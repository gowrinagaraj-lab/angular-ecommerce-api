const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads", "reviews");

fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const ALLOWED_MIME_TYPES = {
    photos: ["image/jpeg", "image/png", "image/webp"],
    video: ["video/mp4", "video/webm", "video/quicktime"],
    file: ["application/pdf", "image/jpeg", "image/png"]
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_ROOT);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
        cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = ALLOWED_MIME_TYPES[file.fieldname];

    if (!allowed || !allowed.includes(file.mimetype)) {
        return cb(new Error(`Unsupported file type for ${file.fieldname}: ${file.mimetype}`));
    }

    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 25 * 1024 * 1024
    }
});

const reviewUpload = (req, res, next) => {
    upload.fields([
        { name: "photos", maxCount: 5 },
        { name: "video", maxCount: 1 },
        { name: "file", maxCount: 1 }
    ])(req, res, (error) => {
        if (error) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        next();
    });
};

module.exports = { reviewUpload, UPLOAD_ROOT };
