import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import projectsRouter from "./routes/projects.js";
import experimentsRouter from "./routes/experiments.js";
import githubRouter from "./routes/github.js";
import runnerRouter from "./routes/runner.js";
import sseRouter from "./routes/sse.js";
import reviewsRouter from "./routes/reviews.js";
import memoryRouter from "./routes/memory.js";
import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import workspaceRouter from "./routes/workspace.js";
import { attachChatWebSocketServer } from "./chatSession/wsChatServer.js";
import { attachTerminalWebSocketServer } from "./terminal/wsTerminalServer.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4100);

app.use(cors());
app.use(express.json());

// API routes — order matters: specific routes before catch-all
app.use("/api/health-matrix", healthRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/memory", memoryRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/experiments", experimentsRouter);
app.use("/api/github", githubRouter);
app.use("/api/chat", chatRouter);
app.use("/api/workspace", workspaceRouter);
app.use("/api", runnerRouter);
app.use("/api", sseRouter);

// Serve static files in production
const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = join(__dirname, "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (_req, res) => {
    res.sendFile(join(webDist, "index.html"));
  });
}

const server = createServer(app);
attachTerminalWebSocketServer(server);
attachChatWebSocketServer(server);

server.listen(PORT, () => {
  console.log(`AutoClawDev server running on http://localhost:${PORT}`);
});
