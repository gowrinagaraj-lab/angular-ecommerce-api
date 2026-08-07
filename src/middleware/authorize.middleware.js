const authorize = (...allowedRoles) => {
    return (req, res, next) => {

        if (!req.user || !allowedRoles.includes(req.user.role)) {

            return res.status(403).json({
                success: false,
                message: "Not authorized to perform this action"
            });

        }

        next();

    };
};

module.exports = authorize;
