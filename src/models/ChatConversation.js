const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    }
  },
  {
    _id: false,
    timestamps: { createdAt: true, updatedAt: false }
  }
);

const chatConversationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    title: {
      type: String,
      trim: true,
      default: "New conversation"
    },
    messages: [chatMessageSchema]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("ChatConversation", chatConversationSchema);
