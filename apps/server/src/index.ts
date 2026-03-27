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
import { listProjects } from "./lib/config.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4100);

app.use(cors());
app.use(express.json());

// Lightweight health probe for startup checks and CLI diagnostics.
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    port: PORT,
    staticFilesAvailable: existsSync(webDist),
  });
});

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
  void (async () => {
    const baseUrl = `http://localhost:${PORT}`;
    const healthUrl = `${baseUrl}/api/health`;
    const projects = await listProjects();
    const staticFilesAvailable = existsSync(webDist);

    let healthStatus = "unreachable";
    try {
      const response = await fetch(healthUrl);
      healthStatus = `${response.status} ${response.ok ? "ok" : "error"}`;
    } catch (error) {
      healthStatus = error instanceof Error ? error.message : "unknown error";
    }

    console.log(`AutoClawDev server running on ${baseUrl}`);
    console.log(`  Port: ${PORT}`);
    console.log(`  Registered projects: ${projects.length}`);
    console.log(`  Dashboard: ${baseUrl}`);
    console.log(`  API health: ${healthStatus} (${healthUrl})`);
    console.log(
      `  Static files: ${staticFilesAvailable ? `available (${webDist})` : `missing (${webDist})`}`,
    );
  })();
});
