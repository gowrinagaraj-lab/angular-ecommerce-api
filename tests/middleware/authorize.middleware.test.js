const authorize = require("../../src/middleware/authorize.middleware");
const { mockResponse } = require("../helpers/mockRes");

describe("authorize.middleware", () => {

    it("rejects when req.user is missing", () => {

        const req = {};
        const res = mockResponse();
        const next = jest.fn();

        authorize("admin")(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Not authorized to perform this action" }));
        expect(next).not.toHaveBeenCalled();

    });

    it("rejects when the user's role is not in the allowed list", () => {

        const req = { user: { role: "customer" } };
        const res = mockResponse();
        const next = jest.fn();

        authorize("admin")(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();

    });

    it("calls next() when the user's role is allowed", () => {

        const req = { user: { role: "admin" } };
        const res = mockResponse();
        const next = jest.fn();

        authorize("admin", "customer")(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();

    });

});
