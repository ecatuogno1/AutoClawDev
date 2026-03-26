import type { ChatProvider } from "@/components/chat/types";
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
  sessionId: string;
}

const CHAT_HISTORY_KEY = "autoclaw:chat-history";
const CHAT_PROVIDER_KEY = "autoclaw:chat-provider";
const CHAT_SESSION_KEY = "autoclaw:chat-session";
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

export function getStoredChatSession(): StoredChatSessionPointer | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(CHAT_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredChatSessionPointer;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.sessionId !== "string" ||
      (parsed.provider !== "claude" && parsed.provider !== "codex")
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function setStoredChatSession(session: StoredChatSessionPointer) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(CHAT_SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new CustomEvent(CHAT_HISTORY_EVENT));
}

export function clearStoredChatSession() {
  if (!canUseStorage()) return;

  window.localStorage.removeItem(CHAT_SESSION_KEY);
  window.dispatchEvent(new CustomEvent(CHAT_HISTORY_EVENT));
}
