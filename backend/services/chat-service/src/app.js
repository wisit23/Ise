const express = require("express");
const { errorHandler } = require("@reloop/shared");
const prisma = require("./models/prismaClient");
const conversationRoutes = require("./features/conversations/conversationRoutes");
const messageRoutes = require("./features/messages/messageRoutes");
const internalRoutes = require("./features/internal/internalRoutes");
const attachmentRoutes = require("./features/attachments/attachmentRoutes");

const app = express();
app.use(express.json());

// Pings Mongo for real (via Prisma's raw command passthrough) rather than
// answering `{status: "ok"}` unconditionally — CHAT-001's whole point is
// proving the replica set is actually reachable and usable, not just that
// the process is listening. A stale "ok" here would hide a broken
// replicaSet/directConnection URL until the first real write failed.
app.get("/health", async (req, res) => {
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    res.json({ status: "ok", service: "chat-service", db: "ok" });
  } catch (err) {
    res.status(503).json({
      status: "error",
      service: "chat-service",
      db: "unreachable",
      error: err.message,
    });
  }
});

app.use("/", conversationRoutes);
app.use("/", messageRoutes);
// Mounted before express.json() would matter if this parsed bodies, but
// multer handles its own multipart parsing — express.json() above simply
// ignores multipart requests, so ordering here is not load-bearing.
app.use("/", attachmentRoutes);
app.use("/internal", internalRoutes);

app.use(errorHandler);

module.exports = app;
