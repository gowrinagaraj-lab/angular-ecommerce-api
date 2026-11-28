const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Category = require("../src/models/Category");
const { listProducts } = require("../services/product.service");
const { checkLowStock, getInventorySummary } = require("../services/inventory.service");
const { publishProductChange } = require("../src/realtime/productEvents");
const { UPLOAD_ROOT } = require("../src/middleware/productUpload.middleware");
const { sendSuccess, sendError } = require("../src/utils/response");

const PRODUCT_UPLOAD_PREFIX = "/uploads/products/";

// Removes a just-uploaded image when the request fails after multer already saved it,
// so a rejected create/update doesn't leave an orphaned file on disk.
const cleanupUploadedFile = (req) => {
  if (req.file?.filename) {
    fs.unlink(path.join(UPLOAD_ROOT, req.file.filename), () => {});
  }
};

// Removes the previous local upload once it's no longer referenced by the product
const deleteIfLocalUpload = (imagePath) => {
  if (imagePath && imagePath.startsWith(PRODUCT_UPLOAD_PREFIX)) {
    fs.unlink(path.join(UPLOAD_ROOT, imagePath.slice(PRODUCT_UPLOAD_PREFIX.length)), () => {});
  }
};

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
        cleanupUploadedFile(req);
        return sendError(res, 400, `Product with name "${name}" already exists.`);
      }
    }

    // 2. Validate Category Reference
    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        cleanupUploadedFile(req);
        return sendError(res, 400, "Invalid category ID format");
      }

      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        cleanupUploadedFile(req);
        return sendError(res, 400, "Category not found");
      }
    }

    if (req.file) {
      req.body.mainImage = `${PRODUCT_UPLOAD_PREFIX}${req.file.filename}`;
    }

    const product = await Product.create(req.body);

    void checkLowStock([product._id]);

    void publishProductChange("insert", product);

    sendSuccess(res, 201, { message: "Product created successfully", data: product });

  } catch (error) {
    cleanupUploadedFile(req);

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
 
  console.log("Update Product Request Body:", req.body);
  try {
    const { name } = req.body;

    // 1. Check for Duplicate Product Name on Update (excluding current product)
    if (name) {
      const existingProduct = await Product.findOne({
        _id: { $ne: req.params.id }, // Exclude current product ID
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") }
      });

      if (existingProduct) {
        cleanupUploadedFile(req);
        return sendError(res, 400, `Another product with name "${name}" already exists.`);
      }
    }

    let previousMainImage;

    if (req.file) {
      const existing = await Product.findById(req.params.id).select("mainImage");

      if (!existing) {
        cleanupUploadedFile(req);
        return sendError(res, 404, "Product not found");
      }

      previousMainImage = existing.mainImage;
      req.body.mainImage = `${PRODUCT_UPLOAD_PREFIX}${req.file.filename}`;
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
      cleanupUploadedFile(req);
      return sendError(res, 404, "Product not found");
    }

    if (previousMainImage && previousMainImage !== product.mainImage) {
      deleteIfLocalUpload(previousMainImage);
    }

    // A stock or threshold change may cross the low-stock line either way
    if (req.body.stock !== undefined || req.body.lowStockThreshold !== undefined) {
      void checkLowStock([product._id]);
    }

    void publishProductChange("update", product);

    sendSuccess(res, 200, { message: "Product updated successfully", data: product });
  } catch (error) {
    console.warn("Error updating product:", error);
    cleanupUploadedFile(req);

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

    deleteIfLocalUpload(product.mainImage);

    void publishProductChange("delete", { _id: product._id, name: product.name });

    sendSuccess(res, 200, { message: "Product deleted successfully" });

  } catch (error) {
    sendError(res, 500, error.message);
  }
};

/*
Inventory Summary (Admin)
GET /api/products/admin/inventory
*/
exports.getInventorySummary = async (req, res) => {
  try {
    const data = await getInventorySummary();

    sendSuccess(res, 200, { data });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};
