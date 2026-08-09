const express = require("express");
const { body } = require("express-validator");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");

const { verifyPayment } = require("../controllers/payment.controller");

router.post(
    "/verify",
    protect,
    [
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
