const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config()

const app = express();
app.use(
  cors({
    origin: "*",
    // origin: process.env.CLIENT_URL,
  })
);
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    // origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"],
  },
});

// Store active users
const users = new Map();

// Store chat messages
const chatMessages = [];

io.on("connection", (socket) => {
  console.log("New client connected");

  // Handle user joining
  socket.on("join", (username) => {
    const userId = uuidv4();
    const user = {
      id: userId,
      username,
      socketId: socket.id,
      joinedAt: new Date(),
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers["user-agent"],
    };
    users.set(userId, user);
    socket.emit("joined", { userId, username });

    // Send updated user list to all clients
    io.emit("userList", Array.from(users.values()));

    // Send previous messages to new user
    socket.emit("previousMessages", chatMessages);

    // Notify all users about new join
    const systemMessage = {
      id: uuidv4(),
      sender: "system",
      content: `${username} has joined the chat`,
      timestamp: new Date(),
    };

    chatMessages.push(systemMessage);
    io.emit("message", systemMessage);
  });

  // Handle chat messages
  socket.on("sendMessage", (data) => {
    const { userId, content } = data;
    const user = users.get(userId);

    if (user) {
      const message = {
        id: uuidv4(),
        sender: user.username,
        senderId: userId,
        content,
        timestamp: new Date(),
      };

      chatMessages.push(message);

      // Limit stored messages to last 100
      if (chatMessages.length > 100) {
        chatMessages.shift();
      }

      io.emit("message", message);
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    let disconnectedUser = null;

    // Find and remove the disconnected user
    for (const [userId, user] of users.entries()) {
      if (user.socketId === socket.id) {
        disconnectedUser = user;
        users.delete(userId);
        break;
      }
    }

    if (disconnectedUser) {
      // Notify all users about the disconnection
      const systemMessage = {
        id: uuidv4(),
        sender: "system",
        content: `${disconnectedUser.username} has left the chat`,
        timestamp: new Date(),
      };

      chatMessages.push(systemMessage);
      io.emit("message", systemMessage);

      // Send updated user list
      io.emit("userList", Array.from(users.values()));
    }

    console.log("Client disconnected");
  });
});

app.get("/", (req, res) => {
  const userIp = req.ip;
  const forwarded = req.headers["x-forwarded-for"];
  const userIp1 = forwarded ? forwarded.split(",")[0] : req.socket.remoteAddress;

  const headers = req.headers; // Get all request headers
  const userAgent = req.headers["user-agent"]; // User's browser/device info
  const referer = req.headers["referer"] || req.headers["origin"]; // Page user came from
  const acceptLanguage = req.headers["accept-language"]; // User's language preference

  // Possible VPN detection clues
  const vpnHeaders = [
    "via", "x-via", "forwarded", "x-forwarded-for", "x-real-ip", "cf-connecting-ip", "true-client-ip",
  ];

  let usingVPN = false;

  // Check if request contains known VPN-related headers
  vpnHeaders.forEach(header => {
    if (req.headers[header]) {
      usingVPN = true;
    }
  });

  // Additional IP-based VPN detection (Basic Check)
  const vpnIpRanges = ["10.", "172.16.", "192.168.", "127.0.0.", "169.254."]; // Private/reserved IPs
  if (vpnIpRanges.some(prefix => userIp1.startsWith(prefix))) {
    usingVPN = true;
  }

  res.status(200).json({
    userIp,
    userIp1,
    headers, 
    userAgent,
    referer,
    acceptLanguage,
    usingVPN,
  });
});


// Admin API route to get all user information
app.get("/api/admin/users", (req, res) => {
  res.json(Array.from(users.values()));
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
