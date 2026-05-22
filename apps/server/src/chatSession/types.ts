import type { ChildProcess } from "node:child_process";
import type { ChatModel, ChatProvider } from "@autoclawdev/types";

export interface ConversationEntry {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  referencedFiles?: string[];
}

export interface StoredChatSession {
  id: string;
  provider: ChatProvider;
  model: ChatModel;
  cwd: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  projectKey?: string;
  messages: ConversationEntry[];
  claudeSessionReady?: boolean;
}

export interface ChatSessionSummary {
  id: string;
  provider: ChatProvider;
  model: ChatModel;
  cwd: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  projectKey?: string;
  alive: boolean;
}

export interface ChatSession {
  id: string;
  process: ChildProcess;
  startedAt: string;
  provider: ChatProvider;
  cwd: string;
  alive: boolean;
}
