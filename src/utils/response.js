/*
Shared response helpers so every controller sends the same
success/error JSON shape: { success, message?, data?, ...meta }
*/

const sendSuccess = (res, statusCode, payload = {}) => {
    return res.status(statusCode).json({
        success: true,
        ...payload
    });
};

const sendError = (res, statusCode, message) => {
    return res.status(statusCode).json({
        success: false,
        message
    });
};

module.exports = { sendSuccess, sendError };
