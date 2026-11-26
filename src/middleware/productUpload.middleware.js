const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");
const { sendError } = require("../utils/response");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads", "products");

fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// Longest edge an uploaded image is resized down to; smaller images are left as-is
const MAX_DIMENSION = 1200;

// Buffered in memory so sharp can resize before anything touches disk
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return cb(new Error(`Unsupported file type: ${file.mimetype}. Only JPEG, PNG, and WEBP images are allowed.`));
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

// Resizes to a max of MAX_DIMENSION on the longest edge, re-encodes as webp for a
// smaller footprint, and writes the result to disk under a random filename.
const resizeAndSave = async (buffer) => {
    const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.webp`;
    const destination = path.join(UPLOAD_ROOT, filename);

    await sharp(buffer)
        .resize({
            width: MAX_DIMENSION,
            height: MAX_DIMENSION,
            fit: "inside",
            withoutEnlargement: true
        })
        .webp({ quality: 80 })
        .toFile(destination);

    return filename;
};

// Single optional "mainImage" file. When a manual image URL is submitted instead,
// no file is attached and req.file stays undefined - the controller keeps that string.
const productUpload = (req, res, next) => {
    upload.single("mainImage")(req, res, async (error) => {
        if (error instanceof multer.MulterError) {
            const message = error.code === "LIMIT_FILE_SIZE"
                ? `Image is too large. Maximum allowed size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`
                : error.message;

            return sendError(res, 400, message);
        }

        if (error) {
            return sendError(res, 400, error.message);
        }

        if (!req.file) {
            return next();
        }

        try {
            req.file.filename = await resizeAndSave(req.file.buffer);
            next();
        } catch (resizeError) {
            sendError(res, 400, "Uploaded file is not a valid image");
        }
    });
};

module.exports = { productUpload, UPLOAD_ROOT };
