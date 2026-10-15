const { validationResult } = require("express-validator");
const Address = require("../src/models/Address");
const { sendSuccess, sendError } = require("../src/utils/response");

/*
Get User Addresses

GET /api/addresses
*/
exports.getAddresses = async (req, res) => {
    try {
        const addresses = await Address.find({ user: req.user.id }).sort({ isDefault: -1, createdAt: -1 });

        sendSuccess(res, 200, { count: addresses.length, data: addresses });

    } catch (error) {
        sendError(res, 500, error.message);
    }
};

/*
Add Address

POST /api/addresses
*/
exports.addAddress = async (req, res) => {
    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return sendError(res, 400, errors.array()[0].msg);
        }

        const userId = req.user.id;

        const { fullName, phone, address, city, state, country, pincode, location, isDefault } = req.body;

        const existingCount = await Address.countDocuments({ user: userId });

        const shouldBeDefault = isDefault === true || existingCount === 0;

        if (shouldBeDefault) {

            await Address.updateMany({ user: userId }, { isDefault: false });
        }

        const newAddress = await Address.create({
            user: userId,
            fullName,
            phone,
            address,
            city,
            state,
            country,
            pincode,
            location,
            isDefault: shouldBeDefault
        });

        sendSuccess(res, 201, { message: "Address added successfully", data: newAddress });

    } catch (error) {
        sendError(res, 500, error.message);
    }
};

/*
Update Address

PUT /api/addresses/:addressId
*/
exports.updateAddress = async (req, res) => {
    try {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return sendError(res, 400, errors.array()[0].msg);
        }

        const userId = req.user.id;

        const existingAddress = await Address.findOne({ _id: req.params.addressId, user: userId });

        if (!existingAddress) {
            return sendError(res, 404, "Address not found");
        }

        const { fullName, phone, address, city, state, country, pincode, location, isDefault } = req.body;

        if (fullName !== undefined) existingAddress.fullName = fullName;
        if (phone !== undefined) existingAddress.phone = phone;
        if (address !== undefined) existingAddress.address = address;
        if (city !== undefined) existingAddress.city = city;
        if (state !== undefined) existingAddress.state = state;
        if (country !== undefined) existingAddress.country = country;
        if (pincode !== undefined) existingAddress.pincode = pincode;
        if (location !== undefined) existingAddress.location = location;

        if (isDefault === true) {
            await Address.updateMany({ user: userId }, { isDefault: false });
            existingAddress.isDefault = true;
        }

        await existingAddress.save();

        sendSuccess(res, 200, { message: "Address updated successfully", data: existingAddress });

    } catch (error) {
        sendError(res, 500, error.message);
    }
};

/*
Delete Address

DELETE /api/addresses/:addressId
*/
exports.deleteAddress = async (req, res) => {
    try {
        const userId = req.user.id;

        const existingAddress = await Address.findOne({ _id: req.params.addressId, user: userId });

        if (!existingAddress) {
            return sendError(res, 404, "Address not found");
        }

        const wasDefault = existingAddress.isDefault;

        await existingAddress.deleteOne();

        if (wasDefault) {
            const nextAddress = await Address.findOne({ user: userId }).sort({ createdAt: 1 });

            if (nextAddress) {
                nextAddress.isDefault = true;
                await nextAddress.save();
            }
        }

        sendSuccess(res, 200, { message: "Address deleted successfully" });

    } catch (error) {
        sendError(res, 500, error.message);
    }
};

/*
Set Default Address

PATCH /api/addresses/:addressId/default
*/
exports.setDefaultAddress = async (req, res) => {
    try {
        const userId = req.user.id;

        const existingAddress = await Address.findOne({ _id: req.params.addressId, user: userId });

        if (!existingAddress) {
            return sendError(res, 404, "Address not found");
        }

        await Address.updateMany({ user: userId }, { isDefault: false });

        existingAddress.isDefault = true;
        await existingAddress.save();

        sendSuccess(res, 200, { message: "Default address updated", data: existingAddress });

    } catch (error) {
        sendError(res, 500, error.message);
    }
};
