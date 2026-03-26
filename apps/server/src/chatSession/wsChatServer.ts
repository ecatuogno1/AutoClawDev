import type { Server as HttpServer } from "node:http";
import type { ChatMessage, ChatProvider, ToolCallState } from "@autoclawdev/types";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { chatSessionManager } from "./sessionManager.js";
import type { StoredChatSession } from "./types.js";

interface CreateSessionMessage {
  type: "create-session";
  provider?: ChatProvider;
  projectKey?: string;
  cwd?: string;
  sessionId?: string;
}

interface ResumeSessionMessage {
  type: "resume-session";
  sessionId: string;
}

interface SendMessageMessage {
  type: "send-message";
  sessionId: string;
  content: string;
  referencedFiles?: string[];
}

interface StopMessage {
  type: "stop";
  sessionId: string;
}

type ClientMessage =
  | CreateSessionMessage
  | ResumeSessionMessage
  | SendMessageMessage
  | StopMessage;

interface SessionHistoryMessage {
  type: "session-created" | "session-resumed";
  sessionId: string;
  provider: ChatProvider;
  cwd: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  alive: boolean;
  history: ChatMessage[];
}

interface MessageStarted {
  type: "message-started";
  sessionId: string;
  provider: ChatProvider;
  cwd: string;
  timestamp: string;
  messageCount: number;
}

interface AssistantDeltaMessage {
  type: "assistant-delta";
  sessionId: string;
  id: string;
  provider: ChatProvider;
  text: string;
}

interface AssistantMessage {
  type: "assistant-message";
  sessionId: string;
  id: string;
  provider: ChatProvider;
  text: string;
}

interface ToolCallMessage {
  type: "tool-call" | "tool-update";
  sessionId: string;
  tool: ToolCallState;
}

interface MessageComplete {
  type: "message-complete";
  sessionId: string;
  code: number | null;
  signal: NodeJS.Signals | null;
}

interface SessionStopped {
  type: "session-stopped";
  sessionId: string;
}

interface ErrorMessage {
  type: "error";
  sessionId?: string;
  message: string;
}

type ServerMessage =
  | SessionHistoryMessage
  | MessageStarted
  | AssistantDeltaMessage
  | AssistantMessage
  | ToolCallMessage
  | MessageComplete
  | SessionStopped
  | ErrorMessage;

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

function isChatProvider(value: unknown): value is ChatProvider {
  return value === "claude" || value === "codex";
}

function serializeHistory(session: StoredChatSession): ChatMessage[] {
  return session.messages
    .filter((message) => message.role !== "system")
    .map((message, index) => ({
      id: `${session.id}:${message.role}:${index}:${message.timestamp}`,
      provider: session.provider,
      role: message.role,
      text: message.content,
      timestamp: message.timestamp,
      referencedFiles: message.referencedFiles,
    }));
}

async function handleCreateSession(ws: WebSocket, message: CreateSessionMessage) {
  const provider = isChatProvider(message.provider) ? message.provider : "claude";
  const session = await chatSessionManager.startSession({
    cwd: typeof message.cwd === "string" && message.cwd.length > 0 ? message.cwd : undefined,
    id:
      typeof message.sessionId === "string" && message.sessionId.length > 0
        ? message.sessionId
        : undefined,
    projectKey:
      typeof message.projectKey === "string" && message.projectKey.length > 0
        ? message.projectKey
        : undefined,
    provider,
  });

  send(ws, {
    type: "session-created",
    sessionId: session.id,
    provider: session.provider,
    cwd: session.cwd,
    createdAt: session.createdAt,
    lastMessageAt: session.lastMessageAt,
    messageCount: session.messageCount,
    alive: false,
    history: serializeHistory(session),
  });
}

async function handleResumeSession(ws: WebSocket, message: ResumeSessionMessage) {
  if (typeof message.sessionId !== "string" || message.sessionId.trim().length === 0) {
    send(ws, { type: "error", message: "sessionId is required" });
    return;
  }

  const session = await chatSessionManager.resumeSession(message.sessionId);
  if (!session) {
    send(ws, {
      type: "error",
      sessionId: message.sessionId,
      message: "Chat session not found",
    });
    return;
  }

  send(ws, {
    type: "session-resumed",
    sessionId: session.id,
    provider: session.provider,
    cwd: session.cwd,
    createdAt: session.createdAt,
    lastMessageAt: session.lastMessageAt,
    messageCount: session.messageCount,
    alive: session.alive,
    history: serializeHistory(session),
  });
}

async function handleSendMessage(ws: WebSocket, message: SendMessageMessage) {
  const sessionId = typeof message.sessionId === "string" ? message.sessionId.trim() : "";
  const content = typeof message.content === "string" ? message.content.trim() : "";

  if (!sessionId) {
    send(ws, { type: "error", message: "sessionId is required" });
    return;
  }

  if (!content) {
    send(ws, { type: "error", sessionId, message: "content is required" });
    return;
  }

  const session = await chatSessionManager.getSession(sessionId);
  if (!session) {
    send(ws, { type: "error", sessionId, message: "Chat session not found" });
    return;
  }

  send(ws, {
    type: "message-started",
    sessionId: session.id,
    provider: session.provider,
    cwd: session.cwd,
    timestamp: new Date().toISOString(),
    messageCount: session.messageCount,
  });

  try {
    const result = await chatSessionManager.sendMessage({
      message: content,
      referencedFiles: Array.isArray(message.referencedFiles)
        ? message.referencedFiles.filter(
            (value): value is string => typeof value === "string" && value.length > 0,
          )
        : [],
      send: (event, data) => {
        if (!data || typeof data !== "object") {
          return;
        }

        if (event === "assistant-delta" || event === "assistant-message") {
          const payload = data as Record<string, unknown>;
          if (
            typeof payload.id === "string" &&
            typeof payload.provider === "string" &&
            typeof payload.text === "string" &&
            isChatProvider(payload.provider)
          ) {
            send(ws, {
              type: event,
              sessionId,
              id: payload.id,
              provider: payload.provider,
              text: payload.text,
            });
          }
          return;
        }

        if (event === "tool-call" || event === "tool-update") {
          send(ws, {
            type: event,
            sessionId,
            tool: data as ToolCallState,
          });
          return;
        }

        if (event === "error") {
          const payload = data as Record<string, unknown>;
          send(ws, {
            type: "error",
            sessionId,
            message:
              typeof payload.message === "string" ? payload.message : "Unexpected chat error",
          });
        }
      },
      sessionId,
    });

    send(ws, {
      type: "message-complete",
      sessionId,
      code: result.code,
      signal: result.signal,
    });
  } catch (error) {
    send(ws, {
      type: "error",
      sessionId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function handleStopMessage(ws: WebSocket, message: StopMessage) {
  if (typeof message.sessionId !== "string" || message.sessionId.trim().length === 0) {
    send(ws, { type: "error", message: "sessionId is required" });
    return;
  }

  if (!chatSessionManager.stopSession(message.sessionId)) {
    send(ws, {
      type: "error",
      sessionId: message.sessionId,
      message: "No active session",
    });
    return;
  }

  send(ws, {
    type: "session-stopped",
    sessionId: message.sessionId,
  });
}

export function attachChatWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      const message = parseMessage(raw);
      if (!message) {
        send(ws, { type: "error", message: "Invalid chat message." });
        return;
      }

      void (async () => {
        switch (message.type) {
          case "create-session":
            await handleCreateSession(ws, message);
            break;
          case "resume-session":
            await handleResumeSession(ws, message);
            break;
          case "send-message":
            await handleSendMessage(ws, message);
            break;
          case "stop":
            handleStopMessage(ws, message);
            break;
        }
      })().catch((error: unknown) => {
        send(ws, {
          type: "error",
          sessionId: "sessionId" in message ? message.sessionId : undefined,
          message: error instanceof Error ? error.message : "Unexpected chat server failure.",
        });
      });
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, "http://localhost").pathname : "";
    if (pathname !== "/ws/chat") {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  server.on("close", () => {
    wss.close();
  });
}
