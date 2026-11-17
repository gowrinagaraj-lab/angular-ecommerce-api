require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const connectDB = require("./config/db");
const startProductChangeStream = require("./watchers/productChangeStream");
const { initProductEvents } = require("./realtime/productEvents");
const { supportsTransactions } = require("./utils/runInTransaction");
const { startPaymentReconciliation } = require("../services/paymentReconciliation.service");

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
initProductEvents(io);

// Connect to MongoDB, then choose how product changes reach browsers:
// a change stream on a replica set (also catches manual DB edits), or
// events published by the API itself on a standalone server.
connectDB().then(async () => {
    const replicaSet = await supportsTransactions().catch(() => false);

    if (replicaSet) {
        startProductChangeStream();
        console.log("Real-time product updates: MongoDB change stream");
    } else {
        console.log("Real-time product updates: in-process events (MongoDB is standalone)");
    }

    startPaymentReconciliation();
}).catch((error) => {
    console.error("Startup after database connection failed:", error.message);
});

// Socket connection
io.on("connection", (socket) => {

    console.log("Socket connected:", socket.id);

    socket.on("disconnect", () => {
        console.log("Socket disconnected:", socket.id);
    });

});

startServer(requestedPort);