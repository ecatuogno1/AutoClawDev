import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type BrowserAutomationAdapter =
  | "playwright-package"
  | "playwright-cli"
  | "playwright-mcp"
  | "unavailable";

export interface BrowserAutomationCapability {
  available: boolean;
  adapter: BrowserAutomationAdapter;
  reason: string;
}

const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT =
  process.env.AUTOCLAWDEV_REPO_ROOT || join(SERVER_DIR, "../../../../");

function commandAvailable(command: string, args: string[] = ["--version"]): boolean {
  return spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: "ignore",
    env: process.env,
  }).status === 0;
}

export function detectBrowserAutomationCapability(): BrowserAutomationCapability {
  try {
    const requireFromRepo = createRequire(join(REPO_ROOT, "package.json"));
    requireFromRepo.resolve("playwright");
    return {
      available: true,
      adapter: "playwright-package",
      reason: "Resolved local playwright package from the repository runtime.",
    };
  } catch {
    // Fall through to CLI / MCP detection.
  }

  if (commandAvailable("npx", ["playwright", "--version"]) || commandAvailable("playwright")) {
    return {
      available: true,
      adapter: "playwright-cli",
      reason: "Playwright CLI is available in PATH or through npx.",
    };
  }

  if (
    process.env.AUTOCLAWDEV_BROWSER_ADAPTER === "playwright-mcp" ||
    process.env.PLAYWRIGHT_MCP_AVAILABLE === "1"
  ) {
    return {
      available: true,
      adapter: "playwright-mcp",
      reason: "Browser automation is configured through the Playwright MCP adapter.",
    };
  }

  return {
    available: false,
    adapter: "unavailable",
    reason: "No Playwright package, CLI, or MCP adapter could be detected.",
  };
}
