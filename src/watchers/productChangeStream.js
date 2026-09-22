const Product = require("../models/Product");

function startProductChangeStream(io) {
  const changeStream = Product.watch([], { fullDocument: "updateLookup" });

  changeStream.on("change", (change) => {
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
    console.error("Product change stream error:", err.message);
  });

  return changeStream;
}

module.exports = startProductChangeStream;
