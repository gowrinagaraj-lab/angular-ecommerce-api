const express = require("express");
const { body } = require("express-validator");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");
const authorize = require("../src/middleware/authorize.middleware");

const {
    checkout,
    getOrders,
    getAllOrders,
    getOrderById,
    updateOrderStatus,
    cancelOrder,
    generateDeliveryOtp,
    verifyDeliveryOtp
} = require("../controllers/order.controller");

router.get("/", protect, getOrders);

router.get("/admin/all", protect, authorize("admin"), getAllOrders);

router.get("/:id", protect, getOrderById);

router.patch(
    "/:id/status",
    protect,
    authorize("admin"),
    [
        body("orderStatus")
            .trim()
            .notEmpty()
            .withMessage("orderStatus is required")
            .isIn(["Pending", "Processing", "Shipped"])
            .withMessage("orderStatus must be one of Pending, Processing, Shipped")
    ],
    updateOrderStatus
);

router.patch(
    "/:id/cancel",
    protect,
    cancelOrder
);

router.post(
    "/:id/generate-delivery-otp",
    protect,
    authorize("admin"),
    generateDeliveryOtp
);

router.post(
    "/:id/verify-delivery-otp",
    protect,
    authorize("admin"),
    [
        body("otp")
            .trim()
            .notEmpty()
            .withMessage("otp is required")
            .isLength({ min: 6, max: 6 })
            .withMessage("otp must be 6 digits")
    ],
    verifyDeliveryOtp
);

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
