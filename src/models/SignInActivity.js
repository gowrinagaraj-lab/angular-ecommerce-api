const mongoose = require("mongoose");

const signInActivitySchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: [true, "Email is required for tracking"]
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            // Not strictly required, because a login attempt might use a non-existent email
        },
        ipAddress: {
            type: String
        },
        userAgent: {
            type: String
        },
        status: {
            type: String,
            enum: ["Success", "Failed"],
            required: true
        },
        failureReason: {
            type: String
        },
        createdAt: {
            type: Date,
            default: Date.now,
            // Automatically delete logs older than 90 days
            expires: 90 * 24 * 60 * 60
        }
    }
);

module.exports = mongoose.model("SignInActivity", signInActivitySchema);
