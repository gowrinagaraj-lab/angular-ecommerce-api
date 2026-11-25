const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Category = require("../src/models/Category");

// Only these fields may be sorted on; anything else (or missing) falls back to newest-first
const ALLOWED_SORT_FIELDS = new Set(["name", "price", "rating", "createdAt"]);

const resolveSort = (sort) => {
    if (!sort) {
        return "-createdAt";
    }

    const field = sort.replace(/^-/, "");

    if (!ALLOWED_SORT_FIELDS.has(field)) {
        return "-createdAt";
    }

    return sort.startsWith("-") ? `-${field}` : field;
};

const listProducts = async (query = {}) => {


    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Number(query.limit) || 10);
    const skip = (page - 1) * limit;

    const search = query.search || "";
    let category = query.category || "";
    const brand = query.brand || "";
    const inStock = query.inStock === "true";
    const sort = resolveSort(query.sort);
    const filter = {};

    if (search) {
        filter.name = {
            $regex: search,
            $options: "i"
        };
    }

    if (brand) {
        filter.brand = {
            $regex: brand,
            $options: "i"
        };
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
        const minPrice = Number(query.minPrice);
        const maxPrice = Number(query.maxPrice);
        const price = {};

        if (query.minPrice !== undefined && !Number.isNaN(minPrice)) {
            price.$gte = minPrice;
        }

        if (query.maxPrice !== undefined && !Number.isNaN(maxPrice)) {
            price.$lte = maxPrice;
        }

        if (Object.keys(price).length > 0) {
            filter.price = price;
        }
    }

    if (inStock) {
        filter.stock = { $gt: 0 };
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
        .select("name description price stock lowStockThreshold category brand images mainImage rating totalReviews isActive createdAt updatedAt")
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