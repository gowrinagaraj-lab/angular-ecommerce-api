const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const Category = require("../src/models/Category");

/*
Create Product
POST /api/products
*/
exports.createProduct = async (req, res) => {
  try {
  
console.log("Request Body:", req.body); // Log the request body for debugging

    const { name, category } = req.body;
console.log("Product Name:", name); // Log the product name for debugging
    // 1. Check for Duplicate Product Name (case-insensitive)
    if (name) {
      const existingProduct = await Product.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") }
      });
 // Log the existing product for debugging
    //  return false
if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: `Product with name "${name}" already exists.`
        });
      }
    }

    // 2. Validate Category Reference
    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID format"
        });
      }

      const categoryExists = await Category.findById(category);
      if (!categoryExists) {
        return res.status(400).json({
          success: false,
          message: "Category not found"
        });
      }
    }

    const product = await Product.create(req.body);

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product
    });

  } catch (error) {
    // Catch Mongoose unique index violation error (Code 11000)
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `Duplicate entry: A product with this ${field} already exists.`
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/*
Get All Products
GET /api/products
*/
exports.getProducts = async (req, res) => {
try {
    console.log("Query Parameters:", req.query.category);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const search = req.query.search || "";
    let category = req.query.category || "";
    const sort = req.query.sort || "-createdAt";

    let filter = {};

    // 1. Handle Search Filter
    if (search) {
      filter.name = {
        $regex: search,
        $options: "i"
      };
    }

    // 2. Handle Category Filter (accepts a category ID or a category name)
    if (category) {
      // Strips single/double quotes and trims whitespace
      category = category.replace(/^['"]|['"]$/g, '').trim();

      if (mongoose.Types.ObjectId.isValid(category)) {
        filter.category = category;
      } else {
        const matchedCategory = await Category.findOne({
          name: { $regex: `^${category}$`, $options: "i" }
        });

        // No matching category: short-circuit to an empty result set
        if (!matchedCategory) {
          return res.json({
            success: true,
            total: 0,
            page,
            totalPages: 0,
            data: [],
            length: 0
          });
        }

        filter.category = matchedCategory._id;
      }

      console.log("Category Filter Applied:", filter.category);
    }

    // 3. Query Database
    const total = await Product.countDocuments(filter);

    const products = await Product.find(filter)
      .populate("category", "name")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: products,
      length: products.length
    });

} catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
}
};


/*
Get Product By Id
GET /api/products/:id
*/
exports.getProductById = async (req, res) => {
  try {
    console.log("Product ID:", req.params.id); // Log the product ID for debugging
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    res.json({
      success: true,
      data: product
    });

  } catch (error) {
    // Catch Invalid Mongo ObjectId errors
    if (error.kind === "ObjectId") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format"
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
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
        return res.status(400).json({
          success: false,
          message: `Another product with name "${name}" already exists.`
        });
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
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    res.json({
      success: true,
      message: "Product updated successfully",
      data: product
    });
io.emit("productUpdated", {
  message: "Product updated"
});
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `Duplicate entry: A product with this ${field} already exists.`
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
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
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    res.json({
      success: true,
      message: "Product deleted successfully"
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};