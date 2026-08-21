jest.mock("../../src/models/Notification");
jest.mock("../../src/models/User");
jest.mock("express-validator", () => ({
    validationResult: jest.fn()
}));

const mongoose = require("mongoose");
const { validationResult } = require("express-validator");

const Notification = require("../../src/models/Notification");
const User = require("../../src/models/User");
const notificationController = require("../../controllers/notification.controller");
const { mockResponse } = require("../helpers/mockRes");

const validRequest = () => ({ isEmpty: () => true, array: () => [] });
const invalidRequest = (msg) => ({ isEmpty: () => false, array: () => [{ msg }] });

describe("notification.controller", () => {

    beforeEach(() => {
        validationResult.mockReturnValue(validRequest());
    });

    describe("createNotification", () => {

        it("rejects invalid request payloads", async () => {

            validationResult.mockReturnValue(invalidRequest("title is required"));

            const req = { user: { id: "admin-1" }, body: {} };
            const res = mockResponse();

            await notificationController.createNotification(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("creates a notification for a specific user", async () => {

            const userId = new mongoose.Types.ObjectId().toString();
            const created = { _id: "n1", user: userId, title: "Hello" };
            User.findById.mockResolvedValue({ _id: userId });
            Notification.create.mockResolvedValue(created);

            const req = {
                user: { id: "admin-1" },
                body: { userId, title: "Hello", message: "World", type: "system" }
            };
            const res = mockResponse();

            await notificationController.createNotification(req, res);

            expect(Notification.create).toHaveBeenCalledWith(expect.objectContaining({
                user: userId,
                title: "Hello",
                message: "World",
                createdBy: "admin-1"
            }));
            expect(res.status).toHaveBeenCalledWith(201);

        });

        it("creates notifications for all users when sendToAll is true", async () => {

            const users = [{ _id: "u1" }, { _id: "u2" }];
            const created = [{ _id: "n1" }, { _id: "n2" }];
            User.find.mockResolvedValue(users);
            Notification.insertMany.mockResolvedValue(created);

            const req = {
                user: { id: "admin-1" },
                body: { title: "Sale", message: "Flash sale", sendToAll: true, type: "promotion" }
            };
            const res = mockResponse();

            await notificationController.createNotification(req, res);

            expect(User.find).toHaveBeenCalledWith({}, "_id");
            expect(Notification.insertMany).toHaveBeenCalledWith([
                expect.objectContaining({ user: "u1", title: "Sale" }),
                expect.objectContaining({ user: "u2", title: "Sale" })
            ]);
            expect(res.status).toHaveBeenCalledWith(201);

        });

    });

    describe("getMyNotifications", () => {

        it("returns paginated notifications for the authenticated user", async () => {

            const notifications = [{ _id: "n1" }];
            Notification.countDocuments.mockResolvedValue(1);
            Notification.find.mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue(notifications)
            });

            const req = { user: { id: "user-1" }, query: {} };
            const res = mockResponse();

            await notificationController.getMyNotifications(req, res);

            expect(Notification.find).toHaveBeenCalledWith({ user: "user-1" });
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                total: 1,
                data: notifications
            }));

        });

        it("filters notifications by read status", async () => {

            Notification.countDocuments.mockResolvedValue(0);
            Notification.find.mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue([])
            });

            const req = { user: { id: "user-1" }, query: { isRead: "false" } };
            const res = mockResponse();

            await notificationController.getMyNotifications(req, res);

            expect(Notification.find).toHaveBeenCalledWith({ user: "user-1", isRead: false });

        });

    });

    describe("getUnreadNotificationCount", () => {

        it("returns the unread notification count", async () => {

            Notification.countDocuments.mockResolvedValue(3);

            const req = { user: { id: "user-1" } };
            const res = mockResponse();

            await notificationController.getUnreadNotificationCount(req, res);

            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: { unreadCount: 3 }
            });

        });

    });

    describe("markNotificationAsRead", () => {

        it("returns 404 when the notification does not exist", async () => {

            const notificationId = new mongoose.Types.ObjectId().toString();
            Notification.findOne.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, params: { id: notificationId } };
            const res = mockResponse();

            await notificationController.markNotificationAsRead(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("marks a notification as read", async () => {

            const notificationId = new mongoose.Types.ObjectId().toString();
            const notification = {
                _id: notificationId,
                isRead: false,
                save: jest.fn().mockResolvedValue(true)
            };
            Notification.findOne.mockResolvedValue(notification);

            const req = { user: { id: "user-1" }, params: { id: notificationId } };
            const res = mockResponse();

            await notificationController.markNotificationAsRead(req, res);

            expect(notification.isRead).toBe(true);
            expect(notification.save).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                message: "Notification marked as read"
            }));

        });

    });

    describe("markAllNotificationsAsRead", () => {

        it("marks all unread notifications as read for the current user", async () => {

            Notification.updateMany.mockResolvedValue({ modifiedCount: 4 });

            const req = { user: { id: "user-1" } };
            const res = mockResponse();

            await notificationController.markAllNotificationsAsRead(req, res);

            expect(Notification.updateMany).toHaveBeenCalledWith(
                { user: "user-1", isRead: false },
                { $set: expect.objectContaining({ isRead: true }) }
            );
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: { modifiedCount: 4 }
            }));

        });

    });

});
