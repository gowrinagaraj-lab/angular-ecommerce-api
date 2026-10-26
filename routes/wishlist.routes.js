const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");

const protect = require("../src/middleware/auth.middleware");
const authorize = require("../src/middleware/authorize.middleware");

const {
    getWishlist,
    addToWishlist,
    removeFromWishlist,
    clearWishlist
} = require("../controllers/wishlist.controller");

// Only customers shop; admins manage the store
router.use(protect, authorize("customer"));

router.get("/", getWishlist);

router.post(
    "/add",
    [
        body("productId")
            .isMongoId()
            .withMessage("A valid productId is required")
    ],
    addToWishlist
);

router.delete(
    "/remove/:productId",
    [
        param("productId")
            .isMongoId()
            .withMessage("A valid productId is required")
    ],
    removeFromWishlist
);

router.delete("/clear", clearWishlist);

module.exports = router;