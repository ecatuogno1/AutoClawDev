import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { spawn, type ChildProcess } from "node:child_process";
import type { ChatProvider } from "@autoclawdev/types";
import {
  applyPendingApproval,
  deletePendingApproval,
  getPendingApproval,
} from "../chatSession/approvals.js";
import { buildChatPrompt, streamChatProcess } from "../chatSession/runtime.js";
import { chatSessionManager } from "../chatSession/sessionManager.js";
import { resolveWorkingDirectory } from "../chatSession/systemPrompt.js";

const router: ExpressRouter = Router();

interface ActiveSession {
  process: ChildProcess;
  provider: ChatProvider;
  startedAt: string;
}

const activeSessions = new Map<string, ActiveSession>();

router.post("/session", async (req: Request, res: Response) => {
  const { provider = "claude", projectKey, cwd, sessionId } = req.body ?? {};
  if (provider !== "claude" && provider !== "codex") {
    return res.status(400).json({ error: "provider must be claude or codex" });
  }

  try {
    const session = await chatSessionManager.startSession({
      cwd: typeof cwd === "string" && cwd.length > 0 ? cwd : undefined,
      id: typeof sessionId === "string" && sessionId.length > 0 ? sessionId : undefined,
      projectKey: typeof projectKey === "string" && projectKey.length > 0 ? projectKey : undefined,
      provider,
    });

    return res.json({
      sessionId: session.id,
      session,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/session/:id/message", async (req: Request, res: Response) => {
  const { message, referencedFiles } = req.body ?? {};
  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "message is required" });
  }

  const session = await chatSessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Chat session not found" });
  }

  prepareSseResponse(res);
  const send = createSseSender(res);
  let closed = false;

  send("start", {
    id: session.id,
    provider: session.provider,
    cwd: session.cwd,
    timestamp: new Date().toISOString(),
    messageCount: session.messageCount,
  });

  req.on("close", () => {
    if (closed) {
      return;
    }

    chatSessionManager.stopSession(session.id);
  });

  try {
    const result = await chatSessionManager.sendMessage({
      message,
      referencedFiles: Array.isArray(referencedFiles) ? referencedFiles : [],
      send,
      sessionId: session.id,
    });

    if (!closed) {
      send("done", { code: result.code, id: session.id, signal: result.signal });
      res.end();
      closed = true;
    }
  } catch (error) {
    send("error", {
      message: error instanceof Error ? error.message : String(error),
    });
    if (!closed) {
      res.end();
      closed = true;
    }
  }
});

router.post("/session/:id/resume", async (req: Request, res: Response) => {
  const session = await chatSessionManager.resumeSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Chat session not found" });
  }

  return res.json({ session });
});

router.get("/sessions", async (_req: Request, res: Response) => {
  const sessions = await chatSessionManager.listSessions();
  return res.json({ sessions });
});

router.delete("/session/:id", async (req: Request, res: Response) => {
  const deleted = await chatSessionManager.deleteSession(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: "Chat session not found" });
  }

  return res.json({ ok: true });
});

router.post("/", async (req: Request, res: Response) => {
  const {
    message,
    provider = "claude",
    projectKey,
    referencedFiles,
    sessionId,
  } = req.body ?? {};

  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "message is required" });
  }

  const cwd = await resolveWorkingDirectory(
    typeof projectKey === "string" && projectKey.length > 0 ? projectKey : undefined,
  );
  const prompt = await buildChatPrompt({
    cwd,
    message,
    referencedFiles: Array.isArray(referencedFiles) ? referencedFiles : [],
  });

  prepareSseResponse(res);

  const id = typeof sessionId === "string" && sessionId.length > 0 ? sessionId : `chat-${Date.now()}`;
  const send = createSseSender(res);

  send("start", { id, provider, cwd, timestamp: new Date().toISOString() });

  try {
    const proc = spawnOneShotProcess(provider, prompt, cwd);
    activeSessions.set(id, {
      process: proc,
      provider,
      startedAt: new Date().toISOString(),
    });

    req.on("close", () => {
      proc.kill("SIGTERM");
      activeSessions.delete(id);
    });

    const result = await streamChatProcess({
      cwd,
      proc,
      projectKey: typeof projectKey === "string" ? projectKey : undefined,
      provider,
      send,
    });

    send("done", { code: result.code, id, signal: result.signal });
    activeSessions.delete(id);
    res.end();
  } catch (error) {
    send("error", {
      message: error instanceof Error ? error.message : String(error),
    });
    activeSessions.delete(id);
    res.end();
  }
});

router.post("/approval", async (req: Request, res: Response) => {
  const { action, requestId } = req.body ?? {};
  if (action !== "approve" && action !== "reject") {
    return res.status(400).json({ error: "action must be approve or reject" });
  }
  if (typeof requestId !== "string" || requestId.length === 0) {
    return res.status(400).json({ error: "requestId is required" });
  }

  const record = getPendingApproval(requestId);
  if (!record) {
    return res.status(404).json({ error: "Pending approval not found" });
  }

  if (action === "reject") {
    deletePendingApproval(requestId);
    return res.json({ ok: true, requestId, status: "rejected" });
  }

  try {
    const result = await applyPendingApproval(record);
    deletePendingApproval(requestId);
    return res.json({ ok: true, requestId, status: "approved", result });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : String(error),
      requestId,
    });
  }
});

router.post("/stop", (req: Request, res: Response) => {
  const { sessionId } = req.body ?? {};
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  const legacySession = activeSessions.get(sessionId);
  if (legacySession) {
    legacySession.process.kill("SIGTERM");
    activeSessions.delete(sessionId);
    return res.json({ ok: true });
  }

  if (chatSessionManager.stopSession(sessionId)) {
    return res.json({ ok: true });
  }

  return res.status(404).json({ error: "No active session" });
});

function prepareSseResponse(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

function createSseSender(res: Response) {
  return (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
}

function spawnOneShotProcess(provider: ChatProvider, prompt: string, cwd: string) {
  if (provider === "codex") {
    return spawn("codex", ["exec", prompt, "-m", "gpt-5.4", "--json", "--color", "never"], {
      cwd,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  return spawn(
    "claude",
    [
      "--print",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--model",
      "sonnet",
      "--verbose",
      prompt,
    ],
    {
      cwd,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

export default router;
