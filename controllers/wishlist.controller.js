const { validationResult } = require("express-validator");

const Wishlist = require("../src/models/Wishlist");
const Product = require("../src/models/Product");
const { sendSuccess, sendError } = require("../src/utils/response");

/*
Get User Wishlist

GET /api/wishlist
*/
exports.getWishlist = async (req, res) => {
    try {
        let wishlist = await Wishlist.findOne({
            user: req.user.id
        }).populate("products");

        if (!wishlist) {
            return sendSuccess(res, 200, { count: 0, data: [] });
        }

        // Filter out null values in case referenced products were deleted from DB
        const originalLength = wishlist.products.length;
        wishlist.products = wishlist.products.filter(product => product !== null);

        // Save cleaned wishlist back to DB if deleted products were found
        if (wishlist.products.length !== originalLength) {
            await wishlist.save();
        }

        sendSuccess(res, 200, { count: wishlist.products.length, data: wishlist.products });

    } catch (error) {
        sendError(res, 500, error.message);
    }
};

/*
Add Product To Wishlist

POST /api/wishlist/add
*/
exports.addToWishlist = async (req, res) => {
    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return sendError(res, 400, errors.array()[0].msg);
        }

        const userId = req.user.id;
        const { productId } = req.body;

        const product = await Product.findById(productId);

        if (!product) {
            return sendError(res, 404, "Product not found");
        }

        let wishlist = await Wishlist.findOne({ user: userId });

        if (!wishlist) {
            wishlist = new Wishlist({
                user: userId,
                products: []
            });
        }

        // Prevent duplicate products in wishlist
        const exists = wishlist.products.some(
            id => id.toString() === productId
        );

        if (exists) {
            return sendError(res, 400, "Product already in wishlist");
        }

        wishlist.products.push(productId);
        await wishlist.save();

        sendSuccess(res, 200, { message: "Product added to wishlist", data: wishlist });

    } catch (error) {
        sendError(res, 500, error.message);
    }
};

/*
Remove Product From Wishlist

DELETE /api/wishlist/remove/:productId
*/
exports.removeFromWishlist = async (req, res) => {
    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return sendError(res, 400, errors.array()[0].msg);
        }

        const wishlist = await Wishlist.findOne({
            user: req.user.id
        });

        if (!wishlist) {
            return sendError(res, 404, "Wishlist not found");
        }

        wishlist.products = wishlist.products.filter(
            id => id.toString() !== req.params.productId
        );

        await wishlist.save();

        sendSuccess(res, 200, { message: "Product removed from wishlist", data: wishlist });

    } catch (error) {
        sendError(res, 500, error.message);
    }
};

/*
Clear Wishlist

DELETE /api/wishlist/clear
*/
exports.clearWishlist = async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({
            user: req.user.id
        });

        if (!wishlist) {
            return sendError(res, 404, "Wishlist not found");
        }

        wishlist.products = [];
        await wishlist.save();

        sendSuccess(res, 200, { message: "Wishlist cleared" });

    } catch (error) {
        sendError(res, 500, error.message);
    }
};
