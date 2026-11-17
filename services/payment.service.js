const Cart = require("../src/models/Cart");
const Order = require("../src/models/Order");
const runInTransaction = require("../src/utils/runInTransaction");
const { deductStock, afterStockChange } = require("./inventory.service");

const createRequestError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

/*
Mark an order as paid: confirm the order and clear the user's cart in one
transaction. Stock was normally reserved at checkout; it is only taken here
for orders that no longer hold it (placed before reservations existed, or
released after the payment window expired and then paid late). Safe to call repeatedly from the client
verify route, the webhook and the reconciliation job — an order that is
already Paid is returned untouched.
*/

const finalizePaidOrder = async ({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    userId,
    idempotencyKey,
    source
}) => {
    const result = await runInTransaction(async (session) => {
        const filter = { razorpayOrderId };

        if (userId) {
            filter.user = userId;
        } 

        const order = await Order.findOne(filter).session(session);

        if (!order) {
            throw createRequestError(404, "Order not found for this payment");
        }

        if (order.paymentStatus === "Paid") {
            return { order, alreadyPaid: true };
        }

        if (idempotencyKey) {
            const keyAlreadyUsed = await Order.findOne({
                user: order.user,
                paymentVerificationKey: idempotencyKey
            }).session(session);

            if (keyAlreadyUsed && keyAlreadyUsed._id.toString() !== order._id.toString()) {
                throw createRequestError(409, "Idempotency key was already used for another payment");
            }

            order.paymentVerificationKey = idempotencyKey;
        }

        const needsStock = !order.stockDeducted;

        if (needsStock) {
            await deductStock(order.items, session);
            order.stockDeducted = true;
        }

        order.reservationExpiresAt = undefined;

        order.paymentStatus = "Paid";
        order.orderStatus = "Processing";
        order.razorpayPaymentId = razorpayPaymentId;
        order.paymentFailureReason = undefined;
        order.paymentConfirmedAt = new Date();
        order.paymentConfirmationSource = source;

        if (razorpaySignature) {
            order.razorpaySignature = razorpaySignature;
        }

        await order.save({ session });

        await Cart.updateOne(
            { user: order.user },
            { $set: { items: [] } },
            { session }
        );

        return { order, alreadyPaid: false, stockTaken: needsStock };
    });

    if (result.stockTaken) {
        void afterStockChange(result.order.items.map((item) => item.product));
    }

    return { order: result.order, alreadyPaid: result.alreadyPaid };
};

/*
Record a failed payment attempt. Never downgrades an order that has
already been paid (a customer may fail once and then succeed).
*/

const markPaymentFailed = ({ razorpayOrderId, razorpayPaymentId, reason, source }) => {
    const updates = {
        paymentStatus: "Failed",
        paymentFailureReason: reason || "Payment failed at Razorpay",
        paymentConfirmationSource: source
    };

    if (razorpayPaymentId) {
        updates.razorpayPaymentId = razorpayPaymentId;
    }

    return Order.findOneAndUpdate(
        { razorpayOrderId, paymentStatus: { $ne: "Paid" } },
        { $set: updates },
        { new: true }
    );
};

module.exports = { finalizePaidOrder, markPaymentFailed };
