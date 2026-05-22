import { Plus, SquareCheckBig } from "lucide-react";
import { useEffect, useState } from "react";
import type { ComposerTaskRecord } from "@autoclawdev/types";
import { cn } from "@/lib/cn";

interface TaskShelfDraft {
  title: string;
  description?: string;
  sourceMessageId?: string | null;
}

interface TaskShelfProps {
  draft: TaskShelfDraft | null;
  tasks: ComposerTaskRecord[];
  onCreateTask: (draft: TaskShelfDraft) => void;
  onClearDraft: () => void;
  onOpenTask: (taskId: string) => void;
}

export function TaskShelf({
  draft,
  tasks,
  onCreateTask,
  onClearDraft,
  onOpenTask,
}: TaskShelfProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceMessageId, setSourceMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) {
      return;
    }

    setIsFormOpen(true);
    setTitle(draft.title);
    setDescription(draft.description ?? "");
    setSourceMessageId(draft.sourceMessageId ?? null);
    onClearDraft();
  }, [draft, onClearDraft]);

  const visibleTasks = tasks.filter((task) => task.status !== "done");

  const resetForm = () => {
    setIsFormOpen(false);
    setTitle("");
    setDescription("");
    setSourceMessageId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#e6edf3]">Tasks</p>
          <p className="mt-1 text-xs text-[#8b949e]">
            Open work items for this composer workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsFormOpen(true);
            setSourceMessageId(null);
          }}
          className="inline-flex items-center gap-2 rounded-full border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3]"
        >
          <Plus className="size-3.5" />
          New Task
        </button>
      </div>

      {visibleTasks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {visibleTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onOpenTask(task.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                task.status === "in_progress"
                  ? "border-[#1f6feb66] bg-[#1f6feb20] text-[#d7ebff]"
                  : "border-[#30363d] bg-[#11161d] text-[#8b949e] hover:border-[#58a6ff] hover:text-[#e6edf3]",
              )}
            >
              <SquareCheckBig className="size-3.5" />
              <span className="max-w-52 truncate">{task.title}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#30363d] bg-[#11161d] px-4 py-3 text-sm text-[#8b949e]">
          No open tasks yet. Create one from the composer or start a blank task here.
        </div>
      )}

      {isFormOpen ? (
        <form
          className="rounded-2xl border border-[#30363d] bg-[#11161d] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateTask({
              title,
              description,
              sourceMessageId,
            });
            resetForm();
          }}
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-[#6e7681]">
                Title
              </label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What needs to get done?"
                className="w-full rounded-xl border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#58a6ff]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-[#6e7681]">
                Notes
              </label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Optional task details"
                className="w-full rounded-xl border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3] outline-none focus:border-[#58a6ff]"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-[#30363d] px-3 py-2 text-sm text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={title.trim().length === 0}
                className="rounded-xl bg-[#1f6feb] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#388bfd] disabled:cursor-not-allowed disabled:bg-[#30363d] disabled:text-[#6e7681]"
              >
                Create Task
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
