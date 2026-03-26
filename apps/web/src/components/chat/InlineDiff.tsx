import { useMemo } from "react";
import { cn } from "@/lib/cn";

interface InlineDiffProps {
  oldContent: string;
  newContent: string;
}

type DiffRow =
  | { type: "same"; oldLine: string; newLine: string; oldNumber: number; newNumber: number }
  | { type: "remove"; oldLine: string; oldNumber: number }
  | { type: "add"; newLine: string; newNumber: number };

const MAX_VISIBLE_ROWS = 160;

export function InlineDiff({ oldContent, newContent }: InlineDiffProps) {
  const rows = useMemo(() => buildLineDiff(oldContent, newContent), [newContent, oldContent]);
  const visibleRows = rows.slice(0, MAX_VISIBLE_ROWS);
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#30363d] bg-[#0b0f14]">
      <div className="grid grid-cols-2 border-b border-[#21262d] bg-[#11161d] text-[11px] uppercase tracking-[0.14em] text-[#8b949e]">
        <div className="border-r border-[#21262d] px-3 py-2">Before</div>
        <div className="px-3 py-2">After</div>
      </div>
      <div className="grid grid-cols-2 text-[12px] font-mono">
        <div className="border-r border-[#21262d]">
          {visibleRows.map((row, index) => (
            <DiffCell
              key={`old:${index}`}
              tone={row.type === "remove" ? "remove" : row.type === "same" ? "same" : "empty"}
              lineNumber={row.type === "add" ? null : row.oldNumber}
              text={row.type === "add" ? "" : row.oldLine}
            />
          ))}
        </div>
        <div>
          {visibleRows.map((row, index) => (
            <DiffCell
              key={`new:${index}`}
              tone={row.type === "add" ? "add" : row.type === "same" ? "same" : "empty"}
              lineNumber={row.type === "remove" ? null : row.newNumber}
              text={row.type === "remove" ? "" : row.newLine}
            />
          ))}
        </div>
      </div>
      {hiddenCount > 0 ? (
        <div className="border-t border-[#21262d] px-3 py-2 text-xs text-[#8b949e]">
          {hiddenCount} more diff line{hiddenCount === 1 ? "" : "s"} hidden.
        </div>
      ) : null}
    </div>
  );
}

function DiffCell({
  lineNumber,
  text,
  tone,
}: {
  lineNumber: number | null;
  text: string;
  tone: "same" | "add" | "remove" | "empty";
}) {
  return (
    <div
      className={cn(
        "grid min-h-7 grid-cols-[3rem_minmax(0,1fr)] border-b border-[#161b22]",
        tone === "add" && "bg-[#0f2418] text-[#c8facc]",
        tone === "remove" && "bg-[#281419] text-[#ffd8d6]",
        tone === "same" && "bg-transparent text-[#c9d1d9]",
        tone === "empty" && "bg-[#0b0f14] text-[#6e7681]",
      )}
    >
      <div className="border-r border-[#161b22] px-2 py-1 text-right text-[#6e7681]">
        {lineNumber ?? ""}
      </div>
      <pre className="overflow-x-auto px-3 py-1 whitespace-pre-wrap break-all">{text || " "}</pre>
    </div>
  );
}

function buildLineDiff(oldContent: string, newContent: string): DiffRow[] {
  const oldLines = oldContent.split(/\r?\n/);
  const newLines = newContent.split(/\r?\n/);
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  const table = Array.from({ length: oldCount + 1 }, () =>
    Array<number>(newCount + 1).fill(0),
  );

  for (let oldIndex = oldCount - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newCount - 1; newIndex >= 0; newIndex -= 1) {
      if (oldLines[oldIndex] === newLines[newIndex]) {
        table[oldIndex]![newIndex] = (table[oldIndex + 1]?.[newIndex + 1] ?? 0) + 1;
      } else {
        table[oldIndex]![newIndex] = Math.max(
          table[oldIndex + 1]?.[newIndex] ?? 0,
          table[oldIndex]?.[newIndex + 1] ?? 0,
        );
      }
    }
  }

  const rows: DiffRow[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldCount && newIndex < newCount) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      rows.push({
        type: "same",
        oldLine: oldLines[oldIndex] ?? "",
        newLine: newLines[newIndex] ?? "",
        oldNumber: oldIndex + 1,
        newNumber: newIndex + 1,
      });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if ((table[oldIndex + 1]?.[newIndex] ?? 0) >= (table[oldIndex]?.[newIndex + 1] ?? 0)) {
      rows.push({
        type: "remove",
        oldLine: oldLines[oldIndex] ?? "",
        oldNumber: oldIndex + 1,
      });
      oldIndex += 1;
      continue;
    }

    rows.push({
      type: "add",
      newLine: newLines[newIndex] ?? "",
      newNumber: newIndex + 1,
    });
    newIndex += 1;
  }

  while (oldIndex < oldCount) {
    rows.push({
      type: "remove",
      oldLine: oldLines[oldIndex] ?? "",
      oldNumber: oldIndex + 1,
    });
    oldIndex += 1;
  }

  while (newIndex < newCount) {
    rows.push({
      type: "add",
      newLine: newLines[newIndex] ?? "",
      newNumber: newIndex + 1,
    });
    newIndex += 1;
  }

  return rows;
}
