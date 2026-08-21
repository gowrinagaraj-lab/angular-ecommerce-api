const express = require("express");
const { body } = require("express-validator");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");
const {
  sendMessage,
  getMyConversations,
  getConversationById,
  deleteConversation
} = require("../controllers/chat.controller");

router.post(
  "/",
  protect,
  [
    body("message")
      .trim()
      .notEmpty()
      .withMessage("message is required")
      .isLength({ max: 2000 })
      .withMessage("message must be 2000 characters or fewer"),
    body("conversationId")
      .optional()
      .isMongoId()
      .withMessage("A valid conversationId is required")
  ],
  sendMessage
);

router.get("/", protect, getMyConversations);

router.get("/:id", protect, getConversationById);

router.delete("/:id", protect, deleteConversation);

module.exports = router;
