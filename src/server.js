require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const connectDB = require("./config/db");
const startProductChangeStream = require("./watchers/productChangeStream");

const DEFAULT_PORT = 5000;
const requestedPort = Number(process.env.PORT) || DEFAULT_PORT;

// Create HTTP server using Express app
const server = http.createServer(app);

const startServer = (port) => {
    const nextPort = Number(port) || DEFAULT_PORT;

    server.listen(nextPort, () => {
        console.log(`Server running on port ${nextPort}`);
    }).on("error", (error) => {
        if (error.code === "EADDRINUSE") {
            const fallbackPort = nextPort + 1;
            console.warn(`Port ${nextPort} is already in use. Retrying on port ${fallbackPort}...`);
            startServer(fallbackPort);
            return;
        }

        console.error(`Unable to start server on port ${nextPort}:`, error.message);
        process.exit(1);
    });
};

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
}).catch((error) => {
    console.error("Product change stream could not start:", error.message);
});

// Socket connection
io.on("connection", (socket) => {

    console.log("Socket connected:", socket.id);

    socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.id);
    });

});

startServer(requestedPort);