require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const connectDB = require("./config/db");
const startProductChangeStream = require("./watchers/productChangeStream");

const PORT = process.env.PORT || 5000;

// Create HTTP server using Express app
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
    cors: {
        origin: "http://localhost:4200",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// Make io accessible to controllers via req.app.get("io")
app.set("io", io);

// Connect to MongoDB, then start watching the products collection for
// changes (API-driven or manual) and broadcast them over the socket.
connectDB().then(() => {
    startProductChangeStream(io);
});

// Socket connection
io.on("connection", (socket) => {

    console.log("Socket connected:", socket.id);

    socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.id);
    });

});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});