import { createFileRoute, Link } from "@tanstack/react-router";
import { useProjectMemory } from "@/lib/api";
import type { MemoryFinding } from "@/types";
import { useState, useMemo } from "react";
import { ProjectTabs } from "@/components/ProjectTabs";

export const Route = createFileRoute("/projects/$projectKey/memory")({
  component: MemoryPage,
});

// ── Styling maps ─────────────────────────────────────────────────────

const directiveStyle: Record<string, { bg: string; text: string; label: string }> = {
  "bug-fix":     { bg: "bg-[#f8514918]", text: "text-[#ff7b72]", label: "Bug Fix" },
  security:      { bg: "bg-[#f8514918]", text: "text-[#ff7b72]", label: "Security" },
  performance:   { bg: "bg-[#d2992218]", text: "text-[#d29922]", label: "Performance" },
  feature:       { bg: "bg-[#1f6feb18]", text: "text-[#58a6ff]", label: "Feature" },
  refactor:      { bg: "bg-[#8b949e18]", text: "text-[#8b949e]", label: "Refactor" },
};

const domainStyle: Record<string, { text: string; label: string }> = {
  backend:  { text: "text-[#d2a8ff]", label: "Backend" },
  frontend: { text: "text-[#79c0ff]", label: "Frontend" },
  unknown:  { text: "text-[#8b949e]", label: "General" },
};

function getDirective(d: string) {
  return directiveStyle[d] || { bg: "bg-[#8b949e18]", text: "text-[#8b949e]", label: d };
}
function getDomain(d: string) {
  return domainStyle[d] || { text: "text-[#8b949e]", label: d };
}

// ── Components ───────────────────────────────────────────────────────

function StatCard({ label, value, color, sub }: { label: string; value: number | string; color: string; sub?: string }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-[#8b949e] mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-[#484f58] mt-0.5">{sub}</div>}
    </div>
  );
}

function FindingCard({ finding, defaultExpanded }: { finding: MemoryFinding; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const dir = getDirective(finding.directive);
  const dom = getDomain(finding.domain);

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className={`w-full text-left p-4 rounded-xl border transition-all hover:brightness-110 ${
        finding.status === "open"
          ? "border-[#30363d] bg-[#161b22]"
          : "border-[#3fb95020] bg-[#3fb95008]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1 shrink-0 ${finding.status === "open" ? "text-[#d29922]" : "text-[#3fb950]"}`}>
          {finding.status === "open" ? "○" : "✓"}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#e6edf3] leading-relaxed">{finding.title}</p>

          <div className="flex flex-wrap gap-2 mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dir.bg} ${dir.text}`}>
              {dir.label}
            </span>
            <span className={`text-xs ${dom.text}`}>{dom.label}</span>
            {finding.targetFiles.length > 0 && (
              <span className="text-xs mono text-[#6e7681]">
                {finding.targetFiles[0].split("/").slice(-2).join("/")}
                {finding.targetFiles.length > 1 && ` +${finding.targetFiles.length - 1}`}
              </span>
            )}
          </div>

          {expanded && (
            <div className="mt-3 pt-3 border-t border-[#30363d] space-y-2">
              {finding.targetFiles.length > 0 && (
                <div>
                  <span className="text-xs text-[#8b949e] uppercase tracking-wider">Files</span>
                  <div className="mt-1 space-y-0.5">
                    {finding.targetFiles.map((f) => (
                      <div key={f} className="text-xs mono text-[#c9d1d9]">{f}</div>
                    ))}
                  </div>
                </div>
              )}
              {finding.notes && (
                <div>
                  <span className="text-xs text-[#8b949e] uppercase tracking-wider">Notes</span>
                  <p className="text-xs text-[#c9d1d9] mt-1">{finding.notes}</p>
                </div>
              )}
              <div className="flex gap-4 text-xs text-[#484f58]">
                {finding.firstSeenExp && <span>First seen: {finding.firstSeenExp}</span>}
                {finding.lastSeenExp && finding.lastSeenExp !== finding.firstSeenExp && (
                  <span>Last seen: {finding.lastSeenExp}</span>
                )}
                {finding.resolutionCommit && (
                  <span className="mono">Fixed in: {finding.resolutionCommit.slice(0, 8)}</span>
                )}
                {finding.updatedAt && (
                  <span>{new Date(finding.updatedAt).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          )}
        </div>
        <span className="text-xs text-[#484f58] shrink-0 mt-1">{expanded ? "Less" : "More"}</span>
      </div>
    </button>
  );
}

function DirectiveBar({ findings }: { findings: MemoryFinding[] }) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of findings) {
      map[f.directive] = (map[f.directive] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [findings]);

  if (counts.length === 0) return null;
  const total = findings.length;

  return (
    <div className="space-y-2">
      {counts.map(([directive, count]) => {
        const dir = getDirective(directive);
        const pct = Math.round((count / total) * 100);
        return (
          <div key={directive} className="flex items-center gap-3">
            <span className={`text-xs w-20 ${dir.text} font-medium`}>{dir.label}</span>
            <div className="flex-1 h-2 bg-[#21262d] rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${dir.bg.replace("18", "60")}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-[#8b949e] w-8 text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function HotspotBar({ hotspots }: { hotspots: Array<{ path: string; count: number }> }) {
  if (hotspots.length === 0) return null;
  const maxCount = Math.max(...hotspots.map((h) => h.count));

  return (
    <div className="space-y-1.5">
      {hotspots.map((h) => (
        <div key={h.path} className="flex items-center gap-3">
          <span className="text-xs mono text-[#c9d1d9] truncate flex-1">{h.path.split("/").slice(-3).join("/")}</span>
          <div className="w-24 h-1.5 bg-[#21262d] rounded-full overflow-hidden shrink-0">
            <div
              className="h-full rounded-full bg-[#d29922]"
              style={{ width: `${Math.round((h.count / maxCount) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-[#8b949e] w-6 text-right shrink-0">{h.count}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────

type FilterTab = "open" | "resolved" | "all";
type DirectiveFilter = string | "all";

function MemoryPage() {
  const { projectKey } = Route.useParams();
  const { data: memory, isLoading } = useProjectMemory(projectKey);
  const [tab, setTab] = useState<FilterTab>("open");
  const [directiveFilter, setDirectiveFilter] = useState<DirectiveFilter>("all");
  const [search, setSearch] = useState("");

  const allFindings = useMemo(() => {
    if (!memory) return [];
    return [...memory.openFindings, ...memory.resolvedFindings];
  }, [memory]);

  const filteredFindings = useMemo(() => {
    let list = allFindings;
    if (tab === "open") list = list.filter((f) => f.status === "open");
    if (tab === "resolved") list = list.filter((f) => f.status !== "open");
    if (directiveFilter !== "all") list = list.filter((f) => f.directive === directiveFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((f) =>
        f.title.toLowerCase().includes(q) ||
        f.targetFiles.some((p) => p.toLowerCase().includes(q)) ||
        (f.notes?.toLowerCase().includes(q) ?? false)
      );
    }
    return list;
  }, [allFindings, tab, directiveFilter, search]);

  const directives = useMemo(() => {
    const set = new Set(allFindings.map((f) => f.directive));
    return Array.from(set).sort();
  }, [allFindings]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#8b949e]">
        <Link to="/" className="hover:text-[#58a6ff]">Home</Link>
        <span>/</span>
        <Link to="/projects/$projectKey" params={{ projectKey }} className="hover:text-[#58a6ff]">
          {projectKey}
        </Link>
        <span>/</span>
        <span className="text-[#e6edf3]">Knowledge Base</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-[#e6edf3]">Knowledge Base</h1>
        <p className="text-[#8b949e] mt-1">
          {memory
            ? `${memory.openFindings.length} open issues tracked across ${memory.hotspots.length} hotspot files`
            : "What AutoClawDev has learned about this project"}
        </p>
      </div>

      <ProjectTabs projectKey={projectKey} activeTab="memory" />

      {isLoading ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl animate-pulse h-64" />
      ) : !memory || memory.totalFindings === 0 ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-12 text-center space-y-4">
          <div className="text-5xl">🧠</div>
          <h2 className="text-xl font-semibold text-[#e6edf3]">No knowledge yet</h2>
          <p className="text-[#8b949e] max-w-md mx-auto">
            AutoClawDev builds a knowledge base as it runs cycles and reviews.
            Each finding, fix, and hotspot is remembered so future runs can be smarter.
          </p>
          <div className="flex gap-3 justify-center">
            <div className="bg-[#0d1117] rounded-lg p-3 inline-block">
              <code className="text-sm text-[#d29922]">autoclaw run {projectKey}</code>
            </div>
            <div className="bg-[#0d1117] rounded-lg p-3 inline-block">
              <code className="text-sm text-[#d29922]">autoclaw memory {projectKey}</code>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Summary card */}
          {memory.summary && (
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
              <p className="text-sm text-[#c9d1d9] leading-relaxed">{memory.summary}</p>
              {memory.updatedAt && (
                <p className="text-xs text-[#484f58] mt-2">
                  Updated {new Date(memory.updatedAt).toLocaleDateString()}
                  {memory.sourceCommit && (
                    <span className="ml-2 mono">@ {memory.sourceCommit.slice(0, 8)}</span>
                  )}
                </p>
              )}
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Open Issues" value={memory.openFindings.length} color="text-[#d29922]" />
            <StatCard label="Resolved" value={memory.resolvedFindings.length} color="text-[#3fb950]" />
            <StatCard label="Hotspot Files" value={memory.hotspots.length} color="text-[#e6edf3]" />
            <StatCard label="Total Tracked" value={memory.totalFindings} color="text-[#e6edf3]" />
          </div>

          {/* Two column: breakdown + hotspots */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Issue breakdown */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
              <h2 className="text-sm font-medium text-[#8b949e] mb-3">Issue Breakdown</h2>
              <DirectiveBar findings={memory.openFindings} />
            </div>

            {/* Hotspots */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
              <h2 className="text-sm font-medium text-[#8b949e] mb-3">
                Hotspot Files
                <span className="text-[#484f58] ml-1">(most frequently touched)</span>
              </h2>
              <HotspotBar hotspots={memory.hotspots} />
              {memory.hotspots.length === 0 && (
                <p className="text-xs text-[#484f58]">No hotspot data yet</p>
              )}
            </div>
          </div>

          {/* Findings list */}
          <div>
            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              {/* Tab pills */}
              <div className="flex gap-1">
                {([
                  { key: "open" as const, label: "Open", count: memory.openFindings.length },
                  { key: "resolved" as const, label: "Resolved", count: memory.resolvedFindings.length },
                  { key: "all" as const, label: "All", count: allFindings.length },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      tab === t.key
                        ? "bg-[#58a6ff] text-white"
                        : "bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3]"
                    }`}
                  >
                    {t.label} ({t.count})
                  </button>
                ))}
              </div>

              {/* Directive filter */}
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setDirectiveFilter("all")}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                    directiveFilter === "all" ? "bg-[#30363d] text-[#e6edf3]" : "text-[#8b949e] hover:text-[#e6edf3]"
                  }`}
                >
                  All types
                </button>
                {directives.map((d) => {
                  const dir = getDirective(d);
                  return (
                    <button
                      key={d}
                      onClick={() => setDirectiveFilter(d)}
                      className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                        directiveFilter === d ? `${dir.bg} ${dir.text}` : "text-[#8b949e] hover:text-[#e6edf3]"
                      }`}
                    >
                      {dir.label}
                    </button>
                  );
                })}
              </div>

              {/* Search */}
              <input
                type="text"
                placeholder="Search findings..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ml-auto bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-sm text-[#e6edf3] placeholder-[#484f58] w-48 focus:border-[#58a6ff] focus:outline-none"
              />
            </div>

            {/* Results count */}
            <div className="text-xs text-[#484f58] mb-3">
              Showing {filteredFindings.length} of {allFindings.length} findings
            </div>

            {/* Findings */}
            {filteredFindings.length > 0 ? (
              <div className="space-y-2">
                {filteredFindings.map((f, i) => (
                  <FindingCard key={i} finding={f} />
                ))}
              </div>
            ) : (
              <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-8 text-center">
                <p className="text-[#8b949e]">No findings match your filters</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
