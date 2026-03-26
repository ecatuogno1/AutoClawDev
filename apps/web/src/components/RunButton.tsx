import { useState } from "react";
import { useStartRun, useStopRun, useActiveRuns } from "@/lib/api";

interface RunButtonProps {
  projectKey: string;
}

export function RunButton({ projectKey }: RunButtonProps) {
  const [cycles, setCycles] = useState(1);
  const startRun = useStartRun();
  const stopRun = useStopRun();
  const { data: activeRuns } = useActiveRuns();

  const isRunning = activeRuns ? projectKey in activeRuns : false;

  return (
    <div className="flex items-center gap-2">
      {!isRunning ? (
        <>
          <select
            value={cycles}
            onChange={(e) => setCycles(Number(e.target.value))}
            className="bg-[#0d1117] border border-[#30363d] rounded-md px-2 py-1.5 text-xs text-[#e6edf3] focus:outline-none focus:border-[#58a6ff]"
          >
            {[1, 3, 5, 10, 20].map((n) => (
              <option key={n} value={n}>
                {n} cycle{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={() => startRun.mutate({ project: projectKey, cycles })}
            disabled={startRun.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#238636] hover:bg-[#2ea043] text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
              <path d="M4 2l12 6-12 6V2z" />
            </svg>
            Run
          </button>
        </>
      ) : (
        <button
          onClick={() => stopRun.mutate({ project: projectKey })}
          disabled={stopRun.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#da3633] hover:bg-[#f85149] text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
            <rect x="3" y="3" width="10" height="10" rx="1" />
          </svg>
          Stop
        </button>
      )}
    </div>
  );
}
