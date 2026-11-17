const Order = require("../src/models/Order");
const Product = require("../src/models/Product");
const User = require("../src/models/User");
const runInTransaction = require("../src/utils/runInTransaction");
const sendEmail = require("../utils/sendEmail");
const { createUserNotification } = require("../utils/notification");
const { publishStockChange } = require("../src/realtime/productEvents");

// Matches the Product schema default; used for products saved before the field existed
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

const RESERVATION_MINUTES = Math.max(Number(process.env.STOCK_RESERVATION_MINUTES) || 30, 5);

const ONLINE_METHODS = ["CARD", "UPI"];

const createRequestError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const thresholdExpr = { $ifNull: ["$lowStockThreshold", DEFAULT_LOW_STOCK_THRESHOLD] };

const getReservationExpiry = () => new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);

/*
Take stock for order items, all or nothing when a session is given.
Each decrement only matches while enough stock is left, so two buyers
can never both take the last unit.
*/

const deductStock = async (items, session) => {
    for (const item of items) {
        const result = await Product.updateOne(
            { _id: item.product, stock: { $gte: item.quantity } },
            { $inc: { stock: -item.quantity } },
            { session }
        );

        if (result.modifiedCount !== 1) {
            throw createRequestError(400, `${item.name} is out of stock`);
        }
    }
};

const restoreStock = async (items, session) => {
    for (const item of items) {
        await Product.updateOne(
            { _id: item.product },
            { $inc: { stock: item.quantity } },
            { session }
        );
    }
};

/*
Give back the stock held by an unpaid order and cancel it. The update only
matches while the order still holds stock and is unpaid, so it is safe to
race with payment confirmation or a second release.
*/

const releaseOrderReservation = async (orderId, reason) => {
    const order = await runInTransaction(async (session) => {
        const released = await Order.findOneAndUpdate(
            { _id: orderId, stockDeducted: true, paymentStatus: { $ne: "Paid" } },
            {
                $set: {
                    stockDeducted: false,
                    orderStatus: "Cancelled",
                    paymentStatus: "Failed",
                    paymentFailureReason: reason
                },
                $unset: { reservationExpiresAt: 1 }
            },
            { new: true, session }
        );

        if (released) {
            await restoreStock(released.items, session);
        }

        return released;
    });

    if (order) {
        await afterStockChange(order.items.map((item) => item.product));
    }

    return order;
};

const sendLowStockAlerts = async (products) => {
    const admins = await User.find({ role: "admin" }).select("_id name email");

    if (admins.length === 0) {
        return;
    }

    const rows = products
        .map((product) => {
            const threshold = product.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
            const state = product.stock === 0 ? "OUT OF STOCK" : `${product.stock} left`;
            return `<li><b>${product.name}</b>: ${state} (alert level ${threshold})</li>`;
        })
        .join("");

    const summary = products.length === 1
        ? `${products[0].name} is running low (${products[0].stock} left).`
        : `${products.length} products are running low on stock.`;

    for (const admin of admins) {
        await createUserNotification({
            userId: admin._id,
            title: "Low stock alert",
            message: summary,
            type: "system",
            link: "/admin/dashboard",
            metadata: { productIds: products.map((product) => product._id) }
        });

        try {
            await sendEmail({
                to: admin.email,
                subject: products.length === 1 ? `Low stock: ${products[0].name}` : `Low stock: ${products.length} products`,
                html: `<p>Hi ${admin.name},</p><p>These products are at or below their low-stock level:</p><ul>${rows}</ul><p>Restock them from the admin panel before sales are blocked.</p>`
            });
        } catch (error) {
            console.error(`Failed to send low-stock email to ${admin.email}:`, error.message);
        }
    }
};

/*
Run after stock changes are committed. Alerts admins once per product when
it falls to its threshold, and re-arms the alert once it is restocked.
Never throws: an alert failure must not fail the order or update.
*/

const checkLowStock = async (productIds) => {
    try {
        const ids = [...new Set(productIds.filter(Boolean).map(String))];

        if (ids.length === 0) {
            return;
        }

        await Product.updateMany(
            { _id: { $in: ids }, lowStockAlertedAt: { $ne: null }, $expr: { $gt: ["$stock", thresholdExpr] } },
            { $unset: { lowStockAlertedAt: 1 } }
        );

        const candidates = await Product.find({
            _id: { $in: ids },
            lowStockAlertedAt: null,
            $expr: { $lte: ["$stock", thresholdExpr] }
        }).select("_id");

        const alerted = [];

        for (const { _id } of candidates) {
            // Claim the alert atomically so concurrent orders don't send duplicates
            const product = await Product.findOneAndUpdate(
                { _id, lowStockAlertedAt: null },
                { $set: { lowStockAlertedAt: new Date() } },
                { new: true }
            ).select("name stock lowStockThreshold");

            if (product) {
                alerted.push(product);
            }
        }

        if (alerted.length > 0) {
            await sendLowStockAlerts(alerted);
        }
    } catch (error) {
        console.error("Low-stock check failed:", error.message);
    }
};

/*
Run after any committed stock change: push the new stock to browsers right
away, then check low-stock levels.
*/

const afterStockChange = async (productIds) => {
    await publishStockChange(productIds);
    await checkLowStock(productIds);
};

/*
Numbers and list for the admin inventory dashboard widgets.
*/

const getInventorySummary = async ({ limit = 20 } = {}) => {
    const lowStockFilter = { $expr: { $lte: ["$stock", thresholdExpr] } };

    const [totalProducts, outOfStock, lowStock, lowStockProducts, reserved] = await Promise.all([
        Product.countDocuments({}),
        Product.countDocuments({ stock: { $lte: 0 } }),
        Product.countDocuments({ stock: { $gt: 0 }, ...lowStockFilter }),
        Product.find(lowStockFilter)
            .sort({ stock: 1, name: 1 })
            .limit(limit)
            .select("name stock lowStockThreshold lowStockAlertedAt mainImage isActive"),
        Order.aggregate([
            {
                $match: {
                    stockDeducted: true,
                    paymentMethod: { $in: ONLINE_METHODS },
                    paymentStatus: { $ne: "Paid" },
                    orderStatus: "Pending"
                }
            },
            { $unwind: "$items" },
            {
                $group: {
                    _id: null,
                    units: { $sum: "$items.quantity" },
                    orders: { $addToSet: "$_id" }
                }
            }
        ])
    ]);

    return {
        totalProducts,
        outOfStock,
        lowStock,
        reservedUnits: reserved[0]?.units || 0,
        reservedOrders: reserved[0]?.orders.length || 0,
        defaultLowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
        lowStockProducts: lowStockProducts.map((product) => ({
            _id: product._id,
            name: product.name,
            stock: product.stock,
            lowStockThreshold: product.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
            alertedAt: product.lowStockAlertedAt || null,
            mainImage: product.mainImage,
            isActive: product.isActive
        }))
    }; 
};

module.exports = {
    ONLINE_METHODS,
    DEFAULT_LOW_STOCK_THRESHOLD,
    getReservationExpiry,
    deductStock,
    restoreStock,
    releaseOrderReservation,
    checkLowStock,
    afterStockChange,
    getInventorySummary
};
