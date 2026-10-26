const Category = require("../src/models/Category");
const Product = require("../src/models/Product");
const { sendSuccess, sendError } = require("../src/utils/response");

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
        return sendError(res, 400, `Category with name "${name}" already exists.`);
      }
    }

    const category = await Category.create(req.body);

    sendSuccess(res, 201, { message: "Category created successfully", data: category });

  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return sendError(res, 400, `Duplicate entry: A category with this ${field} already exists.`);
    }

    sendError(res, 500, error.message);
  }
};


/*
Get All Categories
GET /api/categories
*/
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort("name");

    sendSuccess(res, 200, { total: categories.length, data: categories });

  } catch (error) {
    sendError(res, 500, error.message);
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
      return sendError(res, 404, "Category not found");
    }

    sendSuccess(res, 200, { data: category });

  } catch (error) {
    if (error.kind === "ObjectId") {
      return sendError(res, 400, "Invalid category ID format");
    }

    sendError(res, 500, error.message);
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
        return sendError(res, 400, `Another category with name "${name}" already exists.`);
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
      return sendError(res, 404, "Category not found");
    }

    sendSuccess(res, 200, { message: "Category updated successfully", data: category });

  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return sendError(res, 400, `Duplicate entry: A category with this ${field} already exists.`);
    }

    sendError(res, 500, error.message);
  }
};


/*
Toggle Category Active Status
PATCH /api/categories/:id/status
*/
exports.toggleCategoryStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return sendError(res, 400, "isActive must be a boolean value (true or false)");
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { isActive },
      {
        new: true,
        runValidators: true
      }
    );

    if (!category) {
      return sendError(res, 404, "Category not found");
    }

    sendSuccess(res, 200, { message: `Category ${isActive ? "activated" : "deactivated"} successfully`, data: category });

  } catch (error) {
    if (error.kind === "ObjectId") {
      return sendError(res, 400, "Invalid category ID format");
    }

    sendError(res, 500, error.message);
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
      return sendError(res, 404, "Category not found");
    }

    sendSuccess(res, 200, { message: "Category deleted successfully" });

  } catch (error) {
    sendError(res, 500, error.message);
  }
};

/*
Delete All Categories
DELETE /api/categories
Body: { "confirm": "DELETE ALL" }

Every product must belong to a category, so categories still used by a
product are kept (reassign or delete those products first). Everything
else is removed and the response reports how many were skipped.
*/
exports.deleteAllCategories = async (req, res) => {
  try {
    if (req.body?.confirm !== "DELETE ALL") {
      return sendError(res, 400, 'Send { "confirm": "DELETE ALL" } to delete all categories');
    }

    const usedCategoryIds = await Product.distinct("category");

    const { deletedCount } = await Category.deleteMany({ _id: { $nin: usedCategoryIds } });
    const skippedCount = await Category.countDocuments({ _id: { $in: usedCategoryIds } });

    const message = skippedCount > 0
      ? `Deleted ${deletedCount} categories. ${skippedCount} were kept because products still use them.`
      : `Deleted ${deletedCount} categories.`;

    sendSuccess(res, 200, { message, data: { deletedCount, skippedCount } });

  } catch (error) {
    sendError(res, 500, error.message);
  }
};
