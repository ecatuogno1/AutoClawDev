import { createFileRoute, Link } from "@tanstack/react-router";
import { useProjectMemory } from "@/lib/api";
import type { MemoryFinding } from "@/types";

export const Route = createFileRoute("/projects/$projectKey/memory")({
  component: MemoryPage,
});

const directiveColor: Record<string, string> = {
  "bug-fix": "bg-[#f8514920] text-[#f85149]",
  feature: "bg-[#1f6feb20] text-[#58a6ff]",
  performance: "bg-[#d2992220] text-[#d29922]",
  security: "bg-[#f8514920] text-[#f85149]",
  refactor: "bg-[#8b949e20] text-[#8b949e]",
};

function FindingRow({ finding }: { finding: MemoryFinding }) {
  return (
    <div className="flex items-start gap-3 p-3">
      <span
        className={`mt-0.5 ${finding.status === "open" ? "text-[#d29922]" : "text-[#3fb950]"}`}
      >
        {finding.status === "open" ? "○" : "✓"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[#c9d1d9]">{finding.title}</div>
        <div className="flex flex-wrap gap-2 mt-1.5">
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${directiveColor[finding.directive] || "bg-[#8b949e20] text-[#8b949e]"}`}
          >
            {finding.directive}
          </span>
          <span className="text-xs text-[#8b949e]">{finding.domain}</span>
          {finding.targetFiles.map((f) => (
            <span key={f} className="text-xs mono text-[#6e7681]">
              {f.split("/").slice(-2).join("/")}
            </span>
          ))}
        </div>
        {finding.notes && (
          <div className="text-xs text-[#6e7681] mt-1 line-clamp-2">
            {finding.notes}
          </div>
        )}
      </div>
      {finding.updatedAt && (
        <span className="text-xs text-[#484f58] whitespace-nowrap">
          {new Date(finding.updatedAt).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

function MemoryPage() {
  const { projectKey } = Route.useParams();
  const { data: memory, isLoading } = useProjectMemory(projectKey);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#8b949e]">
        <Link to="/" className="hover:text-[#58a6ff]">
          Home
        </Link>
        <span>/</span>
        <Link
          to="/projects/$projectKey"
          params={{ projectKey }}
          className="hover:text-[#58a6ff]"
        >
          {projectKey}
        </Link>
        <span>/</span>
        <span className="text-[#e6edf3]">Knowledge Base</span>
      </div>

      <h1 className="text-2xl font-bold text-[#e6edf3]">Knowledge Base</h1>

      {isLoading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg animate-pulse h-64" />
      ) : !memory || (!memory.summary && memory.totalFindings === 0) ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 text-center">
          <p className="text-[#8b949e]">
            No memory data yet. Run{" "}
            <code className="mono text-xs text-[#d29922]">
              autoclawdev memory-init {projectKey}
            </code>{" "}
            or complete some standard cycles to build memory.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary + stats */}
          {memory.summary && (
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
              <p className="text-sm text-[#c9d1d9]">{memory.summary}</p>
              {memory.updatedAt && (
                <p className="text-xs text-[#484f58] mt-2">
                  Last updated: {new Date(memory.updatedAt).toLocaleString()}
                  {memory.sourceCommit && (
                    <span className="ml-2 mono">
                      @ {memory.sourceCommit.slice(0, 8)}
                    </span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-[#d29922]">
                {memory.openFindings.length}
              </div>
              <div className="text-xs text-[#8b949e] mt-1">Open Findings</div>
            </div>
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-[#3fb950]">
                {memory.resolvedFindings.length}
              </div>
              <div className="text-xs text-[#8b949e] mt-1">Resolved</div>
            </div>
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-[#e6edf3]">
                {memory.hotspots.length}
              </div>
              <div className="text-xs text-[#8b949e] mt-1">Hotspot Files</div>
            </div>
            <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-[#e6edf3]">
                {memory.fileMemoryCount}
              </div>
              <div className="text-xs text-[#8b949e] mt-1">File Memories</div>
            </div>
          </div>

          {/* Hotspots */}
          {memory.hotspots.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-[#e6edf3] mb-3">
                Hotspot Files
              </h2>
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]">
                {memory.hotspots.map((h) => (
                  <div
                    key={h.path}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <span className="text-sm mono text-[#c9d1d9] truncate">
                      {h.path}
                    </span>
                    <span className="text-xs text-[#8b949e] ml-4 shrink-0">
                      {h.count} cycle{h.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open findings */}
          {memory.openFindings.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-[#d29922] mb-3">
                Open Findings ({memory.openFindings.length})
              </h2>
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]">
                {memory.openFindings.map((f, i) => (
                  <FindingRow key={i} finding={f} />
                ))}
              </div>
            </div>
          )}

          {/* Resolved findings */}
          {memory.resolvedFindings.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-[#3fb950] mb-3">
                Resolved ({memory.resolvedFindings.length})
              </h2>
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]">
                {memory.resolvedFindings.map((f, i) => (
                  <FindingRow key={i} finding={f} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
