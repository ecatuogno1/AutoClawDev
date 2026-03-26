import { ChevronRight, FileText, Folder, FolderOpen, LoaderCircle } from "lucide-react";
import { useFileTree } from "@/lib/api";
import { cn } from "@/lib/cn";
import { getFileIcon } from "@/components/workspace/filePresentation";

interface FileTreeProps {
  projectKey: string;
  activeFile: string | null;
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
}

export function FileTree(props: FileTreeProps) {
  const { data, isLoading, isError } = useFileTree(props.projectKey);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-sm text-[#8b949e]">
        <LoaderCircle className="size-4 animate-spin" />
        <span>Loading files...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-3 py-4 text-sm text-[#f85149]">
        Unable to load project files.
      </div>
    );
  }

  if (data.entries.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-[#8b949e]">
        No files available.
      </div>
    );
  }

  return (
    <div className="px-2 py-3">
      <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#6e7681]">
        Project Files
      </div>
      <TreeLevel
        depth={0}
        entries={data.entries}
        projectKey={props.projectKey}
        activeFile={props.activeFile}
        expandedDirs={props.expandedDirs}
        onSelectFile={props.onSelectFile}
        onToggleDir={props.onToggleDir}
      />
    </div>
  );
}

function TreeLevel({
  depth,
  entries,
  activeFile,
  expandedDirs,
  onSelectFile,
  onToggleDir,
  projectKey,
}: {
  depth: number;
  entries: NonNullable<ReturnType<typeof useFileTree>["data"]>["entries"];
  activeFile: string | null;
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
  projectKey: string;
}) {
  return (
    <div className="space-y-0.5">
      {entries.map((entry) =>
        entry.type === "directory" ? (
          <DirectoryNode
            key={entry.path}
            depth={depth}
            entry={entry}
            activeFile={activeFile}
            expandedDirs={expandedDirs}
            onSelectFile={onSelectFile}
            onToggleDir={onToggleDir}
            projectKey={projectKey}
          />
        ) : (
          <FileNode
            key={entry.path}
            depth={depth}
            entry={entry}
            isActive={activeFile === entry.path}
            onSelectFile={onSelectFile}
          />
        ),
      )}
    </div>
  );
}

function DirectoryNode({
  depth,
  entry,
  activeFile,
  expandedDirs,
  onSelectFile,
  onToggleDir,
  projectKey,
}: {
  depth: number;
  entry: NonNullable<ReturnType<typeof useFileTree>["data"]>["entries"][number];
  activeFile: string | null;
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
  projectKey: string;
}) {
  const isExpanded = expandedDirs.has(entry.path);
  const { data, isLoading, isError } = useFileTree(projectKey, entry.path, isExpanded);

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggleDir(entry.path)}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm text-[#c9d1d9] transition-colors hover:bg-[#161b22]",
          activeFile?.startsWith(`${entry.path}/`) && "bg-[#161b22]/80",
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-[#6e7681] transition-transform group-hover:text-[#8b949e]",
            isExpanded && "rotate-90",
          )}
        />
        {isExpanded ? (
          <FolderOpen className="size-4 shrink-0 text-[#58a6ff]" />
        ) : (
          <Folder className="size-4 shrink-0 text-[#8b949e]" />
        )}
        <span className="truncate">{entry.name}</span>
      </button>

      {isExpanded ? (
        <div className="mt-0.5">
          {isLoading ? (
            <LoadingNode depth={depth + 1} label="Loading directory..." />
          ) : null}
          {isError ? (
            <LoadingNode depth={depth + 1} label="Unable to load directory." error />
          ) : null}
          {data && data.entries.length === 0 ? (
            <LoadingNode depth={depth + 1} label="Empty directory" />
          ) : null}
          {data && data.entries.length > 0 ? (
            <TreeLevel
              depth={depth + 1}
              entries={data.entries}
              projectKey={projectKey}
              activeFile={activeFile}
              expandedDirs={expandedDirs}
              onSelectFile={onSelectFile}
              onToggleDir={onToggleDir}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FileNode({
  depth,
  entry,
  isActive,
  onSelectFile,
}: {
  depth: number;
  entry: NonNullable<ReturnType<typeof useFileTree>["data"]>["entries"][number];
  isActive: boolean;
  onSelectFile: (path: string) => void;
}) {
  const Icon = getFileIcon(entry.path, entry.language);

  return (
    <button
      type="button"
      onClick={() => onSelectFile(entry.path)}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm transition-colors",
        isActive
          ? "bg-[#1f6feb20] text-[#e6edf3]"
          : "text-[#c9d1d9] hover:bg-[#161b22]",
      )}
      style={{ paddingLeft: `${depth * 14 + 28}px` }}
      title={entry.path}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-[#8b949e]">
        <Icon className="size-4" />
      </span>
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

function LoadingNode({
  depth,
  label,
  error = false,
}: {
  depth: number;
  label: string;
  error?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 py-1 text-xs",
        error ? "text-[#f85149]" : "text-[#6e7681]",
      )}
      style={{ paddingLeft: `${depth * 14 + 28}px` }}
    >
      <FileText className="size-3.5 shrink-0" />
      <span>{label}</span>
    </div>
  );
}
