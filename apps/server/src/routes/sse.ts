import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { getActiveRuns, readRecentRunEvents, runEvents } from "../lib/process.js";

const router: ExpressRouter = Router();

router.get("/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Send heartbeat every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  const onOutput = (data: unknown) => send("output", data);
  const onStart = (data: unknown) => send("start", data);
  const onStop = (data: unknown) => send("stop", data);
  const onDone = (data: unknown) => send("done", data);

  runEvents.on("output", onOutput);
  runEvents.on("start", onStart);
  runEvents.on("stop", onStop);
  runEvents.on("done", onDone);

  // Send initial connection message
  send("connected", { timestamp: new Date().toISOString() });
  for (const run of getActiveRuns()) {
    send("start", {
      project: run.project,
      cycles: run.cycles,
      timestamp: run.startedAt,
    });
    for (const event of readRecentRunEvents(run.project, 80)) {
      send("output", event);
    }
  }

  req.on("close", () => {
    clearInterval(heartbeat);
    runEvents.off("output", onOutput);
    runEvents.off("start", onStart);
    runEvents.off("stop", onStop);
    runEvents.off("done", onDone);
  });
});

export default router;
