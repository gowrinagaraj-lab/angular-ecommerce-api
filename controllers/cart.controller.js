const { validationResult } = require("express-validator");

const Cart = require("../src/models/Cart");
const Product = require("../src/models/Product");
const { sendSuccess, sendError } = require("../src/utils/response");

/*
Add Product To Cart

POST /api/cart/add
*/

exports.addToCart = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {

            return sendError(res, 400, errors.array()[0].msg);

        }

        const userId = req.user.id;

        const { productId, quantity } = req.body;

        const product = await Product.findById(productId);

        if (!product) {

            return sendError(res, 404, "Product not found");

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

            return sendError(res, 400, `Only ${product.stock} unit(s) of ${product.name} available`);

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

        sendSuccess(res, 200, { message: "Product added to cart", data: cart });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};


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
            return sendError(res, 404, "Cart is empty");
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

        sendSuccess(res, 200, { totalItems: cart.items.length, grandTotal: total, data: cart });

    } catch (error) {
        sendError(res, 500, error.message);
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

            return sendError(res, 400, errors.array()[0].msg);

        }

        const userId = req.user.id;

        const { productId, quantity } = req.body;

        const cart = await Cart.findOne({
            user: userId
        });

        if (!cart) {

            return sendError(res, 404, "Cart not found");

        }

        const item = cart.items.find(
            item => item.product.toString() === productId
        );

        if (!item) {

            return sendError(res, 404, "Product not found in cart");

        }

        const product = await Product.findById(productId);

        if (!product) {

            return sendError(res, 404, "Product not found");

        }

        if (product.stock < quantity) {

            return sendError(res, 400, `Only ${product.stock} unit(s) of ${product.name} available`);

        }

        item.quantity = quantity;

        await cart.save();

        sendSuccess(res, 200, { message: "Quantity updated", data: cart });

    } catch (error) {

        sendError(res, 500, error.message);

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

            return sendError(res, 400, errors.array()[0].msg);

        }

        const cart = await Cart.findOne({
            user: req.user.id
        });

        if (!cart) {

            return sendError(res, 404, "Cart not found");

        }

        cart.items = cart.items.filter(
            item => item.product.toString() !== req.params.productId
        );

        await cart.save();

        sendSuccess(res, 200, { message: "Item removed" });

    } catch (error) {

        sendError(res, 500, error.message);

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

            return sendError(res, 404, "Cart not found");

        }

        cart.items = [];

        await cart.save();

        sendSuccess(res, 200, { message: "Cart cleared" });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};
