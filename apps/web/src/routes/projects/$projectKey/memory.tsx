import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  MemoryFilterBar,
  MemoryFindingsList,
  MemoryInsightPanels,
  MemoryStatGrid,
  MemorySummaryCard,
} from "@/components/project-memory/MemoryPanels";
import { useProjectMemory } from "@/lib/api";

export const Route = createFileRoute("/projects/$projectKey/memory")({
  component: MemoryPageRoute,
});

function MemoryPageRoute() {
  const { projectKey } = Route.useParams();
  return <ProjectMemoryPane projectKey={projectKey} />;
}

type FilterTab = "open" | "resolved" | "all";
type DirectiveFilter = string | "all";

export function ProjectMemoryPane({ projectKey }: { projectKey: string }) {
  const { data: memory, isLoading } = useProjectMemory(projectKey);
  const [tab, setTab] = useState<FilterTab>("open");
  const [directiveFilter, setDirectiveFilter] = useState<DirectiveFilter>("all");
  const [search, setSearch] = useState("");

  const allFindings = useMemo(
    () => (memory ? [...memory.openFindings, ...memory.resolvedFindings] : []),
    [memory],
  );

  const filteredFindings = useMemo(() => {
    let findings = allFindings;

    if (tab === "open") {
      findings = findings.filter((finding) => finding.status === "open");
    }
    if (tab === "resolved") {
      findings = findings.filter((finding) => finding.status !== "open");
    }
    if (directiveFilter !== "all") {
      findings = findings.filter((finding) => finding.directive === directiveFilter);
    }
    if (search.trim()) {
      const query = search.toLowerCase();
      findings = findings.filter(
        (finding) =>
          finding.title.toLowerCase().includes(query) ||
          finding.targetFiles.some((path) => path.toLowerCase().includes(query)) ||
          (finding.notes?.toLowerCase().includes(query) ?? false),
      );
    }

    return findings;
  }, [allFindings, directiveFilter, search, tab]);

  const directives = useMemo(() => {
    const directiveSet = new Set(allFindings.map((finding) => finding.directive));
    return Array.from(directiveSet).sort();
  }, [allFindings]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-[#e6edf3]">Knowledge Base</h1>
        <p className="mt-1 text-[#8b949e]">
          {memory
            ? `${memory.openFindings.length} open issues tracked across ${memory.hotspots.length} hotspot files`
            : "What AutoClawDev has learned about this project"}
        </p>
      </div>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-xl border border-[#30363d] bg-[#161b22]" />
      ) : !memory || memory.totalFindings === 0 ? (
        <div className="space-y-4 rounded-xl border border-[#30363d] bg-[#161b22] p-12 text-center">
          <div className="text-5xl">🧠</div>
          <h2 className="text-xl font-semibold text-[#e6edf3]">No knowledge yet</h2>
          <p className="mx-auto max-w-md text-[#8b949e]">
            AutoClawDev builds a knowledge base as it runs cycles and reviews. Each finding, fix, and hotspot is
            remembered so future runs can be smarter.
          </p>
          <div className="flex justify-center gap-3">
            <div className="inline-block rounded-lg bg-[#0d1117] p-3">
              <code className="text-sm text-[#d29922]">autoclaw run {projectKey}</code>
            </div>
            <div className="inline-block rounded-lg bg-[#0d1117] p-3">
              <code className="text-sm text-[#d29922]">autoclaw memory {projectKey}</code>
            </div>
          </div>
        </div>
      ) : (
        <>
          <MemorySummaryCard memory={memory} />
          <MemoryStatGrid memory={memory} />
          <MemoryInsightPanels memory={memory} />

          <div>
            <MemoryFilterBar
              tab={tab}
              directiveFilter={directiveFilter}
              directives={directives}
              openCount={memory.openFindings.length}
              resolvedCount={memory.resolvedFindings.length}
              totalCount={allFindings.length}
              search={search}
              onTabChange={setTab}
              onDirectiveFilterChange={setDirectiveFilter}
              onSearchChange={setSearch}
            />
            <div className="mb-3 text-xs text-[#484f58]">
              Showing {filteredFindings.length} of {allFindings.length} findings
            </div>
            <MemoryFindingsList findings={filteredFindings} />
          </div>
        </>
      )}
    </div>
  );
}
