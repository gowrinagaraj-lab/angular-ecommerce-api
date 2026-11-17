const Product = require("../models/Product");
const { broadcastProductChange, setChangeStreamActive, isQuietUpdate } = require("../realtime/productEvents");

/*
Watch the products collection and broadcast every change, including edits
made directly in the database. Needs a replica set or sharded cluster; on a
standalone mongod the server publishes events from the code instead (see
src/realtime/productEvents.js).
*/

function startProductChangeStream() {
  const changeStream = Product.watch([], { fullDocument: "updateLookup" });

  setChangeStreamActive(true);

  changeStream.on("change", async (change) => {
    const product = change.operationType === "delete"
      ? { _id: change.documentKey._id }
      : change.fullDocument;

    await broadcastProductChange(change.operationType, product, { notify: !isQuietUpdate(change) });
  });

  changeStream.on("error", (err) => {
    // Fall back to in-process events so real-time updates keep working
    setChangeStreamActive(false);
    console.error("Product change stream stopped, using in-process product events instead:", err.message);
  });

  return changeStream;
}

module.exports = startProductChangeStream;
