import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatProvider } from "@autoclawdev/types";
import type { ConversationEntry, StoredChatSession } from "./types.js";

const MAX_SESSION_TURNS = 50;
const SESSION_STORE_PATH = fileURLToPath(
  new URL("../../../../.autoclaw/chat-sessions.json", import.meta.url),
);

interface PersistedSessionStore {
  sessions: StoredChatSession[];
}

class ChatSessionStore {
  private readonly sessions = new Map<string, StoredChatSession>();
  private loadPromise: Promise<void> | null = null;
  private persistPromise = Promise.resolve();
  private loaded = false;

  async createSession(props: {
    cwd: string;
    id: string;
    projectKey?: string;
    provider: ChatProvider;
    systemPrompt: string;
  }) {
    await this.ensureLoaded();

    const now = new Date().toISOString();
    const session: StoredChatSession = {
      id: props.id,
      provider: props.provider,
      cwd: props.cwd,
      createdAt: now,
      lastMessageAt: now,
      messageCount: 0,
      projectKey: props.projectKey,
      messages: [
        {
          role: "system",
          content: props.systemPrompt,
          timestamp: now,
        },
      ],
      claudeSessionReady: false,
    };

    this.sessions.set(session.id, session);
    await this.persist();
    return this.cloneSession(session);
  }

  async deleteSession(id: string) {
    await this.ensureLoaded();
    const existed = this.sessions.delete(id);
    if (existed) {
      await this.persist();
    }
    return existed;
  }

  async getSession(id: string) {
    await this.ensureLoaded();
    const session = this.sessions.get(id);
    return session ? this.cloneSession(session) : null;
  }

  async listSessions() {
    await this.ensureLoaded();
    return [...this.sessions.values()]
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      .map((session) => this.cloneSession(session));
  }

  async appendUserMessage(id: string, content: string, referencedFiles: string[]) {
    return await this.appendMessage(id, {
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      referencedFiles: referencedFiles.length > 0 ? referencedFiles : undefined,
    });
  }

  async appendAssistantMessage(id: string, content: string) {
    return await this.appendMessage(id, {
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
    });
  }

  async markClaudeSessionReady(id: string) {
    await this.ensureLoaded();
    const session = this.sessions.get(id);
    if (!session || session.claudeSessionReady) {
      return;
    }

    session.claudeSessionReady = true;
    session.lastMessageAt = new Date().toISOString();
    await this.persist();
  }

  private async appendMessage(id: string, message: ConversationEntry) {
    await this.ensureLoaded();
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error("Chat session not found");
    }

    session.messages = truncateMessages([...session.messages, message]);
    session.lastMessageAt = message.timestamp;
    if (message.role === "user") {
      session.messageCount += 1;
    }

    await this.persist();
    return this.cloneSession(session);
  }

  private async ensureLoaded() {
    if (this.loaded) {
      return;
    }

    if (!this.loadPromise) {
      this.loadPromise = this.load();
    }

    await this.loadPromise;
  }

  private async load() {
    try {
      const raw = await readFile(SESSION_STORE_PATH, "utf-8");
      const parsed = JSON.parse(raw) as PersistedSessionStore;
      const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
      for (const session of sessions) {
        if (!isStoredChatSession(session)) {
          continue;
        }
        this.sessions.set(session.id, {
          ...session,
          messages: truncateMessages(session.messages),
          claudeSessionReady: session.claudeSessionReady === true,
        });
      }
    } catch {
      // Missing or malformed session file should not prevent startup.
    }

    this.loaded = true;
  }

  private async persist() {
    const payload: PersistedSessionStore = {
      sessions: [...this.sessions.values()],
    };

    this.persistPromise = this.persistPromise.then(async () => {
      await mkdir(dirname(SESSION_STORE_PATH), { recursive: true });
      await writeFile(SESSION_STORE_PATH, JSON.stringify(payload, null, 2), "utf-8");
    });

    await this.persistPromise;
  }

  private cloneSession(session: StoredChatSession): StoredChatSession {
    return {
      ...session,
      messages: session.messages.map((message) => ({ ...message })),
    };
  }
}

function truncateMessages(messages: ConversationEntry[]) {
  const systemMessages = messages.filter((message) => message.role === "system");
  const nonSystemMessages = messages.filter((message) => message.role !== "system");
  const maxMessages = MAX_SESSION_TURNS * 2;
  const trimmedNonSystemMessages = nonSystemMessages.slice(-maxMessages);
  return [...systemMessages.slice(0, 1), ...trimmedNonSystemMessages];
}

function isStoredChatSession(value: unknown): value is StoredChatSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Partial<StoredChatSession>;
  return (
    typeof session.id === "string" &&
    (session.provider === "claude" || session.provider === "codex") &&
    typeof session.cwd === "string" &&
    typeof session.createdAt === "string" &&
    typeof session.lastMessageAt === "string" &&
    typeof session.messageCount === "number" &&
    Array.isArray(session.messages)
  );
}

export const chatSessionStore = new ChatSessionStore();
