import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { spawn, type ChildProcess } from "node:child_process";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { getProject } from "../lib/config.js";

const router: ExpressRouter = Router();

interface ActiveSession {
  process: ChildProcess;
  provider: string;
  startedAt: string;
}

const activeSessions = new Map<string, ActiveSession>();

// POST /api/chat — send a message, stream the response
router.post("/", async (req: Request, res: Response) => {
  const { message, provider = "claude", projectKey, sessionId } = req.body ?? {};

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  // Resolve working directory
  let cwd = homedir();
  if (projectKey) {
    const project = await getProject(projectKey);
    if (project?.path && existsSync(project.path)) {
      cwd = project.path;
    }
  }

  // Build the command
  let cmd: string;
  let args: string[];

  if (provider === "codex") {
    cmd = "codex";
    args = ["exec", message, "-m", "gpt-5.4", "--json", "--color", "never"];
  } else {
    // Claude (default)
    cmd = "claude";
    args = [
      "--print",
      "--output-format", "stream-json",
      "--model", "sonnet",
      "--verbose",
      message,
    ];
  }

  // Set up SSE streaming
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const id = sessionId || `chat-${Date.now()}`;

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("start", { id, provider, cwd, timestamp: new Date().toISOString() });

  try {
    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    activeSessions.set(id, {
      process: proc,
      provider,
      startedAt: new Date().toISOString(),
    });

    let buffer = "";

    const processChunk = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;

        if (provider === "claude") {
          // Claude stream-json format: each line is a JSON event
          try {
            const event = JSON.parse(line);
            if (event.type === "content_block_delta" && event.delta?.text) {
              send("text", { text: event.delta.text });
            } else if (event.type === "result" && event.result) {
              send("text", { text: event.result });
            } else if (event.type === "assistant" && event.message) {
              // Full message format from --print
              const content = event.message?.content;
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === "text") {
                    send("text", { text: block.text });
                  }
                }
              } else if (typeof event.message === "string") {
                send("text", { text: event.message });
              }
            }
          } catch {
            // Not JSON — raw text output
            const clean = line.replace(
              // eslint-disable-next-line no-control-regex
              /\x1b\[[0-9;]*[a-zA-Z]/g, ""
            ).trim();
            if (clean) {
              send("text", { text: clean + "\n" });
            }
          }
        } else {
          // Codex JSON format
          try {
            const event = JSON.parse(line);
            if (event.type === "message" && event.message) {
              send("text", { text: event.message });
            } else if (event.content) {
              send("text", { text: event.content });
            }
          } catch {
            const clean = line.replace(
              // eslint-disable-next-line no-control-regex
              /\x1b\[[0-9;]*[a-zA-Z]/g, ""
            ).trim();
            if (clean) {
              send("text", { text: clean + "\n" });
            }
          }
        }
      }
    };

    proc.stdout?.on("data", processChunk);
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString().replace(
        // eslint-disable-next-line no-control-regex
        /\x1b\[[0-9;]*[a-zA-Z]/g, ""
      ).trim();
      if (text && !text.includes("Warning:") && !text.includes("Debugger")) {
        send("text", { text: text + "\n" });
      }
    });

    proc.on("close", (code) => {
      // Flush remaining buffer
      if (buffer.trim()) {
        send("text", { text: buffer.trim() });
      }
      send("done", { code, id });
      activeSessions.delete(id);
      res.end();
    });

    proc.on("error", (err) => {
      send("error", { message: err.message });
      activeSessions.delete(id);
      res.end();
    });

    req.on("close", () => {
      proc.kill("SIGTERM");
      activeSessions.delete(id);
    });
  } catch (err) {
    send("error", { message: (err as Error).message });
    res.end();
  }
});

// POST /api/chat/stop — stop an active chat session
router.post("/stop", (req: Request, res: Response) => {
  const { sessionId } = req.body ?? {};
  const session = activeSessions.get(sessionId);
  if (session) {
    session.process.kill("SIGTERM");
    activeSessions.delete(sessionId);
    return res.json({ ok: true });
  }
  return res.status(404).json({ error: "No active session" });
});

export default router;
