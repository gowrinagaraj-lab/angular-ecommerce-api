const express = require("express");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");
const authorize = require("../src/middleware/authorize.middleware");
const { productUpload } = require("../src/middleware/productUpload.middleware");

const {

    createProduct,

    getProducts,

    getProductById,

    updateProduct,

    deleteProduct,

    getInventorySummary

} = require("../controllers/product.controller");



router.post("/", protect, authorize('admin'), productUpload, createProduct);

router.get("/", protect, getProducts);

// Registered before "/:id" so "admin" is not read as a product id
router.get("/admin/inventory", protect, authorize("admin"), getInventorySummary);

router.get("/:id", getProductById);

router.put("/:id", protect, authorize("admin"), productUpload, updateProduct);

router.delete("/:id", protect, authorize("admin"), deleteProduct);


module.exports = router;