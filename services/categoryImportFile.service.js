const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const ExcelJS = require("exceljs");

const REQUIRED_COLUMNS = ["name"];

/*
Reads a CSV file and returns its header row + data row count.
Does not hold row data in memory - Phase 3's worker re-reads the file itself when it
actually processes rows, so this only needs to stream through once to validate.
*/
const inspectCsvFile = (filePath) => {
  return new Promise((resolve, reject) => {
    let headers = null;
    let rowCount = 0;

    fs.createReadStream(filePath)
      .on("error", (error) => reject(error))
      .pipe(csv())
      .on("headers", (headerRow) => {
        headers = headerRow.map((h) => h.trim().toLowerCase());
      })
      .on("data", () => {
        rowCount += 1;
      })
      .on("end", () => resolve({ headers: headers || [], rowCount }))
      .on("error", (error) => reject(error));
  });
};

/*
Reads an .xlsx file's first worksheet and returns its header row + data row count.
*/
const inspectExcelFile = async (filePath) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];

  if (!worksheet || worksheet.rowCount === 0) {
    return { headers: [], rowCount: 0 };
  }

  const headerRow = worksheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    headers.push(String(cell.value ?? "").trim().toLowerCase());
  });

  let rowCount = 0;
  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const isBlankRow = row.values.length === 0 || row.values.every((value) => value === null || value === undefined || value === "");

    if (!isBlankRow) {
      rowCount += 1;
    }
  }

  return { headers, rowCount };
};

/*
Validates an uploaded import file: readable, non-empty, has the required columns.
Returns { valid: true, totalRecords } or { valid: false, reason }.
Does not throw - parse failures are reported as a validation failure, not an exception,
since a malformed upload is an expected/handled case, not a server error.
*/
const inspectImportFile = async (filePath) => {
  const ext = path.extname(filePath).toLowerCase();

  let headers;
  let rowCount;

  try {
    if (ext === ".csv") {
      ({ headers, rowCount } = await inspectCsvFile(filePath));
    } else if (ext === ".xlsx") {
      ({ headers, rowCount } = await inspectExcelFile(filePath));
    } else {
      return { valid: false, reason: `Unsupported file extension "${ext}".` };
    }
  } catch (error) {
    return { valid: false, reason: "Unable to parse file. Please ensure it is a valid CSV or Excel file." };
  }

  if (headers.length === 0) {
    return { valid: false, reason: "File appears to be empty or invalid." };
  }

  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));

  if (missingColumns.length > 0) {
    return { valid: false, reason: `Missing required column(s): ${missingColumns.join(", ")}.` };
  }

  if (rowCount === 0) {
    return { valid: false, reason: "File contains no data rows." };
  }

  return { valid: true, totalRecords: rowCount };
};

module.exports = { inspectImportFile, REQUIRED_COLUMNS };


// User uploads file
//         ↓
// Get file extension
//         ↓
// CSV parser or Excel parser
//         ↓
// Read headers and count rows
//         ↓
// Check file is readable
//         ↓
// Check required "name" column
//         ↓
// Check at least one data row
//         ↓
// Return validation result