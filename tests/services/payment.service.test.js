jest.mock("../../src/models/Order");
jest.mock("../../src/models/Product");
jest.mock("../../src/models/Cart");
jest.mock("../../src/utils/runInTransaction");

const runInTransaction = require("../../src/utils/runInTransaction");
const Order = require("../../src/models/Order");
const Product = require("../../src/models/Product");
const Cart = require("../../src/models/Cart");
const { finalizePaidOrder, markPaymentFailed } = require("../../services/payment.service");

const withSession = (value) => ({ session: jest.fn().mockResolvedValue(value) });

describe("payment.service", () => {

    let session;

    beforeEach(() => {
        jest.clearAllMocks();
        session = { id: "session-1" };
        runInTransaction.mockImplementation((work) => work(session));
    });

    describe("finalizePaidOrder", () => {

        const pendingOrder = () => ({
            _id: "o1",
            user: "user-1",
            paymentStatus: "Pending",
            items: [{ product: "p1", name: "Widget", quantity: 2 }],
            save: jest.fn().mockResolvedValue(true)
        });

        it("decrements stock, confirms the order and clears the cart", async () => {
            const order = pendingOrder();
            Order.findOne.mockReturnValueOnce(withSession(order));
            Product.updateOne.mockResolvedValue({ modifiedCount: 1 });

            const result = await finalizePaidOrder({
                razorpayOrderId: "order_1",
                razorpayPaymentId: "pay_1",
                source: "webhook"
            });

            expect(Product.updateOne).toHaveBeenCalledWith(
                { _id: "p1", stock: { $gte: 2 } },
                { $inc: { stock: -2 } },
                { session }
            );
            expect(order.paymentStatus).toBe("Paid");
            expect(order.orderStatus).toBe("Processing");
            expect(order.razorpayPaymentId).toBe("pay_1");
            expect(order.paymentConfirmationSource).toBe("webhook");
            expect(order.paymentConfirmedAt).toBeInstanceOf(Date);
            expect(Cart.updateOne).toHaveBeenCalledWith({ user: "user-1" }, { $set: { items: [] } }, { session });
            expect(result).toEqual({ order, alreadyPaid: false });
        });

        it("scopes the lookup to the user when one is given", async () => {
            Order.findOne.mockReturnValueOnce(withSession({ paymentStatus: "Paid" }));

            await finalizePaidOrder({ razorpayOrderId: "order_1", userId: "user-1" });

            expect(Order.findOne).toHaveBeenCalledWith({ razorpayOrderId: "order_1", user: "user-1" });
        });

        it("returns an already paid order untouched", async () => {
            const order = { paymentStatus: "Paid", save: jest.fn() };
            Order.findOne.mockReturnValueOnce(withSession(order));

            const result = await finalizePaidOrder({ razorpayOrderId: "order_1" });

            expect(result).toEqual({ order, alreadyPaid: true });
            expect(Product.updateOne).not.toHaveBeenCalled();
            expect(order.save).not.toHaveBeenCalled();
        });

        it("throws 404 when the order does not exist", async () => {
            Order.findOne.mockReturnValueOnce(withSession(null));

            await expect(finalizePaidOrder({ razorpayOrderId: "missing" }))
                .rejects.toMatchObject({ statusCode: 404 });
        });

        it("throws 400 when an item is out of stock", async () => {
            Order.findOne.mockReturnValueOnce(withSession(pendingOrder()));
            Product.updateOne.mockResolvedValue({ modifiedCount: 0 });

            await expect(finalizePaidOrder({ razorpayOrderId: "order_1" }))
                .rejects.toMatchObject({ statusCode: 400, message: "Widget is out of stock" });
            expect(Cart.updateOne).not.toHaveBeenCalled();
        });

        it("throws 409 when the idempotency key belongs to another order", async () => {
            Order.findOne
                .mockReturnValueOnce(withSession(pendingOrder()))
                .mockReturnValueOnce(withSession({ _id: "other-order" }));

            await expect(finalizePaidOrder({ razorpayOrderId: "order_1", idempotencyKey: "key-123" }))
                .rejects.toMatchObject({ statusCode: 409 });
            expect(Product.updateOne).not.toHaveBeenCalled();
        });

    });

    describe("markPaymentFailed", () => {

        it("marks a non-paid order as failed", async () => {
            Order.findOneAndUpdate.mockResolvedValue({});

            await markPaymentFailed({
                razorpayOrderId: "order_1",
                razorpayPaymentId: "pay_1",
                reason: "Card declined",
                source: "webhook"
            });

            expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
                { razorpayOrderId: "order_1", paymentStatus: { $ne: "Paid" } },
                {
                    $set: {
                        paymentStatus: "Failed",
                        paymentFailureReason: "Card declined",
                        paymentConfirmationSource: "webhook",
                        razorpayPaymentId: "pay_1"
                    }
                },
                { new: true }
            );
        });

    });

});
