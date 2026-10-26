const crypto = require("crypto");
const { validationResult } = require("express-validator");
const Cart = require("../src/models/Cart");
const Order = require("../src/models/Order");
const Product = require("../src/models/Product");
const Address = require("../src/models/Address");
const razorpay = require("../src/config/razorpay");
const sendEmail = require("../utils/sendEmail");
const { createUserNotification } = require("../utils/notification");
const { sendSuccess, sendError } = require("../src/utils/response");
const runInTransaction = require("../src/utils/runInTransaction");

const createRequestError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const createOrderItems = (cart) => {
    let grandTotal = 0;

    const items = cart.items.map((item) => {
        const product = item.product;

        if (!product) {
            throw createRequestError(400, "A product in your cart is no longer available");
        }

        const subtotal = product.price * item.quantity;
        grandTotal += subtotal;

        return {
            product: product._id,
            name: product.name,
            price: product.price,
            quantity: item.quantity,
            subtotal
        };
    });

    return { items, grandTotal };
};

/*
Order lifecycle: Pending -> Processing -> Shipped -> Delivered.
Online (CARD/UPI) orders reach Processing only once payment is confirmed
(verify call, webhook or reconciliation); COD orders are moved to
Processing by an admin. Delivered is set only by the delivery OTP.
*/

const getStatusTransitionError = (order, nextStatus) => {
    const isOnlinePayment = order.paymentMethod === "CARD" || order.paymentMethod === "UPI";

    if (nextStatus === "Processing") {
        if (order.orderStatus !== "Pending") {
            return `Only pending orders can be moved to Processing (order is ${order.orderStatus})`;
        }

        if (isOnlinePayment && order.paymentStatus !== "Paid") {
            return "Online orders move to Processing automatically once payment is confirmed";
        }

        return null;
    }

    if (nextStatus === "Shipped") {
        if (order.orderStatus !== "Processing") {
            return `Only processing orders can be shipped (order is ${order.orderStatus})`;
        }

        if (isOnlinePayment && order.paymentStatus !== "Paid") {
            return "Cannot ship an online order before payment is confirmed";
        }

        return null;
    }

    return `Order status cannot be changed to ${nextStatus}`;
};

const sendOrderCreatedMessages = async ({ order, userId, orderItems, grandTotal, paymentMethod }) => {
    try {
        await createUserNotification({
            userId,
            title: "Order created",
            message: paymentMethod === "CARD" || paymentMethod === "UPI"
                ? `Your order #${order._id} was created and is awaiting payment confirmation.`
                : `Your order #${order._id} has been placed successfully.`,
            type: "order",
            link: `/orders/${order._id}`,
            metadata: {
                orderId: order._id,
                orderStatus: order.orderStatus,
                paymentMethod
            },
            createdBy: userId
        });
    } catch (notificationError) {
        console.error("Failed to create order notification:", notificationError.message);
    }

    try {
        const orderWithUser = await Order.findById(order._id).populate("user", "name email role");

        if (!orderWithUser?.user || orderWithUser.user.role !== "customer") {
            return;
        }

        const itemsHtml = orderItems
            .map((item) => `<li>${item.name} x ${item.quantity} - &#8377;${item.subtotal}</li>`)
            .join("");

        await sendEmail({
            to: orderWithUser.user.email,
            subject: `Order Confirmation - #${order._id}`,
            html: `<p>Hi ${orderWithUser.user.name},</p><p>Thank you for your order! Here's a summary:</p><ul>${itemsHtml}</ul><p><b>Total: &#8377;${grandTotal}</b></p><p>Payment Method: ${paymentMethod}</p><p>We'll notify you as your order status changes.</p>`
        });
    } catch (emailError) {
        console.error("Failed to send order confirmation email:", emailError.message);
    }
};

const transactionalCheckout = async (req, res) => {
    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return sendError(res, 400, errors.array()[0].msg);
        }

        const userId = req.user.id;
        const { addressId, paymentMethod = "COD" } = req.body;
        let shippingAddress = req.body.shippingAddress;

        if (addressId) {
            const savedAddress = await Address.findOne({ _id: addressId, user: userId });

            if (!savedAddress) {
                return sendError(res, 404, "Address not found");
            }

            shippingAddress = {
                fullName: savedAddress.fullName,
                phone: savedAddress.phone,
                address: savedAddress.address,
                city: savedAddress.city,
                state: savedAddress.state,
                country: savedAddress.country,
                pincode: savedAddress.pincode
            };
        } else if (!shippingAddress) {
            const defaultAddress = await Address.findOne({ user: userId, isDefault: true });

            if (!defaultAddress) {
                return sendError(res, 400, "shippingAddress or addressId is required, and no default address was found");
            }

            shippingAddress = {
                fullName: defaultAddress.fullName,
                phone: defaultAddress.phone,
                address: defaultAddress.address,
                city: defaultAddress.city,
                state: defaultAddress.state,
                country: defaultAddress.country,
                pincode: defaultAddress.pincode
            };
        }

        if (paymentMethod === "CARD" || paymentMethod === "UPI") {
            const cart = await Cart.findOne({ user: userId }).populate("items.product");

            if (!cart || cart.items.length === 0) {
                return sendError(res, 400, "Cart is empty");
            }

            const { items: orderItems, grandTotal } = createOrderItems(cart);

            for (const item of cart.items) {
                if (item.product.stock < item.quantity) {
                    return sendError(res, 400, `${item.product.name} is out of stock`);
                }
            }

            const order = await Order.create({
                user: userId,
                items: orderItems,
                shippingAddress,
                paymentMethod,
                totalAmount: grandTotal
            });

            try {
                const razorpayOrder = await razorpay.orders.create({
                    amount: Math.round(grandTotal * 100),
                    currency: "INR",
                    receipt: order._id.toString()
                });

                order.razorpayOrderId = razorpayOrder.id;
                await order.save();

                await sendOrderCreatedMessages({ order, userId, orderItems, grandTotal, paymentMethod });

                return sendSuccess(res, 201, {
                    message: "Order created, awaiting payment",
                    data: order,
                    razorpay: {
                        orderId: razorpayOrder.id,
                        amount: razorpayOrder.amount,
                        currency: razorpayOrder.currency,
                        keyId: process.env.RAZORPAY_KEY_ID
                    }
                });
            } catch (paymentSetupError) {
                order.paymentStatus = "Failed";
                await order.save();
                return sendError(res, 502, "Unable to start payment. Please try again.");
            }
        }

        let order;
        let orderItems;
        let grandTotal;

        await runInTransaction(async (session) => {
            const cart = await Cart.findOne({ user: userId })
                .populate("items.product")
                .session(session);

            if (!cart || cart.items.length === 0) {
                throw createRequestError(400, "Cart is empty");
            }

            ({ items: orderItems, grandTotal } = createOrderItems(cart));

            for (const item of cart.items) {
                const stockUpdate = await Product.updateOne(
                    { _id: item.product._id, stock: { $gte: item.quantity } },
                    { $inc: { stock: -item.quantity } },
                    { session }
                );

                if (stockUpdate.modifiedCount !== 1) {
                    throw createRequestError(400, `${item.product.name} is out of stock`);
                }
            }

            [order] = await Order.create([{
                user: userId,
                items: orderItems,
                shippingAddress,
                paymentMethod,
                totalAmount: grandTotal
            }], { session });

            cart.items = [];
            await cart.save({ session });
        });

        await sendOrderCreatedMessages({ order, userId, orderItems, grandTotal, paymentMethod });

        return sendSuccess(res, 201, {
            message: "Order placed successfully",
            data: order
        });
    } catch (error) {
        return sendError(res, error.statusCode || 500, error.message);
    }
};

/*
Checkout

POST /api/orders/checkout
*/

exports.checkout = transactionalCheckout;

/*
Generate Delivery OTP

POST /api/orders/:id/generate-delivery-otp
*/

exports.generateDeliveryOtp = async (req, res) => {

    try {

        const order = await Order.findById(req.params.id).populate("user", "name email");

        if (!order) {

            return sendError(res, 404, "Order not found");

        }

        if (order.orderStatus === "Delivered") {

            return sendError(res, 400, "Order is already delivered");

        }

        if (order.orderStatus === "Cancelled") {

            return sendError(res, 400, "Cannot generate a delivery OTP for a cancelled order");

        }

        if (order.orderStatus !== "Shipped") {

            return sendError(res, 400, "Mark the order as Shipped before generating a delivery OTP");

        }

        const otp = crypto.randomInt(100000, 999999).toString();

        order.deliveryOtp = crypto.createHash("sha256").update(otp).digest("hex");

        order.deliveryOtpExpire = Date.now() + 10 * 60 * 1000;

        await order.save();

        try {

            await sendEmail({
                to: order.user.email,
                subject: "Your Order Delivery OTP",
                html: `<p>Hi ${order.user.name},</p><p>Your delivery OTP is <b>${otp}</b>. Share this with the delivery agent to confirm receipt of your order.</p><p>This OTP expires in 10 minutes.</p>`
            });

        } catch (emailError) {

            order.deliveryOtp = undefined;

            order.deliveryOtpExpire = undefined;

            await order.save();

            return sendError(res, 500, "Failed to send delivery OTP, please try again later");

        }

        sendSuccess(res, 200, {

            message: "Delivery OTP sent to customer"

        });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};

/*
Verify Delivery OTP

POST /api/orders/:id/verify-delivery-otp
*/

exports.verifyDeliveryOtp = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {

            return sendError(res, 400, errors.array()[0].msg);

        }

        const order = await Order.findById(req.params.id).select("+deliveryOtp +deliveryOtpExpire");

        if (!order) {

            return sendError(res, 404, "Order not found");

        }

        if (order.orderStatus === "Delivered") {

            return sendError(res, 400, "Order is already delivered");

        }

        if (order.orderStatus !== "Shipped") {

            return sendError(res, 400, "Only shipped orders can be marked as delivered");

        }

        if (!order.deliveryOtp || !order.deliveryOtpExpire || order.deliveryOtpExpire < Date.now()) {

            return sendError(res, 400, "OTP has expired or was not generated, please generate a new one");

        }

        const hashedOtp = crypto.createHash("sha256").update(req.body.otp).digest("hex");

        if (hashedOtp !== order.deliveryOtp) {

            return sendError(res, 400, "Invalid OTP");

        }

        order.orderStatus = "Delivered";

        if (order.paymentMethod === "COD") {

            order.paymentStatus = "Paid";

        }

        order.deliveryOtp = undefined;

        order.deliveryOtpExpire = undefined;

        await order.save();

        await createUserNotification({
            userId: order.user,
            title: "Order delivered",
            message: `Your order #${order._id} has been delivered successfully.`,
            type: "order",
            link: `/orders/${order._id}`,
            metadata: {
                orderId: order._id,
                orderStatus: order.orderStatus
            },
            createdBy: req.user?.id || null
        });

        try {

            const orderWithUser = await Order.findById(order._id).populate("user", "name email role");

            if (orderWithUser.user && orderWithUser.user.role === "customer") {

                await sendEmail({
                    to: orderWithUser.user.email,
                    subject: `Order Delivered - #${order._id}`,
                    html: `<p>Hi ${orderWithUser.user.name},</p><p>Your order has been delivered successfully. We hope you enjoy your purchase!</p>`
                });

            }

        } catch (emailError) {

            console.error("Failed to send delivery confirmation email:", emailError.message);

        }

        sendSuccess(res, 200, {

            message: "Order marked as delivered",

            data: order

        });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};

/*
Get All Orders (Admin)

GET /api/orders/admin/all
*/

exports.getAllOrders = async (req, res) => {

    try {

        const page = Math.max(1, Number(req.query.page) || 1);

        const limit = Math.max(1, Number(req.query.limit) || 10);

        const skip = (page - 1) * limit;

        let filter = {};

        if (req.query.orderStatus) {

            filter.orderStatus = req.query.orderStatus;

        }

        if (req.query.paymentMethod) {

            filter.paymentMethod = req.query.paymentMethod;

        }

        const total = await Order.countDocuments(filter);

        const orders = await Order.find(filter)
            .populate("user", "name email phone role")
            .sort("-createdAt")
            .skip(skip)
            .limit(limit);

        sendSuccess(res, 200, {

            total,

            page,

            totalPages: Math.ceil(total / limit),

            data: orders

        });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};

/*
Get Order Stats (Admin)

GET /api/orders/admin/stats
*/

exports.getOrderStats = async (req, res) => {

    try {


        const [stats] = await Order.aggregate([

            {
                $facet: {

                    delivered: [
                        { $match: { orderStatus: "Delivered" } },
                        { $count: "count" }
                    ],

                 payment:[
                    {
                        $match:{paymentMethod:"COD"}
                    },{
                        $count:"count"
                    }
                 ],
                 paymentCard:[
                        { $match:{paymentMethod:"CARD"} },
                        { $count:"count" }
                    ],
paymentUpi:[
                        { $match:{paymentMethod:"UPI"} },
                        { $count:"count" }
                    ],
                    cancelled: [
                        { $match: { orderStatus: "Cancelled" } },
                        { $count: "count" }
                    ],

totalItems: [
                        { $unwind: "$items" },
                        { $group: { _id: null, totalItems: { $sum: "$items.quantity" } } }
                    ],
                    totalAmount: [
                        { $group: { _id: null, sum: { $sum: "$totalAmount" } } }
                    ]

                }
            }

        ]);

        sendSuccess(res, 200, {

            data: {
                totalDelivered: stats.delivered[0]?.count || 0,
                totalCancelled: stats.cancelled[0]?.count || 0,
                totalCOD: stats.payment?.[0]?.count || 0,
                totalCard: stats.paymentCard?.[0]?.count || 0,
                totalUpi: stats.paymentUpi?.[0]?.count || 0,
                totalItems: stats.totalItems?.[0]?.totalItems || 0,
                totalAmount: stats.totalAmount[0]?.sum || 0
            }

        });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};

/*
Get Order By Id

GET /api/orders/:id
*/

exports.getOrderById = async (req, res) => {

    try {

        const order = await Order.findById(req.params.id);

        if (!order) {

            return sendError(res, 404, "Order not found");

        }

        if (order.user.toString() !== req.user.id && req.user.role !== "admin") {

            return sendError(res, 403, "Not authorized to view this order");

        }

        sendSuccess(res, 200, {

            data: order

        });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};

/*
Update Order Status

PATCH /api/orders/:id/status
*/

exports.updateOrderStatus = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {

            return sendError(res, 400, errors.array()[0].msg);

        }

        const order = await Order.findById(req.params.id);

        if (!order) {

            return sendError(res, 404, "Order not found");

        }

        if (order.orderStatus === "Delivered" || order.orderStatus === "Cancelled") {

            return sendError(res, 400, `Order is already ${order.orderStatus.toLowerCase()} and its status can no longer be changed`);

        }

        const transitionError = getStatusTransitionError(order, req.body.orderStatus);

        if (transitionError) {

            return sendError(res, 400, transitionError);

        }

        order.orderStatus = req.body.orderStatus;

        await order.save();

        await createUserNotification({
            userId: order.user,
            title: "Order status updated",
            message: `Your order #${order._id} status is now ${order.orderStatus}.`,
            type: "order",
            link: `/orders/${order._id}`,
            metadata: {
                orderId: order._id,
                orderStatus: order.orderStatus
            },
            createdBy: req.user?.id || null
        });

        sendSuccess(res, 200, {

            message: "Order status updated successfully",

            data: order

        });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};

/*
Cancel Order

PATCH /api/orders/:id/cancel
*/

exports.cancelOrder = async (req, res) => {

    try {

        const order = await Order.findById(req.params.id);

        if (!order) {

            return sendError(res, 404, "Order not found");

        }

        if (order.user.toString() !== req.user.id && req.user.role !== "admin") {

            return sendError(res, 403, "Not authorized to cancel this order");

        }

        if (order.orderStatus === "Delivered" || order.orderStatus === "Cancelled") {

            return sendError(res, 400, `Order is already ${order.orderStatus.toLowerCase()} and cannot be cancelled`);

        }

        if (order.orderStatus === "Shipped") {

            return sendError(res, 400, "Order has already shipped and can no longer be cancelled");

        }

        if (order.paymentMethod === "COD" || order.paymentStatus === "Paid") {

            for (const item of order.items) {

                await Product.findByIdAndUpdate(

                    item.product,

                    {
                        $inc: {
                            stock: item.quantity
                        }
                    }

                );

            }

        }

        order.orderStatus = "Cancelled";

        await order.save();

        await createUserNotification({
            userId: order.user,
            title: "Order cancelled",
            message: `Your order #${order._id} has been cancelled.`,
            type: "order",
            link: `/orders/${order._id}`,
            metadata: {
                orderId: order._id,
                orderStatus: order.orderStatus
            },
            createdBy: req.user?.id || null
        });

        try {

            const orderWithUser = await Order.findById(order._id).populate("user", "name email role");

            if (orderWithUser.user && orderWithUser.user.role === "customer") {

                await sendEmail({
                    to: orderWithUser.user.email,
                    subject: `Order Cancelled - #${order._id}`,
                    html: `<p>Hi ${orderWithUser.user.name},</p><p>Your order has been cancelled as requested.</p><p>If a payment was already made, any applicable refund will be processed shortly.</p>`
                });

            }

        } catch (emailError) {

            console.error("Failed to send order cancellation email:", emailError.message);

        }

        sendSuccess(res, 200, {

            message: "Order cancelled successfully",

            data: order

        });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};

/*
Get My Orders

GET /api/orders
*/

exports.getOrders = async (req, res) => {

    try {

        const userId = req.user.id;

        const page = Math.max(1, Number(req.query.page) || 1);

        const limit = Math.max(1, Number(req.query.limit) || 10);

        const skip = (page - 1) * limit;

        const total = await Order.countDocuments({ user: userId });

        const orders = await Order.find({ user: userId })
            .sort("-createdAt")
            .skip(skip)
            .limit(limit);

        sendSuccess(res, 200, {

            total,

            page,

            totalPages: Math.ceil(total / limit),

            data: orders

        });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};
