const crypto = require("crypto");
const { validationResult } = require("express-validator");

const Cart = require("../src/models/Cart");
const Order = require("../src/models/Order");
const Product = require("../src/models/Product");
const Address = require("../src/models/Address");
const razorpay = require("../src/config/razorpay");
const sendEmail = require("../utils/sendEmail");

/*
Checkout

POST /api/orders/checkout
*/

exports.checkout = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {

            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });

        }

        const userId = req.user.id;

        const { addressId, paymentMethod } = req.body;

        let shippingAddress = req.body.shippingAddress;

        if (addressId) {

            const savedAddress = await Address.findOne({ _id: addressId, user: userId });

            if (!savedAddress) {

                return res.status(404).json({
                    success: false,
                    message: "Address not found"
                });

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

                return res.status(400).json({
                    success: false,
                    message: "shippingAddress or addressId is required, and no default address was found"
                });

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

        const cart = await Cart.findOne({
            user: userId
        }).populate("items.product");
console.log(cart, ` carts`);
        if (!cart || cart.items.length === 0) {

            return res.status(400).json({
                success: false,
                message: "Cart is empty"
            });

        }

        let orderItems = [];

        let grandTotal = 0;

        for (const item of cart.items) {

            const product = item.product;

            if (product.stock < item.quantity) {

                return res.status(400).json({
                    success: false,
                    message: `${product.name} is out of stock`
                });

            }

            const subtotal = product.price * item.quantity;

            grandTotal += subtotal;

            orderItems.push({

                product: product._id,

                name: product.name,

                price: product.price,

                quantity: item.quantity,

                subtotal

            });

        }

        const order = await Order.create({

            user: userId,

            items: orderItems,

            shippingAddress,

            paymentMethod,

            totalAmount: grandTotal

        });

        if (paymentMethod === "CARD" || paymentMethod === "UPI") {

            const razorpayOrder = await razorpay.orders.create({

                amount: Math.round(grandTotal * 100),

                currency: "INR",

                receipt: order._id.toString()

            });

            order.razorpayOrderId = razorpayOrder.id;

            await order.save();

            return res.status(201).json({

                success: true,

                message: "Order created, awaiting payment",

                data: order,

                razorpay: {
                    orderId: razorpayOrder.id,
                    amount: razorpayOrder.amount,
                    currency: razorpayOrder.currency,
                    keyId: process.env.RAZORPAY_KEY_ID
                }

            });

        }

        for (const item of cart.items) {

            await Product.findByIdAndUpdate(

                item.product._id,

                {
                    $inc: {
                        stock: -item.quantity
                    }
                }

            );

        }

        cart.items = [];

        await cart.save();

        res.status(201).json({

            success: true,

            message: "Order placed successfully",

            data: order

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

};

/*
Generate Delivery OTP

POST /api/orders/:id/generate-delivery-otp
*/

exports.generateDeliveryOtp = async (req, res) => {

    try {

        const order = await Order.findById(req.params.id).populate("user", "name email");

        if (!order) {

            return res.status(404).json({
                success: false,
                message: "Order not found"
            });

        }

        if (order.orderStatus === "Delivered") {

            return res.status(400).json({
                success: false,
                message: "Order is already delivered"
            });

        }

        if (order.orderStatus === "Cancelled") {

            return res.status(400).json({
                success: false,
                message: "Cannot generate a delivery OTP for a cancelled order"
            });

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

            return res.status(500).json({
                success: false,
                message: "Failed to send delivery OTP, please try again later"
            });

        }

        res.status(200).json({

            success: true,

            message: "Delivery OTP sent to customer"

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

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

            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });

        }

        const order = await Order.findById(req.params.id).select("+deliveryOtp +deliveryOtpExpire");

        if (!order) {

            return res.status(404).json({
                success: false,
                message: "Order not found"
            });

        }

        if (order.orderStatus === "Delivered") {

            return res.status(400).json({
                success: false,
                message: "Order is already delivered"
            });

        }

        if (!order.deliveryOtp || !order.deliveryOtpExpire || order.deliveryOtpExpire < Date.now()) {

            return res.status(400).json({
                success: false,
                message: "OTP has expired or was not generated, please generate a new one"
            });

        }

        const hashedOtp = crypto.createHash("sha256").update(req.body.otp).digest("hex");

        if (hashedOtp !== order.deliveryOtp) {

            return res.status(400).json({
                success: false,
                message: "Invalid OTP"
            });

        }

        order.orderStatus = "Delivered";

        if (order.paymentMethod === "COD") {

            order.paymentStatus = "Paid";

        }

        order.deliveryOtp = undefined;

        order.deliveryOtpExpire = undefined;

        await order.save();

        res.status(200).json({

            success: true,

            message: "Order marked as delivered",

            data: order

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

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
            .populate("user", "name email")
            .sort("-createdAt")
            .skip(skip)
            .limit(limit);

        res.status(200).json({

            success: true,

            total,

            page,

            totalPages: Math.ceil(total / limit),

            data: orders

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

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

            return res.status(404).json({
                success: false,
                message: "Order not found"
            });

        }

        if (order.user.toString() !== req.user.id && req.user.role !== "admin") {

            return res.status(403).json({
                success: false,
                message: "Not authorized to view this order"
            });

        }

        res.status(200).json({

            success: true,

            data: order

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

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

            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });

        }

        const order = await Order.findById(req.params.id);

        if (!order) {

            return res.status(404).json({
                success: false,
                message: "Order not found"
            });

        }

        if (order.orderStatus === "Delivered" || order.orderStatus === "Cancelled") {

            return res.status(400).json({
                success: false,
                message: `Order is already ${order.orderStatus.toLowerCase()} and its status can no longer be changed`
            });

        }

        order.orderStatus = req.body.orderStatus;

        await order.save();

        res.status(200).json({

            success: true,

            message: "Order status updated successfully",

            data: order

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

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

            return res.status(404).json({
                success: false,
                message: "Order not found"
            });

        }

        if (order.user.toString() !== req.user.id && req.user.role !== "admin") {

            return res.status(403).json({
                success: false,
                message: "Not authorized to cancel this order"
            });

        }

        if (order.orderStatus === "Delivered" || order.orderStatus === "Cancelled") {

            return res.status(400).json({
                success: false,
                message: `Order is already ${order.orderStatus.toLowerCase()} and cannot be cancelled`
            });

        }

        if (order.orderStatus === "Shipped") {

            return res.status(400).json({
                success: false,
                message: "Order has already shipped and can no longer be cancelled"
            });

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

        res.status(200).json({

            success: true,

            message: "Order cancelled successfully",

            data: order

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

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

        res.status(200).json({

            success: true,

            total,

            page,

            totalPages: Math.ceil(total / limit),

            data: orders

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

};