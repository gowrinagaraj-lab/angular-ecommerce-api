const express = require("express");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");
const authorize = require("../src/middleware/authorize.middleware");
const { categoryImportUpload } = require("../src/middleware/categoryImportUpload.middleware");

const {
    createCategory,
    getCategories,
    getCategoryById,
    updateCategory,
    toggleCategoryStatus,
    deleteCategory
} = require("../controllers/category.controller");

const {
    createImportJob,
    getImportJobStatus,
    cancelImportJob
} = require("../controllers/categoryImport.controller");

router.post("/", protect, authorize("admin"), createCategory);

router.get("/", getCategories);

// Import routes are registered before "/:id" so a literal segment like "import" is never
// swallowed by the ":id" param route below.
router.post("/import", protect, authorize("admin"), categoryImportUpload, createImportJob);

router.get("/import/:jobId/status", protect, authorize("admin"), getImportJobStatus);

router.post("/import/:jobId/cancel", protect, authorize("admin"), cancelImportJob);

router.get("/:id", getCategoryById);

router.put("/:id", protect, authorize("admin"), updateCategory);

router.patch("/:id/status", protect, authorize("admin"), toggleCategoryStatus);

router.delete("/:id", protect, authorize("admin"), deleteCategory);

module.exports = router;
