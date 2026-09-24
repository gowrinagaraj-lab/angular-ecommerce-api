const { AppError } = require("../src/utils/AppError");
const { notFoundHandler, errorHandler } = require("../src/middleware/errorHandler");

describe("Centralized error handling", () => {
  test("creates an AppError with status and default message", () => {
    const err = new AppError("Bad request", 400);

    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(400);
    expect(err.status).toBe("error");
    expect(err.message).toBe("Bad request");
  });

  test("notFoundHandler returns a 404 error for missing routes", () => {
    const req = { originalUrl: "/missing-route" };
    const res = {};
    const next = jest.fn();

    notFoundHandler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("Route /missing-route not found");
  });

  test("errorHandler serializes app errors and validation errors consistently", () => {
    const req = { method: "GET", originalUrl: "/api/test" };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    const error = new AppError("Invalid input", 400);
    errorHandler(error, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid input"
    });
  });
});
