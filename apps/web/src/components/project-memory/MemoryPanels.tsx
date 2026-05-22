import { useMemo, useState } from "react";
import type { MemoryFinding, ProjectMemory } from "@autoclawdev/types";

const directiveStyle: Record<string, { bg: string; text: string; label: string }> = {
  "bug-fix": { bg: "bg-[#f8514918]", text: "text-[#ff7b72]", label: "Bug Fix" },
  security: { bg: "bg-[#f8514918]", text: "text-[#ff7b72]", label: "Security" },
  performance: { bg: "bg-[#d2992218]", text: "text-[#d29922]", label: "Performance" },
  feature: { bg: "bg-[#1f6feb18]", text: "text-[#58a6ff]", label: "Feature" },
  refactor: { bg: "bg-[#8b949e18]", text: "text-[#8b949e]", label: "Refactor" },
};

const domainStyle: Record<string, { text: string; label: string }> = {
  backend: { text: "text-[#d2a8ff]", label: "Backend" },
  frontend: { text: "text-[#79c0ff]", label: "Frontend" },
  unknown: { text: "text-[#8b949e]", label: "General" },
};

export function MemorySummaryCard({ memory }: { memory: ProjectMemory }) {
  if (!memory.summary) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
      <p className="text-sm leading-relaxed text-[#c9d1d9]">{memory.summary}</p>
      {memory.updatedAt ? (
        <p className="mt-2 text-xs text-[#484f58]">
          Updated {new Date(memory.updatedAt).toLocaleDateString()}
          {memory.sourceCommit ? <span className="mono ml-2">@ {memory.sourceCommit.slice(0, 8)}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

export function MemoryStatGrid({ memory }: { memory: ProjectMemory }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <MemoryStatCard label="Open Issues" value={memory.openFindings.length} color="text-[#d29922]" />
      <MemoryStatCard label="Resolved" value={memory.resolvedFindings.length} color="text-[#3fb950]" />
      <MemoryStatCard label="Hotspot Files" value={memory.hotspots.length} color="text-[#e6edf3]" />
      <MemoryStatCard label="Total Tracked" value={memory.totalFindings} color="text-[#e6edf3]" />
    </div>
  );
}

export function MemoryInsightPanels({ memory }: { memory: ProjectMemory }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
        <h2 className="mb-3 text-sm font-medium text-[#8b949e]">Issue Breakdown</h2>
        <DirectiveBar findings={memory.openFindings} />
      </div>

      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
        <h2 className="mb-3 text-sm font-medium text-[#8b949e]">
          Hotspot Files
          <span className="ml-1 text-[#484f58]">(most frequently touched)</span>
        </h2>
        <HotspotBar hotspots={memory.hotspots} />
        {memory.hotspots.length === 0 ? <p className="text-xs text-[#484f58]">No hotspot data yet</p> : null}
      </div>
    </div>
  );
}

export function MemoryFilterBar({
  tab,
  directiveFilter,
  directives,
  openCount,
  resolvedCount,
  totalCount,
  search,
  onTabChange,
  onDirectiveFilterChange,
  onSearchChange,
}: {
  tab: "open" | "resolved" | "all";
  directiveFilter: string | "all";
  directives: string[];
  openCount: number;
  resolvedCount: number;
  totalCount: number;
  search: string;
  onTabChange: (tab: "open" | "resolved" | "all") => void;
  onDirectiveFilterChange: (directive: string | "all") => void;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row">
      <div className="flex gap-1">
        {[
          { key: "open" as const, label: "Open", count: openCount },
          { key: "resolved" as const, label: "Resolved", count: resolvedCount },
          { key: "all" as const, label: "All", count: totalCount },
        ].map((tabOption) => (
          <button
            key={tabOption.key}
            type="button"
            onClick={() => onTabChange(tabOption.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === tabOption.key
                ? "bg-[#58a6ff] text-white"
                : "bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3]"
            }`}
          >
            {tabOption.label} ({tabOption.count})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onDirectiveFilterChange("all")}
          className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
            directiveFilter === "all"
              ? "bg-[#30363d] text-[#e6edf3]"
              : "text-[#8b949e] hover:text-[#e6edf3]"
          }`}
        >
          All types
        </button>
        {directives.map((directive) => {
          const config = getDirective(directive);
          return (
            <button
              key={directive}
              type="button"
              onClick={() => onDirectiveFilterChange(directive)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                directiveFilter === directive
                  ? `${config.bg} ${config.text}`
                  : "text-[#8b949e] hover:text-[#e6edf3]"
              }`}
            >
              {config.label}
            </button>
          );
        })}
      </div>

      <input
        type="text"
        placeholder="Search findings..."
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className="ml-auto w-48 rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-sm text-[#e6edf3] placeholder-[#484f58] focus:border-[#58a6ff] focus:outline-none"
      />
    </div>
  );
}

export function MemoryFindingsList({ findings }: { findings: MemoryFinding[] }) {
  if (findings.length === 0) {
    return (
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-8 text-center">
        <p className="text-[#8b949e]">No findings match your filters</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {findings.map((finding, index) => (
        <MemoryFindingCard
          key={`${finding.title}-${finding.directive}-${index}`}
          finding={finding}
        />
      ))}
    </div>
  );
}

function MemoryStatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: number | string;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs text-[#8b949e]">{label}</div>
      {sub ? <div className="mt-0.5 text-[10px] text-[#484f58]">{sub}</div> : null}
    </div>
  );
}

function MemoryFindingCard({ finding }: { finding: MemoryFinding }) {
  const [expanded, setExpanded] = useState(false);
  const directive = getDirective(finding.directive);
  const domain = getDomain(finding.domain);

  return (
    <button
      type="button"
      onClick={() => setExpanded((current) => !current)}
      className={`w-full rounded-xl border p-4 text-left transition-all hover:brightness-110 ${
        finding.status === "open"
          ? "border-[#30363d] bg-[#161b22]"
          : "border-[#3fb95020] bg-[#3fb95008]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1 shrink-0 ${finding.status === "open" ? "text-[#d29922]" : "text-[#3fb950]"}`}>
          {finding.status === "open" ? "○" : "✓"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed text-[#e6edf3]">{finding.title}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${directive.bg} ${directive.text}`}>
              {directive.label}
            </span>
            <span className={`text-xs ${domain.text}`}>{domain.label}</span>
            {finding.targetFiles.length > 0 ? (
              <span className="mono text-xs text-[#6e7681]">
                {finding.targetFiles[0].split("/").slice(-2).join("/")}
                {finding.targetFiles.length > 1 ? ` +${finding.targetFiles.length - 1}` : ""}
              </span>
            ) : null}
          </div>
          {expanded ? (
            <div className="mt-3 space-y-2 border-t border-[#30363d] pt-3">
              {finding.targetFiles.length > 0 ? (
                <div>
                  <span className="text-xs uppercase tracking-wider text-[#8b949e]">Files</span>
                  <div className="mt-1 space-y-0.5">
                    {finding.targetFiles.map((file) => (
                      <div key={file} className="mono text-xs text-[#c9d1d9]">{file}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              {finding.notes ? (
                <div>
                  <span className="text-xs uppercase tracking-wider text-[#8b949e]">Notes</span>
                  <p className="mt-1 text-xs text-[#c9d1d9]">{finding.notes}</p>
                </div>
              ) : null}
              <div className="flex gap-4 text-xs text-[#484f58]">
                {finding.firstSeenExp ? <span>First seen: {finding.firstSeenExp}</span> : null}
                {finding.lastSeenExp && finding.lastSeenExp !== finding.firstSeenExp ? (
                  <span>Last seen: {finding.lastSeenExp}</span>
                ) : null}
                {finding.resolutionCommit ? (
                  <span className="mono">Fixed in: {finding.resolutionCommit.slice(0, 8)}</span>
                ) : null}
                {finding.updatedAt ? <span>{new Date(finding.updatedAt).toLocaleDateString()}</span> : null}
              </div>
            </div>
          ) : null}
        </div>
        <span className="mt-1 shrink-0 text-xs text-[#484f58]">{expanded ? "Less" : "More"}</span>
      </div>
    </button>
  );
}

function DirectiveBar({ findings }: { findings: MemoryFinding[] }) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const finding of findings) {
      map[finding.directive] = (map[finding.directive] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [findings]);

  if (counts.length === 0) {
    return null;
  }

  const total = findings.length;

  return (
    <div className="space-y-2">
      {counts.map(([directive, count]) => {
        const config = getDirective(directive);
        const percentage = Math.round((count / total) * 100);
        return (
          <div key={directive} className="flex items-center gap-3">
            <span className={`w-20 text-xs font-medium ${config.text}`}>{config.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#21262d]">
              <div className={`h-full rounded-full ${config.bg.replace("18", "60")}`} style={{ width: `${percentage}%` }} />
            </div>
            <span className="w-8 text-right text-xs text-[#8b949e]">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function HotspotBar({ hotspots }: { hotspots: Array<{ path: string; count: number }> }) {
  if (hotspots.length === 0) {
    return null;
  }

  const maxCount = Math.max(...hotspots.map((hotspot) => hotspot.count));

  return (
    <div className="space-y-1.5">
      {hotspots.map((hotspot) => (
        <div key={hotspot.path} className="flex items-center gap-3">
          <span className="mono flex-1 truncate text-xs text-[#c9d1d9]">
            {hotspot.path.split("/").slice(-3).join("/")}
          </span>
          <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[#21262d]">
            <div
              className="h-full rounded-full bg-[#d29922]"
              style={{ width: `${Math.round((hotspot.count / maxCount) * 100)}%` }}
            />
          </div>
          <span className="w-6 shrink-0 text-right text-xs text-[#8b949e]">{hotspot.count}</span>
        </div>
      ))}
    </div>
  );
}

function getDirective(directive: string) {
  return directiveStyle[directive] || { bg: "bg-[#8b949e18]", text: "text-[#8b949e]", label: directive };
}

function getDomain(domain: string) {
  return domainStyle[domain] || { text: "text-[#8b949e]", label: domain };
}
