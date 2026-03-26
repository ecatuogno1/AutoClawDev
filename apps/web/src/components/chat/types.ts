export type ChatProvider = "claude" | "codex";

export type ChatToolKind =
  | "file-read"
  | "file-edit"
  | "file-write"
  | "bash-command"
  | "search"
  | "tool";

export type ChatToolStatus =
  | "running"
  | "completed"
  | "pending-approval"
  | "failed"
  | "approved"
  | "rejected";

export interface ChatToolCall {
  id: string;
  provider: ChatProvider;
  kind: ChatToolKind;
  title: string;
  status: ChatToolStatus;
  path?: string;
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

export type ChatTimelineItem =
  | {
      id: string;
      type: "user-message";
      text: string;
      timestamp: string;
      referencedFiles?: string[];
    }
  | {
      id: string;
      type: "assistant-message";
      text: string;
      provider: ChatProvider;
      timestamp: string;
      streaming?: boolean;
    }
  | {
      id: string;
      type: "tool-call";
      tool: ChatToolCall;
      timestamp: string;
    }
  | {
      id: string;
      type: "system";
      text: string;
      tone: "error" | "info";
      timestamp: string;
    };
