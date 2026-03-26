import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Server as HttpServer } from "node:http";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename } from "node:path";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { getProject } from "../lib/config.js";

const MAX_HISTORY_BYTES = 512 * 1024;
const RECONNECT_GRACE_MS = 2 * 60 * 1000;
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 30;

type TerminalStatus = "running" | "exited";

interface TerminalConnectMessage {
  type: "connect";
  sessionId: string;
  projectKey?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

interface TerminalInputMessage {
  type: "input";
  sessionId: string;
  data: string;
}

interface TerminalResizeMessage {
  type: "resize";
  sessionId: string;
  cols: number;
  rows: number;
}

interface TerminalCloseMessage {
  type: "close";
  sessionId: string;
}

type ClientMessage =
  | TerminalConnectMessage
  | TerminalInputMessage
  | TerminalResizeMessage
  | TerminalCloseMessage;

interface TerminalSnapshotMessage {
  type: "snapshot";
  sessionId: string;
  cwd: string;
  history: string;
  status: TerminalStatus;
  exitCode: number | null;
  signal: string | null;
  cols: number;
  rows: number;
}

interface TerminalOutputMessage {
  type: "output";
  sessionId: string;
  data: string;
}

interface TerminalExitMessage {
  type: "exit";
  sessionId: string;
  code: number | null;
  signal: string | null;
}

interface TerminalErrorMessage {
  type: "error";
  sessionId?: string;
  message: string;
}

type ServerMessage =
  | TerminalSnapshotMessage
  | TerminalOutputMessage
  | TerminalExitMessage
  | TerminalErrorMessage;

interface TerminalSession {
  id: string;
  cwd: string;
  cols: number;
  rows: number;
  status: TerminalStatus;
  exitCode: number | null;
  signal: string | null;
  history: string;
  process: ChildProcessWithoutNullStreams;
  clients: Set<WebSocket>;
  reconnectTimer: NodeJS.Timeout | null;
}

function parseMessage(raw: RawData): ClientMessage | null {
  try {
    const value = JSON.parse(raw.toString()) as ClientMessage;
    if (!value || typeof value !== "object" || typeof value.type !== "string") {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function send(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(message));
}

function appendHistory(history: string, chunk: string) {
  const next = history + chunk;
  if (Buffer.byteLength(next, "utf8") <= MAX_HISTORY_BYTES) {
    return next;
  }

  let trimmed = next;
  while (Buffer.byteLength(trimmed, "utf8") > MAX_HISTORY_BYTES) {
    const dropIndex = trimmed.indexOf("\n");
    trimmed = dropIndex === -1 ? trimmed.slice(-MAX_HISTORY_BYTES) : trimmed.slice(dropIndex + 1);
  }
  return trimmed;
}

function shellCandidates() {
  if (process.platform === "win32") {
    return [process.env.ComSpec ?? "cmd.exe"];
  }

  return [
    "/bin/bash",
    "/bin/sh",
    process.env.SHELL,
    "zsh",
    "bash",
    "sh",
  ].filter((value): value is string => Boolean(value));
}

function resolveShell() {
  for (const candidate of shellCandidates()) {
    if (!candidate.includes("/") || existsSync(candidate)) {
      const name = basename(candidate);
      if (process.platform === "win32") {
        return { command: candidate, args: [], env: {}, name };
      }

      if (name === "bash") {
        return {
          command: candidate,
          args: ["--noprofile", "--norc", "-i"],
          env: {
            BASH_SILENCE_DEPRECATION_WARNING: "1",
            PS1: "$ ",
          },
          name,
        };
      }

      return { command: candidate, args: ["-i"], env: {}, name };
    }
  }

  return {
    command: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    args: process.platform === "win32" ? [] : ["-i"],
    env: {},
    name: process.platform === "win32" ? "cmd" : "sh",
  };
}

async function resolveCwd(projectKey?: string, cwd?: string) {
  if (projectKey) {
    const project = await getProject(projectKey);
    if (project?.path) {
      return project.path;
    }
  }

  return cwd || homedir();
}

class TerminalSessionManager {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly socketSessions = new Map<WebSocket, string>();

  async connect(ws: WebSocket, message: TerminalConnectMessage) {
    const sessionId = message.sessionId.trim();
    if (!sessionId) {
      send(ws, { type: "error", message: "Missing terminal session id." });
      return;
    }

    const session = await this.getOrCreateSession(message);
    this.attachClient(session, ws);
    send(ws, {
      type: "snapshot",
      sessionId: session.id,
      cwd: session.cwd,
      history: session.history,
      status: session.status,
      exitCode: session.exitCode,
      signal: session.signal,
      cols: session.cols,
      rows: session.rows,
    });
  }

  write(message: TerminalInputMessage) {
    const session = this.sessions.get(message.sessionId);
    if (!session || session.status === "exited") {
      return;
    }
    session.process.stdin.write(message.data);
  }

  resize(message: TerminalResizeMessage) {
    const session = this.sessions.get(message.sessionId);
    if (!session) {
      return;
    }
    session.cols = normalizeDimension(message.cols, DEFAULT_COLS);
    session.rows = normalizeDimension(message.rows, DEFAULT_ROWS);
  }

  close(message: TerminalCloseMessage) {
    const session = this.sessions.get(message.sessionId);
    if (!session) {
      return;
    }
    this.disposeSession(session.id);
  }

  detachSocket(ws: WebSocket) {
    const sessionId = this.socketSessions.get(ws);
    if (!sessionId) {
      return;
    }

    this.socketSessions.delete(ws);
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.clients.delete(ws);
    if (session.clients.size === 0) {
      this.scheduleCleanup(session);
    }
  }

  dispose() {
    for (const sessionId of [...this.sessions.keys()]) {
      this.disposeSession(sessionId);
    }
  }

  private async getOrCreateSession(message: TerminalConnectMessage) {
    const existing = this.sessions.get(message.sessionId);
    if (existing) {
      existing.cols = normalizeDimension(message.cols, existing.cols);
      existing.rows = normalizeDimension(message.rows, existing.rows);
      if (existing.reconnectTimer) {
        clearTimeout(existing.reconnectTimer);
        existing.reconnectTimer = null;
      }
      return existing;
    }

    const cwd = await resolveCwd(message.projectKey, message.cwd);
    const { command, args, env, name } = resolveShell();
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FORCE_COLOR: "1",
      },
      stdio: "pipe",
    });

    const session: TerminalSession = {
      id: message.sessionId,
      cwd,
      cols: normalizeDimension(message.cols, DEFAULT_COLS),
      rows: normalizeDimension(message.rows, DEFAULT_ROWS),
      status: "running",
      exitCode: null,
      signal: null,
      history: "",
      process: child,
      clients: new Set(),
      reconnectTimer: null,
    };

    child.stdout.on("data", (chunk: Buffer | string) => {
      const data = chunk.toString();
      session.history = appendHistory(session.history, data);
      this.broadcast(session, { type: "output", sessionId: session.id, data });
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const data = chunk.toString();
      session.history = appendHistory(session.history, data);
      this.broadcast(session, { type: "output", sessionId: session.id, data });
    });

    child.on("error", (error) => {
      const messageText = `[terminal] Failed to start ${name}: ${error.message}\r\n`;
      session.history = appendHistory(session.history, messageText);
      this.broadcast(session, {
        type: "error",
        sessionId: session.id,
        message: error.message,
      });
      this.broadcast(session, {
        type: "output",
        sessionId: session.id,
        data: messageText,
      });
    });

    child.on("exit", (code, signal) => {
      session.status = "exited";
      session.exitCode = code;
      session.signal = signal;
      this.broadcast(session, {
        type: "exit",
        sessionId: session.id,
        code,
        signal,
      });
      if (session.clients.size === 0) {
        this.scheduleCleanup(session);
      }
    });

    this.sessions.set(session.id, session);
    return session;
  }

  private attachClient(session: TerminalSession, ws: WebSocket) {
    const previousSessionId = this.socketSessions.get(ws);
    if (previousSessionId && previousSessionId !== session.id) {
      const previousSession = this.sessions.get(previousSessionId);
      previousSession?.clients.delete(ws);
    }

    this.socketSessions.set(ws, session.id);
    session.clients.add(ws);
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
  }

  private broadcast(session: TerminalSession, message: ServerMessage) {
    for (const client of session.clients) {
      send(client, message);
    }
  }

  private scheduleCleanup(session: TerminalSession) {
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
    }

    session.reconnectTimer = setTimeout(() => {
      this.disposeSession(session.id);
    }, RECONNECT_GRACE_MS);
  }

  private disposeSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }

    this.sessions.delete(sessionId);

    for (const client of session.clients) {
      this.socketSessions.delete(client);
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    }
    session.clients.clear();

    if (!session.process.killed) {
      session.process.kill("SIGTERM");
      setTimeout(() => {
        if (!session.process.killed) {
          session.process.kill("SIGKILL");
        }
      }, 1_000);
    }
  }
}

function normalizeDimension(value: number | undefined, fallback: number) {
  if (!value || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.round(value));
}

export function attachTerminalWebSocketServer(server: HttpServer) {
  const sessions = new TerminalSessionManager();
  const wss = new WebSocketServer({ server, path: "/ws/terminal" });

  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      const message = parseMessage(raw);
      if (!message) {
        send(ws, { type: "error", message: "Invalid terminal message." });
        return;
      }

      void (async () => {
        switch (message.type) {
          case "connect":
            await sessions.connect(ws, message);
            break;
          case "input":
            sessions.write(message);
            break;
          case "resize":
            sessions.resize(message);
            break;
          case "close":
            sessions.close(message);
            break;
        }
      })().catch((error: unknown) => {
        const messageText =
          error instanceof Error ? error.message : "Unexpected terminal server failure.";
        send(ws, {
          type: "error",
          sessionId: "sessionId" in message ? message.sessionId : undefined,
          message: messageText,
        });
      });
    });

    ws.on("close", () => {
      sessions.detachSocket(ws);
    });
  });

  server.on("close", () => {
    wss.close();
    sessions.dispose();
  });
}
