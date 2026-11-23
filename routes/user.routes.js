const express = require("express");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");
const authorize = require("../src/middleware/authorize.middleware");

const {
    getAllUsers,
    updateUserRole,
    updateUserStatus
} = require("../controllers/user.controller");

router.use(protect, authorize("admin"));

router.get("/", getAllUsers);

router.patch("/:id/role", updateUserRole);

router.patch("/:id/status", updateUserStatus);

module.exports = router;
