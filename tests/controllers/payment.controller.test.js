jest.mock("../../src/models/Order");
jest.mock("../../services/payment.service");
jest.mock("express-validator", () => ({
    validationResult: jest.fn()
}));

const crypto = require("crypto");
const { validationResult } = require("express-validator");

const Order = require("../../src/models/Order");
const { finalizePaidOrder, markPaymentFailed } = require("../../services/payment.service");
const paymentController = require("../../controllers/payment.controller");
const { mockResponse } = require("../helpers/mockRes");

const validRequest = () => ({ isEmpty: () => true, array: () => [] });
const invalidRequest = (msg) => ({ isEmpty: () => false, array: () => [{ msg }] });

const RAZORPAY_ORDER_ID = "order_rzp_1";
const RAZORPAY_PAYMENT_ID = "pay_rzp_1";
const IDEMPOTENCY_KEY = "idem-key-123";

const hmac = (payload, secret) =>
    crypto.createHmac("sha256", secret).update(payload).digest("hex");

describe("payment.controller", () => {

    const originalKeySecret = process.env.RAZORPAY_KEY_SECRET;
    const originalWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    beforeAll(() => {
        process.env.RAZORPAY_KEY_SECRET = "test-secret";
        process.env.RAZORPAY_WEBHOOK_SECRET = "webhook-secret";
    });

    afterAll(() => {
        process.env.RAZORPAY_KEY_SECRET = originalKeySecret;
        process.env.RAZORPAY_WEBHOOK_SECRET = originalWebhookSecret;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        validationResult.mockReturnValue(validRequest());
    });

    describe("verifyPayment", () => {

        const baseReq = (overrides = {}, headers = { "idempotency-key": IDEMPOTENCY_KEY }) => ({
            user: { id: "user-1" },
            headers,
            body: {
                razorpay_order_id: RAZORPAY_ORDER_ID,
                razorpay_payment_id: RAZORPAY_PAYMENT_ID,
                razorpay_signature: hmac(`${RAZORPAY_ORDER_ID}|${RAZORPAY_PAYMENT_ID}`, "test-secret"),
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

        it("rejects when the Idempotency-Key header is missing", async () => {
            const res = mockResponse();

            await paymentController.verifyPayment(baseReq({}, {}), res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 404 when no matching order is found", async () => {
            Order.findOne.mockResolvedValue(null);
            const res = mockResponse();

            await paymentController.verifyPayment(baseReq(), res);

            expect(res.status).toHaveBeenCalledWith(404);
        });

        it("short-circuits with 200 when the order was already paid", async () => {
            Order.findOne.mockResolvedValue({ paymentStatus: "Paid" });
            const res = mockResponse();

            await paymentController.verifyPayment(baseReq(), res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Payment already verified" }));
            expect(finalizePaidOrder).not.toHaveBeenCalled();
        });

        it("marks the order Failed and returns 400 on an invalid signature", async () => {
            const order = { paymentStatus: "Pending", save: jest.fn().mockResolvedValue(true) };
            Order.findOne.mockResolvedValue(order);
            const res = mockResponse();

            await paymentController.verifyPayment(baseReq({ razorpay_signature: "0".repeat(64) }), res);

            expect(order.paymentStatus).toBe("Failed");
            expect(order.save).toHaveBeenCalled();
            expect(finalizePaidOrder).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("finalizes the order on a valid signature", async () => {
            Order.findOne.mockResolvedValue({ paymentStatus: "Pending" });
            const finalized = { paymentStatus: "Paid" };
            finalizePaidOrder.mockResolvedValue({ order: finalized, alreadyPaid: false });
            const res = mockResponse();

            await paymentController.verifyPayment(baseReq(), res);

            expect(finalizePaidOrder).toHaveBeenCalledWith(expect.objectContaining({
                userId: "user-1",
                razorpayOrderId: RAZORPAY_ORDER_ID,
                razorpayPaymentId: RAZORPAY_PAYMENT_ID,
                idempotencyKey: IDEMPOTENCY_KEY,
                source: "payment-verification"
            }));
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: "Payment verified, order confirmed",
                data: finalized
            }));
        });

        it("passes through business errors such as out of stock", async () => {
            Order.findOne.mockResolvedValue({ paymentStatus: "Pending" });
            const error = new Error("Widget is out of stock");
            error.statusCode = 400;
            finalizePaidOrder.mockRejectedValue(error);
            const res = mockResponse();

            await paymentController.verifyPayment(baseReq(), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Widget is out of stock" }));
        });

        it("returns 500 on unexpected errors", async () => {
            Order.findOne.mockRejectedValue(new Error("DB down"));
            const res = mockResponse();

            await paymentController.verifyPayment(baseReq(), res);

            expect(res.status).toHaveBeenCalledWith(500);
        });

    });

    describe("handleWebhook", () => {

        const webhookReq = (event, entity = { id: RAZORPAY_PAYMENT_ID, order_id: RAZORPAY_ORDER_ID }, signature) => {
            const body = { event, payload: { payment: { entity } } };
            const rawBody = Buffer.from(JSON.stringify(body));

            return {
                body,
                rawBody,
                headers: { "x-razorpay-signature": signature ?? hmac(rawBody, "webhook-secret") }
            };
        };

        it("rejects an invalid signature", async () => {
            const res = mockResponse();

            await paymentController.handleWebhook(webhookReq("payment.captured", undefined, "0".repeat(64)), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(finalizePaidOrder).not.toHaveBeenCalled();
        });

        it("rejects a request without the raw body", async () => {
            const req = webhookReq("payment.captured");
            delete req.rawBody;
            const res = mockResponse();

            await paymentController.handleWebhook(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
        });

        it("returns 500 when the webhook secret is not configured", async () => {
            process.env.RAZORPAY_WEBHOOK_SECRET = "";
            const res = mockResponse();

            await paymentController.handleWebhook(webhookReq("payment.captured"), res);

            process.env.RAZORPAY_WEBHOOK_SECRET = "webhook-secret";
            expect(res.status).toHaveBeenCalledWith(500);
        });

        it.each(["payment.captured", "order.paid"])("finalizes the order on %s", async (event) => {
            finalizePaidOrder.mockResolvedValue({ order: {}, alreadyPaid: false });
            const res = mockResponse();

            await paymentController.handleWebhook(webhookReq(event), res);

            expect(finalizePaidOrder).toHaveBeenCalledWith({
                razorpayOrderId: RAZORPAY_ORDER_ID,
                razorpayPaymentId: RAZORPAY_PAYMENT_ID,
                source: "webhook"
            });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it("marks the payment failed on payment.failed", async () => {
            const res = mockResponse();

            await paymentController.handleWebhook(webhookReq("payment.failed", {
                id: RAZORPAY_PAYMENT_ID,
                order_id: RAZORPAY_ORDER_ID,
                error_description: "Card declined"
            }), res);

            expect(markPaymentFailed).toHaveBeenCalledWith({
                razorpayOrderId: RAZORPAY_ORDER_ID,
                razorpayPaymentId: RAZORPAY_PAYMENT_ID,
                reason: "Card declined",
                source: "webhook"
            });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it("acknowledges and ignores unrelated events", async () => {
            const res = mockResponse();

            await paymentController.handleWebhook(webhookReq("refund.created"), res);

            expect(finalizePaidOrder).not.toHaveBeenCalled();
            expect(markPaymentFailed).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it("acknowledges business errors so Razorpay does not retry", async () => {
            const error = new Error("Order not found for this payment");
            error.statusCode = 404;
            finalizePaidOrder.mockRejectedValue(error);
            jest.spyOn(console, "warn").mockImplementation(() => {});
            const res = mockResponse();

            await paymentController.handleWebhook(webhookReq("payment.captured"), res);

            expect(res.status).toHaveBeenCalledWith(200);
        });

        it("returns 500 on unexpected errors so Razorpay retries", async () => {
            finalizePaidOrder.mockRejectedValue(new Error("DB down"));
            jest.spyOn(console, "error").mockImplementation(() => {});
            const res = mockResponse();

            await paymentController.handleWebhook(webhookReq("payment.captured"), res);

            expect(res.status).toHaveBeenCalledWith(500);
        });

    });

});
