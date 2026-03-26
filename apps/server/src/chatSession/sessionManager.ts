import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { ChatProvider } from "@autoclawdev/types";
import { buildChatPrompt, streamChatProcess } from "./runtime.js";
import { chatSessionStore } from "./sessionStore.js";
import { buildPersistentSystemPrompt, resolveWorkingDirectory } from "./systemPrompt.js";
import type { ChatSession, ChatSessionSummary, StoredChatSession } from "./types.js";

class ChatSessionManager {
  private readonly activeSessions = new Map<string, ChatSession>();

  async startSession(props: {
    cwd?: string;
    id?: string;
    projectKey?: string;
    provider: ChatProvider;
  }) {
    const id = props.id ?? randomUUID();
    const cwd = props.cwd ?? (await resolveWorkingDirectory(props.projectKey));
    const systemPrompt = await buildPersistentSystemPrompt({
      cwd,
      projectKey: props.projectKey,
    });

    return await chatSessionStore.createSession({
      cwd,
      id,
      projectKey: props.projectKey,
      provider: props.provider,
      systemPrompt,
    });
  }

  async getSession(id: string) {
    const session = await chatSessionStore.getSession(id);
    if (!session) {
      return null;
    }

    return {
      ...session,
      alive: this.activeSessions.has(id),
    };
  }

  async listSessions(): Promise<ChatSessionSummary[]> {
    const sessions = await chatSessionStore.listSessions();
    return sessions.map((session) => ({
      id: session.id,
      provider: session.provider,
      cwd: session.cwd,
      createdAt: session.createdAt,
      lastMessageAt: session.lastMessageAt,
      messageCount: session.messageCount,
      projectKey: session.projectKey,
      alive: this.activeSessions.has(session.id),
    }));
  }

  async resumeSession(id: string) {
    return await this.getSession(id);
  }

  async sendMessage(props: {
    message: string;
    referencedFiles?: string[];
    send: (event: string, data: unknown) => void;
    sessionId: string;
  }) {
    const session = await chatSessionStore.getSession(props.sessionId);
    if (!session) {
      throw new Error("Chat session not found");
    }

    if (this.activeSessions.has(props.sessionId)) {
      throw new Error("Chat session is already processing a message");
    }

    const referencedFiles = normalizeReferencedFiles(props.referencedFiles);
    const updatedSession = await chatSessionStore.appendUserMessage(
      props.sessionId,
      props.message,
      referencedFiles,
    );
    const proc = await this.spawnProcess(updatedSession, props.message, referencedFiles);

    this.activeSessions.set(props.sessionId, {
      id: props.sessionId,
      process: proc,
      startedAt: new Date().toISOString(),
      provider: updatedSession.provider,
      cwd: updatedSession.cwd,
      alive: true,
    });

    try {
      const result = await streamChatProcess({
        cwd: updatedSession.cwd,
        proc,
        projectKey: updatedSession.projectKey,
        provider: updatedSession.provider,
        send: props.send,
      });

      if (updatedSession.provider === "claude" && (result.code === 0 || result.assistantText.trim())) {
        await chatSessionStore.markClaudeSessionReady(updatedSession.id);
      }

      if (result.assistantText.trim()) {
        await chatSessionStore.appendAssistantMessage(updatedSession.id, result.assistantText);
      }

      return result;
    } finally {
      const activeSession = this.activeSessions.get(props.sessionId);
      if (activeSession) {
        activeSession.alive = false;
      }
      this.activeSessions.delete(props.sessionId);
    }
  }

  stopSession(sessionId: string) {
    const activeSession = this.activeSessions.get(sessionId);
    if (!activeSession) {
      return false;
    }

    activeSession.process.kill("SIGTERM");
    activeSession.alive = false;
    this.activeSessions.delete(sessionId);
    return true;
  }

  async deleteSession(sessionId: string) {
    this.stopSession(sessionId);
    return await chatSessionStore.deleteSession(sessionId);
  }

  private async spawnProcess(
    session: StoredChatSession,
    message: string,
    referencedFiles: string[],
  ) {
    if (session.provider === "codex") {
      return await this.spawnCodexProcess(session);
    }

    const prompt = await buildChatPrompt({
      cwd: session.cwd,
      message,
      referencedFiles,
    });
    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--dangerously-skip-permissions",
      "--verbose",
      "--model",
      "opus",
    ];

    if (session.claudeSessionReady) {
      args.push("--resume", session.id);
    } else {
      args.push("--session-id", session.id);
      const systemMessage = session.messages.find((entry) => entry.role === "system");
      if (systemMessage?.content) {
        args.push("--append-system-prompt", systemMessage.content);
      }
    }

    args.push(prompt);

    return spawn("claude", args, {
      cwd: session.cwd,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  private async spawnCodexProcess(session: StoredChatSession) {
    const prompt = await this.buildCodexReplayPrompt(session);

    return spawn(
      "codex",
      [
        "exec",
        prompt,
        "-m",
        "gpt-5.4",
        "--json",
        "--color",
        "never",
        "--dangerously-bypass-approvals-and-sandbox",
        "--skip-git-repo-check",
      ],
      {
        cwd: session.cwd,
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  }

  private async buildCodexReplayPrompt(session: StoredChatSession) {
    const renderedMessages = await Promise.all(
      session.messages.map(async (message) => {
        if (
          message.role === "user" &&
          Array.isArray(message.referencedFiles) &&
          message.referencedFiles.length > 0
        ) {
          const content = await buildChatPrompt({
            cwd: session.cwd,
            message: message.content,
            referencedFiles: message.referencedFiles,
          });
          return { ...message, content };
        }

        return message;
      }),
    );

    return renderedMessages
      .map((message) => {
        if (message.role === "system") {
          return `System:\n${message.content}`;
        }

        if (message.role === "assistant") {
          return `Assistant:\n${message.content}`;
        }

        return `User:\n${message.content}`;
      })
      .concat("Respond to the latest user request while preserving the full conversation context.")
      .join("\n\n");
  }
}

function normalizeReferencedFiles(referencedFiles: string[] | undefined) {
  if (!Array.isArray(referencedFiles)) {
    return [];
  }

  return referencedFiles.filter((value): value is string => typeof value === "string" && value.length > 0);
}

export const chatSessionManager = new ChatSessionManager();
