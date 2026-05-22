import { Router, type Router as ExpressRouter } from "express";
import type { RemoteCommandInput } from "@autoclawdev/types";
import { executeRemoteCommand, remoteCommandCatalog } from "../lib/remoteCommands.js";

const router: ExpressRouter = Router();

router.get("/", (_req, res) => {
  res.json({
    commands: remoteCommandCatalog,
  });
});

router.post("/execute", async (req, res) => {
  const payload = req.body as RemoteCommandInput | undefined;
  if (!payload || typeof payload.command !== "string") {
    return res.status(400).json({ error: "command is required" });
  }

  try {
    const result = await executeRemoteCommand(payload);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({
      ok: false,
      command: payload.command,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
