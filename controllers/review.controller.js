const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { validationResult } = require("express-validator");

const Review = require("../src/models/Review");
const Order = require("../src/models/Order");
const { recalculateProductRating } = require("../utils/productRating");
const { sendSuccess, sendError } = require("../src/utils/response");

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
console.log("Built media from files:", media);
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
    
    console.log("Request body:", req.body);
    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            deleteUploadedFiles(req.files);

            return sendError(res, 400, errors.array()[0].msg);
        }

        const userId = req.user.id;
        const { productId, orderId, rating, comment } = req.body;

        const order = await Order.findOne({ _id: orderId, user: userId });

        if (!order) {
            deleteUploadedFiles(req.files);

            return sendError(res, 404, "Order not found");
        }

        if (order.orderStatus !== "Delivered") {
            deleteUploadedFiles(req.files);

            return sendError(res, 400, "You can only review products from delivered orders");
        }

        const purchasedItem = order.items.find((item) => item.product.toString() === productId);

        if (!purchasedItem) {
            deleteUploadedFiles(req.files);

            return sendError(res, 400, "This product is not part of the specified order");
        }

        const existingReview = await Review.findOne({ product: productId, user: userId, order: orderId });

        if (existingReview) {
            deleteUploadedFiles(req.files);

            return sendError(res, 409, "You have already reviewed this product for this order");
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

        sendSuccess(res, 201, { message: "Review submitted successfully", data: review });
    } catch (error) {
        deleteUploadedFiles(req.files);

        sendError(res, 500, error.message);
    }
};

/*
Get Reviews For a Product

GET /api/reviews/product/:productId
*/
exports.getProductReviews = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.productId)) {
            return sendError(res, 400, "Invalid product ID format");
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

        sendSuccess(res, 200, {
            total,
            page,
            totalPages: Math.ceil(total / limit),
            data: reviews
        });
    } catch (error) {
        sendError(res, 500, error.message);
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

        sendSuccess(res, 200, {
            total,
            page,
            totalPages: Math.ceil(total / limit),
            data: reviews
        });
    } catch (error) {
        sendError(res, 500, error.message);
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
            return sendError(res, 400, errors.array()[0].msg);
        }

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return sendError(res, 400, "Invalid review ID format");
        }

        const review = await Review.findOne({ _id: req.params.id, user: req.user.id });

        if (!review) {
            return sendError(res, 404, "Review not found");
        }

        if (req.body.rating !== undefined) {
            review.rating = req.body.rating;
        }

        if (req.body.comment !== undefined) {
            review.comment = req.body.comment;
        }

        await review.save();
        await recalculateProductRating(review.product);

        sendSuccess(res, 200, { message: "Review updated successfully", data: review });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};

/*
Delete Review

DELETE /api/reviews/:id
*/
exports.deleteReview = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return sendError(res, 400, "Invalid review ID format");
        }

        const filter = req.user.role === "admin"
            ? { _id: req.params.id }
            : { _id: req.params.id, user: req.user.id };

        const review = await Review.findOneAndDelete(filter);

        if (!review) {
            return sendError(res, 404, "Review not found");
        }

        review.media.forEach((item) => {
            const filePath = path.join(__dirname, "..", item.url.replace(/^\//, ""));
            fs.unlink(filePath, () => {});
        });

        await recalculateProductRating(review.product);

        sendSuccess(res, 200, { message: "Review deleted successfully" });
    } catch (error) {
        sendError(res, 500, error.message);
    }
};
