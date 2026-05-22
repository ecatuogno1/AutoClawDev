import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type Router as ExpressRouter } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SystemHealthReport } from "@autoclawdev/types";
import { detectBrowserAutomationCapability } from "../lib/capabilities.js";
import { listProjectsDetailed } from "../lib/config.js";
import { importLegacyHistory } from "../lib/history.js";
import { telegramControlService } from "../integrations/telegram/service.js";
import { getActiveRuns } from "../lib/process.js";
import { listPortfolioAuditRows, listProjectReadiness } from "../lib/orchestrator.js";
import { SESSION_COOKIE_NAME } from "../lib/sessionAuth.js";

const router: ExpressRouter = Router();
const SERVER_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT =
  process.env.AUTOCLAWDEV_REPO_ROOT || join(SERVER_DIR, "../../../../");

router.get("/health", async (_req, res) => {
  const projects = await listProjectsDetailed();
  const report: SystemHealthReport = {
    generatedAt: new Date().toISOString(),
    registeredProjects: projects.length,
    activeRuns: getActiveRuns().length,
    serverBuilt: existsSync(join(REPO_ROOT, "apps", "server", "dist", "index.js")),
    webBuilt: existsSync(join(REPO_ROOT, "apps", "web", "dist", "index.html")),
    authMode: "session",
    sessionCookieName: SESSION_COOKIE_NAME,
    capabilities: {
      browserAutomation: detectBrowserAutomationCapability(),
      telegramControl: telegramControlService.getStatus(),
    },
  };
  res.json(report);
});

router.get("/projects-readiness", async (_req, res) => {
  const projects = await listProjectReadiness();
  res.json({
    generatedAt: new Date().toISOString(),
    projects,
  });
});

router.get("/projects-audit", async (_req, res) => {
  const rows = await listPortfolioAuditRows();
  res.json({
    generatedAt: new Date().toISOString(),
    projects: rows,
  });
});

router.post("/history/import", async (req, res) => {
  try {
    const payload = await importLegacyHistory({
      projectKey: typeof req.body?.project === "string" ? req.body.project : undefined,
      dryRun: Boolean(req.body?.dryRun),
    });
    res.json(payload);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to import legacy history",
    });
  }
});

export default router;
