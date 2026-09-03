const path = require("path");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

app.use(
    "/uploads",
    express.static(path.join(__dirname, "..", "uploads"), {
        setHeaders: (res) => {
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        }
    })
);


const productRoutes = require("./../routes/product.routes");

app.use("/api/products", productRoutes);
app.use("/api/categories", require("./../routes/category.routes"));
const cartRoutes = require("./../routes/cart.routes");
const wishlistRoutes = require("./../routes/wishlist.routes");

app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/orders", require("./../routes/order.routes"));
app.use("/api/auth", require("./../routes/auth.routes"));
app.use("/api/addresses", require("./../routes/address.routes"));
app.use("/api/payments", require("./../routes/payment.routes"));
app.use("/api/notifications", require("./../routes/notification.routes"));
app.use("/api/chat", require("./../routes/chat.routes"));
app.use("/api/reviews", require("./../routes/review.routes"));

module.exports = app;
