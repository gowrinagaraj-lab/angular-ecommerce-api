const fs = require("fs");
const mongoose = require("mongoose");

const ImportJob = require("../src/models/ImportJob");
const { inspectImportFile } = require("../services/categoryImportFile.service");
const { processImportJob } = require("../services/categoryImportWorker.service");
const { sendSuccess, sendError } = require("../src/utils/response");

const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];

const formatJobResponse = (job) => ({
  jobId: job._id,
  type: job.type,
  fileName: job.fileName,
  status: job.status,
  progress: job.progress,
  totalRecords: job.totalRecords,
  processedRecords: job.processedRecords,
  successfulRecords: job.successfulRecords,
  failedRecords: job.failedRecords,
  errors: job.rowErrors,
  message: job.message,
  startedAt: job.startedAt,
  completedAt: job.completedAt,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt
});

/*
Create Import Job
POST /api/categories/import

Validates the uploaded file (multer already ran), creates an ImportJob record, and
returns immediately. Note: this phase does not start any background processing yet -
the job is created in "queued" status and stays there until Phase 3 adds the worker
that reads it. That makes this endpoint independently testable: upload a file, get a
jobId back, and confirm the status endpoint reflects it.
*/
exports.createImportJob = async (req, res) => {
  const filePath = req.file.path;

  try {
    const validation = await inspectImportFile(filePath);

    if (!validation.valid) {
      fs.unlink(filePath, () => {});

      return sendError(res, 400, validation.reason);
    }

    const job = await ImportJob.create({
      type: "category",
      fileName: req.file.originalname,
      filePath,
      status: "queued",
      totalRecords: validation.totalRecords
    });

    sendSuccess(res, 202, {
      message: "Import job created. Processing will begin shortly.",
      data: { jobId: job._id, status: job.status }
    });

    // Fire-and-forget: intentionally not awaited, the HTTP response above has already
    // been sent. processImportJob handles its own errors internally (job -> "failed"),
    // this catch only guards against a bug in that error handling itself.
    processImportJob(job._id).catch((error) => {
      console.error(`Unexpected error while processing import job ${job._id}:`, error);
    });
  } catch (error) {
    fs.unlink(filePath, () => {});

    sendError(res, 500, error.message);
  }
};

/*
Get Import Job Status
GET /api/categories/import/:jobId/status
*/
exports.getImportJobStatus = async (req, res) => {
  const { jobId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    return sendError(res, 400, "Invalid job ID format");
  }

  try {
    const job = await ImportJob.findById(jobId);

    if (!job) {
      return sendError(res, 404, "Import job not found");
    }

    sendSuccess(res, 200, { data: formatJobResponse(job) });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

/*
Cancel Import Job
POST /api/categories/import/:jobId/cancel

Note: until Phase 3 adds the worker, there is no running process to actually stop -
this only flips the job's status in MongoDB. Phase 3's worker will check this status
between rows and stop processing once it sees "cancelled".
*/
exports.cancelImportJob = async (req, res) => {
  const { jobId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    return sendError(res, 400, "Invalid job ID format");
  }

  try {
    const job = await ImportJob.findById(jobId);

    if (!job) {
      return sendError(res, 404, "Import job not found");
    }

    if (TERMINAL_STATUSES.includes(job.status)) {
      return sendError(res, 400, `Job is already ${job.status} and cannot be cancelled.`);
    }

    job.status = "cancelled";
    job.message = "Cancelled by user";
    job.completedAt = new Date();
    await job.save();

    sendSuccess(res, 200, { message: "Import job cancelled", data: formatJobResponse(job) });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};
