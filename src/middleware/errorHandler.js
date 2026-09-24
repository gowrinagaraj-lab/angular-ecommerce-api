const { AppError } = require("../utils/AppError");

const notFoundHandler = (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404));
};

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Something went wrong";

  if (process.env.NODE_ENV !== "test") {
    console.error(`\n[ERROR] ${req.method} ${req.originalUrl}`);
    console.error(err.stack || err);
  }

  res.status(statusCode).json({
    success: false,
    message
  });
};

module.exports = { 
  AppError,
  notFoundHandler,
  errorHandler
};
