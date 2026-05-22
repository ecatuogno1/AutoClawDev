import { Trash2 } from "lucide-react";
import type { ComposerTaskRecord, ComposerTaskStatus } from "@autoclawdev/types";

interface TaskPaneProps {
  task: ComposerTaskRecord;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (
    taskId: string,
    patch: { title?: string; description?: string; status?: ComposerTaskStatus },
  ) => void;
}

export function TaskPane({ task, onDeleteTask, onUpdateTask }: TaskPaneProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0d1117]">
      <div className="border-b border-[#30363d] px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-[#6e7681]">
              Task Title
            </label>
            <input
              value={task.title}
              onChange={(event) => onUpdateTask(task.id, { title: event.target.value })}
              className="w-full rounded-xl border border-[#30363d] bg-[#11161d] px-3 py-2 text-lg font-semibold text-[#e6edf3] outline-none focus:border-[#58a6ff]"
            />
          </div>
          <button
            type="button"
            onClick={() => onDeleteTask(task.id)}
            className="inline-flex items-center gap-2 rounded-xl border border-[#6f2f35] bg-[#221116] px-3 py-2 text-sm text-[#ffb3ad] transition-colors hover:border-[#f85149] hover:text-white"
          >
            <Trash2 className="size-4" />
            Delete
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ["open", "Open"],
            ["in_progress", "In Progress"],
            ["done", "Done"],
          ] as const).map(([status, label]) => (
            <button
              key={status}
              type="button"
              onClick={() => onUpdateTask(task.id, { status })}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                task.status === status
                  ? "border-[#58a6ff] bg-[#1f6feb20] text-[#d7ebff]"
                  : "border-[#30363d] bg-[#11161d] text-[#8b949e] hover:border-[#58a6ff] hover:text-[#e6edf3]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-[#6e7681]">
          Notes
        </label>
        <textarea
          value={task.description}
          onChange={(event) => onUpdateTask(task.id, { description: event.target.value })}
          rows={16}
          className="min-h-[320px] w-full rounded-2xl border border-[#30363d] bg-[#11161d] px-4 py-3 text-sm leading-6 text-[#e6edf3] outline-none focus:border-[#58a6ff]"
          placeholder="Add implementation notes, acceptance criteria, or reminders."
        />
      </div>
    </div>
  );
}
