jest.mock("../../src/models/User");
jest.mock("../../src/models/SignInActivity");
jest.mock("../../utils/generateToken");
jest.mock("../../utils/sendEmail");
jest.mock("bcrypt");
jest.mock("express-validator", () => ({
    validationResult: jest.fn()
}));

const bcrypt = require("bcrypt");
const { validationResult } = require("express-validator");

const User = require("../../src/models/User");
const SignInActivity = require("../../src/models/SignInActivity");
const generateToken = require("../../utils/generateToken");
const sendEmail = require("../../utils/sendEmail");

const authController = require("../../controllers/auth.controller");
const { mockResponse } = require("../helpers/mockRes");

const validRequest = () => ({ isEmpty: () => true, array: () => [] });
const invalidRequest = (msg) => ({ isEmpty: () => false, array: () => [{ msg }] });

describe("auth.controller", () => {

    beforeEach(() => {
        validationResult.mockReturnValue(validRequest());
        SignInActivity.create.mockResolvedValue({});
        generateToken.mockReturnValue("fake.jwt.token");
    });

    describe("register", () => {

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("Name is required"));

            const req = { body: {} };
            const res = mockResponse();

            await authController.register(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: "Name is required" }));
            expect(User.create).not.toHaveBeenCalled();

        });

        it("rejects when the email is already registered", async () => {

            User.findOne.mockResolvedValue({ _id: "existing-user" });

            const req = { body: { name: "Jane", email: "jane@example.com", password: "password123" } };
            const res = mockResponse();

            await authController.register(req, res);

            expect(res.status).toHaveBeenCalledWith(409);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: "Email is already registered" }));
            expect(User.create).not.toHaveBeenCalled();

        });

        it("makes the first registered user an admin", async () => {

            User.findOne.mockResolvedValue(null);
            User.countDocuments.mockResolvedValue(0);
            bcrypt.hash.mockResolvedValue("hashed-password");
            User.create.mockResolvedValue({
                _id: "user-1",
                name: "Jane",
                email: "jane@example.com",
                phone: "1234567890",
                role: "admin"
            });

            const req = { body: { name: "Jane", email: "jane@example.com", password: "password123", phone: "1234567890" } };
            const res = mockResponse();

            await authController.register(req, res);

            expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ role: "admin" }));
            expect(generateToken).toHaveBeenCalledWith("user-1", "admin");
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: expect.objectContaining({ token: "fake.jwt.token" })
            }));

        });

        it("registers subsequent users as customers", async () => {

            User.findOne.mockResolvedValue(null);
            User.countDocuments.mockResolvedValue(3);
            bcrypt.hash.mockResolvedValue("hashed-password");
            User.create.mockResolvedValue({
                _id: "user-2",
                name: "Bob",
                email: "bob@example.com",
                phone: "1234567890",
                role: "customer"
            });

            const req = { body: { name: "Bob", email: "bob@example.com", password: "password123", phone: "1234567890" } };
            const res = mockResponse();

            await authController.register(req, res);

            expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ role: "customer" }));

        });

        it("returns 500 when User.create throws", async () => {

            User.findOne.mockResolvedValue(null);
            User.countDocuments.mockResolvedValue(1);
            bcrypt.hash.mockResolvedValue("hashed-password");
            User.create.mockRejectedValue(new Error("DB write failed"));

            const req = { body: { name: "Bob", email: "bob@example.com", password: "password123" } };
            const res = mockResponse();

            await authController.register(req, res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: "DB write failed" }));

        });

    });

    describe("login", () => {

        const req = () => ({
            body: { email: "jane@example.com", password: "password123" },
            ip: "127.0.0.1",
            headers: { "user-agent": "jest-test-agent" }
        });

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("A valid email is required"));

            const res = mockResponse();

            await authController.login(req(), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(User.findOne).not.toHaveBeenCalled();

        });

        it("logs a failed attempt and returns 401 when the email is unknown", async () => {

            User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

            const res = mockResponse();

            await authController.login(req(), res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: "Invalid email or password" }));
            expect(SignInActivity.create).toHaveBeenCalledWith(expect.objectContaining({
                email: "jane@example.com",
                status: "Failed",
                failureReason: "No account found with this email",
                ipAddress: "127.0.0.1",
                userAgent: "jest-test-agent"
            }));

        });

        it("logs a failed attempt and returns 401 when the password is wrong", async () => {

            const user = { _id: "user-1", email: "jane@example.com", password: "hashed" };
            User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
            bcrypt.compare.mockResolvedValue(false);

            const res = mockResponse();

            await authController.login(req(), res);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(SignInActivity.create).toHaveBeenCalledWith(expect.objectContaining({
                email: "jane@example.com",
                user: "user-1",
                status: "Failed",
                failureReason: "Incorrect password"
            }));

        });

        it("logs a successful attempt and returns a token on success", async () => {

            const user = { _id: "user-1", name: "Jane", email: "jane@example.com", phone: "123", role: "customer", password: "hashed" };
            User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
            bcrypt.compare.mockResolvedValue(true);

            const res = mockResponse();

            await authController.login(req(), res);

            expect(generateToken).toHaveBeenCalledWith("user-1", "customer");
            expect(SignInActivity.create).toHaveBeenCalledWith(expect.objectContaining({
                email: "jane@example.com",
                user: "user-1",
                status: "Success"
            }));
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: expect.objectContaining({ token: "fake.jwt.token" })
            }));

        });

        it("still logs in successfully even if activity logging fails", async () => {

            const user = { _id: "user-1", name: "Jane", email: "jane@example.com", phone: "123", role: "customer", password: "hashed" };
            User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
            bcrypt.compare.mockResolvedValue(true);
            SignInActivity.create.mockRejectedValue(new Error("log write failed"));

            const res = mockResponse();

            await authController.login(req(), res);

            expect(res.status).toHaveBeenCalledWith(200);

        });

    });

    describe("forgotPassword", () => {

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("A valid email is required"));

            const req = { body: {} };
            const res = mockResponse();

            await authController.forgotPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns a generic success message when the email is not registered, without sending mail", async () => {

            User.findOne.mockResolvedValue(null);

            const req = { body: { email: "unknown@example.com" } };
            const res = mockResponse();

            await authController.forgotPassword(req, res);

            expect(sendEmail).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

        });

        it("saves a reset token and sends an email when the user exists", async () => {

            const user = { email: "jane@example.com", save: jest.fn().mockResolvedValue(true) };
            User.findOne.mockResolvedValue(user);
            sendEmail.mockResolvedValue(true);

            const req = { body: { email: "jane@example.com" } };
            const res = mockResponse();

            await authController.forgotPassword(req, res);

            expect(user.resetPasswordToken).toBeDefined();
            expect(user.resetPasswordExpire).toBeDefined();
            expect(user.save).toHaveBeenCalledWith({ validateBeforeSave: false });
            expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "jane@example.com" }));
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

        });

        it("clears the reset token and returns 500 when sending the email fails", async () => {

            const user = { email: "jane@example.com", save: jest.fn().mockResolvedValue(true) };
            User.findOne.mockResolvedValue(user);
            sendEmail.mockRejectedValue(new Error("smtp down"));

            const req = { body: { email: "jane@example.com" } };
            const res = mockResponse();

            await authController.forgotPassword(req, res);

            expect(user.resetPasswordToken).toBeUndefined();
            expect(user.resetPasswordExpire).toBeUndefined();
            expect(res.status).toHaveBeenCalledWith(500);

        });

    });

    describe("resetPassword", () => {

        it("rejects when validation fails", async () => {

            validationResult.mockReturnValue(invalidRequest("Password must be at least 6 characters long"));

            const req = { params: { token: "abc" }, body: {} };
            const res = mockResponse();

            await authController.resetPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("returns 400 when the token is invalid or expired", async () => {

            User.findOne.mockResolvedValue(null);

            const req = { params: { token: "bad-token" }, body: { password: "newpassword" } };
            const res = mockResponse();

            await authController.resetPassword(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: "Reset token is invalid or has expired" }));

        });

        it("updates the password and clears the reset token on success", async () => {

            const user = { save: jest.fn().mockResolvedValue(true), _id: "user-1", role: "customer" };
            User.findOne.mockResolvedValue(user);
            bcrypt.hash.mockResolvedValue("new-hashed-password");

            const req = { params: { token: "good-token" }, body: { password: "newpassword" } };
            const res = mockResponse();

            await authController.resetPassword(req, res);

            expect(user.password).toBe("new-hashed-password");
            expect(user.resetPasswordToken).toBeUndefined();
            expect(user.resetPasswordExpire).toBeUndefined();
            expect(user.save).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: { token: "fake.jwt.token" }
            }));

        });

    });

    describe("getMySignInActivity", () => {

        it("returns the current user's paginated sign-in history", async () => {

            const activity = [{ status: "Success" }];
            const query = {
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue(activity)
            };
            SignInActivity.find.mockReturnValue(query);
            SignInActivity.countDocuments.mockResolvedValue(1);

            const req = { user: { id: "user-1" }, query: {} };
            const res = mockResponse();

            await authController.getMySignInActivity(req, res);

            expect(SignInActivity.find).toHaveBeenCalledWith({ user: "user-1" });
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                total: 1,
                page: 1,
                totalPages: 1,
                data: activity
            }));

        });

    });

    describe("getAllSignInActivity", () => {

        it("filters by email and status for admins", async () => {

            const activity = [{ status: "Failed" }];
            const query = {
                populate: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue(activity)
            };
            SignInActivity.find.mockReturnValue(query);
            SignInActivity.countDocuments.mockResolvedValue(1);

            const req = { query: { email: "Jane@Example.com", status: "Failed", page: "2", limit: "5" } };
            const res = mockResponse();

            await authController.getAllSignInActivity(req, res);

            expect(SignInActivity.find).toHaveBeenCalledWith({ email: "jane@example.com", status: "Failed" });
            expect(query.skip).toHaveBeenCalledWith(5);
            expect(query.limit).toHaveBeenCalledWith(5);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, page: 2, data: activity }));

        });

    });

});
