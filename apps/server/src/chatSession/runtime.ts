import type { ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import type { ChatProvider, ToolCallState } from "@autoclawdev/types";
import { buildApprovalInput, setPendingApproval } from "./approvals.js";
import {
  resolveToolPath,
  resolveWithinRoot,
  safeJsonParse,
  safeReadText,
  stripAnsi,
  toDisplayPath,
} from "./utils.js";

interface SendEvent {
  event: string;
  data: unknown;
}

interface StreamProcessOptions {
  cwd: string;
  proc: ChildProcess;
  projectKey?: string;
  provider: ChatProvider;
  send: (event: string, data: unknown) => void;
}

export interface StreamProcessResult {
  assistantText: string;
  code: number | null;
  signal: NodeJS.Signals | null;
}

export async function buildChatPrompt(props: {
  cwd: string;
  message: string;
  referencedFiles: string[];
}) {
  const references = await Promise.all(
    props.referencedFiles.map(async (pathValue) => {
      const absolutePath = resolveWithinRoot(props.cwd, pathValue);
      if (!absolutePath) {
        return null;
      }

      try {
        const content = await readFile(absolutePath, "utf-8");
        return {
          absolutePath,
          content: content.slice(0, 16_000),
        };
      } catch {
        return null;
      }
    }),
  );

  const resolvedReferences = references.filter(
    (entry): entry is NonNullable<(typeof references)[number]> => entry !== null,
  );

  if (resolvedReferences.length === 0) {
    return props.message;
  }

  const header = resolvedReferences
    .map((entry) => {
      const displayPath = toDisplayPath(props.cwd, entry.absolutePath);
      return [`Referenced file: ${displayPath}`, "```", entry.content, "```"].join("\n");
    })
    .join("\n\n");

  return `${header}\n\nUser request:\n${props.message}`;
}

export async function streamChatProcess(
  props: StreamProcessOptions,
): Promise<StreamProcessResult> {
  const toolCalls = new Map<string, ToolCallState>();
  const streamedAssistantMessageIds = new Set<string>();
  const assistantMessages = new Map<string, string>();
  const assistantMessageOrder: string[] = [];
  let currentClaudeMessageId: string | null = null;
  let buffer = "";
  let processing = Promise.resolve();

  const recordAssistantEvent = ({ event, data }: SendEvent) => {
    const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    if (!payload || typeof payload.id !== "string" || typeof payload.text !== "string") {
      return;
    }

    if (!assistantMessages.has(payload.id)) {
      assistantMessages.set(payload.id, "");
      assistantMessageOrder.push(payload.id);
    }

    if (event === "assistant-delta") {
      assistantMessages.set(payload.id, `${assistantMessages.get(payload.id) ?? ""}${payload.text}`);
      return;
    }

    if (!assistantMessages.get(payload.id)) {
      assistantMessages.set(payload.id, payload.text);
    }
  };

  const send = (event: string, data: unknown) => {
    recordAssistantEvent({ event, data });
    props.send(event, data);
  };

  const enqueueLine = (line: string) => {
    processing = processing
      .then(() =>
        handleStreamLine({
          cwd: props.cwd,
          line,
          projectKey: props.projectKey,
          provider: props.provider,
          send,
          toolCalls,
          streamedAssistantMessageIds,
          getCurrentClaudeMessageId: () => currentClaudeMessageId,
          setCurrentClaudeMessageId: (messageId) => {
            currentClaudeMessageId = messageId;
          },
        }),
      )
      .catch((error) => {
        send("error", { message: error instanceof Error ? error.message : String(error) });
      });
  };

  const processChunk = (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) {
        enqueueLine(line);
      }
    }
  };

  props.proc.stdout?.on("data", processChunk);
  props.proc.stderr?.on("data", (chunk: Buffer) => {
    const text = stripAnsi(chunk.toString()).trim();
    if (!text || text.includes("Warning:") || text.includes("Debugger")) {
      return;
    }
    send("error", { message: text });
  });

  return await new Promise<StreamProcessResult>((resolve, reject) => {
    props.proc.once("error", (error) => {
      reject(error);
    });

    props.proc.once("close", (code, signal) => {
      void (async () => {
        if (buffer.trim()) {
          enqueueLine(buffer.trim());
          buffer = "";
        }

        await processing;

        resolve({
          assistantText: assistantMessageOrder.map((id) => assistantMessages.get(id) ?? "").join(""),
          code,
          signal,
        });
      })();
    });
  });
}

async function handleStreamLine(props: {
  cwd: string;
  line: string;
  projectKey?: string;
  provider: ChatProvider;
  send: (event: string, data: unknown) => void;
  toolCalls: Map<string, ToolCallState>;
  streamedAssistantMessageIds: Set<string>;
  getCurrentClaudeMessageId: () => string | null;
  setCurrentClaudeMessageId: (messageId: string | null) => void;
}) {
  const event = safeJsonParse(props.line);
  if (!event) {
    props.send("assistant-message", {
      id: `raw-${Date.now()}`,
      provider: props.provider,
      text: stripAnsi(props.line),
    });
    return;
  }

  if (props.provider === "claude") {
    await handleClaudeEvent(props, event);
    return;
  }

  await handleCodexEvent(props, event);
}

async function handleClaudeEvent(
  props: Parameters<typeof handleStreamLine>[0],
  event: Record<string, unknown>,
) {
  if (event.type === "stream_event") {
    const payload =
      event.event && typeof event.event === "object"
        ? (event.event as Record<string, unknown>)
        : null;
    if (!payload) {
      return;
    }

    if (payload.type === "message_start") {
      const message =
        payload.message && typeof payload.message === "object"
          ? (payload.message as Record<string, unknown>)
          : null;
      props.setCurrentClaudeMessageId(typeof message?.id === "string" ? message.id : null);
      return;
    }

    if (payload.type === "content_block_delta") {
      const delta =
        payload.delta && typeof payload.delta === "object"
          ? (payload.delta as Record<string, unknown>)
          : null;
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        const messageId = props.getCurrentClaudeMessageId() ?? `claude-${Date.now()}`;
        props.streamedAssistantMessageIds.add(messageId);
        props.send("assistant-delta", {
          id: messageId,
          provider: "claude",
          text: delta.text,
        });
      }
      return;
    }
  }

  if (event.type === "assistant") {
    const message =
      event.message && typeof event.message === "object"
        ? (event.message as Record<string, unknown>)
        : null;
    const messageId = typeof message?.id === "string" ? message.id : `claude-${Date.now()}`;
    const content = Array.isArray(message?.content) ? message.content : [];

    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }

      const item = block as Record<string, unknown>;
      if (item.type === "text" && typeof item.text === "string") {
        if (!props.streamedAssistantMessageIds.has(messageId)) {
          props.send("assistant-message", {
            id: messageId,
            provider: "claude",
            text: item.text,
          });
        }
        continue;
      }

      if (item.type === "tool_use") {
        const toolState = await buildClaudeToolState(props.cwd, item);
        props.toolCalls.set(toolState.id, toolState);
        props.send("tool-call", toolState);
      }
    }
    return;
  }

  if (event.type !== "user") {
    return;
  }

  const message =
    event.message && typeof event.message === "object"
      ? (event.message as Record<string, unknown>)
      : null;
  const eventToolUseResult =
    event.tool_use_result && typeof event.tool_use_result === "object"
      ? (event.tool_use_result as Record<string, unknown>)
      : null;
  const content = Array.isArray(message?.content) ? message.content : [];

  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }

    const item = block as Record<string, unknown>;
    const toolUseId = typeof item.tool_use_id === "string" ? item.tool_use_id : null;
    if (!toolUseId) {
      continue;
    }

    const existing = props.toolCalls.get(toolUseId);
    if (!existing) {
      continue;
    }

    const nextState = await buildClaudeToolResultState(
      props.cwd,
      existing,
      item,
      {
        provider: "claude",
        projectKey: props.projectKey,
      },
      eventToolUseResult,
    );
    props.toolCalls.set(toolUseId, nextState);
    props.send("tool-update", nextState);
  }
}

async function handleCodexEvent(
  props: Parameters<typeof handleStreamLine>[0],
  event: Record<string, unknown>,
) {
  if (event.type !== "item.started" && event.type !== "item.completed") {
    return;
  }

  const item =
    event.item && typeof event.item === "object"
      ? (event.item as Record<string, unknown>)
      : null;
  if (!item || typeof item.id !== "string" || typeof item.type !== "string") {
    return;
  }

  if (item.type === "agent_message" && typeof item.text === "string") {
    props.send("assistant-message", {
      id: item.id,
      provider: "codex",
      text: item.text,
    });
    return;
  }

  if (item.type !== "command_execution") {
    props.send("tool-call", {
      id: item.id,
      provider: "codex",
      kind: "tool",
      title: String(item.type),
      status: event.type === "item.started" ? "running" : "completed",
      detail: JSON.stringify(item),
    } satisfies ToolCallState);
    return;
  }

  const command = typeof item.command === "string" ? item.command : "";
  const toolState: ToolCallState = {
    id: item.id,
    provider: "codex",
    kind: "bash-command",
    title: "Run command",
    status:
      event.type === "item.started"
        ? "running"
        : item.status === "failed"
          ? "failed"
          : "completed",
    command,
    output:
      typeof item.aggregated_output === "string" ? item.aggregated_output : undefined,
    exitCode:
      typeof item.exit_code === "number" ? item.exit_code : item.exit_code === null ? null : null,
  };

  props.toolCalls.set(toolState.id, toolState);
  props.send(event.type === "item.started" ? "tool-call" : "tool-update", toolState);
}

async function buildClaudeToolState(cwd: string, block: Record<string, unknown>) {
  const id = String(block.id);
  const name = typeof block.name === "string" ? block.name : "Tool";
  const input =
    block.input && typeof block.input === "object"
      ? (block.input as Record<string, unknown>)
      : {};

  if (name === "Read") {
    const absolutePath = resolveToolPath(cwd, input.file_path);
    return {
      id,
      provider: "claude",
      kind: "file-read",
      title: "Read file",
      status: "running",
      absolutePath: absolutePath ?? undefined,
      path: absolutePath ? toDisplayPath(cwd, absolutePath) : undefined,
    } satisfies ToolCallState;
  }

  if (name === "Write") {
    const absolutePath = resolveToolPath(cwd, input.file_path);
    const oldContent = absolutePath ? await safeReadText(absolutePath) : "";
    const newContent = typeof input.content === "string" ? input.content : "";
    return {
      id,
      provider: "claude",
      kind: "file-write",
      title: "Write file",
      status: "running",
      absolutePath: absolutePath ?? undefined,
      path: absolutePath ? toDisplayPath(cwd, absolutePath) : undefined,
      oldContent,
      newContent,
    } satisfies ToolCallState;
  }

  if (name === "Edit") {
    const absolutePath = resolveToolPath(cwd, input.file_path);
    const oldContent = absolutePath ? await safeReadText(absolutePath) : "";
    const newContent = typeof oldContent === "string" ? applyEditRequest(oldContent, input) : "";
    return {
      id,
      provider: "claude",
      kind: "file-edit",
      title: "Edit file",
      status: "running",
      absolutePath: absolutePath ?? undefined,
      path: absolutePath ? toDisplayPath(cwd, absolutePath) : undefined,
      oldContent,
      newContent,
    } satisfies ToolCallState;
  }

  if (name === "Bash") {
    return {
      id,
      provider: "claude",
      kind: "bash-command",
      title: "Run command",
      status: "running",
      command: typeof input.command === "string" ? input.command : "",
      detail: typeof input.description === "string" ? input.description : undefined,
    } satisfies ToolCallState;
  }

  if (name === "Grep" || name === "Glob") {
    return {
      id,
      provider: "claude",
      kind: "search",
      title: name === "Grep" ? "Search files" : "Find files",
      status: "running",
      query:
        typeof input.pattern === "string"
          ? input.pattern
          : typeof input.path === "string"
            ? input.path
            : undefined,
    } satisfies ToolCallState;
  }

  return {
    id,
    provider: "claude",
    kind: "tool",
    title: name,
    status: "running",
    detail: JSON.stringify(input),
  } satisfies ToolCallState;
}

async function buildClaudeToolResultState(
  cwd: string,
  existing: ToolCallState,
  block: Record<string, unknown>,
  meta: { provider: ChatProvider; projectKey?: string },
  eventToolUseResult: Record<string, unknown> | null,
) {
  const nextState: ToolCallState = { ...existing };
  const content = typeof block.content === "string" ? block.content : undefined;
  const isError = block.is_error === true;

  if (existing.kind === "file-read") {
    const file =
      eventToolUseResult?.file && typeof eventToolUseResult.file === "object"
        ? (eventToolUseResult.file as Record<string, unknown>)
        : null;
    nextState.content = typeof file?.content === "string" ? file.content : content;
    nextState.status = isError ? "failed" : "completed";
    nextState.error = isError ? content : undefined;
    return nextState;
  }

  if (existing.kind === "bash-command") {
    const stdout =
      typeof eventToolUseResult?.stdout === "string" ? eventToolUseResult.stdout : "";
    const stderr =
      typeof eventToolUseResult?.stderr === "string" ? eventToolUseResult.stderr : "";
    nextState.output = [stdout, stderr].filter(Boolean).join(stdout && stderr ? "\n" : "");
    nextState.status = isError ? "failed" : "completed";
    nextState.error = isError ? content : undefined;
    return nextState;
  }

  if (existing.kind === "search" || existing.kind === "tool") {
    nextState.content = content;
    nextState.status = isError ? "failed" : "completed";
    nextState.error = isError ? content : undefined;
    return nextState;
  }

  if (
    (existing.kind === "file-edit" || existing.kind === "file-write") &&
    isError &&
    typeof block.tool_use_id === "string" &&
    content?.includes("requested permissions")
  ) {
    nextState.status = "pending-approval";
    nextState.error = undefined;
    nextState.requestId = block.tool_use_id;
    setPendingApproval({
      requestId: block.tool_use_id,
      createdAt: new Date().toISOString(),
      cwd,
      provider: meta.provider,
      requestKind: "file-change",
      toolName: existing.kind === "file-edit" ? "Edit" : "Write",
      input: buildApprovalInput(existing),
      projectKey: meta.projectKey,
    });
    return nextState;
  }

  nextState.status = isError ? "failed" : "completed";
  nextState.error = isError ? content : undefined;
  return nextState;
}

function applyEditRequest(content: string, input: Record<string, unknown>) {
  const oldString = typeof input.old_string === "string" ? input.old_string : null;
  const newString = typeof input.new_string === "string" ? input.new_string : "";
  const replaceAll = input.replace_all === true;

  if (!oldString) {
    return content;
  }

  if (replaceAll) {
    return content.split(oldString).join(newString);
  }

  const index = content.indexOf(oldString);
  if (index === -1) {
    return content;
  }

  return `${content.slice(0, index)}${newString}${content.slice(index + oldString.length)}`;
}
