const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {

        return res.status(401).json({
            success: false,
            message: "Not authorized, no token"
        });

    }

    const token = authHeader.split(" ")[1];

    try {

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // console.log("decoded ", decoded)
        req.user = { id: decoded.id, role: decoded.role };

        next();

    } catch (error) {

        return res.status(401).json({
            success: false,
            message: "Not authorized, invalid token"
        });

    }

};

module.exports = protect;
