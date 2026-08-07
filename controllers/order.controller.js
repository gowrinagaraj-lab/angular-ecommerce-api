const { validationResult } = require("express-validator");

const Cart = require("../src/models/Cart");
const Order = require("../src/models/Order");
const Product = require("../src/models/Product");
const Address = require("../src/models/Address");

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