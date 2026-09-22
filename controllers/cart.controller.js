const { validationResult } = require("express-validator");

const Cart = require("../src/models/Cart");
const Product = require("../src/models/Product");

/*
Add Product To Cart

POST /api/cart/add
*/

exports.addToCart = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) { 

            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });

        }

        const userId = req.user.id;
console.log(req.user, ' userId')
        const { productId, quantity } = req.body;

        const product = await Product.findById(productId);

        if (!product) {

            return res.status(404).json({
                success: false,
                message: "Product not found"
            });

        }

        let cart = await Cart.findOne({ user: userId });
        if (!cart) {

            cart = new Cart({
                user: userId,
                items: []
            });

        }

        const itemIndex = cart.items.findIndex(
            item => item.product.toString() === productId
        );

        const requestedQuantity = itemIndex > -1
            ? cart.items[itemIndex].quantity + quantity
            : quantity;

        if (product.stock < requestedQuantity) {

            return res.status(400).json({
                success: false,
                message: `Only ${product.stock} unit(s) of ${product.name} available`
            });

        }

        if (itemIndex > -1) {

            cart.items[itemIndex].quantity = requestedQuantity;

        } else {

            cart.items.push({
                product: productId,
                quantity
            });

        }

        await cart.save();

        res.status(200).json({
            success: true,
            message: "Product added to cart",
            data: cart
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};


/*
Get User Cart

GET /api/cart
*/

/*
Get User Cart
GET /api/cart
*/
exports.getCart = async (req, res) => {
    try {
        const cart = await Cart.findOne({
            user: req.user.id
        }).populate("items.product");

        if (!cart) {
            return res.status(404).json({
                success: false,
                message: "Cart is empty"
            });
        }

        // 1. Filter out items whose referenced product was deleted from DB
        cart.items = cart.items.filter(item => item.product !== null);

        // 2. Safely calculate grand total
        let total = 0;
        cart.items.forEach(item => {
            if (item.product && item.product.price) {
                total += item.product.price * item.quantity;
            }
        });

        // Save cleaned cart back to database if any deleted items were filtered out
        await cart.save();

        res.json({
            success: true,
            totalItems: cart.items.length,
            grandTotal: total,
            data: cart
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


/*
Update Quantity

PUT /api/cart/update
*/

exports.updateQuantity = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {

            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });

        }

        const userId = req.user.id;

        const { productId, quantity } = req.body;

        const cart = await Cart.findOne({
            user: userId
        });

        if (!cart) {

            return res.status(404).json({
                success: false,
                message: "Cart not found"
            });

        }

        const item = cart.items.find(
            item => item.product.toString() === productId
        );

        if (!item) {

            return res.status(404).json({
                success: false,
                message: "Product not found in cart"
            });

        }

        const product = await Product.findById(productId);

        if (!product) {

            return res.status(404).json({
                success: false,
                message: "Product not found"
            });

        }

        if (product.stock < quantity) {

            return res.status(400).json({
                success: false,
                message: `Only ${product.stock} unit(s) of ${product.name} available`
            });

        }

        item.quantity = quantity;

        await cart.save();

        res.json({
            success: true,
            message: "Quantity updated",
            data: cart
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};


/*
Remove Product

DELETE /api/cart/remove/:productId
*/

exports.removeItem = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {

            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });

        }

        const cart = await Cart.findOne({
            user: req.user.id
        });

        if (!cart) {

            return res.status(404).json({
                success: false,
                message: "Cart not found"
            });

        }

        cart.items = cart.items.filter(
            item => item.product.toString() !== req.params.productId
        );

        await cart.save();

        res.json({
            success: true,
            message: "Item removed"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};


/*
Clear Cart

DELETE /api/cart/clear
*/

exports.clearCart = async (req, res) => {

    try {

        const cart = await Cart.findOne({
            user: req.user.id
        });

        if (!cart) {

            return res.status(404).json({
                success: false,
                message: "Cart not found"
            });

        }

        cart.items = [];

        await cart.save();

        res.json({
            success: true,
            message: "Cart cleared"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};
