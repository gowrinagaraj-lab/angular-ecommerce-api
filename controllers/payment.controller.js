const crypto = require("crypto");
const { validationResult } = require("express-validator");

const Order = require("../src/models/Order");
const { finalizePaidOrder, markPaymentFailed } = require("../services/payment.service");
const { sendSuccess, sendError } = require("../src/utils/response");

const isValidSignature = (payload, signature, secret) => {
    if (typeof signature !== "string" || !secret) {
        return false;
    }

    const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest("hex");

    return (
        expectedSignature.length === signature.length &&
        crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature))
    );
};

/*
Verify Razorpay payment and finalize the order

POST /api/payments/verify
*/

exports.verifyPayment = async (req, res) => {
    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return sendError(res, 400, errors.array()[0].msg);
        }

        const userId = req.user.id;
        const idempotencyKey = req.get?.("Idempotency-Key") || req.headers?.["idempotency-key"];
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!idempotencyKey) {
            return sendError(res, 400, "Idempotency-Key header is required");
        }

        const order = await Order.findOne({
            user: userId,
            razorpayOrderId: razorpay_order_id
        });

        if (!order) {
            return sendError(res, 404, "Order not found for this payment");
        }

        if (order.paymentStatus === "Paid") {
            return sendSuccess(res, 200, { message: "Payment already verified", data: order });
        }

        const isValid = isValidSignature(
            `${razorpay_order_id}|${razorpay_payment_id}`,
            razorpay_signature,
            process.env.RAZORPAY_KEY_SECRET
        );

        if (!isValid) {
            order.paymentStatus = "Failed";
            order.paymentFailureReason = "Payment signature verification failed";
            await order.save();
            return sendError(res, 400, "Payment verification failed");
        }

        const { order: finalizedOrder, alreadyPaid } = await finalizePaidOrder({
            userId,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
            idempotencyKey,
            source: "payment-verification"
        });

        return sendSuccess(res, 200, {
            message: alreadyPaid ? "Payment already verified" : "Payment verified, order confirmed",
            data: finalizedOrder
        });
    } catch (error) {
        const statusCode = error.statusCode || (error.code === 11000 ? 409 : 500);
        return sendError(res, statusCode, error.message);
    }
};

/*
Receive asynchronous payment events from Razorpay

POST /api/payments/webhook

Razorpay retries any non-2xx response, so business outcomes that a retry
cannot change (unknown order, out of stock, duplicate) are acknowledged
with 200 and logged; only unexpected failures return 500.
*/

exports.handleWebhook = async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
        console.error("Razorpay webhook received but RAZORPAY_WEBHOOK_SECRET is not set");
        return sendError(res, 500, "Webhook is not configured");
    }

    const signature = req.get?.("X-Razorpay-Signature") || req.headers?.["x-razorpay-signature"];

    if (!req.rawBody || !isValidSignature(req.rawBody, signature, secret)) {
        return sendError(res, 400, "Invalid webhook signature");
    }

    const { event, payload } = req.body || {};
    const payment = payload?.payment?.entity;

    if (!payment?.order_id) {
        return sendSuccess(res, 200, { message: `Webhook event ${event} ignored` });
    }

    try {
        if (event === "payment.captured" || event === "order.paid") {
            await finalizePaidOrder({
                razorpayOrderId: payment.order_id,
                razorpayPaymentId: payment.id,
                source: "webhook"
            });
        } else if (event === "payment.failed") {
            await markPaymentFailed({
                razorpayOrderId: payment.order_id,
                razorpayPaymentId: payment.id,
                reason: payment.error_description,
                source: "webhook"
            });
        } else {
            return sendSuccess(res, 200, { message: `Webhook event ${event} ignored` });
        }

        return sendSuccess(res, 200, { message: "Webhook processed" });
    } catch (error) {
        if ((error.statusCode && error.statusCode < 500) || error.code === 11000) {
            console.warn(`Razorpay webhook ${event} for ${payment.order_id} not applied:`, error.message);
            return sendSuccess(res, 200, { message: "Webhook acknowledged" });
        }

        console.error(`Razorpay webhook ${event} for ${payment.order_id} failed:`, error.message);
        return sendError(res, 500, "Webhook processing failed");
    }
};
