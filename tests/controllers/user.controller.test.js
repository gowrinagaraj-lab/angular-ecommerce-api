jest.mock("../../src/models/User");

const User = require("../../src/models/User");

const userController = require("../../controllers/user.controller");
const { mockResponse } = require("../helpers/mockRes");

describe("user.controller", () => {

    describe("getAllUsers", () => {

        it("returns a paginated list of users", async () => {

            User.countDocuments.mockResolvedValue(1);

            const sort = jest.fn().mockReturnThis();
            const skip = jest.fn().mockReturnThis();
            const limit = jest.fn().mockResolvedValue([{ _id: "user-1", email: "jane@example.com" }]);
            User.find.mockReturnValue({ sort, skip, limit });

            const req = { query: {} };
            const res = mockResponse();

            await userController.getAllUsers(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                total: 1,
                page: 1,
                data: [{ _id: "user-1", email: "jane@example.com" }]
            }));

        });

    });

    describe("updateUserRole", () => {

        it("rejects an invalid role", async () => {

            const req = { params: { id: "user-1" }, body: { role: "superadmin" }, user: { id: "admin-1" } };
            const res = mockResponse();

            await userController.updateUserRole(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(User.findByIdAndUpdate).not.toHaveBeenCalled();

        });

        it("rejects an admin changing their own role", async () => {

            const req = { params: { id: "admin-1" }, body: { role: "customer" }, user: { id: "admin-1" } };
            const res = mockResponse();

            await userController.updateUserRole(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "You cannot change your own role" }));
            expect(User.findByIdAndUpdate).not.toHaveBeenCalled();

        });

        it("returns 404 when the user does not exist", async () => {

            User.findByIdAndUpdate.mockResolvedValue(null);

            const req = { params: { id: "user-1" }, body: { role: "admin" }, user: { id: "admin-1" } };
            const res = mockResponse();

            await userController.updateUserRole(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("updates the user's role", async () => {

            User.findByIdAndUpdate.mockResolvedValue({ _id: "user-1", role: "admin" });

            const req = { params: { id: "user-1" }, body: { role: "admin" }, user: { id: "admin-1" } };
            const res = mockResponse();

            await userController.updateUserRole(req, res);

            expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
                "user-1",
                { role: "admin" },
                { new: true, runValidators: true }
            );
            expect(res.status).toHaveBeenCalledWith(200);

        });

    });

    describe("updateUserStatus", () => {

        it("rejects a non-boolean isActive value", async () => {

            const req = { params: { id: "user-1" }, body: { isActive: "yes" }, user: { id: "admin-1" } };
            const res = mockResponse();

            await userController.updateUserStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(User.findByIdAndUpdate).not.toHaveBeenCalled();

        });

        it("rejects an admin suspending their own account", async () => {

            const req = { params: { id: "admin-1" }, body: { isActive: false }, user: { id: "admin-1" } };
            const res = mockResponse();

            await userController.updateUserStatus(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(User.findByIdAndUpdate).not.toHaveBeenCalled();

        });

        it("suspends a user", async () => {

            User.findByIdAndUpdate.mockResolvedValue({ _id: "user-1", isActive: false });

            const req = { params: { id: "user-1" }, body: { isActive: false }, user: { id: "admin-1" } };
            const res = mockResponse();

            await userController.updateUserStatus(req, res);

            expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
                "user-1",
                { isActive: false },
                { new: true, runValidators: true }
            );
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: "User suspended successfully"
            }));

        });

    });

});
