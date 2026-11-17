const express = require("express");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");
const authorize = require("../src/middleware/authorize.middleware");

const {

    createProduct,

    getProducts,

    getProductById,

    updateProduct,

    deleteProduct,

    getInventorySummary

} = require("../controllers/product.controller");



router.post("/", protect, authorize('admin'), createProduct);

router.get("/", protect, getProducts);

// Registered before "/:id" so "admin" is not read as a product id
router.get("/admin/inventory", protect, authorize("admin"), getInventorySummary);

router.get("/:id", getProductById);

router.put("/:id", protect, authorize("admin"), updateProduct);

router.delete("/:id", protect, authorize("admin"), deleteProduct);


module.exports = router;