const express = require("express");
const { body } = require("express-validator");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");
const { reviewUpload } = require("../src/middleware/upload.middleware");
const {
    createReview,
    getProductReviews,
    getMyReviews,
    updateReview,
    deleteReview
} = require("../controllers/review.controller");

router.get("/product/:productId", getProductReviews);

router.get("/my", protect, getMyReviews);

router.post(
    "/",
    protect,
    reviewUpload,
    [
        body("productId").isMongoId().withMessage("A valid productId is required"),
        body("orderId").isMongoId().withMessage("A valid orderId is required"),
        body("rating")
            .isInt({ min: 1, max: 5 })
            .withMessage("rating must be an integer between 1 and 5"),
        body("comment")
            .optional()
            .trim()
            .isLength({ max: 2000 })
            .withMessage("comment must be 2000 characters or fewer")
    ],
    createReview
);

router.patch(
    "/:id",
    protect,
    [
        body("rating")
            .optional()
            .isInt({ min: 1, max: 5 })
            .withMessage("rating must be an integer between 1 and 5"),
        body("comment")
            .optional()
            .trim()
            .isLength({ max: 2000 })
            .withMessage("comment must be 2000 characters or fewer")
    ],
    updateReview
);

router.delete("/:id", protect, deleteReview);

module.exports = router;
