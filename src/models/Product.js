const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Product name is required"],
      unique: true, // Prevents duplicate product names in DB
      trim: true,
      index: true
    },

    description: {
      type: String,
      required: [true, "Product description is required"],
      trim: true
    },

    price: {
      type: Number,
      required: [true, "Product price is required"],
      min: [0, "Price cannot be negative"]
    },

    stock: {
      type: Number,
      required: [true, "Stock count is required"],
      min: [0, "Stock cannot be negative"],
      default: 0
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Product category is required"],
      index: true
    },

    brand: {
      type: String,
      trim: true,
      default: ""
    },

    // Flexible image support (Cloudinary / S3 standard structure)
    images: [
      {
        url: {
          type: String,
          required: true
        },
        public_id: {
          type: String // Useful for cloud storage (e.g., Cloudinary image deletion)
        }
      }
    ],

    // Fallback single main image URL if preferred over array
    mainImage: {
      type: String,
      default: ""
    },

    rating: {
      type: Number,
      default: 0,
      min: [0, "Rating cannot be less than 0"],
      max: [5, "Rating cannot be more than 5"]
    },

    totalReviews: {
      type: Number,
      default: 0,
      min: 0
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Add a compound text index for efficient search queries in MongoDB
productSchema.index({
  name: "text",
  description: "text",
  brand: "text"
});

module.exports = mongoose.model("Product", productSchema);