const mongoose = require("mongoose");

const reviewMediaSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["image", "video", "file"],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    originalName: {
      type: String
    }
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      trim: true,
      default: ""
    },
    media: [reviewMediaSchema]
  },
  {
    timestamps: true
  }
);

reviewSchema.index({ product: 1, user: 1, order: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema);
