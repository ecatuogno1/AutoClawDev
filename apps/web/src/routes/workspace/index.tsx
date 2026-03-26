import { createFileRoute } from "@tanstack/react-router";
import { Blocks, FileCode2, LayoutPanelTop, Sparkles } from "lucide-react";
import { useWorkspaceLayoutContext } from "@/components/workspace/WorkspaceLayout";

export const Route = createFileRoute("/workspace/")({
  component: WorkspaceIndexRoute,
});

function WorkspaceIndexRoute() {
  const { provider, selectedProject } = useWorkspaceLayoutContext();

  return (
    <div className="grid h-full min-h-0 overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(29,78,216,0.16),transparent_28%),linear-gradient(180deg,#0b1220_0%,#08101b_100%)]">
      <div className="min-h-0 overflow-auto px-5 py-5 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <section className="relative overflow-hidden rounded-[28px] border border-[#243041] bg-[#0f172a]/72 p-6 shadow-[0_20px_80px_rgba(2,6,23,0.34)]">
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#1d4ed8]/20 blur-3xl" />
            <div className="relative max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#64748b]">
                Phase 1
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#f8fafc]">
                Workspace layout shell is live.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#94a3b8]">
                The route now behaves like an IDE canvas: resizable explorer, full-height editor stage, and a persistent bottom utility panel ready for files, terminals, and diffs.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {[
                  selectedProject?.name ?? "No project selected",
                  provider === "codex" ? "Codex active" : "Claude active",
                  "Phase 2: file explorer",
                ].map((pill) => (
                  <span
                    key={pill}
                    className="rounded-full border border-[#334155] bg-[#111827] px-3 py-1 text-xs font-medium text-[#cbd5e1]"
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[24px] border border-[#243041] bg-[#0b1324] p-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#64748b]">
                <LayoutPanelTop className="h-4 w-4" />
                Editor Stage
              </div>
              <div className="mt-4 rounded-[20px] border border-dashed border-[#334155] bg-[#09111f] p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-[#f8fafc]">
                  <FileCode2 className="h-4 w-4 text-[#60a5fa]" />
                  Ready for file tabs and code preview
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#94a3b8]">
                  This is intentionally a shell in Phase 1. The layout, chrome, and persistence are in place so Phase 2 can drop in the tree and viewer without reworking the route structure.
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-[#243041] bg-[#0f172a] p-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#64748b]">
                <Sparkles className="h-4 w-4" />
                What Works Now
              </div>
              <div className="mt-4 space-y-3">
                {[
                  "Drag the left splitter to resize the explorer.",
                  "Drag the horizontal splitter to resize the bottom panel.",
                  "Double-click either splitter to restore the default size.",
                  "Pane state persists in localStorage across reloads.",
                  "The explorer auto-collapses below tablet width.",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-2xl border border-[#243041] bg-[#111827]/75 px-4 py-3 text-sm text-[#cbd5e1]"
                  >
                    <Blocks className="mt-0.5 h-4 w-4 shrink-0 text-[#60a5fa]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
