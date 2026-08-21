const express = require("express");
const { body } = require("express-validator");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");
const authorize = require("../src/middleware/authorize.middleware");
const {
  createNotification,
  getMyNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead
} = require("../controllers/notification.controller");

router.get("/", protect, getMyNotifications);

router.get("/unread-count", protect, getUnreadNotificationCount);

router.patch("/read-all", protect, markAllNotificationsAsRead);

router.patch("/:id/read", protect, markNotificationAsRead);

router.post(
  "/",
  protect,
  authorize("admin"),
  [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("title is required"),
    body("message")
      .trim()
      .notEmpty()
      .withMessage("message is required"),
    body("type")
      .optional()
      .isIn(["system", "order", "payment", "promotion"])
      .withMessage("type must be one of system, order, payment, promotion"),
    body("userId")
      .optional()
      .isMongoId()
      .withMessage("A valid userId is required"),
    body("sendToAll")
      .optional()
      .isBoolean()
      .withMessage("sendToAll must be a boolean")
  ],
  createNotification
);

module.exports = router;
