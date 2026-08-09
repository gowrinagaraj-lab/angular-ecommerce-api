const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { validationResult } = require("express-validator");

const User = require("../src/models/User");
const generateToken = require("../utils/generateToken");
const sendEmail = require("../utils/sendEmail");

/*
Register User

POST /api/auth/register
*/

exports.register = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {

            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });

        }

        const { name, email, password, phone } = req.body;

        const existingUser = await User.findOne({ email: email.toLowerCase() });

        if (existingUser) {

            return res.status(409).json({
                success: false,
                message: "Email is already registered"
            });

        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // First registered user becomes admin
        const isFirstAccount = (await User.countDocuments({})) === 0;
        const role = isFirstAccount ? "admin" : "customer";

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            phone,
            role
        });

        const token = generateToken(user._id, user.role);

        res.json({
            success: true,
            message: "User registered successfully",
            data: {
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role
                },
                token
            }
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};


/*
Login User

POST /api/auth/login
*/

exports.login = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {

            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });

        }

        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
// console.log(user, ' user')
        if (!user) {

            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });

        }

        const isMatch = await bcrypt.compare(password, user.password);
// console.log(password, user.password,"sdfsdfs")
        if (!isMatch) {

            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });

        }

        const token = generateToken(user._id, user.role);
console.log(token, 'token')
        res.status(200).json({
            success: true,
            message: "Login successful",
            data: {
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role, 
                 
                },
                token
            }
        }); 

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};


/*
Forgot Password

POST /api/auth/forgot-password
*/

exports.forgotPassword = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {

            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });

        }

        const { email } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });

        if (user) {

            const resetToken = crypto.randomBytes(32).toString("hex");
            const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

            user.resetPasswordToken = hashedToken;
            user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

            await user.save({ validateBeforeSave: false });

            const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

            try {

                await sendEmail({
                    to: user.email,
                    subject: "Password Reset Request",
                    html: `<p>You requested a password reset.</p><p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 10 minutes.</p><p>If you didn't request this, you can safely ignore this email.</p>`
                });

            } catch (emailError) {

                user.resetPasswordToken = undefined;
                user.resetPasswordExpire = undefined;

                await user.save({ validateBeforeSave: false });

                return res.status(500).json({
                    success: false,
                    message: "Failed to send reset email, please try again later"
                });

            }

        }

        res.json({
            success: true,
            message: "If that email is registered, a password reset link has been sent"
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};


/*
Reset Password

POST /api/auth/reset-password/:token
*/

exports.resetPassword = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {

            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });

        }

        const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {

            return res.status(400).json({
                success: false,
                message: "Reset token is invalid or has expired"
            });

        }

        user.password = await bcrypt.hash(req.body.password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;

        await user.save();

        const token = generateToken(user._id, user.role);

        res.json({
            success: true,
            message: "Password reset successful",
            data: { token }
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};
