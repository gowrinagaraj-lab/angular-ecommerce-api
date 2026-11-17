jest.mock("../../src/models/Order");
jest.mock("../../src/models/Product");
jest.mock("../../src/models/User");
jest.mock("../../src/utils/runInTransaction", () => jest.fn((work) => work(null)));
jest.mock("../../utils/sendEmail");
jest.mock("../../utils/notification", () => ({ createUserNotification: jest.fn() }));

const Order = require("../../src/models/Order");
const Product = require("../../src/models/Product");
const User = require("../../src/models/User");
const sendEmail = require("../../utils/sendEmail");
const { createUserNotification } = require("../../utils/notification");
const {
    deductStock,
    restoreStock,
    releaseOrderReservation,
    checkLowStock,
    getInventorySummary
} = require("../../services/inventory.service");

const selectable = (value) => ({ select: jest.fn().mockResolvedValue(value) });

describe("inventory.service", () => {

    beforeEach(() => {
        jest.clearAllMocks();
        Product.updateMany.mockResolvedValue({});
        Product.find.mockReturnValue(selectable([]));
    });

    describe("deductStock / restoreStock", () => {

        it("takes stock only while enough is left", async () => {
            Product.updateOne.mockResolvedValue({ modifiedCount: 1 });

            await deductStock([{ product: "p1", name: "Widget", quantity: 2 }], "session");

            expect(Product.updateOne).toHaveBeenCalledWith(
                { _id: "p1", stock: { $gte: 2 } },
                { $inc: { stock: -2 } },
                { session: "session" }
            );
        });

        it("throws 400 when an item cannot be reserved", async () => {
            Product.updateOne.mockResolvedValue({ modifiedCount: 0 });

            await expect(deductStock([{ product: "p1", name: "Widget", quantity: 2 }]))
                .rejects.toMatchObject({ statusCode: 400, message: "Widget is out of stock" });
        });

        it("gives stock back", async () => {
            await restoreStock([{ product: "p1", quantity: 3 }], "session");

            expect(Product.updateOne).toHaveBeenCalledWith({ _id: "p1" }, { $inc: { stock: 3 } }, { session: "session" });
        });

    });

    describe("releaseOrderReservation", () => {

        it("cancels an unpaid order that still holds stock and restores it", async () => {
            const released = { _id: "o1", items: [{ product: "p1", quantity: 2 }] };
            Order.findOneAndUpdate.mockResolvedValue(released);

            const result = await releaseOrderReservation("o1", "Payment was not completed in time");

            expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
                { _id: "o1", stockDeducted: true, paymentStatus: { $ne: "Paid" } },
                expect.objectContaining({
                    $set: expect.objectContaining({ stockDeducted: false, orderStatus: "Cancelled" })
                }),
                { new: true, session: null }
            );
            expect(Product.updateOne).toHaveBeenCalledWith({ _id: "p1" }, { $inc: { stock: 2 } }, { session: null });
            expect(result).toBe(released);
        });

        it("does nothing when the order is already paid or released", async () => {
            Order.findOneAndUpdate.mockResolvedValue(null);

            const result = await releaseOrderReservation("o1", "reason");

            expect(Product.updateOne).not.toHaveBeenCalled();
            expect(result).toBeNull();
        });

    });

    describe("checkLowStock", () => {

        it("re-arms alerts for restocked products and alerts admins once for low ones", async () => {
            Product.find.mockReturnValue(selectable([{ _id: "p1" }]));
            Product.findOneAndUpdate.mockReturnValue(selectable({ _id: "p1", name: "Widget", stock: 2, lowStockThreshold: 5 }));
            User.find.mockReturnValue(selectable([{ _id: "admin-1", name: "Admin", email: "admin@example.com" }]));

            await checkLowStock(["p1", "p1", "p2"]);

            expect(Product.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({ _id: { $in: ["p1", "p2"] }, lowStockAlertedAt: { $ne: null } }),
                { $unset: { lowStockAlertedAt: 1 } }
            );
            expect(Product.findOneAndUpdate).toHaveBeenCalledWith(
                { _id: "p1", lowStockAlertedAt: null },
                { $set: { lowStockAlertedAt: expect.any(Date) } },
                { new: true }
            );
            expect(createUserNotification).toHaveBeenCalledWith(expect.objectContaining({
                userId: "admin-1",
                title: "Low stock alert"
            }));
            expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
                to: "admin@example.com",
                subject: "Low stock: Widget"
            }));
        });

        it("sends nothing when another request already claimed the alert", async () => {
            Product.find.mockReturnValue(selectable([{ _id: "p1" }]));
            Product.findOneAndUpdate.mockReturnValue(selectable(null));

            await checkLowStock(["p1"]);

            expect(User.find).not.toHaveBeenCalled();
            expect(sendEmail).not.toHaveBeenCalled();
        });

        it("never throws, so an alert failure cannot fail an order", async () => {
            Product.updateMany.mockRejectedValue(new Error("DB down"));
            jest.spyOn(console, "error").mockImplementation(() => {});

            await expect(checkLowStock(["p1"])).resolves.toBeUndefined();
        });

    });

    describe("getInventorySummary", () => {

        it("returns counts, reserved units and the low-stock list", async () => {
            Product.countDocuments
                .mockResolvedValueOnce(40)
                .mockResolvedValueOnce(3)
                .mockResolvedValueOnce(6);
            Product.find.mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                select: jest.fn().mockResolvedValue([{ _id: "p1", name: "Widget", stock: 0, isActive: true }])
            });
            Order.aggregate.mockResolvedValue([{ units: 7, orders: ["o1", "o2"] }]);

            const summary = await getInventorySummary();

            expect(summary).toMatchObject({
                totalProducts: 40,
                outOfStock: 3,
                lowStock: 6,
                reservedUnits: 7,
                reservedOrders: 2
            });
            expect(summary.lowStockProducts[0]).toMatchObject({ name: "Widget", stock: 0, lowStockThreshold: 5 });
        });

    });

});
