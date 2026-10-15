const mongoose = require("mongoose");
const { validationResult } = require("express-validator");

const Notification = require("../src/models/Notification");
const User = require("../src/models/User");
const { sendSuccess, sendError } = require("../src/utils/response");

const parseBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value === "true";
  }

  return false;
};

exports.createNotification = async (req, res) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return sendError(res, 400, errors.array()[0].msg);
    }

    const { title, message, type = "system", userId, link = "", metadata } = req.body;
    const sendToAll = parseBoolean(req.body.sendToAll);

    if (!sendToAll && !userId) {
      return sendError(res, 400, "userId is required when sendToAll is false");
    }

    if (sendToAll) {
      const users = await User.find({}, "_id");

      if (!users.length) {
        return sendError(res, 404, "No users found to notify");
      }

      const notifications = users.map((user) => ({
        user: user._id,
        title,
        message,
        type,
        link,
        metadata,
        createdBy: req.user.id
      }));

      const createdNotifications = await Notification.insertMany(notifications);

      return sendSuccess(res, 201, {
        message: "Notifications created successfully",
        count: createdNotifications.length,
        data: createdNotifications
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return sendError(res, 400, "Invalid user ID format");
    }

    const user = await User.findById(userId);

    if (!user) {
      return sendError(res, 404, "User not found");
    }

    const notification = await Notification.create({
      user: userId,
      title,
      message,
      type,
      link,
      metadata,
      createdBy: req.user.id
    });

    sendSuccess(res, 201, { message: "Notification created successfully", data: notification });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

exports.getMyNotifications   = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const filter = { user: req.user.id };

    if (req.query.isRead !== undefined) {
      filter.isRead = req.query.isRead === "true";
    }

    if (req.query.type) {
      filter.type = req.query.type;
    }

    const total = await Notification.countDocuments(filter);
    const notifications = await Notification.find(filter)
      .sort("-createdAt")
      .skip(skip)
      .limit(limit);

    sendSuccess(res, 200, {
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: notifications
    });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

exports.getUnreadNotificationCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      user: req.user.id,
      isRead: false
    });

    sendSuccess(res, 200, { data: { unreadCount } });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

exports.markNotificationAsRead = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return sendError(res, 400, "Invalid notification ID format");
    }

    const notification = await Notification.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!notification) {
      return sendError(res, 404, "Notification not found");
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await notification.save();
    }

    sendSuccess(res, 200, { message: "Notification marked as read", data: notification });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      {
        user: req.user.id,
        isRead: false
      },
      {
        $set: {
          isRead: true,
          readAt: new Date()
        }
      }
    );

    sendSuccess(res, 200, {
      message: "All notifications marked as read",
      data: {
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};
