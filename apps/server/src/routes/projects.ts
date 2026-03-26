import { Router, type Router as ExpressRouter } from "express";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { listProjects, getProject } from "../lib/config.js";
import { getExperiments } from "../lib/experiments.js";
import { getWorkspacePath } from "../lib/paths.js";
import { parseRunnerLine } from "../lib/process.js";

const router: ExpressRouter = Router();

router.get("/", async (_req, res) => {
  const projects = await listProjects();
  const withStats = await Promise.all(
    projects.map(async (p) => {
      const experiments = await getExperiments(p.key);
      const total = experiments.length;
      const passed = experiments.filter((e) => e.result === "pass").length;
      const failed = total - passed;
      const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
      const lastExperiment = experiments[experiments.length - 1] ?? null;
      return { ...p, stats: { total, passed, failed, passRate, lastExperiment } };
    }),
  );
  res.json(withStats);
});

router.get("/:key", async (req, res) => {
  const project = await getProject(req.params.key);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const experiments = await getExperiments(project.key);
  const total = experiments.length;
  const passed = experiments.filter((e) => e.result === "pass").length;
  const failed = total - passed;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
  res.json({
    ...project,
    stats: { total, passed, failed, passRate },
    recentExperiments: experiments.slice(-20).reverse(),
  });
});

router.get("/:key/experiments", async (req, res) => {
  const experiments = await getExperiments(req.params.key);
  res.json(experiments.reverse());
});

router.get("/:key/cycles", async (req, res) => {
  const key = req.params.key;
  const cyclesDir = getWorkspacePath("cycles");
  if (!existsSync(cyclesDir)) {
    res.json([]);
    return;
  }
  const files = readdirSync(cyclesDir)
    .filter((f) => f.startsWith(`${key}-exp-`) && f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, 20);
  const cycles = files
    .map((f) => {
      try {
        return JSON.parse(readFileSync(getWorkspacePath("cycles", f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  res.json(cycles);
});

router.get("/:key/cycles/:cycleId", async (req, res) => {
  const { key, cycleId } = req.params;
  const file = getWorkspacePath("cycles", `${key}-${cycleId}.json`);
  if (!existsSync(file)) {
    res.status(404).json({ error: "Cycle not found" });
    return;
  }
  try {
    res.json(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    res.status(500).json({ error: "Failed to read cycle" });
  }
});

router.get("/:key/lastlog", async (req, res) => {
  const key = req.params.key;
  // Try project-specific log first, then generic
  const candidates = [
    getWorkspacePath(`run-${key}.log`),
    getWorkspacePath("run.log"),
    getWorkspacePath("nightly.log"),
  ];
  for (const logFile of candidates) {
    if (existsSync(logFile)) {
      try {
        const content = readFileSync(logFile, "utf8");
        const cleanedLines = content
          .replace(
            // eslint-disable-next-line no-control-regex
            /\x1b\[[0-9;]*[a-zA-Z]/g,
            "",
          )
          .split("\n")
          .map((line) => line.trimEnd())
          .filter((line) => line.trim().length > 0)
          .slice(-200);
        const events = cleanedLines.map((line) => parseRunnerLine(key, line));
        res.json({ lines: cleanedLines, events, source: logFile });
        return;
      } catch {
        continue;
      }
    }
  }
  res.json({ lines: [], events: [], source: null });
});

export default router;
