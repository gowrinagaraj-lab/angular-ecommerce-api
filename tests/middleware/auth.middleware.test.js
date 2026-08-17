jest.mock("jsonwebtoken");

const jwt = require("jsonwebtoken");
const protect = require("../../src/middleware/auth.middleware");
const { mockResponse } = require("../helpers/mockRes");

describe("auth.middleware (protect)", () => {

    it("rejects a request with no Authorization header", () => {

        const req = { headers: {} };
        const res = mockResponse();
        const next = jest.fn();

        protect(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Not authorized, no token" }));
        expect(next).not.toHaveBeenCalled();

    });

    it("rejects a header that does not start with 'Bearer '", () => {

        const req = { headers: { authorization: "Basic abc123" } };
        const res = mockResponse();
        const next = jest.fn();

        protect(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();

    });

    it("rejects an invalid or expired token", () => {

        jwt.verify.mockImplementation(() => {
            throw new Error("invalid signature");
        });

        const req = { headers: { authorization: "Bearer bad.token" } };
        const res = mockResponse();
        const next = jest.fn();

        protect(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Not authorized, invalid token" }));
        expect(next).not.toHaveBeenCalled();

    });

    it("attaches the decoded user id and role, then calls next()", () => {

        jwt.verify.mockReturnValue({ id: "user-1", role: "admin", iat: 1, exp: 2 });

        const req = { headers: { authorization: "Bearer good.token" } };
        const res = mockResponse();
        const next = jest.fn();

        protect(req, res, next);

        expect(req.user).toEqual({ id: "user-1", role: "admin" });
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();

    });

});
