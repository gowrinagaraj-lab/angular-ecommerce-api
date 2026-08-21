const mongoose = require("mongoose");
const { validationResult } = require("express-validator");

const ollama = require("../src/config/ollama");
const ChatConversation = require("../src/models/ChatConversation");
const { chatTools, executeChatTool } = require("../utils/chatTools");

const MAX_TOOL_ITERATIONS = 5;

const SYSTEM_PROMPT = `You are a helpful shopping assistant for an ecommerce store.
Use the search_products tool to help customers find products, prices, and availability.
Use the get_my_orders and get_order_details tools to answer questions about the current customer's own orders.
Always use tools to look up real data instead of guessing product details, prices, stock, or order information.
Keep responses concise and friendly, and format prices in INR (₹).
If asked about something unrelated to shopping, products, or orders, politely redirect the conversation back to the store.`;

const runAssistant = async (history, userId) => {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...history];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await ollama.chat({ messages, tools: chatTools });
    const message = response.message;

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content || "Sorry, I couldn't come up with a response. Could you try rephrasing that?";
    }

    messages.push({
      role: "assistant",
      content: message.content || "",
      tool_calls: message.tool_calls
    });

    for (const toolCall of message.tool_calls) {
      const { name, arguments: args } = toolCall.function;

      let result;

      try {
        result = await executeChatTool(name, args, userId);
      } catch (error) {
        result = { error: error.message };
      }

      messages.push({
        role: "tool",
        tool_name: name,
        content: JSON.stringify(result)
      });
    }
  }

  return "I'm having trouble completing that request right now. Could you try rephrasing it?";
};

/*
Send a chat message

POST /api/chat
*/
exports.sendMessage = async (req, res) => {
  try {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const userId = req.user.id;
    const { message, conversationId } = req.body;

    let conversation;

    if (conversationId) {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid conversation ID format"
        });
      }

      conversation = await ChatConversation.findOne({ _id: conversationId, user: userId });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: "Conversation not found"
        });
      }
    } else {
      conversation = new ChatConversation({ user: userId, messages: [] });
    }

    const history = conversation.messages.map((m) => ({
      role: m.role,
      content: m.content
    }));

    history.push({ role: "user", content: message });

    const replyText = await runAssistant(history, userId);

    conversation.messages.push({ role: "user", content: message });
    conversation.messages.push({ role: "assistant", content: replyText });

    if (conversation.messages.length === 2) {
      conversation.title = message.length > 60 ? `${message.slice(0, 60)}...` : message;
    }

    await conversation.save();

    res.status(200).json({
      success: true,
      data: {
        conversationId: conversation._id,
        reply: replyText,
        title: conversation.title
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/*
Get my chat conversations

GET /api/chat
*/
exports.getMyConversations = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    const filter = { user: req.user.id };

    const total = await ChatConversation.countDocuments(filter);
    const conversations = await ChatConversation.find(filter)
      .select("title createdAt updatedAt messages")
      .sort("-updatedAt")
      .skip(skip)
      .limit(limit);

    const data = conversations.map((conversation) => ({
      id: conversation._id,
      title: conversation.title,
      lastMessage: conversation.messages[conversation.messages.length - 1] || null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    }));

    res.status(200).json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/*
Get a single chat conversation

GET /api/chat/:id
*/
exports.getConversationById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID format"
      });
    }

    const conversation = await ChatConversation.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found"
      });
    }

    res.status(200).json({
      success: true,
      data: conversation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/*
Delete a chat conversation

DELETE /api/chat/:id
*/
exports.deleteConversation = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID format"
      });
    }

    const conversation = await ChatConversation.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Conversation deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
