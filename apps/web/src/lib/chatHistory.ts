import type { ChatModel, ChatProvider } from "@autoclawdev/types";
export type { ChatProvider };

export interface RecentChatEntry {
  id: string;
  prompt: string;
  provider: ChatProvider;
  projectKey?: string;
  timestamp: string;
}

export interface StoredChatSessionPointer {
  provider: ChatProvider;
  model: ChatModel;
  sessionId: string;
}

const CHAT_HISTORY_KEY = "autoclaw:chat-history";
const CHAT_PROVIDER_KEY = "autoclaw:chat-provider";
const CHAT_MODEL_SELECTIONS_KEY = "autoclaw:chat-model-selections";
const CHAT_SESSION_KEY = "autoclaw:chat-session";
const COMPOSER_SESSION_KEY_PREFIX = "autoclaw:composer-session:";
export const CHAT_HISTORY_EVENT = "autoclaw:chat-history-updated";
const MAX_CHAT_HISTORY = 12;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readRecentChats(): RecentChatEntry[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentChatEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => typeof entry?.prompt === "string" && typeof entry?.timestamp === "string")
      .slice(0, MAX_CHAT_HISTORY);
  } catch {
    return [];
  }
}

export function addRecentChat(entry: Omit<RecentChatEntry, "id">) {
  if (!canUseStorage()) return;

  const nextEntry: RecentChatEntry = {
    ...entry,
    id: `${entry.timestamp}:${entry.provider}:${entry.projectKey ?? "global"}`,
  };

  const nextHistory = [
    nextEntry,
    ...readRecentChats().filter(
      (item) =>
        !(
          item.prompt === nextEntry.prompt &&
          item.provider === nextEntry.provider &&
          item.projectKey === nextEntry.projectKey
        ),
    ),
  ].slice(0, MAX_CHAT_HISTORY);

  window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(nextHistory));
  window.dispatchEvent(new CustomEvent(CHAT_HISTORY_EVENT));
}

export function getStoredChatProvider(): ChatProvider {
  if (!canUseStorage()) return "claude";

  const value = window.localStorage.getItem(CHAT_PROVIDER_KEY);
  return value === "codex" ? "codex" : "claude";
}

export function setStoredChatProvider(provider: ChatProvider) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(CHAT_PROVIDER_KEY, provider);
  window.dispatchEvent(new CustomEvent(CHAT_HISTORY_EVENT));
}

export function getStoredChatModelSelections(): Record<ChatProvider, ChatModel> {
  if (!canUseStorage()) {
    return { claude: "opus", codex: "gpt-5.4" };
  }

  try {
    const raw = window.localStorage.getItem(CHAT_MODEL_SELECTIONS_KEY);
    if (!raw) {
      return { claude: "opus", codex: "gpt-5.4" };
    }

    const parsed = JSON.parse(raw) as Partial<Record<ChatProvider, unknown>>;
    return {
      claude: typeof parsed.claude === "string" && parsed.claude.length > 0 ? parsed.claude : "opus",
      codex:
        typeof parsed.codex === "string" && parsed.codex.length > 0 ? parsed.codex : "gpt-5.4",
    };
  } catch {
    return { claude: "opus", codex: "gpt-5.4" };
  }
}

export function setStoredChatModelSelection(provider: ChatProvider, model: ChatModel) {
  if (!canUseStorage()) return;

  const next = {
    ...getStoredChatModelSelections(),
    [provider]: model,
  };

  window.localStorage.setItem(CHAT_MODEL_SELECTIONS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(CHAT_HISTORY_EVENT));
}

function getSessionStorageKey(scopeKey?: string | null) {
  return scopeKey ? `${COMPOSER_SESSION_KEY_PREFIX}${scopeKey}` : CHAT_SESSION_KEY;
}

function parseStoredChatSession(raw: string | null): StoredChatSessionPointer | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredChatSessionPointer;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.sessionId !== "string" ||
      typeof parsed.model !== "string" ||
      (parsed.provider !== "claude" && parsed.provider !== "codex")
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function getStoredChatSession(scopeKey?: string | null): StoredChatSessionPointer | null {
  if (!canUseStorage()) return null;

  const scopedSession = parseStoredChatSession(
    window.localStorage.getItem(getSessionStorageKey(scopeKey)),
  );
  if (scopedSession) {
    return scopedSession;
  }

  if (scopeKey) {
    return parseStoredChatSession(window.localStorage.getItem(CHAT_SESSION_KEY));
  }

  return null;
}

export function setStoredChatSession(
  session: StoredChatSessionPointer,
  scopeKey?: string | null,
) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(getSessionStorageKey(scopeKey), JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(CHAT_HISTORY_EVENT));
}

export function clearStoredChatSession(scopeKey?: string | null) {
  if (!canUseStorage()) return;

  window.localStorage.removeItem(getSessionStorageKey(scopeKey));
  window.dispatchEvent(new CustomEvent(CHAT_HISTORY_EVENT));
}
