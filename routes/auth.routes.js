const express = require("express");
const { body } = require("express-validator");

const router = express.Router();

const protect = require("../src/middleware/auth.middleware");
const authorize = require("../src/middleware/authorize.middleware");

const {
    register,
    login,
    forgotPassword,
    resetPassword,
    getMySignInActivity,
    getAllSignInActivity
} = require("../controllers/auth.controller");

router.post(
    "/register",
    [
        body("name")
            .trim()
            .notEmpty()
            .withMessage("Name is required"),

        body("email")
            .trim()
            .isEmail()
            .withMessage("A valid email is required"),

        body("password")
            .isLength({ min: 6 })
            .withMessage("Password must be at least 6 characters long")
    ],
    register
);

router.post(
    "/login",
    [
        body("email")
            .trim()
            .isEmail()
            .withMessage("A valid email is required"),

        body("password")
            .notEmpty()
            .withMessage("Password is required")
    ],
    login
);

router.post(
    "/forgot-password",
    [
        body("email") 
            .trim()
            .isEmail()
            .withMessage("A valid email is required")
    ],
    forgotPassword
);

router.post(
    "/reset-password/:token",
    [
        body("password")
            .isLength({ min: 6 })
            .withMessage("Password must be at least 6 characters long")
    ],
    resetPassword
);

router.get("/sign-in-activity", protect, getMySignInActivity);

router.get("/admin/sign-in-activity", protect, authorize("admin"), getAllSignInActivity);

module.exports = router;
