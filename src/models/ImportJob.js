const mongoose = require("mongoose");

const importJobErrorSchema = new mongoose.Schema(
  {
    row: {
      type: Number,
      required: true
    },
    message: {
      type: String,
      required: true
    }
  },
  { _id: false }
);

const importJobSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      default: "category",
      trim: true
    },

    fileName: {
      type: String,
      required: true
    },

    filePath: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed", "cancelled"],
      default: "queued",
      index: true
    },

    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    totalRecords: {
      type: Number,
      default: 0
    },

    processedRecords: {
      type: Number,
      default: 0
    },

    successfulRecords: {
      type: Number,
      default: 0
    },

    failedRecords: {
      type: Number,
      default: 0
    },

    // Named "rowErrors" rather than "errors" - Mongoose reserves "errors" as the
    // property it uses internally to report document validation failures, and
    // reusing it here produced a "reserved schema pathname" warning.
    rowErrors: {
      type: [importJobErrorSchema],
      default: []
    },

    message: {
      type: String,
      default: ""
    },

    startedAt: {
      type: Date,
      default: null
    },

    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("ImportJob", importJobSchema);
