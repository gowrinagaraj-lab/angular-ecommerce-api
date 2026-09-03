const mongoose = require("mongoose");

const Review = require("../src/models/Review");
const Product = require("../src/models/Product");

const recalculateProductRating = async (productId) => {
    const [stats] = await Review.aggregate([
        { $match: { product: new mongoose.Types.ObjectId(productId) } },
        { $group: { _id: "$product", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } }
    ]);

    await Product.findByIdAndUpdate(productId, {
        rating: stats ? Math.round(stats.avgRating * 10) / 10 : 0,
        totalReviews: stats ? stats.count : 0
    });
};

module.exports = { recalculateProductRating };
