const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));


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

module.exports = app;