const crypto = require("crypto");
const { validationResult } = require("express-validator");

const Order = require("../src/models/Order");
const Product = require("../src/models/Product");
const Cart = require("../src/models/Cart");

/*
Verify Razorpay payment and finalize the order

POST /api/payments/verify
*/

exports.verifyPayment = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {

            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });

        }

        const userId = req.user.id;

        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        const order = await Order.findOne({
            user: userId,
            razorpayOrderId: razorpay_order_id
        }).populate("items.product");

        if (!order) {

            return res.status(404).json({
                success: false,
                message: "Order not found for this payment"
            });

        }

        if (order.paymentStatus === "Paid") {

            return res.status(200).json({
                success: true,
                message: "Payment already verified",
                data: order
            });

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

            return res.status(400).json({
                success: false,
                message: "Payment verification failed"
            });

        }

        for (const item of order.items) {

            const product = item.product;

            if (product.stock < item.quantity) {

                return res.status(400).json({
                    success: false,
                    message: `${item.name} is out of stock`
                });

            }

        }

        for (const item of order.items) {

            await Product.findByIdAndUpdate(
                item.product._id,
                {
                    $inc: {
                        stock: -item.quantity
                    }
                }
            );

        }

        order.paymentStatus = "Paid";
        order.orderStatus = "Processing";
        order.razorpayPaymentId = razorpay_payment_id;
        order.razorpaySignature = razorpay_signature;

        await order.save();

        const cart = await Cart.findOne({ user: userId });

        if (cart) {

            cart.items = [];

            await cart.save();

        }

        res.status(200).json({

            success: true,

            message: "Payment verified, order confirmed",

            data: order

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

};
