const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const { sendError } = require("../utils/response");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads", "imports");

fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

// .xls (legacy binary Excel format) is intentionally not supported - exceljs (used to
// parse the file in categoryImportFile.service.js) only reads the modern .xlsx (Open XML)
// format, so accepting .xls here would pass upload validation and then fail confusingly
// when the worker tries to parse it.
const ALLOWED_EXTENSIONS = [".csv", ".xlsx"];

// Browsers report inconsistent/unreliable mimetypes for CSV/Excel (e.g. Windows Excel
// sends CSVs as "application/vnd.ms-excel", some browsers fall back to
// "application/octet-stream"), so the extension allowlist above is the primary gate.
// This mimetype allowlist only rejects obviously-wrong types (e.g. an image or PDF).
const ALLOWED_MIME_TYPES = [
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream"
];

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_ROOT);
  },
  filename: (req, file, cb) => {
    // Never trust the original filename for the path on disk - generate our own name
    // and keep the original only as metadata (ImportJob.fileName) for display.
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`Unsupported file extension "${ext}". Only .csv and .xlsx files are allowed.`));
  }

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  }
});

const categoryImportUpload = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? `File is too large. Maximum allowed size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`
          : error.message;

      return sendError(res, 400, message);
    }

    if (error) {
      return sendError(res, 400, error.message);
    }

    if (!req.file) {
      return sendError(res, 400, "No file uploaded. Please select a CSV or Excel file.");
    }

    next();
  });
};

module.exports = { categoryImportUpload, UPLOAD_ROOT, MAX_FILE_SIZE_BYTES };

// Client sends multipart request with field "file"
//         ↓
// Multer receives the file
//         ↓
// Check extension
//         ↓
// Check MIME type
//         ↓
// Check 5 MB limit
//         ↓
// Generate a unique safe filename
//         ↓
// Save to backend/uploads/imports
//         ↓
// Attach metadata to req.file
//         ↓
// Call next()
//         ↓
// Controller validates and creates the import job