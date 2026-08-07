const express = require("express");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");
const authorize = require("../src/middleware/authorize.middleware");

const {
    createCategory,
    getCategories,
    getCategoryById,
    updateCategory,
    deleteCategory
} = require("../controllers/category.controller");

router.post("/", protect, authorize("admin"), createCategory);

router.get("/", getCategories);

router.get("/:id", getCategoryById);

router.put("/:id", protect, authorize("admin"), updateCategory);

router.delete("/:id", protect, authorize("admin"), deleteCategory);

module.exports = router;
