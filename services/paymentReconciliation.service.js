const Order = require("../src/models/Order");
const razorpay = require("../src/config/razorpay");
const { finalizePaidOrder, markPaymentFailed } = require("./payment.service");
const { ONLINE_METHODS, releaseOrderReservation } = require("./inventory.service");
const { createUserNotification } = require("../utils/notification");

const MINUTE_MS = 60 * 1000;

/*
Ask Razorpay for the real state of online orders that are still Pending
(or Failed, in case a later retry was captured) and apply it. Orders
younger than the grace period are skipped so the client verify call and
the webhook get the first chance to confirm them.
*/

const reconcilePendingPayments = async ({
    graceMinutes = 10,
    lookbackHours = 48,
    limit = 100
} = {}) => {
    const now = Date.now();

    const orders = await Order.find({
        paymentMethod: { $in: ["CARD", "UPI"] },
        paymentStatus: { $in: ["Pending", "Failed"] },
        razorpayOrderId: { $type: "string", $ne: "" },
        createdAt: {
            $gte: new Date(now - lookbackHours * 60 * MINUTE_MS),
            $lte: new Date(now - graceMinutes * MINUTE_MS)
        }
    })
        .sort({ lastReconciledAt: 1, createdAt: 1 })
        .limit(limit);

    const summary = { checked: orders.length, paid: 0, failed: 0, errors: 0 };

    for (const order of orders) {
        try {
            const { items: payments = [] } = await razorpay.orders.fetchPayments(order.razorpayOrderId);
            const captured = payments.find((payment) => payment.status === "captured");
            const failed = payments.find((payment) => payment.status === "failed");

            if (captured) {
                const { alreadyPaid } = await finalizePaidOrder({
                    razorpayOrderId: order.razorpayOrderId,
                    razorpayPaymentId: captured.id,
                    source: "reconciliation"
                });

                if (!alreadyPaid) {
                    summary.paid += 1;
                }
            } else if (failed && order.paymentStatus !== "Failed") {
                await markPaymentFailed({
                    razorpayOrderId: order.razorpayOrderId,
                    razorpayPaymentId: failed.id,
                    reason: failed.error_description,
                    source: "reconciliation"
                });
                summary.failed += 1;
            }
        } catch (error) {
            summary.errors += 1;
            console.error(`Payment reconciliation failed for order ${order._id}:`, error.message);
        } finally {
            await Order.updateOne({ _id: order._id }, { $set: { lastReconciledAt: new Date() } })
                .catch(() => {});
        }
    }

    return summary;
};

/*
Give back stock held by online orders whose payment window has passed.
Razorpay is asked first, so a payment that was captured but never reported
confirms the order instead of losing its stock.
*/

const releaseExpiredReservations = async ({ limit = 100 } = {}) => {
    const orders = await Order.find({
        paymentMethod: { $in: ONLINE_METHODS },
        orderStatus: "Pending",
        paymentStatus: { $ne: "Paid" },
        stockDeducted: true,
        reservationExpiresAt: { $lte: new Date() }
    })
        .sort({ reservationExpiresAt: 1 })
        .limit(limit);

    const summary = { expired: orders.length, released: 0, paid: 0, errors: 0 };

    for (const order of orders) {
        try {
            if (order.razorpayOrderId) {
                const { items: payments = [] } = await razorpay.orders.fetchPayments(order.razorpayOrderId);
                const captured = payments.find((payment) => payment.status === "captured");

                if (captured) {
                    await finalizePaidOrder({
                        razorpayOrderId: order.razorpayOrderId,
                        razorpayPaymentId: captured.id,
                        source: "reconciliation"
                    });
                    summary.paid += 1;
                    continue;
                }
            }

            const released = await releaseOrderReservation(order._id, "Payment was not completed in time");

            if (released) {
                summary.released += 1;

                await createUserNotification({
                    userId: released.user,
                    title: "Order cancelled",
                    message: `Your order #${released._id} was cancelled because payment was not completed in time.`,
                    type: "order",
                    link: `/orders/${released._id}`,
                    metadata: { orderId: released._id, orderStatus: released.orderStatus }
                });
            }
        } catch (error) {
            summary.errors += 1;
            console.error(`Releasing reservation for order ${order._id} failed:`, error.message);
        }
    }

    return summary;
};

/*
Run reconciliation on an interval. Configure with:
  PAYMENT_RECONCILIATION_ENABLED     (default true; "false" disables)
  PAYMENT_RECONCILIATION_INTERVAL_MS (default 5 min, min 1 min)
*/

const startPaymentReconciliation = () => {
    if (process.env.PAYMENT_RECONCILIATION_ENABLED === "false") {
        return null;
    }

    const intervalMs = Math.max(
        Number(process.env.PAYMENT_RECONCILIATION_INTERVAL_MS) || 5 * MINUTE_MS,
        MINUTE_MS
    );
    let running = false;

    const run = async () => {
        if (running) {
            return;
        }

        running = true;

        try {
            const summary = await reconcilePendingPayments();

            if (summary.checked > 0) {
                console.log(
                    `Payment reconciliation: ${summary.checked} checked, ${summary.paid} paid, ` +
                    `${summary.failed} failed, ${summary.errors} errors`
                );
            }

            const reservations = await releaseExpiredReservations();

            if (reservations.expired > 0) {
                console.log(
                    `Stock reservations: ${reservations.expired} expired, ${reservations.released} released, ` +
                    `${reservations.paid} paid late, ${reservations.errors} errors`
                );
            }
        } catch (error) {
            console.error("Payment reconciliation run failed:", error.message);
        } finally {
            running = false;
        }
    };

    const timer = setInterval(run, intervalMs);
    timer.unref();
    run();

    return timer;
};

module.exports = { reconcilePendingPayments, releaseExpiredReservations, startPaymentReconciliation };
