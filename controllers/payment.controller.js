const crypto = require("crypto");
const mongoose = require("mongoose");
const { validationResult } = require("express-validator");

const Order = require("../src/models/Order");
const Product = require("../src/models/Product");
const Cart = require("../src/models/Cart");
const { sendSuccess, sendError } = require("../src/utils/response");

const createRequestError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

/*
Verify Razorpay payment and finalize the order

POST /api/payments/verify
*/

exports.verifyPayment = async (req, res) => {
    let session;

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

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        const isValid =
            expectedSignature.length === razorpay_signature.length &&
            crypto.timingSafeEqual(
                Buffer.from(expectedSignature),
                Buffer.from(razorpay_signature)
            );

        if (!isValid) {
            order.paymentStatus = "Failed";
            await order.save();
            return sendError(res, 400, "Payment verification failed");
        }

        let finalizedOrder;
        let alreadyVerified = false;

        session = await mongoose.startSession();

        await session.withTransaction(async () => {
            const currentOrder = await Order.findOne({
                user: userId,
                razorpayOrderId: razorpay_order_id
            }).session(session);

            if (!currentOrder) {
                throw createRequestError(404, "Order not found for this payment");
            }

            if (currentOrder.paymentStatus === "Paid") {
                finalizedOrder = currentOrder;
                alreadyVerified = true;
                return;
            }

            const keyAlreadyUsed = await Order.findOne({
                user: userId,
                paymentVerificationKey: idempotencyKey
            }).session(session);

            if (keyAlreadyUsed && keyAlreadyUsed._id.toString() !== currentOrder._id.toString()) {
                throw createRequestError(409, "Idempotency key was already used for another payment");
            }

            for (const item of currentOrder.items) {
                const stockUpdate = await Product.updateOne(
                    { _id: item.product, stock: { $gte: item.quantity } },
                    { $inc: { stock: -item.quantity } },
                    { session }
                );

                if (stockUpdate.modifiedCount !== 1) {
                    throw createRequestError(400, `${item.name} is out of stock`);
                }
            }

            currentOrder.paymentStatus = "Paid";
            currentOrder.orderStatus = "Processing";
            currentOrder.razorpayPaymentId = razorpay_payment_id;
            currentOrder.razorpaySignature = razorpay_signature;
            currentOrder.paymentVerificationKey = idempotencyKey;
            await currentOrder.save({ session });

            const cart = await Cart.findOne({ user: userId }).session(session);

            if (cart) {
                cart.items = [];
                await cart.save({ session });
            }

            finalizedOrder = currentOrder;
        });

        return sendSuccess(res, 200, {
            message: alreadyVerified ? "Payment already verified" : "Payment verified, order confirmed",
            data: finalizedOrder
        });
    } catch (error) {
        const statusCode = error.statusCode || (error.code === 11000 ? 409 : 500);
        return sendError(res, statusCode, error.message);
    } finally {
        if (session) {
            await session.endSession();
        }
    }
};
