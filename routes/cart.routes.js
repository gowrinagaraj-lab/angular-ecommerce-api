const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");

const protect = require("../src/middleware/auth.middleware");

const {

    addToCart,

    getCart,

    updateQuantity,

    removeItem,

    clearCart

} = require("../controllers/cart.controller");


router.use(protect);


router.post(
    "/add",
    [
        body("productId")
            .isMongoId()
            .withMessage("A valid productId is required"),

        body("quantity")
            .isInt({ min: 1 })
            .withMessage("Quantity must be a positive integer")
    ],
    addToCart
);

router.get("/", getCart);

router.put(
    "/update",
    [
        body("productId")
            .isMongoId()
            .withMessage("A valid productId is required"),

        body("quantity")
            .isInt({ min: 1 })
            .withMessage("Quantity must be a positive integer")
    ],
    updateQuantity
);

router.delete(
    "/remove/:productId",
    [
        param("productId")
            .isMongoId()
            .withMessage("A valid productId is required")
    ],
    removeItem
);

router.delete("/clear", clearCart);

module.exports = router;
