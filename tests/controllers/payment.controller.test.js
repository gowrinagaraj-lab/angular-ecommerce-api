jest.mock("../../src/models/Order");
jest.mock("../../src/models/Product");
jest.mock("../../src/models/Cart");
jest.mock("express-validator", () => ({
    validationResult: jest.fn()
}));

const crypto = require("crypto");
const { validationResult } = require("express-validator");

const Order = require("../../src/models/Order");
const Product = require("../../src/models/Product");
const Cart = require("../../src/models/Cart");
const paymentController = require("../../controllers/payment.controller");
const { mockResponse } = require("../helpers/mockRes");

const validRequest = () => ({ isEmpty: () => true, array: () => [] });
const invalidRequest = (msg) => ({ isEmpty: () => false, array: () => [{ msg }] });

const RAZORPAY_ORDER_ID = "order_rzp_1";
const RAZORPAY_PAYMENT_ID = "pay_rzp_1";

const signFor = (orderId, paymentId) =>
    crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

describe("payment.controller", () => {

    const originalSecret = process.env.RAZORPAY_KEY_SECRET;

    beforeAll(() => {
        process.env.RAZORPAY_KEY_SECRET = "test-secret";
    });

    afterAll(() => {
        process.env.RAZORPAY_KEY_SECRET = originalSecret;
    });

    beforeEach(() => {
        validationResult.mockReturnValue(validRequest());
    });

    describe("verifyPayment", () => {

        const baseReq = (overrides = {}) => ({
            user: { id: "user-1" },
            body: {
                razorpay_order_id: RAZORPAY_ORDER_ID,
                razorpay_payment_id: RAZORPAY_PAYMENT_ID,
                razorpay_signature: signFor(RAZORPAY_ORDER_ID, RAZORPAY_PAYMENT_ID),
                ...overrides
            }
        });

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("Invalid payment data"));

            const res = mockResponse();

            await paymentController.verifyPayment(baseReq(), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(Order.findOne).not.toHaveBeenCalled();

        });

        it("returns 404 when no matching order is found", async () => {

            Order.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });

            const res = mockResponse();

            await paymentController.verifyPayment(baseReq(), res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("short-circuits with 200 when the order was already paid", async () => {

            const order = { paymentStatus: "Paid" };
            Order.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(order) });

            const res = mockResponse();

            await paymentController.verifyPayment(baseReq(), res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Payment already verified" }));

        });

        it("marks the order Failed and returns 400 on an invalid signature", async () => {

            const order = { paymentStatus: "Pending", save: jest.fn().mockResolvedValue(true) };
            Order.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(order) });

            const res = mockResponse();

            await paymentController.verifyPayment(baseReq({ razorpay_signature: "0".repeat(64) }), res);

            expect(order.paymentStatus).toBe("Failed");
            expect(order.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("rejects when an item has gone out of stock before payment could be confirmed", async () => {

            const order = {
                paymentStatus: "Pending",
                items: [{ name: "Widget", quantity: 5, product: { _id: "p1", stock: 1 } }],
                save: jest.fn().mockResolvedValue(true)
            };
            Order.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(order) });

            const res = mockResponse();

            await paymentController.verifyPayment(baseReq(), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Widget is out of stock" }));

        });

        it("confirms the order, decrements stock, and clears the cart on a valid signature", async () => {

            const order = {
                paymentStatus: "Pending",
                items: [{ name: "Widget", quantity: 2, product: { _id: "p1", stock: 10 } }],
                save: jest.fn().mockResolvedValue(true)
            };
            Order.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(order) });
            const cart = { items: [{ product: "p1" }], save: jest.fn().mockResolvedValue(true) };
            Cart.findOne.mockResolvedValue(cart);

            const res = mockResponse();

            await paymentController.verifyPayment(baseReq(), res);

            expect(Product.findByIdAndUpdate).toHaveBeenCalledWith("p1", { $inc: { stock: -2 } });
            expect(order.paymentStatus).toBe("Paid");
            expect(order.orderStatus).toBe("Processing");
            expect(order.razorpayPaymentId).toBe(RAZORPAY_PAYMENT_ID);
            expect(cart.items).toHaveLength(0);
            expect(cart.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Payment verified, order confirmed" }));

        });

        it("confirms the order even when the user has no cart to clear", async () => {

            const order = {
                paymentStatus: "Pending",
                items: [{ name: "Widget", quantity: 1, product: { _id: "p1", stock: 10 } }],
                save: jest.fn().mockResolvedValue(true)
            };
            Order.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(order) });
            Cart.findOne.mockResolvedValue(null);

            const res = mockResponse();

            await paymentController.verifyPayment(baseReq(), res);

            expect(res.status).toHaveBeenCalledWith(200);

        });

        it("returns 500 on unexpected errors", async () => {

            Order.findOne.mockReturnValue({ populate: jest.fn().mockRejectedValue(new Error("DB down")) });

            const res = mockResponse();

            await paymentController.verifyPayment(baseReq(), res);

            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

});
