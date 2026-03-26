import { AgentBadge } from "./AgentBadge";
import type { Experiment } from "@/types";

interface ExperimentRowProps {
  experiment: Experiment;
  showProject?: boolean;
}

function formatElapsed(seconds?: number): string {
  if (!seconds) return "--";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ExperimentRow({
  experiment,
  showProject = false,
}: ExperimentRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#30363d] hover:bg-[#161b22] transition-colors group">
      {/* Result indicator */}
      <div
        className={`w-2 h-2 rounded-full shrink-0 ${
          experiment.result === "pass" ? "bg-[#3fb950]" : "bg-[#f85149]"
        }`}
      />

      {/* ID */}
      <span className="mono text-xs text-[#6e7681] w-16 shrink-0">
        #{experiment.id}
      </span>

      {/* Project key (optional) */}
      {showProject && experiment.project && (
        <span className="mono text-xs text-[#d29922] w-20 shrink-0">
          {experiment.project}
        </span>
      )}

      {/* Description */}
      <span className="text-sm text-[#e6edf3] flex-1 truncate">
        {experiment.description}
      </span>

      {/* Tools/agents */}
      <div className="hidden lg:flex items-center gap-1 shrink-0">
        {(Array.isArray(experiment.tools)
          ? experiment.tools as string[]
          : typeof experiment.tools === 'string'
            ? (experiment.tools as string).split('+')
            : [] as string[]
        ).slice(0, 3).map((tool: string, i: number) => (
          <AgentBadge key={i} agent={tool} />
        ))}
      </div>

      {/* Commit */}
      {experiment.commit && (
        <span className="mono text-xs text-[#bc8cff] w-18 shrink-0 hidden md:block">
          {experiment.commit.slice(0, 7)}
        </span>
      )}

      {/* Elapsed */}
      <span className="mono text-xs text-[#8b949e] w-14 text-right shrink-0">
        {formatElapsed(experiment.elapsed)}
      </span>

      {/* Timestamp */}
      <span className="text-xs text-[#6e7681] w-32 text-right shrink-0 hidden sm:block">
        {formatTime(experiment.timestamp)}
      </span>
    </div>
  );
}
