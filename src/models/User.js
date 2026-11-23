const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        password: {
            type: String,
            required: true,
            select: false
        },

        phone: {
            type: String
        },

        role: {
            type: String,
            enum: ["customer", "admin"],
            default: "customer"
        },

        emailVerified: {
            type: Boolean,
            default: true
        },

        isActive: {
            type: Boolean,
            default: true
        },

        emailVerificationToken: {
            type: String,
            select: false
        },

        emailVerificationExpire: {
            type: Date,
            select: false
        },

        emailVerificationResendAt: {
            type: Date,
            select: false
        },

        resetPasswordToken: {
            type: String,
            select: false
        },

        resetPasswordExpire: {
            type: Date,
            select: false
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("User", userSchema);
