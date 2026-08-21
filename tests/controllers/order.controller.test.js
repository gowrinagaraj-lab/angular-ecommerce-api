jest.mock("../../src/models/Cart");
jest.mock("../../src/models/Order");
jest.mock("../../src/models/Product");
jest.mock("../../src/models/Address");
jest.mock("../../utils/sendEmail");
jest.mock("../../utils/notification", () => ({
    createUserNotification: jest.fn().mockResolvedValue(null)
}));
jest.mock("../../src/config/razorpay", () => ({
    orders: { create: jest.fn() }
}));
jest.mock("express-validator", () => ({
    validationResult: jest.fn()
}));

const crypto = require("crypto");
const { validationResult } = require("express-validator");

const Cart = require("../../src/models/Cart");
const Order = require("../../src/models/Order");
const Product = require("../../src/models/Product");
const Address = require("../../src/models/Address");
const razorpay = require("../../src/config/razorpay");
const sendEmail = require("../../utils/sendEmail");

const orderController = require("../../controllers/order.controller");
const { mockResponse } = require("../helpers/mockRes");

const validRequest = () => ({ isEmpty: () => true, array: () => [] });
const invalidRequest = (msg) => ({ isEmpty: () => false, array: () => [{ msg }] });

describe("order.controller", () => {

    beforeEach(() => {
        jest.clearAllMocks();
        validationResult.mockReturnValue(validRequest());
    });

    describe("checkout", () => {

        const address = {
            fullName: "Jane", phone: "123", address: "Street 1",
            city: "City", state: "State", country: "Country", pincode: "12345"
        };

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("Invalid checkout data"));

            const req = { user: { id: "user-1" }, body: {} };
            const res = mockResponse();

            await orderController.checkout(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns 404 when the given addressId does not belong to the user", async () => {

            Address.findOne.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, body: { addressId: "addr-1", paymentMethod: "COD" } };
            const res = mockResponse();

            await orderController.checkout(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("returns 400 when no address is supplied and no default address exists", async () => {

            Address.findOne.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, body: { paymentMethod: "COD" } };
            const res = mockResponse();

            await orderController.checkout(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: "shippingAddress or addressId is required, and no default address was found"
            }));

        });

        it("returns 400 when the cart is empty", async () => {

            Address.findOne.mockResolvedValue(address);
            Cart.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });

            const req = { user: { id: "user-1" }, body: { addressId: "addr-1", paymentMethod: "COD" } };
            const res = mockResponse();

            await orderController.checkout(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Cart is empty" }));

        });

        it("returns 400 when a cart item exceeds available stock", async () => {

            Address.findOne.mockResolvedValue(address);
            const cart = {
                items: [{ product: { _id: "p1", name: "Widget", price: 10, stock: 1 }, quantity: 5 }]
            };
            Cart.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(cart) });

            const req = { user: { id: "user-1" }, body: { addressId: "addr-1", paymentMethod: "COD" } };
            const res = mockResponse();

            await orderController.checkout(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Widget is out of stock" }));

        });

        it("places a COD order: decrements stock, clears the cart, and skips Razorpay", async () => {

            Address.findOne.mockResolvedValue(address);
            const cart = {
                items: [{ product: { _id: "p1", name: "Widget", price: 10, stock: 5 }, quantity: 2 }],
                save: jest.fn().mockResolvedValue(true)
            };
            Cart.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(cart) });
            const order = { _id: "order-1", save: jest.fn().mockResolvedValue(true) };
            Order.create.mockResolvedValue(order);
            Order.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ user: { name: "Jane", email: "jane@example.com", role: "customer" } })
            });

            const req = { user: { id: "user-1" }, body: { addressId: "addr-1", paymentMethod: "COD" } };
            const res = mockResponse();

            await orderController.checkout(req, res);

            expect(Order.create).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: "COD", totalAmount: 20 }));
            expect(Product.findByIdAndUpdate).toHaveBeenCalledWith("p1", { $inc: { stock: -2 } });
            expect(cart.items).toHaveLength(0);
            expect(cart.save).toHaveBeenCalled();
            expect(razorpay.orders.create).not.toHaveBeenCalled();
            expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
                to: "jane@example.com",
                subject: expect.stringContaining("Order Confirmation")
            }));
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Order placed successfully" }));

        });

        it("still places the order when the confirmation email fails to send", async () => {

            Address.findOne.mockResolvedValue(address);
            const cart = {
                items: [{ product: { _id: "p1", name: "Widget", price: 10, stock: 5 }, quantity: 2 }],
                save: jest.fn().mockResolvedValue(true)
            };
            Cart.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(cart) });
            const order = { _id: "order-1", save: jest.fn().mockResolvedValue(true) };
            Order.create.mockResolvedValue(order);
            Order.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ user: { name: "Jane", email: "jane@example.com", role: "customer" } })
            });
            sendEmail.mockRejectedValueOnce(new Error("SMTP down"));

            const req = { user: { id: "user-1" }, body: { addressId: "addr-1", paymentMethod: "COD" } };
            const res = mockResponse();

            await orderController.checkout(req, res);

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Order placed successfully" }));

        });

        it("uses the user's default address when no addressId or shippingAddress is given", async () => {

            Address.findOne.mockResolvedValue(address);
            const cart = {
                items: [{ product: { _id: "p1", name: "Widget", price: 10, stock: 5 }, quantity: 1 }],
                save: jest.fn().mockResolvedValue(true)
            };
            Cart.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(cart) });
            Order.create.mockResolvedValue({ _id: "order-1", save: jest.fn() });

            const req = { user: { id: "user-1" }, body: { paymentMethod: "COD" } };
            const res = mockResponse();

            await orderController.checkout(req, res);

            expect(Address.findOne).toHaveBeenCalledWith({ user: "user-1", isDefault: true });
            expect(res.status).toHaveBeenCalledWith(201);

        });

        it("creates a Razorpay order for CARD/UPI and does not touch stock or cart yet", async () => {

            Address.findOne.mockResolvedValue(address);
            const cart = {
                items: [{ product: { _id: "p1", name: "Widget", price: 10, stock: 5 }, quantity: 1 }],
                save: jest.fn().mockResolvedValue(true)
            };
            Cart.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(cart) });
            const order = { _id: "order-1", save: jest.fn().mockResolvedValue(true) };
            Order.create.mockResolvedValue(order);
            Order.findById.mockReturnValue({
                populate: jest.fn().mockResolvedValue({ user: { name: "Jane", email: "jane@example.com", role: "customer" } })
            });
            razorpay.orders.create.mockResolvedValue({ id: "rzp_order_1", amount: 1000, currency: "INR" });

            const req = { user: { id: "user-1" }, body: { addressId: "addr-1", paymentMethod: "CARD" } };
            const res = mockResponse();

            await orderController.checkout(req, res);

            expect(razorpay.orders.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 1000, currency: "INR" }));
            expect(order.razorpayOrderId).toBe("rzp_order_1");
            expect(order.save).toHaveBeenCalled();
            expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
            expect(cart.save).not.toHaveBeenCalled();
            expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "jane@example.com" }));
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: "Order created, awaiting payment",
                razorpay: expect.objectContaining({ orderId: "rzp_order_1" })
            }));

        });

        it("returns 500 on unexpected errors", async () => {

            Address.findOne.mockRejectedValue(new Error("DB down"));

            const req = { user: { id: "user-1" }, body: { addressId: "addr-1", paymentMethod: "COD" } };
            const res = mockResponse();

            await orderController.checkout(req, res);

            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

    describe("generateDeliveryOtp", () => {

        it("returns 404 when the order does not exist", async () => {

            Order.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(null) });

            const req = { params: { id: "order-1" } };
            const res = mockResponse();

            await orderController.generateDeliveryOtp(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("rejects when the order is already delivered", async () => {

            Order.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ orderStatus: "Delivered" }) });

            const req = { params: { id: "order-1" } };
            const res = mockResponse();

            await orderController.generateDeliveryOtp(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("rejects when the order was cancelled", async () => {

            Order.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue({ orderStatus: "Cancelled" }) });

            const req = { params: { id: "order-1" } };
            const res = mockResponse();

            await orderController.generateDeliveryOtp(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("generates an OTP, sends the email, and saves the hashed value", async () => {

            const order = {
                orderStatus: "Processing",
                user: { name: "Jane", email: "jane@example.com" },
                save: jest.fn().mockResolvedValue(true)
            };
            Order.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(order) });
            sendEmail.mockResolvedValue(true);

            const req = { params: { id: "order-1" } };
            const res = mockResponse();

            await orderController.generateDeliveryOtp(req, res);

            expect(order.deliveryOtp).toBeDefined();
            expect(order.deliveryOtpExpire).toBeDefined();
            expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "jane@example.com" }));
            expect(res.status).toHaveBeenCalledWith(200);

        });

        it("clears the OTP and returns 500 when sending the email fails", async () => {

            const order = {
                orderStatus: "Processing",
                user: { name: "Jane", email: "jane@example.com" },
                save: jest.fn().mockResolvedValue(true)
            };
            Order.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(order) });
            sendEmail.mockRejectedValue(new Error("smtp down"));

            const req = { params: { id: "order-1" } };
            const res = mockResponse();

            await orderController.generateDeliveryOtp(req, res);

            expect(order.deliveryOtp).toBeUndefined();
            expect(order.deliveryOtpExpire).toBeUndefined();
            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

    describe("verifyDeliveryOtp", () => {

        const hashOtp = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("OTP is required"));

            const req = { params: { id: "order-1" }, body: {} };
            const res = mockResponse();

            await orderController.verifyDeliveryOtp(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns 404 when the order does not exist", async () => {

            Order.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

            const req = { params: { id: "order-1" }, body: { otp: "123456" } };
            const res = mockResponse();

            await orderController.verifyDeliveryOtp(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("rejects when the order is already delivered", async () => {

            Order.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ orderStatus: "Delivered" }) });

            const req = { params: { id: "order-1" }, body: { otp: "123456" } };
            const res = mockResponse();

            await orderController.verifyDeliveryOtp(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("rejects when the OTP is missing or expired", async () => {

            Order.findById.mockReturnValue({
                select: jest.fn().mockResolvedValue({
                    orderStatus: "Processing",
                    deliveryOtp: hashOtp("123456"),
                    deliveryOtpExpire: Date.now() - 1000
                })
            });

            const req = { params: { id: "order-1" }, body: { otp: "123456" } };
            const res = mockResponse();

            await orderController.verifyDeliveryOtp(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: "OTP has expired or was not generated, please generate a new one"
            }));

        });

        it("rejects an incorrect OTP", async () => {

            Order.findById.mockReturnValue({
                select: jest.fn().mockResolvedValue({
                    orderStatus: "Processing",
                    deliveryOtp: hashOtp("123456"),
                    deliveryOtpExpire: Date.now() + 60000
                })
            });

            const req = { params: { id: "order-1" }, body: { otp: "000000" } };
            const res = mockResponse();

            await orderController.verifyDeliveryOtp(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Invalid OTP" }));

        });

        it("marks a COD order Delivered and Paid on a correct OTP, and sends a delivery confirmation email", async () => {

            const order = {
                _id: "order-1",
                orderStatus: "Processing",
                paymentMethod: "COD",
                deliveryOtp: hashOtp("123456"),
                deliveryOtpExpire: Date.now() + 60000,
                save: jest.fn().mockResolvedValue(true)
            };
            Order.findById
                .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(order) })
                .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue({ user: { name: "Jane", email: "jane@example.com", role: "customer" } }) });

            const req = { params: { id: "order-1" }, body: { otp: "123456" } };
            const res = mockResponse();

            await orderController.verifyDeliveryOtp(req, res);

            expect(order.orderStatus).toBe("Delivered");
            expect(order.paymentStatus).toBe("Paid");
            expect(order.deliveryOtp).toBeUndefined();
            expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
                to: "jane@example.com",
                subject: expect.stringContaining("Delivered")
            }));
            expect(res.status).toHaveBeenCalledWith(200);

        });

        it("does not send a delivery confirmation email when the order owner is an admin", async () => {

            const order = {
                _id: "order-1",
                orderStatus: "Processing",
                paymentMethod: "COD",
                deliveryOtp: hashOtp("123456"),
                deliveryOtpExpire: Date.now() + 60000,
                save: jest.fn().mockResolvedValue(true)
            };
            Order.findById
                .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(order) })
                .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue({ user: { name: "Admin", email: "admin@example.com", role: "admin" } }) });

            const req = { params: { id: "order-1" }, body: { otp: "123456" } };
            const res = mockResponse();

            await orderController.verifyDeliveryOtp(req, res);

            expect(order.orderStatus).toBe("Delivered");
            expect(sendEmail).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);

        });

        it("marks a non-COD order Delivered without altering paymentStatus", async () => {

            const order = {
                orderStatus: "Processing",
                paymentMethod: "CARD",
                deliveryOtp: hashOtp("123456"),
                deliveryOtpExpire: Date.now() + 60000,
                save: jest.fn().mockResolvedValue(true)
            };
            Order.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(order) });

            const req = { params: { id: "order-1" }, body: { otp: "123456" } };
            const res = mockResponse();

            await orderController.verifyDeliveryOtp(req, res);

            expect(order.orderStatus).toBe("Delivered");
            expect(order.paymentStatus).toBeUndefined();

        });

    });

    describe("getAllOrders", () => {

        it("returns a paginated list filtered by orderStatus and paymentMethod", async () => {

            const orders = [{ _id: "order-1" }];
            const query = {
                populate: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue(orders)
            };
            Order.find.mockReturnValue(query);
            Order.countDocuments.mockResolvedValue(1);

            const req = { query: { orderStatus: "Processing", paymentMethod: "COD", page: "2", limit: "5" } };
            const res = mockResponse();

            await orderController.getAllOrders(req, res);

            expect(Order.find).toHaveBeenCalledWith({ orderStatus: "Processing", paymentMethod: "COD" });
            expect(query.skip).toHaveBeenCalledWith(5);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, page: 2, data: orders }));

        });

        it("returns 500 on unexpected errors", async () => {

            Order.countDocuments.mockRejectedValue(new Error("DB down"));

            const req = { query: {} };
            const res = mockResponse();

            await orderController.getAllOrders(req, res);

            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

    describe("getOrderStats", () => {

        it("returns delivered/cancelled counts and the total amount sum", async () => {

            Order.aggregate.mockResolvedValue([{
                delivered: [{ count: 4 }],
                cancelled: [{ count: 2 }],
                totalAmount: [{ sum: 1500 }]
            }]);

            const req = {};
            const res = mockResponse();

            await orderController.getOrderStats(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: expect.objectContaining({ totalDelivered: 4, totalCancelled: 2, totalAmount: 1500 })
            }));

        });

        it("defaults counts and sum to 0 when there are no matching orders", async () => {

            Order.aggregate.mockResolvedValue([{
                delivered: [],
                cancelled: [],
                totalAmount: []
            }]);

            const req = {};
            const res = mockResponse();

            await orderController.getOrderStats(req, res);

            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ totalDelivered: 0, totalCancelled: 0, totalAmount: 0 })
            }));

        });

        it("returns 500 on unexpected errors", async () => {

            Order.aggregate.mockRejectedValue(new Error("DB down"));

            const req = {};
            const res = mockResponse();

            await orderController.getOrderStats(req, res);

            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

    describe("getOrderById", () => {

        it("returns 404 when the order does not exist", async () => {

            Order.findById.mockResolvedValue(null);

            const req = { params: { id: "order-1" }, user: { id: "user-1", role: "customer" } };
            const res = mockResponse();

            await orderController.getOrderById(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("rejects a non-owner, non-admin request with 403", async () => {

            Order.findById.mockResolvedValue({ user: { toString: () => "someone-else" } });

            const req = { params: { id: "order-1" }, user: { id: "user-1", role: "customer" } };
            const res = mockResponse();

            await orderController.getOrderById(req, res);

            expect(res.status).toHaveBeenCalledWith(403);

        });

        it("allows the owner to view their order", async () => {

            const order = { user: { toString: () => "user-1" } };
            Order.findById.mockResolvedValue(order);

            const req = { params: { id: "order-1" }, user: { id: "user-1", role: "customer" } };
            const res = mockResponse();

            await orderController.getOrderById(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: order }));

        });

        it("allows an admin to view any order", async () => {

            const order = { user: { toString: () => "someone-else" } };
            Order.findById.mockResolvedValue(order);

            const req = { params: { id: "order-1" }, user: { id: "admin-1", role: "admin" } };
            const res = mockResponse();

            await orderController.getOrderById(req, res);

            expect(res.status).toHaveBeenCalledWith(200);

        });

    });

    describe("updateOrderStatus", () => {

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("Invalid status"));

            const req = { params: { id: "order-1" }, body: {} };
            const res = mockResponse();

            await orderController.updateOrderStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns 404 when the order does not exist", async () => {

            Order.findById.mockResolvedValue(null);

            const req = { params: { id: "order-1" }, body: { orderStatus: "Shipped" } };
            const res = mockResponse();

            await orderController.updateOrderStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("rejects changing the status of a Delivered order", async () => {

            Order.findById.mockResolvedValue({ orderStatus: "Delivered" });

            const req = { params: { id: "order-1" }, body: { orderStatus: "Shipped" } };
            const res = mockResponse();

            await orderController.updateOrderStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("updates the order status successfully", async () => {

            const order = { orderStatus: "Processing", save: jest.fn().mockResolvedValue(true) };
            Order.findById.mockResolvedValue(order);

            const req = { params: { id: "order-1" }, body: { orderStatus: "Shipped" } };
            const res = mockResponse();

            await orderController.updateOrderStatus(req, res);

            expect(order.orderStatus).toBe("Shipped");
            expect(res.status).toHaveBeenCalledWith(200);

        });

    });

    describe("cancelOrder", () => {

        it("returns 404 when the order does not exist", async () => {

            Order.findById.mockResolvedValue(null);

            const req = { params: { id: "order-1" }, user: { id: "user-1", role: "customer" } };
            const res = mockResponse();

            await orderController.cancelOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("rejects a non-owner, non-admin request with 403", async () => {

            Order.findById.mockResolvedValue({ user: { toString: () => "someone-else" }, orderStatus: "Processing" });

            const req = { params: { id: "order-1" }, user: { id: "user-1", role: "customer" } };
            const res = mockResponse();

            await orderController.cancelOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(403);

        });

        it("rejects cancelling an already Delivered/Cancelled order", async () => {

            Order.findById.mockResolvedValue({ user: { toString: () => "user-1" }, orderStatus: "Cancelled" });

            const req = { params: { id: "order-1" }, user: { id: "user-1", role: "customer" } };
            const res = mockResponse();

            await orderController.cancelOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("rejects cancelling a Shipped order", async () => {

            Order.findById.mockResolvedValue({ user: { toString: () => "user-1" }, orderStatus: "Shipped" });

            const req = { params: { id: "order-1" }, user: { id: "user-1", role: "customer" } };
            const res = mockResponse();

            await orderController.cancelOrder(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Order has already shipped and can no longer be cancelled" }));

        });

        it("restocks items when cancelling a paid order, marks it Cancelled, and sends a cancellation email", async () => {

            const order = {
                _id: "order-1",
                user: { toString: () => "user-1" },
                orderStatus: "Processing",
                paymentMethod: "CARD",
                paymentStatus: "Paid",
                items: [{ product: "p1", quantity: 3 }],
                save: jest.fn().mockResolvedValue(true)
            };
            Order.findById
                .mockResolvedValueOnce(order)
                .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue({ user: { name: "Jane", email: "jane@example.com", role: "customer" } }) });

            const req = { params: { id: "order-1" }, user: { id: "user-1", role: "customer" } };
            const res = mockResponse();

            await orderController.cancelOrder(req, res);

            expect(Product.findByIdAndUpdate).toHaveBeenCalledWith("p1", { $inc: { stock: 3 } });
            expect(order.orderStatus).toBe("Cancelled");
            expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
                to: "jane@example.com",
                subject: expect.stringContaining("Cancelled")
            }));
            expect(res.status).toHaveBeenCalledWith(200);

        });

        it("does not restock an unpaid non-COD order", async () => {

            const order = {
                user: { toString: () => "user-1" },
                orderStatus: "Processing",
                paymentMethod: "CARD",
                paymentStatus: "Pending",
                items: [{ product: "p1", quantity: 3 }],
                save: jest.fn().mockResolvedValue(true)
            };
            Order.findById.mockResolvedValue(order);

            const req = { params: { id: "order-1" }, user: { id: "user-1", role: "customer" } };
            const res = mockResponse();

            await orderController.cancelOrder(req, res);

            expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
            expect(order.orderStatus).toBe("Cancelled");

        });

    });

    describe("getOrders", () => {

        it("returns the current user's paginated order history", async () => {

            const orders = [{ _id: "order-1" }];
            const query = {
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue(orders)
            };
            Order.find.mockReturnValue(query);
            Order.countDocuments.mockResolvedValue(1);

            const req = { user: { id: "user-1" }, query: {} };
            const res = mockResponse();

            await orderController.getOrders(req, res);

            expect(Order.find).toHaveBeenCalledWith({ user: "user-1" });
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, total: 1, data: orders }));

        });

        it("returns 500 on unexpected errors", async () => {

            Order.countDocuments.mockRejectedValue(new Error("DB down"));

            const req = { user: { id: "user-1" }, query: {} };
            const res = mockResponse();

            await orderController.getOrders(req, res);

            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

});
