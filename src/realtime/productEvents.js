const Product = require("../models/Product");
const User = require("../models/User");
const Notification = require("../models/Notification");

/*
Real-time product events for every connected browser.

Two sources, never both at once (so clients never get duplicates):
- MongoDB change stream (replica set / Atlas): catches every write, even
  ones made directly in the database. Set with setChangeStreamActive(true).
- In-process publish (standalone mongod, e.g. local development): the code
  that writes products calls publishProductChange() right after the write.
*/

let io = null;
let changeStreamActive = false;

const EVENT_BY_OPERATION = {
    insert: "productCreated",
    update: "productUpdated",
    replace: "productUpdated",
    delete: "productDeleted"
};

// Fields that change during normal shopping; such updates are not worth a notification
const QUIET_FIELDS = new Set(["stock", "lowStockAlertedAt", "rating", "totalReviews", "updatedAt"]);

const initProductEvents = (socketServer) => {
    io = socketServer;
};

const setChangeStreamActive = (active) => {
    changeStreamActive = active;
};

const isChangeStreamActive = () => changeStreamActive;

const createProductNotifications = async (operationType, product) => {
    const productName = product?.name || "a product";
    const link = product?._id && operationType !== "delete" ? `/products/${product._id}` : "";

    const byOperation = {
        insert: { title: "New product available", message: `${productName} was added to the store.` },
        update: { title: "Product updated", message: `${productName} was updated.` },
        replace: { title: "Product updated", message: `${productName} was updated.` },
        delete: { title: "Product removed", message: `${productName} was removed from the store.` }
    };

    const notification = byOperation[operationType];

    if (!notification) {
        return;
    }

    const users = await User.find({}, "_id").lean();

    if (!users.length) {
        return;
    }

    await Notification.insertMany(
        users.map((user) => ({
            user: user._id,
            ...notification,
            link,
            type: "system",
            metadata: { productId: product?._id }
        }))
    );
};

/*
Emit the socket event and, unless `notify` is false, create the in-app
notifications. Used by both sources. Never throws.
*/

const broadcastProductChange = async (operationType, productOrDoc, { notify = true } = {}) => {
    const event = EVENT_BY_OPERATION[operationType];
    const product = typeof productOrDoc?.toObject === "function" ? productOrDoc.toObject() : productOrDoc;

    if (!event || !product?._id) {
        return;
    }

    const data = operationType === "delete" ? { _id: product._id } : product;

    if (io) {
        io.emit(event, { message: `Product ${operationType === "insert" ? "created" : operationType === "delete" ? "deleted" : "updated"}`, data });
    }

    if (notify) {
        try {
            await createProductNotifications(operationType, product);
        } catch (error) {
            console.error("Failed to create product notification:", error.message);
        }
    }
};

/*
Called by controllers and services right after they write a product.
Does nothing when the change stream is active, because it will report the
same write itself.
*/

const publishProductChange = async (operationType, product, options) => {
    if (changeStreamActive) {
        return;
    }

    await broadcastProductChange(operationType, product, options);
};

/*
Stock moved because of an order (checkout, payment, cancel, release).
Pushes the new stock to browsers without notifying users.
*/

const publishStockChange = async (productIds) => {
    if (changeStreamActive || !io) {
        return;
    }

    try {
        const ids = [...new Set(productIds.filter(Boolean).map(String))];

        if (ids.length === 0) {
            return;
        }

        const products = await Product.find({ _id: { $in: ids } }).select("_id stock");

        for (const product of products) {
            io.emit("productUpdated", {
                message: "Product stock updated",
                data: { _id: product._id, stock: product.stock },
                partial: true
            });
        }
    } catch (error) {
        console.error("Failed to publish stock change:", error.message);
    }
};

// Change-stream updates that only touched shopping fields (stock, rating) stay silent
const isQuietUpdate = (change) => {
    const fields = Object.keys(change.updateDescription?.updatedFields || {});
    const removed = change.updateDescription?.removedFields || [];

    return change.operationType === "update" && fields.length > 0 &&
        [...fields, ...removed].every((field) => QUIET_FIELDS.has(field));
};

module.exports = {
    initProductEvents,
    setChangeStreamActive,
    isChangeStreamActive,
    broadcastProductChange,
    publishProductChange,
    publishStockChange,
    isQuietUpdate
};
