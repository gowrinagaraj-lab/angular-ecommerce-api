const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");

const protect = require("../src/middleware/auth.middleware");
const INDIAN_STATES = require("../src/constants/indianStates");

const {
    getAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress
} = require("../controllers/address.controller");

router.use(protect);

const addressIdParam = param("addressId")
    .isMongoId()
    .withMessage("A valid addressId is required");

router.get("/", getAddresses);

router.post(
    "/",

    addAddress
);

router.put(
    "/:addressId",
    [
        addressIdParam,

        body("fullName")
            .optional()
            .trim()
            .notEmpty()
            .withMessage("fullName cannot be empty"),

        body("phone")
            .optional()
            .trim()
            .notEmpty()
            .withMessage("phone cannot be empty"),

        body("address")
            .optional()
            .trim()
            .notEmpty()
            .withMessage("address cannot be empty"),

        body("city")
            .optional()
            .trim()
            .notEmpty()
            .withMessage("city cannot be empty"),

        body("state")
            .optional()
            .trim()
            .notEmpty()
            .withMessage("state cannot be empty")
            .bail()
            .isIn(INDIAN_STATES)
            .withMessage("state must be a valid Indian state or union territory"),

        body("country")
            .optional()
            .trim()
            .notEmpty()
            .withMessage("country cannot be empty"),

        body("pincode")
            .optional()
            .trim()
            .notEmpty()
            .withMessage("pincode cannot be empty"),

        body("location.lat")
            .optional()
            .isFloat({ min: -90, max: 90 })
            .withMessage("location.lat must be between -90 and 90"),

        body("location.lng")
            .optional()
            .isFloat({ min: -180, max: 180 })
            .withMessage("location.lng must be between -180 and 180"),

        body("isDefault")
            .optional()
            .isBoolean()
            .withMessage("isDefault must be a boolean")
    ],
    updateAddress
);

router.delete(
    "/:addressId",
    [addressIdParam],
    deleteAddress
);

router.patch(
    "/:addressId/default",
    [addressIdParam],
    setDefaultAddress
);

module.exports = router;
