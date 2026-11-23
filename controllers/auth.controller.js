const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { validationResult } = require("express-validator");

const User = require("../src/models/User");
const SignInActivity = require("../src/models/SignInActivity");
const generateToken = require("../utils/generateToken");
const sendEmail = require("../utils/sendEmail");
const { sendSuccess, sendError } = require("../src/utils/response");

const createEmailVerificationToken = () => {
    const token = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    return { token, hashedToken };
};

const logSignInActivity = ({ email, user, req, status, failureReason }) => {

    SignInActivity.create({
        email: email.toLowerCase(),
        user: user || undefined,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        status,
        failureReason
    }).catch((error) => {
        console.error("Failed to log sign-in activity:", error.message);
    });

};

/*
Register User

POST /api/auth/register
*/

exports.register = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {

            return sendError(res, 400, errors.array()[0].msg);

        }

        const { name, email, password, phone } = req.body;

        const existingUser = await User.findOne({ email: email.toLowerCase() });

        if (existingUser) {

            return sendError(res, 409, "Email is already registered");

        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const { token: verificationToken, hashedToken } = createEmailVerificationToken();

        // First registered user becomes admin
        const isFirstAccount = (await User.countDocuments({})) === 0;
        const role = isFirstAccount ? "admin" : "customer";

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            phone,
            role,
            emailVerified: false,
            emailVerificationToken: hashedToken,
            emailVerificationExpire: Date.now() + 24 * 60 * 60 * 1000,
            emailVerificationResendAt: Date.now() + 60 * 1000
        });

        const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${verificationToken}`;
        try {
            await sendEmail({
                to: user.email,
                subject: "Verify your email address",
                html: `<p>Please verify your email address to activate your account.</p><p><a href="${verificationUrl}">Verify email</a></p><p>This link expires in 24 hours.</p>`
            });
        } catch (emailError) {
            user.emailVerificationToken = undefined;
            user.emailVerificationExpire = undefined;
            user.emailVerificationResendAt = undefined;
            await user.save({ validateBeforeSave: false });
            throw emailError;
        }

        sendSuccess(res, 200, {
            message: "Registration successful. Check your email to verify your account.",
            retryAfter: 60,
            data: {
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role,
                    emailVerified: user.emailVerified
                }
            }
        });

    } catch (error) {

        sendError(res, 500, error.message);

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

            return sendError(res, 400, errors.array()[0].msg);

        }

        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() })
            .select("+password +emailVerificationResendAt");

        if (!user) {

            logSignInActivity({
                email,
                req,
                status: "Failed",
                failureReason: "No account found with this email"
            });

            return sendError(res, 401, "Invalid email or password");

        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {

            logSignInActivity({
                email,
                user: user._id,
                req,
                status: "Failed",
                failureReason: "Incorrect password"
            });

            return sendError(res, 401, "Invalid email or password");

        }

        if (user.emailVerified === false) {
            logSignInActivity({
                email,
                user: user._id,
                req,
                status: "Failed",
                failureReason: "Email address is not verified"
            });

            return res.status(403).json({
                success: false,
                code: "EMAIL_NOT_VERIFIED",
                message: "Please verify your email address before logging in.",
                email: user.email,
                retryAfter: user.emailVerificationResendAt
                    ? Math.max(0, Math.ceil((new Date(user.emailVerificationResendAt).getTime() - Date.now()) / 1000))
                    : 0
            });
        }

        if (user.isActive === false) {
            logSignInActivity({
                email,
                user: user._id,
                req,
                status: "Failed",
                failureReason: "Account is suspended"
            });

            return res.status(403).json({
                success: false,
                code: "ACCOUNT_SUSPENDED",
                message: "Your account has been suspended. Please contact support."
            });
        }

        const token = generateToken(user._id, user.role);

        logSignInActivity({
            email,
            user: user._id,
            req,
            status: "Success"
        });

        sendSuccess(res, 200, {
            message: "Login successful",
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

        sendError(res, 500, error.message);

    }

};


/*
Verify Email

POST /api/auth/verify-email
*/

exports.verifyEmail = async (req, res) => {

    try {

        const { token } = req.body;
        if (!token || typeof token !== "string") {
            return sendError(res, 400, "A verification token is required");
        }
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
        const user = await User.findOne({
            emailVerificationToken: hashedToken,
            emailVerificationExpire: { $gt: Date.now() }
        });
        if (!user) {
            return sendError(res, 400, "Verification link is invalid or has expired");
        }
        user.emailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpire = undefined;
        user.emailVerificationResendAt = undefined;
        await user.save({ validateBeforeSave: false });

        return sendSuccess(res, 200, { message: "Email verified successfully. You can now log in." });

    } catch (error) {

        return sendError(res, 500, error.message);

    }

};


/*
Resend Email Verification

POST /api/auth/resend-verification
*/

exports.resendVerification = async (req, res) => {

    try {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return sendError(res, 400, errors.array()[0].msg);
        }

        const email = req.body.email.toLowerCase();
        const user = await User.findOne({ email }).select("+emailVerificationResendAt");

        if (!user || user.emailVerified !== false) {
            return sendSuccess(res, 200, {
                message: "If the account needs verification, a new link has been sent."
            });
        }

        const remainingMs = user.emailVerificationResendAt
            ? new Date(user.emailVerificationResendAt).getTime() - Date.now()
            : 0;

        if (remainingMs > 0) {
            const retryAfter = Math.ceil(remainingMs / 1000);
            return res.status(429).json({
                success: false,
                message: `Please wait ${retryAfter} seconds before requesting another verification email.`,
                retryAfter
            });
        }

        const { token, hashedToken } = createEmailVerificationToken();
        user.emailVerificationToken = hashedToken;
        user.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000;
        user.emailVerificationResendAt = Date.now() + 60 * 1000;
        await user.save({ validateBeforeSave: false });

        const verificationUrl = `${process.env.CLIENT_URL}/verify-email/${token}`;
        try {
            await sendEmail({
                to: user.email,
                subject: "Verify your email address",
                html: `<p>Please verify your email address to activate your account.</p><p><a href="${verificationUrl}">Verify email</a></p><p>This link expires in 24 hours.</p>`
            });
        } catch (emailError) {
            user.emailVerificationToken = undefined;
            user.emailVerificationExpire = undefined;
            user.emailVerificationResendAt = undefined;
            await user.save({ validateBeforeSave: false });
            throw emailError;
        }

        return sendSuccess(res, 200, {
            message: "If the account needs verification, a new link has been sent.",
            retryAfter: 60
        });

    } catch (error) {

        return sendError(res, 500, "Failed to send verification email, please try again later");

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

            return sendError(res, 400, errors.array()[0].msg);

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

                return sendError(res, 500, "Failed to send reset email, please try again later");

            }

        }

        sendSuccess(res, 200, { message: "If that email is registered, a password reset link has been sent" });

    } catch (error) {

        sendError(res, 500, error.message);

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

            return sendError(res, 400, errors.array()[0].msg);

        }

        const hashedToken = crypto.createHash("sha256").update(req.params.token).digest("hex");

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {

            return sendError(res, 400, "Reset token is invalid or has expired");

        }

        if (user.emailVerified === false) {
            return sendError(res, 403, "Please verify your email address before resetting your password");
        }

        user.password = await bcrypt.hash(req.body.password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;

        await user.save();

        const token = generateToken(user._id, user.role);

        sendSuccess(res, 200, { message: "Password reset successful", data: { token } });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};


/*
Get My Sign-In Activity

GET /api/auth/sign-in-activity
*/

exports.getMySignInActivity = async (req, res) => {

    try {

        const page = Math.max(1, Number(req.query.page) || 1);

        const limit = Math.max(1, Number(req.query.limit) || 10);

        const skip = (page - 1) * limit;

        const filter = { user: req.user.id };

        const total = await SignInActivity.countDocuments(filter);

        const activity = await SignInActivity.find(filter)
            .sort("-createdAt")
            .skip(skip)
            .limit(limit);

        sendSuccess(res, 200, {
            total,
            page,
            totalPages: Math.ceil(total / limit),
            data: activity
        });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};


/*
Get All Sign-In Activity (Admin)

GET /api/auth/admin/sign-in-activity
*/

exports.getAllSignInActivity = async (req, res) => {

    try {

        const page = Math.max(1, Number(req.query.page) || 1);

        const limit = Math.max(1, Number(req.query.limit) || 10);

        const skip = (page - 1) * limit;

        const filter = {};

        if (req.query.email) {

            filter.email = req.query.email.toLowerCase();

        }

        if (req.query.status) {

            filter.status = req.query.status;

        }

        const total = await SignInActivity.countDocuments(filter);

        const activity = await SignInActivity.find(filter)
            .populate("user", "name email")
            .sort("-createdAt")
            .skip(skip)
            .limit(limit);

        sendSuccess(res, 200, {
            total,
            page,
            totalPages: Math.ceil(total / limit),
            data: activity
        });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};
