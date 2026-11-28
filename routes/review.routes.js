const express = require("express");
const { body } = require("express-validator");
const router = express.Router();
const protect = require("../src/middleware/auth.middleware");
const authorize = require("../src/middleware/authorize.middleware");
const { reviewUpload } = require("../src/middleware/upload.middleware");
const { containsBlockedContent } = require("../utils/contentFilter");
const {
    createReview,
    getProductReviews,
    getMyReviews,
    updateReview,
    deleteReview,
    reportReview,
    getModerationQueue,
    moderateReview
} = require("../controllers/review.controller");

router.get("/product/:productId", getProductReviews);

router.get("/my", protect, getMyReviews);

// Registered before "/:id" routes so "admin" is not read as a review id
router.get("/admin/queue", protect, authorize("admin"), getModerationQueue);

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
            .custom((value) => !containsBlockedContent(value))
            .withMessage("comment contains language that isn't allowed")
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
            .custom((value) => !containsBlockedContent(value))
            .withMessage("comment contains language that isn't allowed")
    ],
    updateReview
);

router.delete("/:id", protect, deleteReview);

router.post(
    "/:id/report",
    protect,
    [
        body("reason")
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage("reason must be 500 characters or fewer")
    ],
    reportReview
);

router.patch(
    "/:id/moderate",
    protect,
    authorize("admin"),
    [
        body("status")
            .isIn(["visible", "hidden"])
            .withMessage("status must be either visible or hidden")
    ],
    moderateReview
);

module.exports = router;
