#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultOutputDir = join(repoRoot, "output", "playwright");
const execFileAsync = promisify(execFile);

function usage() {
  console.error(`Usage: browser_snapshot.mjs <url> [options]

Options:
  --output-dir <dir>        Directory for artifacts (default: output/playwright)
  --name <label>            Custom artifact name prefix
  --browser <name>          chromium|firefox|webkit (default: chromium)
  --viewport-size <wxh>     Viewport size for the browser screenshot
  --timeout <ms>            Playwright screenshot timeout (default: 30000)
  --wait-for-timeout <ms>   Extra wait before capture (default: 1500)
  --storage-state <path>    Reuse authenticated Playwright storage state
  --full-page               Capture the full page screenshot
  --ignore-https-errors     Ignore HTTPS errors in Playwright
  --save-har                Save a HAR file alongside the screenshot
  --help                    Show this help
`);
}

function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "page";
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseViewport(value) {
  const [widthText, heightText] = String(value || "").split(/[x,]/i);
  return {
    width: toNumber(widthText, 1440),
    height: toNumber(heightText, 900),
  };
}

function parseArgs(argv) {
  const args = {
    url: "",
    outputDir: defaultOutputDir,
    name: "",
    browser: "chromium",
    viewportSize: "1440,900",
    timeout: 30000,
    waitForTimeout: 1500,
    storageState: "",
    fullPage: false,
    ignoreHttpsErrors: false,
    saveHar: false,
  };

  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--full-page") {
      args.fullPage = true;
      continue;
    }
    if (arg === "--ignore-https-errors") {
      args.ignoreHttpsErrors = true;
      continue;
    }
    if (arg === "--save-har") {
      args.saveHar = true;
      continue;
    }

    const next = argv[i + 1];
    if (arg === "--output-dir" && next) {
      args.outputDir = next;
      i += 1;
      continue;
    }
    if (arg === "--name" && next) {
      args.name = next;
      i += 1;
      continue;
    }
    if (arg === "--browser" && next) {
      args.browser = next;
      i += 1;
      continue;
    }
    if (arg === "--viewport-size" && next) {
      args.viewportSize = next;
      i += 1;
      continue;
    }
    if (arg === "--timeout" && next) {
      args.timeout = toNumber(next, args.timeout);
      i += 1;
      continue;
    }
    if (arg === "--wait-for-timeout" && next) {
      args.waitForTimeout = toNumber(next, args.waitForTimeout);
      i += 1;
      continue;
    }
    if (arg === "--storage-state" && next) {
      args.storageState = next;
      i += 1;
      continue;
    }

    positional.push(arg);
  }

  args.url = positional[0] || "";
  return args;
}

function assessPage({ title, text, html, status, finalUrl, screenshotOk }) {
  const lowerText = `${title}\n${text}\n${html}`.toLowerCase();
  const issues = [];
  let score = 100;

  if (!title) {
    issues.push("Missing document title");
    score -= 10;
  }

  if (text.length < 80) {
    issues.push("Very little visible text");
    score -= 20;
  }

  const errorSignals = [
    "application error",
    "something went wrong",
    "cannot get /",
    "404 not found",
    "500 internal server error",
    "typeerror",
    "referenceerror",
    "exception",
    "stack trace",
    "failed to load",
  ];
  const hitSignals = errorSignals.filter((signal) => lowerText.includes(signal));
  if (hitSignals.length > 0) {
    issues.push(`Error signals found: ${hitSignals.join(", ")}`);
    score -= Math.min(45, 12 * hitSignals.length);
  }

  if (status >= 400) {
    issues.push(`HTTP status ${status}`);
    score -= 35;
  }

  if (!screenshotOk) {
    issues.push("Screenshot file missing or empty");
    score -= 30;
  }

  if (!finalUrl || !/^https?:\/\//i.test(finalUrl)) {
    issues.push("Unexpected final URL");
    score -= 5;
  }

  score = Math.max(0, Math.min(100, score));
  const statusLabel = score >= 80 && issues.length === 0 ? "pass" : score >= 50 ? "concern" : "fail";
  return { score, status: statusLabel, issues };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const url = args.url.includes("://") ? args.url : `http://${args.url}`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = args.name ? slugify(args.name) : slugify(url);
  const artifactBase = `${baseName}-${stamp}`;

  await mkdir(args.outputDir, { recursive: true });

  const screenshotPath = join(args.outputDir, `${artifactBase}.png`);
  const htmlPath = join(args.outputDir, `${artifactBase}.html`);
  const jsonPath = join(args.outputDir, `${artifactBase}.json`);
  const harPath = args.saveHar ? screenshotPath.replace(/\.png$/i, ".har") : null;

  const observedRequests = [];
  let captureError = "";
  let html = "";
  let title = "";
  let visibleText = "";
  let finalUrl = url;
  let httpStatus = 0;
  let screenshotOk = false;

  let playwright = null;
  try {
    playwright = await import("playwright");
  } catch {
    playwright = null;
  }

  if (playwright) {
    const browserFactory = {
      chromium: playwright.chromium,
      firefox: playwright.firefox,
      webkit: playwright.webkit,
    }[args.browser] || playwright.chromium;

    let browser;
    let context;
    let page;
    try {
      browser = await browserFactory.launch({ headless: true });
      const viewport = parseViewport(args.viewportSize);
      context = await browser.newContext({
        ignoreHTTPSErrors: args.ignoreHttpsErrors,
        viewport,
        storageState: args.storageState || undefined,
        recordHar: args.saveHar
          ? {
              path: harPath,
              mode: "minimal",
              content: "embed",
            }
          : undefined,
      });
      page = await context.newPage();
      page.on("request", (request) => {
        observedRequests.push({
          url: request.url(),
          method: request.method(),
          resourceType: request.resourceType(),
        });
      });
      const response = await page.goto(url, {
        timeout: args.timeout,
        waitUntil: "domcontentloaded",
      });
      await page.waitForTimeout(args.waitForTimeout);
      await page.screenshot({ path: screenshotPath, fullPage: args.fullPage });
      html = await page.content();
      title = await page.title();
      visibleText = stripHtml(html).slice(0, 4000);
      finalUrl = page.url();
      httpStatus = response?.status() || 0;
      screenshotOk = true;
      await writeFile(htmlPath, html, "utf8");
    } catch (error) {
      captureError = error instanceof Error ? error.message : String(error);
    } finally {
      await context?.close().catch(() => {});
      await browser?.close().catch(() => {});
    }
  } else if (!args.storageState) {
    const cmdArgs = [
      "playwright",
      "screenshot",
      "--browser",
      args.browser,
      "--timeout",
      String(args.timeout),
      "--wait-for-timeout",
      String(args.waitForTimeout),
      "--viewport-size",
      args.viewportSize,
    ];
    if (args.fullPage) cmdArgs.push("--full-page");
    if (args.ignoreHttpsErrors) cmdArgs.push("--ignore-https-errors");
    if (args.saveHar && harPath) cmdArgs.push("--save-har", harPath);
    cmdArgs.push(url, screenshotPath);
    try {
      await execFileAsync("npx", ["--yes", ...cmdArgs], {
        cwd: repoRoot,
        env: {
          ...process.env,
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD || "0",
        },
        maxBuffer: 10 * 1024 * 1024,
      });
      screenshotOk = true;
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      html = await response.text();
      finalUrl = response.url;
      httpStatus = response.status;
      visibleText = stripHtml(html).slice(0, 4000);
      await writeFile(htmlPath, html, "utf8");
    } catch (error) {
      captureError = error instanceof Error ? error.message : String(error);
    }
  } else {
    captureError = "Authenticated browser replay requires the playwright package to be available locally.";
  }

  const assessment = assessPage({
    title,
    text: visibleText,
    html,
    status: httpStatus,
    finalUrl,
    screenshotOk,
  });
  if (captureError) {
    assessment.issues.push(`Browser capture failed: ${captureError}`);
  }

  const result = {
    artifact: {
      name: artifactBase,
      outputDir: args.outputDir,
      jsonPath,
      screenshotPath,
      htmlPath: html ? htmlPath : null,
      harPath,
    },
    input: {
      url,
      browser: args.browser,
      viewportSize: args.viewportSize,
      timeout: args.timeout,
      waitForTimeout: args.waitForTimeout,
      storageState: args.storageState || null,
      fullPage: args.fullPage,
      ignoreHttpsErrors: args.ignoreHttpsErrors,
      saveHar: args.saveHar,
    },
    page: {
      requestedUrl: url,
      finalUrl,
      title: title || null,
      httpStatus: httpStatus || null,
      visibleTextSample: visibleText,
      contentHash: hashText(html || title || url),
    },
    browser: {
      observedRequests,
    },
    assessment: {
      status: assessment.status,
      score: assessment.score,
      issues: assessment.issues,
    },
    errors: {
      capture: captureError || null,
    },
    createdAt: new Date().toISOString(),
  };

  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
}
