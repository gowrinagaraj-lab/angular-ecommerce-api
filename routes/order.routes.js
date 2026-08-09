const express = require("express");
const { body } = require("express-validator");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");

const { checkout, getOrders } = require("../controllers/order.controller");

router.get("/", protect, getOrders);

router.post(
    "/checkout",
    protect,
    [
        body("paymentMethod")
            .optional()
            .isIn(["COD", "CARD", "UPI"])
            .withMessage("paymentMethod must be one of COD, CARD, UPI"),

        body("addressId")
            .optional()
            .isMongoId()
            .withMessage("A valid addressId is required"),

        body("shippingAddress")
            .optional(),

        body("shippingAddress.fullName")
            .if(body("shippingAddress").exists())
            .trim()
            .notEmpty()
            .withMessage("shippingAddress.fullName is required"),

        body("shippingAddress.phone")
            .if(body("shippingAddress").exists())
            .trim()
            .notEmpty()
            .withMessage("shippingAddress.phone is required"),

        body("shippingAddress.address")
            .if(body("shippingAddress").exists())
            .trim()
            .notEmpty()
            .withMessage("shippingAddress.address is required"),

        body("shippingAddress.city")
            .if(body("shippingAddress").exists())
            .trim()
            .notEmpty()
            .withMessage("shippingAddress.city is required"),

        body("shippingAddress.state")
            .if(body("shippingAddress").exists())
            .trim()
            .notEmpty()
            .withMessage("shippingAddress.state is required"),

        body("shippingAddress.country")
            .if(body("shippingAddress").exists())
            .trim()
            .notEmpty()
            .withMessage("shippingAddress.country is required"),

        body("shippingAddress.pincode")
            .if(body("shippingAddress").exists())
            .trim()
            .notEmpty()
            .withMessage("shippingAddress.pincode is required")
    ],
    checkout
);

module.exports = router;
