const Category = require("../src/models/Category");

/*
Create Category
POST /api/categories
*/
exports.createCategory = async (req, res) => {
  try {
    const { name } = req.body;

    if (name) {
      const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") }
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: `Category with name "${name}" already exists.`
        });
      }
    }

    const category = await Category.create(req.body);

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: category
    });

  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `Duplicate entry: A category with this ${field} already exists.`
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/*
Get All Categories
GET /api/categories
*/
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort("name");

    res.json({
      success: true,
      total: categories.length,
      data: categories
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/*
Get Category By Id
GET /api/categories/:id
*/
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    res.json({
      success: true,
      data: category
    });

  } catch (error) {
    if (error.kind === "ObjectId") {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format"
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/*
Update Category
PUT /api/categories/:id
*/
exports.updateCategory = async (req, res) => {
  try {
    const { name } = req.body;

    if (name) {
      const existingCategory = await Category.findOne({
        _id: { $ne: req.params.id },
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") }
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: `Another category with name "${name}" already exists.`
        });
      }
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    res.json({
      success: true,
      message: "Category updated successfully",
      data: category
    });

  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `Duplicate entry: A category with this ${field} already exists.`
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


/*
Delete Category
DELETE /api/categories/:id
*/
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    res.json({
      success: true,
      message: "Category deleted successfully"
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
