import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ChatProvider, ToolCallState } from "@autoclawdev/types";
import { resolveToolPath, safeReadText, toDisplayPath } from "./utils.js";

export interface PendingApprovalRecord {
  requestId: string;
  createdAt: string;
  cwd: string;
  provider: ChatProvider;
  requestKind: "command" | "file-read" | "file-change";
  toolName: string;
  input: Record<string, unknown>;
  projectKey?: string;
}

const pendingApprovals = new Map<string, PendingApprovalRecord>();

export function getPendingApproval(requestId: string) {
  return pendingApprovals.get(requestId);
}

export function deletePendingApproval(requestId: string) {
  pendingApprovals.delete(requestId);
}

export function setPendingApproval(record: PendingApprovalRecord) {
  pendingApprovals.set(record.requestId, record);
}

export function buildApprovalInput(tool: ToolCallState) {
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

export async function applyPendingApproval(record: PendingApprovalRecord) {
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
