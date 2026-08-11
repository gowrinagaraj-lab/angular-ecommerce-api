const { validationResult } = require("express-validator");

const Address = require("../src/models/Address");

/*
Get User Addresses

GET /api/addresses
*/
exports.getAddresses = async (req, res) => {
    try {
        const addresses = await Address.find({ user: req.user.id }).sort({ isDefault: -1, createdAt: -1 });

        res.status(200).json({
            success: true,
            count: addresses.length,
            data: addresses
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
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
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });
        }

        const userId = req.user.id;

        const { fullName, phone, address, city, state, country, pincode, location, isDefault } = req.body;

        const existingCount = await Address.countDocuments({ user: userId });
console.log("Existing address count:", existingCount);
// return  false
        const shouldBeDefault = isDefault === true || existingCount === 0;
console.log("Should be default:", shouldBeDefault);
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

        res.status(201).json({
            success: true,
            message: "Address added successfully",
            data: newAddress
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
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
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });
        }
console.log("Request body:", req.user.id);
        const userId = req.user.id;

        const existingAddress = await Address.findOne({ _id: req.params.addressId, user: userId });

        if (!existingAddress) {
            return res.status(404).json({
                success: false,
                message: "Address not found"
            });
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

        res.status(200).json({
            success: true,
            message: "Address updated successfully",
            data: existingAddress
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
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
            return res.status(404).json({
                success: false,
                message: "Address not found"
            });
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

        res.status(200).json({
            success: true,
            message: "Address deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
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
            return res.status(404).json({
                success: false,
                message: "Address not found"
            });
        }

        await Address.updateMany({ user: userId }, { isDefault: false });

        existingAddress.isDefault = true;
        await existingAddress.save();

        res.status(200).json({
            success: true,
            message: "Default address updated",
            data: existingAddress
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
