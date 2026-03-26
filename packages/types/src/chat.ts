export type ChatProvider = "claude" | "codex";

export type ToolCallKind =
  | "file-read"
  | "file-edit"
  | "file-write"
  | "bash-command"
  | "search"
  | "tool";

export type ToolCallStatus =
  | "running"
  | "completed"
  | "pending-approval"
  | "failed"
  | "approved"
  | "rejected";

export interface ToolCallState {
  id: string;
  provider: ChatProvider;
  kind: ToolCallKind;
  title: string;
  status: ToolCallStatus;
  path?: string;
  absolutePath?: string;
  command?: string;
  query?: string;
  detail?: string;
  content?: string;
  output?: string;
  oldContent?: string;
  newContent?: string;
  exitCode?: number | null;
  requestId?: string;
  error?: string;
}

export interface ChatMessage {
  id: string;
  provider: ChatProvider;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
  referencedFiles?: string[];
  streaming?: boolean;
  tone?: "error" | "info";
}
