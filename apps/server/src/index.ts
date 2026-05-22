import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import projectsRouter from "./routes/projects.js";
import githubRouter from "./routes/github.js";
import runnerRouter from "./routes/runner.js";
import runsRouter from "./routes/runs.js";
import sseRouter from "./routes/sse.js";
import reviewsRouter from "./routes/reviews.js";
import memoryRouter from "./routes/memory.js";
import healthRouter from "./routes/health.js";
import chatRouter from "./routes/chat.js";
import commandsRouter from "./routes/commands.js";
import workspaceRouter from "./routes/workspace.js";
import systemRouter from "./routes/system.js";
import telegramRouter from "./routes/telegram.js";
import webAuditsRouter from "./routes/webAudits.js";
import { attachChatWebSocketServer } from "./chatSession/wsChatServer.js";
import { attachTerminalWebSocketServer } from "./terminal/wsTerminalServer.js";
import { telegramControlService } from "./integrations/telegram/service.js";
import { listProjects } from "./lib/config.js";
import { loadAutoClawDevEnv } from "./lib/env.js";
import { sessionAuthMiddleware } from "./lib/sessionAuth.js";

loadAutoClawDevEnv();

const app = express();
const PORT = Number(process.env.PORT ?? 4100);

app.use(cors());
app.use(express.json());
app.use(sessionAuthMiddleware);

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
app.use("/api/system", systemRouter);
app.use("/api/telegram", telegramRouter);
app.use("/api/runs", runsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/web-audits", webAuditsRouter);
app.use("/api/memory", memoryRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/github", githubRouter);
app.use("/api/chat", chatRouter);
app.use("/api/commands", commandsRouter);
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
    try {
      await telegramControlService.start();
    } catch (error) {
      console.error(
        `Telegram control failed to start: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

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
    if (telegramControlService.getStatus().enabled) {
      console.log(
        `  Telegram control: ${telegramControlService.getStatus().running ? "active" : "configured"}${telegramControlService.getStatus().username ? ` (@${telegramControlService.getStatus().username})` : ""}`,
      );
    }
    console.log(
      `  Static files: ${staticFilesAvailable ? `available (${webDist})` : `missing (${webDist})`}`,
    );
  })();
});
