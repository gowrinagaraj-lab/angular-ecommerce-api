const Product = require("../models/Product");
const User = require("../models/User");
const Notification = require("../models/Notification");

const createProductNotifications = async (change) => {
  const users = await User.find({}, "_id").lean();

  if (!users.length) {
    return;
  }

  const product = change.fullDocument || {};
  const productName = product.name || "a product";
  const notificationByOperation = {
    insert: {
      title: "New product available",
      message: `${productName} was added to the store.`,
      link: product._id ? `/products/${product._id}` : ""
    },
    update: {
      title: "Product updated",
      message: `${productName} was updated.`,
      link: product._id ? `/products/${product._id}` : ""
    },
    replace: {
      title: "Product updated",
      message: `${productName} was updated.`,
      link: product._id ? `/products/${product._id}` : ""
    },
    delete: {
      title: "Product removed",
      message: "A product was removed from the store.",
      link: ""
    }
  };
  const notification = notificationByOperation[change.operationType];

  if (!notification) {
    return;
  }

  await Notification.insertMany(
    users.map((user) => ({
      user: user._id,
      ...notification,
      type: "system",
      metadata: { productId: change.documentKey?._id }
    }))
  );
};

function startProductChangeStream(io) {
  const changeStream = Product.watch([], { fullDocument: "updateLookup" });

  changeStream.on("change", async (change) => {
    try {
      await createProductNotifications(change);
    } catch (error) {
      console.error("Failed to create product notification:", error.message);
    }

    switch (change.operationType) {
      case "insert":
        io.emit("productCreated", { message: "Product created", data: change.fullDocument });
        break;
      case "update":
      case "replace":
        io.emit("productUpdated", { message: "Product updated", data: change.fullDocument });
        break;
      case "delete":
        io.emit("productDeleted", { message: "Product deleted", data: { _id: change.documentKey._id } });
        break;
    }
  });

  changeStream.on("error", (err) => {
    console.error(
      "Product change stream error. MongoDB must run as a replica set or sharded cluster:",
      err.message
    );
  });

  return changeStream;
}

module.exports = startProductChangeStream;
 