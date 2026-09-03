jest.mock("fs", () => ({
    unlink: jest.fn((filePath, cb) => cb && cb())
}));
jest.mock("../../src/models/Review");
jest.mock("../../src/models/Order");
jest.mock("../../utils/productRating", () => ({
    recalculateProductRating: jest.fn()
}));
jest.mock("express-validator", () => ({
    validationResult: jest.fn()
}));

const mongoose = require("mongoose");
const { validationResult } = require("express-validator");

const Review = require("../../src/models/Review");
const Order = require("../../src/models/Order");
const { recalculateProductRating } = require("../../utils/productRating");
const reviewController = require("../../controllers/review.controller");
const { mockResponse } = require("../helpers/mockRes");

const validRequest = () => ({ isEmpty: () => true, array: () => [] });
const invalidRequest = (msg) => ({ isEmpty: () => false, array: () => [{ msg }] });

describe("review.controller", () => {

    beforeEach(() => {
        validationResult.mockReturnValue(validRequest());
    });

    describe("createReview", () => {

        const productId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId().toString();

        it("rejects invalid request payloads", async () => {

            validationResult.mockReturnValue(invalidRequest("rating must be an integer between 1 and 5"));

            const req = { user: { id: "user-1" }, body: {}, files: {} };
            const res = mockResponse();

            await reviewController.createReview(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns 404 when the order does not belong to the user", async () => {

            Order.findOne.mockResolvedValue(null);

            const req = {
                user: { id: "user-1" },
                body: { productId, orderId, rating: "5" },
                files: {}
            };
            const res = mockResponse();

            await reviewController.createReview(req, res);

            expect(Order.findOne).toHaveBeenCalledWith({ _id: orderId, user: "user-1" });
            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("rejects reviewing a product from an order that has not been delivered", async () => {

            Order.findOne.mockResolvedValue({
                orderStatus: "Shipped",
                items: [{ product: { toString: () => productId } }]
            });

            const req = {
                user: { id: "user-1" },
                body: { productId, orderId, rating: "5" },
                files: {}
            };
            const res = mockResponse();

            await reviewController.createReview(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: "You can only review products from delivered orders"
            }));

        });

        it("rejects reviewing a product that was not part of the order", async () => {

            Order.findOne.mockResolvedValue({
                orderStatus: "Delivered",
                items: [{ product: { toString: () => "some-other-product" } }]
            });

            const req = {
                user: { id: "user-1" },
                body: { productId, orderId, rating: "5" },
                files: {}
            };
            const res = mockResponse();

            await reviewController.createReview(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: "This product is not part of the specified order"
            }));

        });

        it("rejects a duplicate review for the same product and order", async () => {

            Order.findOne.mockResolvedValue({
                orderStatus: "Delivered",
                items: [{ product: { toString: () => productId } }]
            });
            Review.findOne.mockResolvedValue({ _id: "existing-review" });

            const req = {
                user: { id: "user-1" },
                body: { productId, orderId, rating: "5" },
                files: {}
            };
            const res = mockResponse();

            await reviewController.createReview(req, res);

            expect(res.status).toHaveBeenCalledWith(409);

        });

        it("creates a review with uploaded media and recalculates the product rating", async () => {

            Order.findOne.mockResolvedValue({
                orderStatus: "Delivered",
                items: [{ product: { toString: () => productId } }]
            });
            Review.findOne.mockResolvedValue(null);

            const createdReview = { _id: "review-1", product: productId, rating: 5 };
            Review.create.mockResolvedValue(createdReview);

            const req = {
                user: { id: "user-1" },
                body: { productId, orderId, rating: "5", comment: "Great product!" },
                files: {
                    photos: [{ filename: "photo1.jpg", originalname: "photo1.jpg", path: "/tmp/photo1.jpg" }],
                    video: [{ filename: "clip.mp4", originalname: "clip.mp4", path: "/tmp/clip.mp4" }]
                }
            };
            const res = mockResponse();

            await reviewController.createReview(req, res);

            expect(Review.create).toHaveBeenCalledWith(expect.objectContaining({
                product: productId,
                user: "user-1",
                order: orderId,
                rating: "5",
                comment: "Great product!",
                media: [
                    { type: "image", url: "/uploads/reviews/photo1.jpg", originalName: "photo1.jpg" },
                    { type: "video", url: "/uploads/reviews/clip.mp4", originalName: "clip.mp4" }
                ]
            }));
            expect(recalculateProductRating).toHaveBeenCalledWith(productId);
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: createdReview
            }));

        });

    });

    describe("getProductReviews", () => {

        it("returns paginated reviews for a product", async () => {

            const productId = new mongoose.Types.ObjectId().toString();
            const reviews = [{ _id: "r1", rating: 5 }];

            Review.countDocuments.mockResolvedValue(1);
            Review.find.mockReturnValue({
                populate: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue(reviews)
            });

            const req = { params: { productId }, query: {} };
            const res = mockResponse();

            await reviewController.getProductReviews(req, res);

            expect(Review.find).toHaveBeenCalledWith({ product: productId });
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                total: 1,
                data: reviews
            }));

        });

        it("returns 400 for a malformed product ID", async () => {

            const req = { params: { productId: "not-an-id" }, query: {} };
            const res = mockResponse();

            await reviewController.getProductReviews(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

    });

    describe("getMyReviews", () => {

        it("returns paginated reviews for the authenticated user", async () => {

            const reviews = [{ _id: "r1" }];

            Review.countDocuments.mockResolvedValue(1);
            Review.find.mockReturnValue({
                populate: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue(reviews)
            });

            const req = { user: { id: "user-1" }, query: {} };
            const res = mockResponse();

            await reviewController.getMyReviews(req, res);

            expect(Review.find).toHaveBeenCalledWith({ user: "user-1" });
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, total: 1 }));

        });

    });

    describe("updateReview", () => {

        it("returns 404 when the review does not belong to the user", async () => {

            const reviewId = new mongoose.Types.ObjectId().toString();
            Review.findOne.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, params: { id: reviewId }, body: { rating: 4 } };
            const res = mockResponse();

            await reviewController.updateReview(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("updates the rating and comment, then recalculates the product rating", async () => {

            const reviewId = new mongoose.Types.ObjectId().toString();
            const productId = new mongoose.Types.ObjectId().toString();
            const review = {
                _id: reviewId,
                product: productId,
                rating: 3,
                comment: "Ok",
                save: jest.fn().mockResolvedValue(true)
            };
            Review.findOne.mockResolvedValue(review);

            const req = {
                user: { id: "user-1" },
                params: { id: reviewId },
                body: { rating: 5, comment: "Actually great" }
            };
            const res = mockResponse();

            await reviewController.updateReview(req, res);

            expect(review.rating).toBe(5);
            expect(review.comment).toBe("Actually great");
            expect(review.save).toHaveBeenCalled();
            expect(recalculateProductRating).toHaveBeenCalledWith(productId);
            expect(res.status).toHaveBeenCalledWith(200);

        });

    });

    describe("deleteReview", () => {

        it("deletes a review owned by the user and recalculates the product rating", async () => {

            const reviewId = new mongoose.Types.ObjectId().toString();
            const productId = new mongoose.Types.ObjectId().toString();
            const review = { _id: reviewId, product: productId, media: [] };
            Review.findOneAndDelete.mockResolvedValue(review);

            const req = { user: { id: "user-1", role: "customer" }, params: { id: reviewId } };
            const res = mockResponse();

            await reviewController.deleteReview(req, res);

            expect(Review.findOneAndDelete).toHaveBeenCalledWith({ _id: reviewId, user: "user-1" });
            expect(recalculateProductRating).toHaveBeenCalledWith(productId);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

        });

        it("allows an admin to delete any user's review", async () => {

            const reviewId = new mongoose.Types.ObjectId().toString();
            const review = { _id: reviewId, product: "p1", media: [] };
            Review.findOneAndDelete.mockResolvedValue(review);

            const req = { user: { id: "admin-1", role: "admin" }, params: { id: reviewId } };
            const res = mockResponse();

            await reviewController.deleteReview(req, res);

            expect(Review.findOneAndDelete).toHaveBeenCalledWith({ _id: reviewId });

        });

        it("returns 404 when the review does not exist", async () => {

            const reviewId = new mongoose.Types.ObjectId().toString();
            Review.findOneAndDelete.mockResolvedValue(null);

            const req = { user: { id: "user-1", role: "customer" }, params: { id: reviewId } };
            const res = mockResponse();

            await reviewController.deleteReview(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

    });

});
