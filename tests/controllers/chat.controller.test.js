jest.mock("../../src/config/ollama", () => ({
    chat: jest.fn(),
    MODEL: "llama3.1",
    BASE_URL: "http://localhost:11434"
}));
jest.mock("../../src/models/ChatConversation");
jest.mock("../../utils/chatTools", () => ({
    chatTools: [],
    executeChatTool: jest.fn()
}));
jest.mock("express-validator", () => ({
    validationResult: jest.fn()
}));

const mongoose = require("mongoose");
const { validationResult } = require("express-validator");

const ollama = require("../../src/config/ollama");
const ChatConversation = require("../../src/models/ChatConversation");
const { executeChatTool } = require("../../utils/chatTools");
const chatController = require("../../controllers/chat.controller");
const { mockResponse } = require("../helpers/mockRes");

const validRequest = () => ({ isEmpty: () => true, array: () => [] });
const invalidRequest = (msg) => ({ isEmpty: () => false, array: () => [{ msg }] });

describe("chat.controller", () => {

    beforeEach(() => {
        validationResult.mockReturnValue(validRequest());
    });

    describe("sendMessage", () => {

        it("rejects invalid request payloads", async () => {

            validationResult.mockReturnValue(invalidRequest("message is required"));

            const req = { user: { id: "user-1" }, body: {} };
            const res = mockResponse();

            await chatController.sendMessage(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

        it("creates a new conversation and returns the assistant reply", async () => {

            ollama.chat.mockResolvedValue({
                message: { role: "assistant", content: "Hello! How can I help you shop today?" }
            });

            const savedConversation = {
                _id: "conv-1",
                user: "user-1",
                messages: [],
                title: "New conversation",
                save: jest.fn().mockResolvedValue(true)
            };

            ChatConversation.mockImplementation(() => savedConversation);

            const req = { user: { id: "user-1" }, body: { message: "Hi there" } };
            const res = mockResponse();

            await chatController.sendMessage(req, res);

            expect(ollama.chat).toHaveBeenCalledTimes(1);
            expect(savedConversation.messages).toEqual([
                { role: "user", content: "Hi there" },
                { role: "assistant", content: "Hello! How can I help you shop today?" }
            ]);
            expect(savedConversation.title).toBe("Hi there");
            expect(savedConversation.save).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: expect.objectContaining({
                    conversationId: "conv-1",
                    reply: "Hello! How can I help you shop today?"
                })
            }));

        });

        it("executes tool calls before returning a final reply", async () => {

            executeChatTool.mockResolvedValue({ products: [{ id: "p1", name: "Shoes" }] });

            ollama.chat
                .mockResolvedValueOnce({
                    message: {
                        role: "assistant",
                        content: "",
                        tool_calls: [
                            { function: { name: "search_products", arguments: { query: "shoes" } } }
                        ]
                    }
                })
                .mockResolvedValueOnce({
                    message: { role: "assistant", content: "We have Shoes in stock!" }
                });

            const savedConversation = {
                _id: "conv-2",
                user: "user-1",
                messages: [],
                title: "New conversation",
                save: jest.fn().mockResolvedValue(true)
            };

            ChatConversation.mockImplementation(() => savedConversation);

            const req = { user: { id: "user-1" }, body: { message: "Do you have shoes?" } };
            const res = mockResponse();

            await chatController.sendMessage(req, res);

            expect(executeChatTool).toHaveBeenCalledWith("search_products", { query: "shoes" }, "user-1");
            expect(ollama.chat).toHaveBeenCalledTimes(2);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: expect.objectContaining({ reply: "We have Shoes in stock!" })
            }));

        });

        it("continues an existing conversation owned by the user", async () => {

            ollama.chat.mockResolvedValue({
                message: { role: "assistant", content: "Sure, here is more info." }
            });

            const conversationId = new mongoose.Types.ObjectId().toString();
            const existingConversation = {
                _id: conversationId,
                user: "user-1",
                messages: [
                    { role: "user", content: "Hi" },
                    { role: "assistant", content: "Hello!" }
                ],
                title: "Hi",
                save: jest.fn().mockResolvedValue(true)
            };

            ChatConversation.findOne.mockResolvedValue(existingConversation);

            const req = {
                user: { id: "user-1" },
                body: { message: "Tell me more", conversationId }
            };
            const res = mockResponse();

            await chatController.sendMessage(req, res);

            expect(ChatConversation.findOne).toHaveBeenCalledWith({ _id: conversationId, user: "user-1" });
            expect(existingConversation.messages).toHaveLength(4);
            expect(existingConversation.title).toBe("Hi");
            expect(res.status).toHaveBeenCalledWith(200);

        });

        it("returns 404 when continuing a conversation that does not belong to the user", async () => {

            const conversationId = new mongoose.Types.ObjectId().toString();
            ChatConversation.findOne.mockResolvedValue(null);

            const req = {
                user: { id: "user-1" },
                body: { message: "Hi", conversationId }
            };
            const res = mockResponse();

            await chatController.sendMessage(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("returns 400 for a malformed conversationId", async () => {

            const req = {
                user: { id: "user-1" },
                body: { message: "Hi", conversationId: "not-an-id" }
            };
            const res = mockResponse();

            await chatController.sendMessage(req, res);

            expect(res.status).toHaveBeenCalledWith(400);

        });

    });

    describe("getMyConversations", () => {

        it("returns paginated conversations for the authenticated user", async () => {

            const conversations = [
                {
                    _id: "c1",
                    title: "Hi",
                    messages: [{ role: "user", content: "Hi" }],
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            ];

            ChatConversation.countDocuments.mockResolvedValue(1);
            ChatConversation.find.mockReturnValue({
                select: jest.fn().mockReturnThis(),
                sort: jest.fn().mockReturnThis(),
                skip: jest.fn().mockReturnThis(),
                limit: jest.fn().mockResolvedValue(conversations)
            });

            const req = { user: { id: "user-1" }, query: {} };
            const res = mockResponse();

            await chatController.getMyConversations(req, res);

            expect(ChatConversation.find).toHaveBeenCalledWith({ user: "user-1" });
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                total: 1
            }));

        });

    });

    describe("getConversationById", () => {

        it("returns 404 when the conversation does not exist", async () => {

            const conversationId = new mongoose.Types.ObjectId().toString();
            ChatConversation.findOne.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, params: { id: conversationId } };
            const res = mockResponse();

            await chatController.getConversationById(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

        it("returns the conversation when owned by the user", async () => {

            const conversationId = new mongoose.Types.ObjectId().toString();
            const conversation = { _id: conversationId, user: "user-1", messages: [] };
            ChatConversation.findOne.mockResolvedValue(conversation);

            const req = { user: { id: "user-1" }, params: { id: conversationId } };
            const res = mockResponse();

            await chatController.getConversationById(req, res);

            expect(res.json).toHaveBeenCalledWith({ success: true, data: conversation });

        });

    });

    describe("deleteConversation", () => {

        it("deletes a conversation owned by the user", async () => {

            const conversationId = new mongoose.Types.ObjectId().toString();
            ChatConversation.findOneAndDelete.mockResolvedValue({ _id: conversationId });

            const req = { user: { id: "user-1" }, params: { id: conversationId } };
            const res = mockResponse();

            await chatController.deleteConversation(req, res);

            expect(ChatConversation.findOneAndDelete).toHaveBeenCalledWith({
                _id: conversationId,
                user: "user-1"
            });
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));

        });

        it("returns 404 when the conversation does not exist", async () => {

            const conversationId = new mongoose.Types.ObjectId().toString();
            ChatConversation.findOneAndDelete.mockResolvedValue(null);

            const req = { user: { id: "user-1" }, params: { id: conversationId } };
            const res = mockResponse();

            await chatController.deleteConversation(req, res);

            expect(res.status).toHaveBeenCalledWith(404);

        });

    });

});
