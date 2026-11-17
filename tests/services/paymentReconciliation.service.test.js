jest.mock("../../src/models/Order");
jest.mock("../../services/payment.service");
jest.mock("../../services/inventory.service", () => ({
    ONLINE_METHODS: ["CARD", "UPI"],
    releaseOrderReservation: jest.fn()
}));
jest.mock("../../utils/notification", () => ({ createUserNotification: jest.fn() }));
jest.mock("../../src/config/razorpay", () => ({
    orders: { fetchPayments: jest.fn() }
}));

const Order = require("../../src/models/Order");
const razorpay = require("../../src/config/razorpay");
const { finalizePaidOrder, markPaymentFailed } = require("../../services/payment.service");
const { releaseOrderReservation } = require("../../services/inventory.service");
const { createUserNotification } = require("../../utils/notification");
const { reconcilePendingPayments, releaseExpiredReservations } = require("../../services/paymentReconciliation.service");

const mockOrders = (orders) => {
    const query = { sort: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue(orders) };
    Order.find.mockReturnValue(query);
    return query;
};

describe("paymentReconciliation.service", () => {

    beforeEach(() => {
        jest.clearAllMocks();
        Order.updateOne.mockResolvedValue({});
    });

    it("only looks at online orders outside the grace period", async () => {
        mockOrders([]);

        await reconcilePendingPayments({ graceMinutes: 10, lookbackHours: 48 });

        const filter = Order.find.mock.calls[0][0];
        expect(filter.paymentMethod).toEqual({ $in: ["CARD", "UPI"] });
        expect(filter.paymentStatus).toEqual({ $in: ["Pending", "Failed"] });
        expect(filter.createdAt.$lte.getTime()).toBeLessThanOrEqual(Date.now() - 10 * 60 * 1000);
    });

    it("finalizes orders whose payment was captured", async () => {
        mockOrders([{ _id: "o1", razorpayOrderId: "order_1", paymentStatus: "Pending" }]);
        razorpay.orders.fetchPayments.mockResolvedValue({
            items: [{ id: "pay_fail", status: "failed" }, { id: "pay_ok", status: "captured" }]
        });
        finalizePaidOrder.mockResolvedValue({ alreadyPaid: false });

        const summary = await reconcilePendingPayments();

        expect(finalizePaidOrder).toHaveBeenCalledWith({
            razorpayOrderId: "order_1",
            razorpayPaymentId: "pay_ok",
            source: "reconciliation"
        });
        expect(markPaymentFailed).not.toHaveBeenCalled();
        expect(summary).toEqual({ checked: 1, paid: 1, failed: 0, errors: 0 });
        expect(Order.updateOne).toHaveBeenCalledWith(
            { _id: "o1" },
            { $set: { lastReconciledAt: expect.any(Date) } }
        );
    });

    it("marks pending orders failed when Razorpay reports only failed payments", async () => {
        mockOrders([{ _id: "o1", razorpayOrderId: "order_1", paymentStatus: "Pending" }]);
        razorpay.orders.fetchPayments.mockResolvedValue({
            items: [{ id: "pay_fail", status: "failed", error_description: "Card declined" }]
        });

        const summary = await reconcilePendingPayments();

        expect(markPaymentFailed).toHaveBeenCalledWith({
            razorpayOrderId: "order_1",
            razorpayPaymentId: "pay_fail",
            reason: "Card declined",
            source: "reconciliation"
        });
        expect(summary.failed).toBe(1);
    });

    it("does not re-mark orders that are already failed", async () => {
        mockOrders([{ _id: "o1", razorpayOrderId: "order_1", paymentStatus: "Failed" }]);
        razorpay.orders.fetchPayments.mockResolvedValue({ items: [{ id: "pay_fail", status: "failed" }] });

        const summary = await reconcilePendingPayments();

        expect(markPaymentFailed).not.toHaveBeenCalled();
        expect(summary.failed).toBe(0);
    });

    it("counts errors and keeps going with the next order", async () => {
        mockOrders([
            { _id: "o1", razorpayOrderId: "order_1", paymentStatus: "Pending" },
            { _id: "o2", razorpayOrderId: "order_2", paymentStatus: "Pending" }
        ]);
        razorpay.orders.fetchPayments
            .mockRejectedValueOnce(new Error("Razorpay down"))
            .mockResolvedValueOnce({ items: [{ id: "pay_ok", status: "captured" }] });
        finalizePaidOrder.mockResolvedValue({ alreadyPaid: false });
        jest.spyOn(console, "error").mockImplementation(() => {});

        const summary = await reconcilePendingPayments();

        expect(summary).toEqual({ checked: 2, paid: 1, failed: 0, errors: 1 });
    });

    describe("releaseExpiredReservations", () => {

        it("releases unpaid expired reservations and tells the customer", async () => {
            mockOrders([{ _id: "o1", razorpayOrderId: "order_1" }]);
            razorpay.orders.fetchPayments.mockResolvedValue({ items: [{ id: "pay_fail", status: "failed" }] });
            releaseOrderReservation.mockResolvedValue({ _id: "o1", user: "user-1", orderStatus: "Cancelled" });

            const summary = await releaseExpiredReservations();

            const filter = Order.find.mock.calls[0][0];
            expect(filter).toMatchObject({ stockDeducted: true, orderStatus: "Pending", paymentStatus: { $ne: "Paid" } });
            expect(filter.reservationExpiresAt.$lte).toBeInstanceOf(Date);
            expect(releaseOrderReservation).toHaveBeenCalledWith("o1", "Payment was not completed in time");
            expect(createUserNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", title: "Order cancelled" }));
            expect(summary).toEqual({ expired: 1, released: 1, paid: 0, errors: 0 });
        });

        it("confirms the order instead when Razorpay captured a payment", async () => {
            mockOrders([{ _id: "o1", razorpayOrderId: "order_1" }]);
            razorpay.orders.fetchPayments.mockResolvedValue({ items: [{ id: "pay_ok", status: "captured" }] });
            finalizePaidOrder.mockResolvedValue({ alreadyPaid: false });

            const summary = await releaseExpiredReservations();

            expect(finalizePaidOrder).toHaveBeenCalledWith(expect.objectContaining({ razorpayPaymentId: "pay_ok" }));
            expect(releaseOrderReservation).not.toHaveBeenCalled();
            expect(summary.paid).toBe(1);
        });

        it("does not notify when another process already released the order", async () => {
            mockOrders([{ _id: "o1" }]);
            releaseOrderReservation.mockResolvedValue(null);

            const summary = await releaseExpiredReservations();

            expect(razorpay.orders.fetchPayments).not.toHaveBeenCalled();
            expect(createUserNotification).not.toHaveBeenCalled();
            expect(summary.released).toBe(0);
        });

    });

});

