const mongoose = require("mongoose");

const Product = require("../src/models/Product");
const Category = require("../src/models/Category");
const Order = require("../src/models/Order");

const chatTools = [
  {
    type: "function",
    function: {
      name: "search_products",
      description:
        "Search the store's product catalog by keyword and/or category. Use this whenever a customer asks about products, prices, availability, or recommendations. Never make up product details.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Keywords to search for in the product name, description, or brand"
          },
          category: {
            type: "string",
            description: "Optional category name to filter by"
          },
          maxResults: {
            type: "integer",
            description: "Maximum number of products to return (default 5, max 10)"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_my_orders",
      description:
        "List the current customer's own recent orders, optionally filtered by status. Use this to answer questions like 'where is my order' or 'what did I order'.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"],
            description: "Optional order status to filter by"
          },
          limit: {
            type: "integer",
            description: "Maximum number of orders to return (default 5, max 10)"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_order_details",
      description: "Get full details for one of the current customer's own orders by its order ID.",
      parameters: {
        type: "object",
        properties: {
          orderId: {
            type: "string",
            description: "The order ID"
          }
        },
        required: ["orderId"]
      }
    }
  }
];

const searchProducts = async ({ query, category, maxResults } = {}) => {
  const limit = Math.min(Math.max(Number(maxResults) || 5, 1), 10);
  const filter = { isActive: true };

  if (query) {
    filter.$text = { $search: query };
  }

  if (category) {
    const matchedCategory = await Category.findOne({
      name: { $regex: `^${category}$`, $options: "i" }
    });

    if (!matchedCategory) {
      return { products: [], note: `No category found matching "${category}"` };
    }

    filter.category = matchedCategory._id;
  }

  const products = await Product.find(filter)
    .select("name description price stock brand rating")
    .limit(limit);

  return {
    products: products.map((product) => ({
      id: product._id.toString(),
      name: product.name,
      price: product.price,
      inStock: product.stock > 0,
      stock: product.stock,
      brand: product.brand,
      rating: product.rating
    }))
  };
};

const getMyOrders = async ({ status, limit } = {}, userId) => {
  const cap = Math.min(Math.max(Number(limit) || 5, 1), 10);
  const filter = { user: userId };

  if (status) {
    filter.orderStatus = status;
  }

  const orders = await Order.find(filter).sort("-createdAt").limit(cap);

  return {
    orders: orders.map((order) => ({
      id: order._id.toString(),
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      totalAmount: order.totalAmount,
      itemCount: order.items.length,
      createdAt: order.createdAt
    }))
  };
};

const getOrderDetails = async ({ orderId } = {}, userId) => {
  if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
    return { error: "Invalid order ID format" };
  }

  const order = await Order.findOne({ _id: orderId, user: userId });

  if (!order) {
    return { error: "Order not found" };
  }

  return {
    id: order._id.toString(),
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    totalAmount: order.totalAmount,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.subtotal
    })),
    shippingAddress: order.shippingAddress,
    createdAt: order.createdAt
  };
};

const executeChatTool = async (name, input, userId) => {
  switch (name) {
    case "search_products":
      return searchProducts(input);
    case "get_my_orders":
      return getMyOrders(input, userId);
    case "get_order_details":
      return getOrderDetails(input, userId);
    default:
      return { error: `Unknown tool: ${name}` };
  }
};

module.exports = {
  chatTools,
  executeChatTool
};
