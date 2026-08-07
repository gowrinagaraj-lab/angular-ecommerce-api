const express = require("express");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");
const authorize = require("../src/middleware/authorize.middleware");

const {

    createProduct,

    getProducts,

    getProductById,

    updateProduct,

    deleteProduct

} = require("../controllers/product.controller");



router.post("/", protect, authorize("admin"), createProduct);

router.get("/", getProducts);

router.get("/:id", getProductById);

router.put("/:id", protect, authorize("admin"), updateProduct);

router.delete("/:id", protect, authorize("admin"), deleteProduct);


module.exports = router;