const express = require("express");
const { body } = require("express-validator");

const router = express.Router();

const { register, login, forgotPassword, resetPassword } = require("../controllers/auth.controller");

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

module.exports = router;
