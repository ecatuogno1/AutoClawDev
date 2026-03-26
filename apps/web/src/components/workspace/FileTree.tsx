import { useWorkspaceFiles } from "@/lib/api";

interface FileTreeProps {
  projectKey: string;
  selectedFile: string | null;
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
}

export function FileTree(props: FileTreeProps) {
  const { data, isLoading, isError } = useWorkspaceFiles(props.projectKey);

  if (isLoading) {
    return (
      <div className="px-3 py-4 text-sm text-[#8b949e]">
        Loading files...
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
      <div className="mb-2 px-2 text-[11px] uppercase tracking-[0.18em] text-[#6e7681]">
        Project Files
      </div>
      <TreeLevel
        depth={0}
        entries={data.entries}
        projectKey={props.projectKey}
        selectedFile={props.selectedFile}
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
  expandedDirs,
  onSelectFile,
  onToggleDir,
  projectKey,
  selectedFile,
}: {
  depth: number;
  entries: NonNullable<ReturnType<typeof useWorkspaceFiles>["data"]>["entries"];
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
  projectKey: string;
  selectedFile: string | null;
}) {
  return (
    <div className="space-y-1">
      {entries.map((entry) =>
        entry.type === "directory" ? (
          <DirectoryNode
            key={entry.path}
            depth={depth}
            expandedDirs={expandedDirs}
            entry={entry}
            onSelectFile={onSelectFile}
            onToggleDir={onToggleDir}
            projectKey={projectKey}
            selectedFile={selectedFile}
          />
        ) : (
          <FileNode
            key={entry.path}
            depth={depth}
            isActive={selectedFile === entry.path}
            name={entry.name}
            path={entry.path}
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
  expandedDirs,
  onSelectFile,
  onToggleDir,
  projectKey,
  selectedFile,
}: {
  depth: number;
  entry: NonNullable<ReturnType<typeof useWorkspaceFiles>["data"]>["entries"][number];
  expandedDirs: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
  projectKey: string;
  selectedFile: string | null;
}) {
  const isExpanded = expandedDirs.has(entry.path);
  const { data, isLoading, isError } = useWorkspaceFiles(
    projectKey,
    entry.path,
    isExpanded,
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggleDir(entry.path)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[#c9d1d9] hover:bg-[#161b22]"
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <span className="w-4 shrink-0 text-center text-[#8b949e]">
          {isExpanded ? "▾" : "▸"}
        </span>
        <span className="shrink-0">{isExpanded ? "📂" : "📁"}</span>
        <span className="truncate">{entry.name}</span>
      </button>

      {isExpanded && (
        <div className="mt-1">
          {isLoading && (
            <div
              className="px-2 py-1 text-xs text-[#6e7681]"
              style={{ paddingLeft: `${(depth + 1) * 14 + 28}px` }}
            >
              Loading...
            </div>
          )}
          {isError && (
            <div
              className="px-2 py-1 text-xs text-[#f85149]"
              style={{ paddingLeft: `${(depth + 1) * 14 + 28}px` }}
            >
              Unable to load directory.
            </div>
          )}
          {data && data.entries.length === 0 && (
            <div
              className="px-2 py-1 text-xs text-[#6e7681]"
              style={{ paddingLeft: `${(depth + 1) * 14 + 28}px` }}
            >
              Empty directory
            </div>
          )}
          {data && data.entries.length > 0 && (
            <TreeLevel
              depth={depth + 1}
              entries={data.entries}
              projectKey={projectKey}
              selectedFile={selectedFile}
              expandedDirs={expandedDirs}
              onSelectFile={onSelectFile}
              onToggleDir={onToggleDir}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FileNode({
  depth,
  isActive,
  name,
  onSelectFile,
  path,
}: {
  depth: number;
  isActive: boolean;
  name: string;
  onSelectFile: (path: string) => void;
  path: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectFile(path)}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
        isActive
          ? "bg-[#1f6feb20] text-[#e6edf3]"
          : "text-[#c9d1d9] hover:bg-[#161b22]"
      }`}
      style={{ paddingLeft: `${depth * 14 + 28}px` }}
      title={path}
    >
      <span className="shrink-0">📄</span>
      <span className="truncate">{name}</span>
    </button>
  );
}
