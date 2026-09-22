const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Category = require("../src/models/Category");

const listProducts = async (query = {}) => {

    
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const skip = (page - 1) * limit;

    const search = query.search || "";
    let category = query.category || "";
    const sort = query.sort || "-createdAt";
    const filter = {};

    if (search) {
        filter.name = {
            $regex: search,
            $options: "i"
        };
    }

    if (category) {
        category = category.replace(/^['"]|['"]$/g, "").trim();

        if (mongoose.Types.ObjectId.isValid(category)) {
            filter.category = category;
        } else {
            const matchedCategory = await Category.findOne({
                name: { $regex: `^${category}$`, $options: "i" }
            });

            if (!matchedCategory) {
                return {
                    total: 0,
                    page,
                    totalPages: 0,
                    data: [],
                    length: 0
                };
            }

            filter.category = matchedCategory._id;
        }
    }

    const total = await Product.countDocuments(filter);

    const products = await Product.find(filter)
        .select("name description price stock category brand images mainImage rating totalReviews isActive createdAt updatedAt")
        .populate("category", "name")
        .sort(sort)
        .skip(skip)
        .limit(limit);

    return {
        total,
        page,
        totalPages: Math.ceil(total / limit),
        data: products,
        length: products.length
    };
};

module.exports = { listProducts };