import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

export function safeJsonParse(line: string) {
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function stripAnsi(value: string) {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /\x1b\[[0-9;]*[a-zA-Z]/g,
    "",
  );
}

export function resolveWithinRoot(root: string, pathValue: string) {
  const absolutePath = resolve(root, pathValue);
  if (absolutePath === root || absolutePath.startsWith(`${root}/`)) {
    return absolutePath;
  }
  return null;
}

export function resolveToolPath(cwd: string, rawPath: unknown) {
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    return null;
  }
  return resolveWithinRoot(cwd, rawPath);
}

export function toDisplayPath(root: string, absolutePath: string) {
  const relativePath = relative(root, absolutePath);
  return relativePath.length > 0 && !relativePath.startsWith("..") ? relativePath : absolutePath;
}

export async function safeReadText(pathValue: string) {
  try {
    return await readFile(pathValue, "utf-8");
  } catch {
    return "";
  }
}
