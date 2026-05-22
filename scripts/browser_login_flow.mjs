#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

function usage() {
  console.error(`Usage: browser_login_flow.mjs <config.json> [options]

Options:
  --output-dir <dir>        Directory for auth artifacts
  --browser <name>          chromium|firefox|webkit (default: chromium)
  --timeout <ms>            Operation timeout (default: 30000)
  --help                    Show this help
`);
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(argv) {
  const args = {
    configPath: "",
    outputDir: join(repoRoot, "output", "playwright-auth"),
    browser: "chromium",
    timeout: 30000,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--output-dir" && next) {
      args.outputDir = next;
      i += 1;
      continue;
    }
    if (arg === "--browser" && next) {
      args.browser = next;
      i += 1;
      continue;
    }
    if (arg === "--timeout" && next) {
      args.timeout = toNumber(next, args.timeout);
      i += 1;
      continue;
    }
    positional.push(arg);
  }

  args.configPath = positional[0] || "";
  return args;
}

async function ensureVisible(page, selector, timeout) {
  await page.locator(selector).first().waitFor({ state: "visible", timeout });
}

async function runStep(page, step, timeout) {
  const action = String(step.action || "").toLowerCase();
  if (action === "goto") {
    await page.goto(String(step.url), { timeout, waitUntil: "domcontentloaded" });
    return;
  }
  if (action === "fill") {
    await ensureVisible(page, String(step.selector), timeout);
    await page.locator(String(step.selector)).first().fill(String(step.value ?? ""));
    return;
  }
  if (action === "type") {
    await ensureVisible(page, String(step.selector), timeout);
    await page.locator(String(step.selector)).first().type(String(step.value ?? ""));
    return;
  }
  if (action === "click") {
    await ensureVisible(page, String(step.selector), timeout);
    await page.locator(String(step.selector)).first().click();
    return;
  }
  if (action === "press") {
    await ensureVisible(page, String(step.selector), timeout);
    await page.locator(String(step.selector)).first().press(String(step.key || "Enter"));
    return;
  }
  if (action === "waitforselector") {
    await page.locator(String(step.selector)).first().waitFor({
      state: String(step.state || "visible"),
      timeout,
    });
    return;
  }
  if (action === "waitforurl") {
    await page.waitForURL(String(step.pattern), { timeout });
    return;
  }
  if (action === "wait") {
    await page.waitForTimeout(toNumber(step.ms, 500));
    return;
  }
  throw new Error(`Unsupported login step action: ${action}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.configPath) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const playwright = await import("playwright").catch(() => null);
  if (!playwright) {
    console.error("The playwright package is required for browser login replay.");
    process.exit(1);
  }

  const config = JSON.parse(await readFile(args.configPath, "utf8"));
  const browserFactory = {
    chromium: playwright.chromium,
    firefox: playwright.firefox,
    webkit: playwright.webkit,
  }[args.browser] || playwright.chromium;

  await mkdir(args.outputDir, { recursive: true });
  const statePath = join(args.outputDir, "storage-state.json");
  const networkPath = join(args.outputDir, "observed-network.json");

  const observedRequests = [];
  const browser = await browserFactory.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: Boolean(config.ignoreHttpsErrors),
  });
  const page = await context.newPage();
  const timeout = toNumber(config.timeout, args.timeout);
  const label = String(config.label || "Browser-authenticated session");
  const privilegeLevel = String(config.privilegeLevel || "authenticated");

  if (config.headers && typeof config.headers === "object") {
    await context.setExtraHTTPHeaders(config.headers);
  }

  page.on("request", (request) => {
    observedRequests.push({
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
    });
  });

  let success = false;
  let error = null;
  let finalUrl = "";

  try {
    const loginUrl = String(config.url || config.loginUrl || "");
    if (!loginUrl) {
      throw new Error("Browser login config requires url or loginUrl");
    }

    await page.goto(loginUrl, { timeout, waitUntil: "domcontentloaded" });

    if (Array.isArray(config.steps) && config.steps.length > 0) {
      for (const step of config.steps) {
        await runStep(page, step, timeout);
      }
    } else {
      if (config.usernameSelector && config.username !== undefined) {
        await ensureVisible(page, String(config.usernameSelector), timeout);
        await page.locator(String(config.usernameSelector)).first().fill(String(config.username));
      }
      if (config.passwordSelector && config.password !== undefined) {
        await ensureVisible(page, String(config.passwordSelector), timeout);
        await page.locator(String(config.passwordSelector)).first().fill(String(config.password));
      }
      if (config.submitSelector) {
        await ensureVisible(page, String(config.submitSelector), timeout);
        await page.locator(String(config.submitSelector)).first().click();
      } else if (config.passwordSelector) {
        await page.locator(String(config.passwordSelector)).first().press("Enter");
      }
    }

    if (config.mfaUnsupportedSelector) {
      const mfaLocator = page.locator(String(config.mfaUnsupportedSelector)).first();
      if (await mfaLocator.isVisible().catch(() => false)) {
        throw new Error("Login flow requires MFA and is marked unsupported for automated replay");
      }
    }

    if (config.successSelector) {
      await page.locator(String(config.successSelector)).first().waitFor({
        state: "visible",
        timeout,
      });
    }
    if (config.successUrlContains) {
      await page.waitForURL(
        (current) => current.toString().includes(String(config.successUrlContains)),
        { timeout },
      );
    }
    await page.waitForTimeout(toNumber(config.postLoginWaitMs, 1000));
    finalUrl = page.url();

    await context.storageState({ path: statePath });
    await writeFile(networkPath, `${JSON.stringify(observedRequests, null, 2)}\n`, "utf8");
    success = true;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const cookies = await context.cookies();
  const storage = await page.evaluate(() => ({
    localStorage: Object.fromEntries(Object.entries(window.localStorage)),
    sessionStorage: Object.fromEntries(Object.entries(window.sessionStorage)),
  })).catch(() => ({ localStorage: {}, sessionStorage: {} }));
  const authHeaders = {};
  for (const request of observedRequests) {
    const headers = request.headers || {};
    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (lower === "authorization" || lower === "x-api-key") {
        authHeaders[key] = value;
      }
    }
  }

  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  const result = {
    ok: success,
    label,
    privilegeLevel,
    finalUrl,
    statePath: success ? statePath : null,
    networkPath,
    cookies,
    authHeaders,
    observedRoutes: observedRequests
      .map((request) => {
        try {
          const parsed = new URL(request.url);
          return parsed.pathname;
        } catch {
          return null;
        }
      })
      .filter((value, index, all) => value && all.indexOf(value) === index),
    storage,
    error,
    createdAt: new Date().toISOString(),
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(success ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
