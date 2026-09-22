const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const ExcelJS = require("exceljs");

const isBlankRowValues = (row) => Object.values(row).every((value) => value === null || value === undefined || String(value).trim() === "");

/*
Streams a CSV file row by row as an async iterable, so the worker can `for await` it
and do an async Mongo write between rows without loading the whole file into memory.
Header names are lowercased/trimmed so downstream code doesn't care about the file's
original casing/spacing (e.g. "Name" or " name " both become "name").
*/
async function* readCsvRows(filePath) {
  let rowNumber = 1; // row 1 is the header

  const stream = fs.createReadStream(filePath).pipe(
    csv({ mapHeaders: ({ header }) => header.trim().toLowerCase() })
  );

  for await (const row of stream) {
    rowNumber += 1;

    if (isBlankRowValues(row)) {
      continue;
    }

    yield { rowNumber, values: row };
  }
}

/*
Yields rows from the first worksheet of an .xlsx file. exceljs loads the whole workbook
into memory when reading (there is no true streaming read for a random-access sheet),
so unlike the CSV path this isn't memory-efficient for very large sheets - a known POC
limitation called out in the Phase 12 production review.
*/
async function* readExcelRows(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    return;
  }

  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim().toLowerCase();
  });

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const values = {};

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const key = headers[colNumber];
      if (key) {
        values[key] = cell.value === null || cell.value === undefined ? "" : String(cell.value);
      }
    });

    if (Object.keys(values).length === 0 || isBlankRowValues(values)) {
      continue;
    }

    yield { rowNumber, values };
  }
}

const readImportRows = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".csv") {
    return readCsvRows(filePath);
  }

  if (ext === ".xlsx") {
    return readExcelRows(filePath);
  }

  throw new Error(`Unsupported file extension "${ext}"`);
};

module.exports = { readImportRows };


// Receive uploaded file path
//         ↓
// Check file extension
//         ↓
// Choose CSV or Excel reader
//         ↓
// Read headers
//         ↓
// Normalize header names
//         ↓
// Read one data row
//         ↓
// Skip blank rows
//         ↓
// Yield row number and values
//         ↓
// Process the row
//         ↓
// Read the next row