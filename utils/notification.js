const Notification = require("../src/models/Notification");

const createUserNotification = async ({
  userId,
  title,
  message,
  type = "system",
  link = "",
  metadata,
  createdBy = null
}) => {
  if (!userId || !title || !message) {
    return null;
  }

  try {
    return await Notification.create({
      user: userId,
      title,
      message,
      type,
      link,
      metadata,
      createdBy
    });
  } catch (error) {
    console.error("Failed to create notification:", error.message);
    return null;
  }
};

module.exports = {
  createUserNotification
};
