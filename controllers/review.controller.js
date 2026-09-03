const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { validationResult } = require("express-validator");

const Review = require("../src/models/Review");
const Order = require("../src/models/Order");
const { recalculateProductRating } = require("../utils/productRating");

const MEDIA_TYPE_BY_FIELD = {
    photos: "image",
    video: "video",
    file: "file"
};

const buildMediaFromFiles = (files = {}) => {
    const media = [];

    Object.entries(MEDIA_TYPE_BY_FIELD).forEach(([field, type]) => {
        (files[field] || []).forEach((file) => {
            media.push({
                type,
                url: `/uploads/reviews/${file.filename}`,
                originalName: file.originalname
            });
        });
    });

    return media;
};

const deleteUploadedFiles = (files = {}) => {
    Object.values(files)
        .flat()
        .forEach((file) => {
            fs.unlink(file.path, () => {});
        });
};

/*
Create Review

POST /api/reviews
*/
exports.createReview = async (req, res) => {
    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            deleteUploadedFiles(req.files);

            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });
        }

        const userId = req.user.id;
        const { productId, orderId, rating, comment } = req.body;

        const order = await Order.findOne({ _id: orderId, user: userId });

        if (!order) {
            deleteUploadedFiles(req.files);

            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        if (order.orderStatus !== "Delivered") {
            deleteUploadedFiles(req.files);

            return res.status(400).json({
                success: false,
                message: "You can only review products from delivered orders"
            });
        }

        const purchasedItem = order.items.find((item) => item.product.toString() === productId);

        if (!purchasedItem) {
            deleteUploadedFiles(req.files);

            return res.status(400).json({
                success: false,
                message: "This product is not part of the specified order"
            });
        }

        const existingReview = await Review.findOne({ product: productId, user: userId, order: orderId });

        if (existingReview) {
            deleteUploadedFiles(req.files);

            return res.status(409).json({
                success: false,
                message: "You have already reviewed this product for this order"
            });
        }

        const review = await Review.create({
            product: productId,
            user: userId,
            order: orderId,
            rating,
            comment,
            media: buildMediaFromFiles(req.files)
        });

        await recalculateProductRating(productId);

        res.status(201).json({
            success: true,
            message: "Review submitted successfully",
            data: review
        });
    } catch (error) {
        deleteUploadedFiles(req.files);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/*
Get Reviews For a Product

GET /api/reviews/product/:productId
*/
exports.getProductReviews = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid product ID format"
            });
        }

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.max(1, Number(req.query.limit) || 10);
        const skip = (page - 1) * limit;

        const filter = { product: req.params.productId };

        const total = await Review.countDocuments(filter);
        const reviews = await Review.find(filter)
            .populate("user", "name")
            .sort("-createdAt")
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            data: reviews
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/*
Get My Reviews

GET /api/reviews/my
*/
exports.getMyReviews = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.max(1, Number(req.query.limit) || 10);
        const skip = (page - 1) * limit;

        const filter = { user: req.user.id };

        const total = await Review.countDocuments(filter);
        const reviews = await Review.find(filter)
            .populate("product", "name mainImage")
            .sort("-createdAt")
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            data: reviews
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/*
Update Review

PATCH /api/reviews/:id
*/
exports.updateReview = async (req, res) => {
    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });
        }

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid review ID format"
            });
        }

        const review = await Review.findOne({ _id: req.params.id, user: req.user.id });

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        if (req.body.rating !== undefined) {
            review.rating = req.body.rating;
        }

        if (req.body.comment !== undefined) {
            review.comment = req.body.comment;
        }

        await review.save();
        await recalculateProductRating(review.product);

        res.status(200).json({
            success: true,
            message: "Review updated successfully",
            data: review
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/*
Delete Review

DELETE /api/reviews/:id
*/
exports.deleteReview = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid review ID format"
            });
        }

        const filter = req.user.role === "admin"
            ? { _id: req.params.id }
            : { _id: req.params.id, user: req.user.id };

        const review = await Review.findOneAndDelete(filter);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: "Review not found"
            });
        }

        review.media.forEach((item) => {
            const filePath = path.join(__dirname, "..", item.url.replace(/^\//, ""));
            fs.unlink(filePath, () => {});
        });

        await recalculateProductRating(review.product);

        res.status(200).json({
            success: true,
            message: "Review deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
