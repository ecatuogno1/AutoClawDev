import type { ChatMessage, ChatProvider, ToolCallState } from "@autoclawdev/types";

export type { ChatProvider };
export type ChatToolKind = ToolCallState["kind"];
export type ChatToolStatus = ToolCallState["status"];
export type ChatToolCall = ToolCallState;

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
      tone: NonNullable<ChatMessage["tone"]>;
      timestamp: string;
    };
