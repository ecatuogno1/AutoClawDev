import { useState } from "react";
import { ChevronDown, ChevronUp, Diff, TerminalSquare } from "lucide-react";

interface WorkspacePanelProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

type PanelTab = "terminal" | "diff";

export function WorkspacePanel({ collapsed, onToggleCollapsed }: WorkspacePanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("terminal");

  if (collapsed) {
    return (
      <div className="flex h-full items-center justify-between px-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-[#64748b]">
          <TerminalSquare className="h-3.5 w-3.5" />
          Bottom Panel
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="inline-flex items-center gap-2 rounded-lg border border-[#243041] bg-[#0f172a] px-3 py-1.5 text-xs font-medium text-[#cbd5e1] transition hover:border-[#3b82f6] hover:text-white"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          Expand
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-[#243041] px-4 py-2.5">
        <div className="flex items-center gap-2">
          {[
            { id: "terminal" as const, label: "Terminal", icon: TerminalSquare },
            { id: "diff" as const, label: "Diff", icon: Diff },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? "border-[#3b82f6] bg-[#172554] text-white"
                    : "border-[#243041] bg-[#0f172a] text-[#94a3b8] hover:border-[#3b82f6] hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onToggleCollapsed}
          className="inline-flex items-center gap-2 rounded-lg border border-[#243041] bg-[#0f172a] px-3 py-1.5 text-xs font-medium text-[#cbd5e1] transition hover:border-[#3b82f6] hover:text-white"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Collapse
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {activeTab === "terminal" ? (
          <div className="grid h-full min-h-[8rem] gap-3 md:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-[#243041] bg-[#020617] p-4 shadow-[inset_0_1px_0_rgba(148,163,184,0.08)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#64748b]">
                Terminal Deck
              </p>
              <div className="mt-4 rounded-xl border border-[#1f2937] bg-[#050b16] p-4 font-mono text-xs leading-6 text-[#93c5fd]">
                <div>$ autoclaw status</div>
                <div className="text-[#64748b]">Terminal transport arrives in Phase 3.</div>
                <div className="text-[#22c55e]">Panel shell and resize behavior are ready.</div>
              </div>
            </div>
            <div className="rounded-2xl border border-[#243041] bg-[#0b1324] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#64748b]">
                Next Hooks
              </p>
              <div className="mt-4 space-y-2 text-sm text-[#94a3b8]">
                <p>WebSocket terminal tab strip</p>
                <p>Fit-to-panel xterm sizing</p>
                <p>Per-project working directory</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid h-full min-h-[8rem] gap-3 md:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-2xl border border-[#243041] bg-[#0b1324] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#64748b]">
                Diff Staging
              </p>
              <div className="mt-4 space-y-3 text-sm text-[#94a3b8]">
                <p>Phase 5 plugs the diff viewer and git actions into this panel.</p>
                <p>The shell already supports persistence, collapse, and resize.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-dashed border-[#334155] bg-[#050b16] p-4 font-mono text-xs leading-6 text-[#cbd5e1]">
              <div className="text-[#ef4444]">- old.tsx</div>
              <div className="text-[#22c55e]">+ workspace.tsx</div>
              <div className="text-[#64748b]">@@ IDE shell preview @@</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
