const express = require("express");
const { body, header } = require("express-validator");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");

const { verifyPayment } = require("../controllers/payment.controller");

router.post(
    "/verify",
    protect,
    [
        header("idempotency-key")
            .trim()
            .notEmpty()
            .withMessage("Idempotency-Key header is required")
            .isLength({ min: 8, max: 255 })
            .withMessage("Idempotency-Key must be between 8 and 255 characters"),

        body("razorpay_order_id")
            .trim()
            .notEmpty()
            .withMessage("razorpay_order_id is required"),

        body("razorpay_payment_id")
            .trim()
            .notEmpty()
            .withMessage("razorpay_payment_id is required"),

        body("razorpay_signature")
            .trim()
            .notEmpty()
            .withMessage("razorpay_signature is required")
    ],
    verifyPayment
);

module.exports = router;
