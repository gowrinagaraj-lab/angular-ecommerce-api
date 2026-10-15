const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Category = require("../src/models/Category");
const { listProducts } = require("../services/product.service");
const { sendSuccess, sendError } = require("../src/utils/response");

/*
Create Product
POST /api/products
*/
exports.createProduct = async (req, res) => {
  try {

    const { name, category } = req.body;

    // 1. Check for Duplicate Product Name (case-insensitive)
    if (name) {
      const existingProduct = await Product.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") }
      });

      if (existingProduct) {
        return sendError(res, 400, `Product with name "${name}" already exists.`);
      }
    }

    // 2. Validate Category Reference
    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return sendError(res, 400, "Invalid category ID format");
      }

      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return sendError(res, 400, "Category not found");
      }
    }

    const product = await Product.create(req.body);

    sendSuccess(res, 201, { message: "Product created successfully", data: product });

  } catch (error) {
    // Catch Mongoose unique index violation error (Code 11000)
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return sendError(res, 400, `Duplicate entry: A product with this ${field} already exists.`);
    }

    sendError(res, 500, error.message);
  }
};


/*
Get All Products
GET /api/products
*/
exports.getProducts = async (req, res) => {
  try {
    const result = await listProducts(req.query);

    sendSuccess(res, 200, result);
  } catch (error) {
    sendError(res, 500, error.message);
  }
};


/*
Get Product By Id
GET /api/products/:id
*/
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return sendError(res, 404, "Product not found");
    }

    sendSuccess(res, 200, { data: product });

  } catch (error) {
    // Catch Invalid Mongo ObjectId errors
    if (error.kind === "ObjectId") {
      return sendError(res, 400, "Invalid product ID format");
    }

    sendError(res, 500, error.message);
  }
};


/*
Update Product
PUT /api/products/:id
*/
exports.updateProduct = async (req, res) => {
  try {
    const { name } = req.body;

    // 1. Check for Duplicate Product Name on Update (excluding current product)
    if (name) {
      const existingProduct = await Product.findOne({
        _id: { $ne: req.params.id }, // Exclude current product ID
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") }
      });

      if (existingProduct) {
        return sendError(res, 400, `Another product with name "${name}" already exists.`);
      }
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!product) {
      return sendError(res, 404, "Product not found");
    }

    sendSuccess(res, 200, { message: "Product updated successfully", data: product });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return sendError(res, 400, `Duplicate entry: A product with this ${field} already exists.`);
    }

    sendError(res, 500, error.message);
  }
};


/*
Delete Product
DELETE /api/products/:id
*/
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return sendError(res, 404, "Product not found");
    }

    sendSuccess(res, 200, { message: "Product deleted successfully" });

  } catch (error) {
    sendError(res, 500, error.message);
  }
};
