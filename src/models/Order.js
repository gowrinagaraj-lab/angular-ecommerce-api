const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },

    name: {
        type: String,
        required: true
    },

    price: {
        type: Number,
        required: true
    },

    quantity: {
        type: Number,
        required: true
    },

    subtotal: {
        type: Number,
        required: true
    }
});

const orderSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        items: [orderItemSchema],

        shippingAddress: {
            fullName: String,
            phone: String,
            address: String,
            city: String,
            state: String,
            country: String,
            pincode: String
        },

        paymentMethod: {
            type: String,
            enum: ["COD", "CARD", "UPI"],
            default: "COD"
        },

        paymentStatus: {
            type: String,
            enum: ["Pending", "Paid", "Failed"],
            default: "Pending"
        },

        razorpayOrderId: {
            type: String
        },

        razorpayPaymentId: {
            type: String
        },

        razorpaySignature: {
            type: String
        },

        paymentVerificationKey: {
            type: String
        },

        orderStatus: {
            type: String,
            enum: [
                "Pending",
                "Processing",
                "Shipped",
                "Delivered",
                "Cancelled"
            ],
            default: "Pending"
        },

        totalAmount: {
            type: Number,
            required: true
        },

        deliveryOtp: {
            type: String,
            select: false
        },

        deliveryOtpExpire: {
            type: Date,
            select: false
        }
    },
    {
        timestamps: true
    }
);

orderSchema.index(
    { user: 1, paymentVerificationKey: 1 },
    {
        unique: true,
        partialFilterExpression: { paymentVerificationKey: { $type: "string" } }
    }
);

orderSchema.index(
    { razorpayPaymentId: 1 },
    { unique: true, sparse: true }
);

module.exports = mongoose.model("Order", orderSchema);
