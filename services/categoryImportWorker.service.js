const ImportJob = require("../src/models/ImportJob");
const Category = require("../src/models/Category");
const { readImportRows } = require("./categoryImportRowReader.service");

// How many rows to process between two persisted progress updates. Writing to Mongo on
// every single row would be wasteful for a large file; checking too infrequently makes
// cancellation and progress feel unresponsive. 5 is a reasonable POC middle ground -
// tunable, and exactly why progress can jump (0, 0, 0, 40, 70, 100) instead of climbing
// one row at a time.
const PROGRESS_UPDATE_BATCH_SIZE = 5;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/*
Create-or-update a single category row.

Duplicate handling: an existing category (case-insensitive name match) is updated
in place rather than rejected as a duplicate, since a re-import of the same catalog
file (e.g. updated descriptions) is the expected common case, not an error case.

The Category schema already has a unique index on `name` (see src/models/Category.js).
That index is what actually prevents two documents with the same name from ever
existing - the findOne-then-create/update here is just the normal-path decision logic,
not the source of truth for uniqueness. A race is still possible (two rows resolving to
the same new name concurrently, whether from this same import or a separate admin
request creating a category at the same moment) between the findOne and the create; if
that happens the unique index rejects the second insert with a Mongo E11000 error, which
is caught below and turned into an update instead of a failed row - the row still
succeeds, it just takes the update path instead of the create path.
*/
const upsertCategoryFromRow = async (values) => {
  const name = String(values.name ?? "").trim();
  const description = String(values.description ?? "").trim();

  if (!name) {
    throw new Error("name is required");
   }

  const nameMatch = {
    name: { $regex: new RegExp(`^${escapeRegex(name)}$`, "i") },
  };

  const existing = await Category.findOne(nameMatch);

  if (existing) {
    existing.description = description;
    await existing.save();
    return;
  }

  try {
    await Category.create({ name, description });
  } catch (error) {
    if (error.code === 11000) {
      await Category.findOneAndUpdate(nameMatch, { description });
      return;
    }

    throw error;
  }
};

const isCancelled = async (jobId) => {
  const job = await ImportJob.findById(jobId).select("status").lean();
  return job?.status === "cancelled";
};

/*
Processes an ImportJob: reads the uploaded file row by row, creates/updates categories,
and keeps the job document updated with progress so polling requests can observe it.

Not awaited by the caller (see categoryImport.controller.js) - this runs after the
upload HTTP response has already been sent.
*/
const processImportJob = async (jobId) => {
  const job = await ImportJob.findById(jobId);

  // Guards against: job not found, or already moved out of "queued" (e.g. cancelled
  // before this function got a chance to run).
  if (!job || job.status !== "queued") {
    return;
  }

  job.status = "processing";
  job.startedAt = new Date();
  await job.save();

  let processedRecords = 0;
  let successfulRecords = 0;
  let failedRecords = 0;
  const rowErrors = [];
  let cancelled = false;

  const persistProgress = () =>
    ImportJob.updateOne(
      { _id: job._id },
      {
        processedRecords,
        successfulRecords,
        failedRecords,
        rowErrors,
        progress: Math.floor((processedRecords / job.totalRecords) * 100),
      },
    );

  try {
    for await (const { rowNumber, values } of readImportRows(job.filePath)) {
      if (
        processedRecords % PROGRESS_UPDATE_BATCH_SIZE === 0 &&
        (await isCancelled(job._id))
      ) {
        cancelled = true;
        break;
      }

      try {
        await upsertCategoryFromRow(values);
        successfulRecords += 1;
      } catch (rowError) {
        failedRecords += 1;
        rowErrors.push({ row: rowNumber, message: rowError.message });
      }

      processedRecords += 1;

      if (processedRecords % PROGRESS_UPDATE_BATCH_SIZE === 0) {
        await persistProgress();
      }
    }

    if (cancelled) {
      await persistProgress();
      return;
    }

    // Conditioned on status still not being "cancelled" to close the race where the
    // cancel endpoint flips the status in the moment between this worker's last
    // cancellation check and this final write - without this guard a cancel that lands
    // in that narrow window would get silently overwritten back to "completed".
    await ImportJob.updateOne(
      { _id: job._id, status: { $ne: "cancelled" } },
      {
        status: "completed",
        processedRecords,
        successfulRecords,
        failedRecords,
        rowErrors,
        progress: 100,
        message: `Import completed: ${successfulRecords} succeeded, ${failedRecords} failed.`,
        completedAt: new Date(),
      },
    );
  } catch (error) {
    await ImportJob.updateOne(
      { _id: job._id, status: { $ne: "cancelled" } },
      {
        status: "failed",
        processedRecords,
        successfulRecords,
        failedRecords,
        rowErrors,
        message: error.message,
        completedAt: new Date(),
      },
    );
  }
};

module.exports = { processImportJob };

// Load queued import job
//         ↓
// Mark job as processing
//         ↓
// Read CSV or Excel rows
//         ↓
// Check cancellation
//         ↓
// Validate category name
//         ↓
// Find category case-insensitively
//         ↓
// Update existing category or create a new one
//         ↓
// Record success or row error
//         ↓
// Persist progress every 5 rows
//         ↓
// Complete, cancel, or fail the job