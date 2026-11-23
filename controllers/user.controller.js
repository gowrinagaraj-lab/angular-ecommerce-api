const User = require("../src/models/User");
const { sendSuccess, sendError } = require("../src/utils/response");

/*
Get All Users (Admin)

GET /api/users
*/
exports.getAllUsers = async (req, res) => {

    try {

        const page = Math.max(1, Number(req.query.page) || 1);

        const limit = Math.max(1, Number(req.query.limit) || 10);

        const skip = (page - 1) * limit;

        const filter = {};

        if (req.query.role) {

            filter.role = req.query.role;

        }

        if (req.query.email) {

            filter.email = { $regex: req.query.email.toLowerCase(), $options: "i" };

        }

        if (req.query.status === "active") {

            filter.isActive = true;

        } else if (req.query.status === "suspended") {

            filter.isActive = false;

        }

        const total = await User.countDocuments(filter);

        const users = await User.find(filter)
            .sort("-createdAt")
            .skip(skip)
            .limit(limit);

        sendSuccess(res, 200, {
            total,
            page,
            totalPages: Math.ceil(total / limit),
            data: users
        });

    } catch (error) {

        sendError(res, 500, error.message);

    }

};


/*
Update User Role (Admin)

PATCH /api/users/:id/role
*/
exports.updateUserRole = async (req, res) => {

    try {

        const { role } = req.body;

        if (!["customer", "admin"].includes(role)) {

            return sendError(res, 400, 'Role must be either "customer" or "admin"');

        }

        if (req.params.id === req.user.id) {

            return sendError(res, 400, "You cannot change your own role");

        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role },
            {
                new: true,
                runValidators: true
            }
        );

        if (!user) {

            return sendError(res, 404, "User not found");

        }

        sendSuccess(res, 200, { message: `User role updated to ${role}`, data: user });

    } catch (error) {

        if (error.kind === "ObjectId") {

            return sendError(res, 400, "Invalid user ID format");

        }

        sendError(res, 500, error.message);

    }

};


/*
Suspend / Reactivate User (Admin)

PATCH /api/users/:id/status
*/
exports.updateUserStatus = async (req, res) => {

    try {

        const { isActive } = req.body;

        if (typeof isActive !== "boolean") {

            return sendError(res, 400, "isActive must be a boolean value (true or false)");

        }

        if (req.params.id === req.user.id) {

            return sendError(res, 400, "You cannot change your own account status");

        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isActive },
            {
                new: true,
                runValidators: true
            }
        );

        if (!user) {

            return sendError(res, 404, "User not found");

        }

        sendSuccess(res, 200, { message: `User ${isActive ? "reactivated" : "suspended"} successfully`, data: user });

    } catch (error) {

        if (error.kind === "ObjectId") {

            return sendError(res, 400, "Invalid user ID format");

        }

        sendError(res, 500, error.message);

    }

};
