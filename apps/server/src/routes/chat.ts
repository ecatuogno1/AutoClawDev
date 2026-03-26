import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { getProject } from "../lib/config.js";

const router: ExpressRouter = Router();

interface ActiveSession {
  process: ChildProcess;
  provider: string;
  startedAt: string;
}

interface PendingApprovalRecord {
  requestId: string;
  createdAt: string;
  cwd: string;
  provider: string;
  requestKind: "command" | "file-read" | "file-change";
  toolName: string;
  input: Record<string, unknown>;
  projectKey?: string;
}

interface ToolCallState {
  id: string;
  provider: string;
  kind: "file-read" | "file-edit" | "file-write" | "bash-command" | "search" | "tool";
  title: string;
  status: "running" | "completed" | "pending-approval" | "failed";
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

const activeSessions = new Map<string, ActiveSession>();
const pendingApprovals = new Map<string, PendingApprovalRecord>();

router.post("/", async (req: Request, res: Response) => {
  const {
    message,
    provider = "claude",
    projectKey,
    referencedFiles,
    sessionId,
  } = req.body ?? {};

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  const cwd = await resolveWorkingDirectory(projectKey);
  const prompt = await buildChatPrompt({
    cwd,
    message: String(message),
    referencedFiles: Array.isArray(referencedFiles) ? referencedFiles : [],
  });

  let cmd: string;
  let args: string[];

  if (provider === "codex") {
    cmd = "codex";
    args = ["exec", prompt, "-m", "gpt-5.4", "--json", "--color", "never"];
  } else {
    cmd = "claude";
    args = [
      "--print",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--model",
      "sonnet",
      "--verbose",
      prompt,
    ];
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const id = sessionId || `chat-${Date.now()}`;
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("start", { id, provider, cwd, timestamp: new Date().toISOString() });

  try {
    const proc = spawn(cmd, args, {
      cwd,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    activeSessions.set(id, {
      process: proc,
      provider,
      startedAt: new Date().toISOString(),
    });

    const toolCalls = new Map<string, ToolCallState>();
    const streamedAssistantMessageIds = new Set<string>();
    let currentClaudeMessageId: string | null = null;
    let buffer = "";
    let processing = Promise.resolve();
    let closed = false;

    const enqueueLine = (line: string) => {
      processing = processing
        .then(() =>
          handleStreamLine({
            cwd,
            line,
            projectKey,
            provider: provider === "codex" ? "codex" : "claude",
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

    proc.stdout?.on("data", processChunk);
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = stripAnsi(chunk.toString()).trim();
      if (!text || text.includes("Warning:") || text.includes("Debugger")) {
        return;
      }
      send("error", { message: text });
    });

    proc.on("close", (code) => {
      void (async () => {
        if (buffer.trim()) {
          enqueueLine(buffer.trim());
          buffer = "";
        }
        await processing;
        if (!closed) {
          send("done", { code, id });
          activeSessions.delete(id);
          res.end();
          closed = true;
        }
      })();
    });

    proc.on("error", (err) => {
      send("error", { message: err.message });
      activeSessions.delete(id);
      if (!closed) {
        res.end();
        closed = true;
      }
    });

    req.on("close", () => {
      proc.kill("SIGTERM");
      activeSessions.delete(id);
    });
  } catch (err) {
    send("error", { message: (err as Error).message });
    res.end();
  }
});

router.post("/approval", async (req: Request, res: Response) => {
  const { action, requestId } = req.body ?? {};
  if (action !== "approve" && action !== "reject") {
    return res.status(400).json({ error: "action must be approve or reject" });
  }
  if (typeof requestId !== "string" || requestId.length === 0) {
    return res.status(400).json({ error: "requestId is required" });
  }

  const record = pendingApprovals.get(requestId);
  if (!record) {
    return res.status(404).json({ error: "Pending approval not found" });
  }

  if (action === "reject") {
    pendingApprovals.delete(requestId);
    return res.json({ ok: true, requestId, status: "rejected" });
  }

  try {
    const result = await applyPendingApproval(record);
    pendingApprovals.delete(requestId);
    return res.json({ ok: true, requestId, status: "approved", result });
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : String(error),
      requestId,
    });
  }
});

router.post("/stop", (req: Request, res: Response) => {
  const { sessionId } = req.body ?? {};
  const session = activeSessions.get(sessionId);
  if (session) {
    session.process.kill("SIGTERM");
    activeSessions.delete(sessionId);
    return res.json({ ok: true });
  }
  return res.status(404).json({ error: "No active session" });
});

async function resolveWorkingDirectory(projectKey: string | undefined) {
  if (!projectKey) {
    return homedir();
  }
  const project = await getProject(projectKey);
  if (project?.path && existsSync(project.path)) {
    return project.path;
  }
  return homedir();
}

async function buildChatPrompt(props: {
  cwd: string;
  message: string;
  referencedFiles: string[];
}) {
  const references = await Promise.all(
    props.referencedFiles.map(async (pathValue) => {
      const absolutePath = resolveWithinRoot(props.cwd, pathValue);
      if (!absolutePath) return null;
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
      return [
        `Referenced file: ${displayPath}`,
        "```",
        entry.content,
        "```",
      ].join("\n");
    })
    .join("\n\n");

  return `${header}\n\nUser request:\n${props.message}`;
}

async function handleStreamLine(props: {
  cwd: string;
  line: string;
  projectKey?: string;
  provider: "claude" | "codex";
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
    if (!payload) return;

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
    const messageId =
      typeof message?.id === "string" ? message.id : `claude-${Date.now()}`;
    const content = Array.isArray(message?.content) ? message.content : [];

    for (const block of content) {
      if (!block || typeof block !== "object") continue;
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

  if (event.type === "user") {
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
      if (!block || typeof block !== "object") continue;
      const item = block as Record<string, unknown>;
      const toolUseId = typeof item.tool_use_id === "string" ? item.tool_use_id : null;
      if (!toolUseId) continue;

      const existing = props.toolCalls.get(toolUseId);
      if (!existing) continue;

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
    });
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
    const newContent =
      typeof oldContent === "string" ? applyEditRequest(oldContent, input) : "";
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
  meta: { provider: string; projectKey?: string },
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
    nextState.content =
      typeof file?.content === "string"
        ? file.content
        : content;
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
    pendingApprovals.set(block.tool_use_id, {
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

function buildApprovalInput(tool: ToolCallState) {
  if (tool.kind === "file-write") {
    return {
      file_path: tool.absolutePath ?? tool.path,
      content: tool.newContent ?? "",
    };
  }
  return {
    file_path: tool.absolutePath ?? tool.path,
    old_content: tool.oldContent ?? "",
    new_content: tool.newContent ?? "",
  };
}

async function applyPendingApproval(record: PendingApprovalRecord) {
  if (record.requestKind === "command") {
    const command = typeof record.input.command === "string" ? record.input.command : null;
    if (!command) {
      throw new Error("Pending command approval is missing a command");
    }
    const result = spawnSync("/bin/zsh", ["-lc", command], {
      cwd: record.cwd,
      encoding: "utf-8",
      timeout: 15_000,
    });
    return {
      kind: "bash-command",
      command,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
      exitCode: result.status,
    };
  }

  if (record.requestKind === "file-read") {
    const absolutePath = resolveToolPath(record.cwd, record.input.file_path);
    if (!absolutePath) {
      throw new Error("Pending file-read approval has an invalid path");
    }
    const content = await readFile(absolutePath, "utf-8");
    return {
      kind: "file-read",
      path: toDisplayPath(record.cwd, absolutePath),
      content,
    };
  }

  const absolutePath = resolveToolPath(record.cwd, record.input.file_path);
  if (!absolutePath) {
    throw new Error("Pending file-change approval has an invalid path");
  }

  await mkdir(dirname(absolutePath), { recursive: true });

  if (record.toolName === "Write") {
    const content = typeof record.input.content === "string" ? record.input.content : "";
    const oldContent = await safeReadText(absolutePath);
    await writeFile(absolutePath, content, "utf-8");
    return {
      kind: "file-write",
      path: toDisplayPath(record.cwd, absolutePath),
      oldContent,
      newContent: content,
    };
  }

  const currentContent = await safeReadText(absolutePath);
  const nextContent =
    typeof record.input.new_content === "string" ? record.input.new_content : currentContent;
  await writeFile(absolutePath, nextContent, "utf-8");
  return {
    kind: "file-edit",
    path: toDisplayPath(record.cwd, absolutePath),
    oldContent: currentContent,
    newContent: nextContent,
  };
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

function safeJsonParse(line: string) {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stripAnsi(value: string) {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /\x1b\[[0-9;]*[a-zA-Z]/g,
    "",
  );
}

function resolveToolPath(cwd: string, rawPath: unknown) {
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    return null;
  }
  return resolveWithinRoot(cwd, rawPath);
}

function resolveWithinRoot(root: string, pathValue: string) {
  const absolutePath = resolve(root, pathValue);
  if (absolutePath === root || absolutePath.startsWith(`${root}/`)) {
    return absolutePath;
  }
  return null;
}

function toDisplayPath(root: string, absolutePath: string) {
  const relativePath = relative(root, absolutePath);
  return relativePath.length > 0 && !relativePath.startsWith("..") ? relativePath : absolutePath;
}

async function safeReadText(pathValue: string) {
  try {
    return await readFile(pathValue, "utf-8");
  } catch {
    return "";
  }
}

export default router;
