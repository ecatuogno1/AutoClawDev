#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultOutputDir = join(repoRoot, "output", "playwright");

function usage() {
  console.error(`Usage: browser_snapshot.mjs <url> [options]

Options:
  --output-dir <dir>        Directory for artifacts (default: output/playwright)
  --name <label>            Custom artifact name prefix
  --browser <name>          chromium|firefox|webkit (default: chromium)
  --viewport-size <wxh>     Viewport size for the browser screenshot
  --timeout <ms>            Playwright screenshot timeout (default: 30000)
  --wait-for-timeout <ms>   Extra wait before capture (default: 1500)
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

function extractFirstMatch(html, pattern) {
  const match = String(html).match(pattern);
  return match?.[1]?.trim() || "";
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

    positional.push(arg);
  }

  args.url = positional[0] || "";
  return args;
}

async function runPlaywrightScreenshot(url, screenshotPath, options) {
  const cmdArgs = [
    "playwright",
    "screenshot",
    "--browser",
    options.browser,
    "--timeout",
    String(options.timeout),
    "--wait-for-timeout",
    String(options.waitForTimeout),
    "--viewport-size",
    options.viewportSize,
  ];

  if (options.fullPage) cmdArgs.push("--full-page");
  if (options.ignoreHttpsErrors) cmdArgs.push("--ignore-https-errors");
  if (options.saveHar) cmdArgs.push("--save-har", screenshotPath.replace(/\.png$/i, ".har"));

  cmdArgs.push(url, screenshotPath);

  const env = {
    ...process.env,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD || "0",
  };

  await execFileAsync("npx", ["--yes", ...cmdArgs], {
    cwd: repoRoot,
    env,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function fetchPageHtml(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  const html = await response.text();
  return {
    finalUrl: response.url,
    status: response.status,
    ok: response.ok,
    html,
  };
}

function assessPage({ title, text, html, status, screenshotStat, finalUrl }) {
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

  if (!screenshotStat || screenshotStat.size === 0) {
    issues.push("Screenshot file missing or empty");
    score -= 30;
  }

  if (!finalUrl || !/^https?:\/\//i.test(finalUrl)) {
    issues.push("Unexpected final URL");
    score -= 5;
  }

  score = Math.max(0, Math.min(100, score));

  const statusLabel = score >= 80 && issues.length === 0
    ? "pass"
    : score >= 50
      ? "concern"
      : "fail";

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

  let captureError = "";
  try {
    await runPlaywrightScreenshot(url, screenshotPath, args);
  } catch (error) {
    captureError = error instanceof Error ? error.message : String(error);
  }

  let fetched = {
    finalUrl: url,
    status: 0,
    ok: false,
    html: "",
  };
  let fetchError = "";
  try {
    fetched = await fetchPageHtml(url);
    await writeFile(htmlPath, fetched.html, "utf8");
  } catch (error) {
    fetchError = error instanceof Error ? error.message : String(error);
  }

  const title = extractFirstMatch(fetched.html, /<title[^>]*>([\s\S]*?)<\/title>/i)
    || extractFirstMatch(fetched.html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || extractFirstMatch(fetched.html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const visibleText = stripHtml(fetched.html).slice(0, 4000);
  const screenshotStat = captureError ? null : await stat(screenshotPath).catch(() => null);
  const assessment = assessPage({
    title,
    text: visibleText,
    html: fetched.html,
    status: fetched.status,
    screenshotStat,
    finalUrl: fetched.finalUrl,
  });

  if (captureError) {
    assessment.issues.push(`Browser capture failed: ${captureError}`);
  }
  if (fetchError) {
    assessment.issues.push(`HTML fetch failed: ${fetchError}`);
  }

  const result = {
    artifact: {
      name: artifactBase,
      outputDir: args.outputDir,
      jsonPath,
      screenshotPath,
      htmlPath: fetchError ? null : htmlPath,
      harPath,
    },
    input: {
      url,
      browser: args.browser,
      viewportSize: args.viewportSize,
      timeout: args.timeout,
      waitForTimeout: args.waitForTimeout,
      fullPage: args.fullPage,
      ignoreHttpsErrors: args.ignoreHttpsErrors,
      saveHar: args.saveHar,
    },
    page: {
      requestedUrl: url,
      finalUrl: fetched.finalUrl,
      title: title || null,
      httpStatus: fetched.status || null,
      visibleTextSample: visibleText,
      contentHash: hashText(fetched.html || title || url),
    },
    browser: {
      screenshot: screenshotStat
        ? {
            size: screenshotStat.size,
            mtimeMs: screenshotStat.mtimeMs,
          }
        : null,
    },
    assessment: {
      status: assessment.status,
      score: assessment.score,
      issues: assessment.issues,
    },
    errors: {
      capture: captureError || null,
      fetch: fetchError || null,
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
