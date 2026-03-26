import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileCode2, LoaderCircle, PanelTopOpen, X } from "lucide-react";
import { useFileContent } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  basenameOf,
  formatBytes,
  getFileIcon,
  getLanguageLabel,
} from "@/components/workspace/filePresentation";

interface CodeViewerProps {
  projectKey: string;
  openFiles: readonly string[];
  activeFile: WorkspaceFileTarget | null;
  onSelectFile: (path: string) => void;
  onCloseFile: (path: string) => void;
}

export interface WorkspaceFileTarget {
  path: string;
  line?: number | null;
}

const LINE_HEIGHT = 22;
const KEYWORD_LANGUAGES = new Set([
  "bash",
  "c",
  "cpp",
  "css",
  "go",
  "graphql",
  "html",
  "java",
  "javascript",
  "json",
  "kotlin",
  "python",
  "ruby",
  "rust",
  "sql",
  "swift",
  "toml",
  "typescript",
  "vue",
  "xml",
  "yaml",
]);

export function CodeViewer(props: CodeViewerProps) {
  const activePath = props.activeFile?.path ?? null;
  const contentQuery = useFileContent(props.projectKey, activePath);
  const deferredContent = useDeferredValue(contentQuery.data?.content ?? "");
  const lineTarget = props.activeFile?.line ?? null;
  const viewerRef = useRef<HTMLDivElement | null>(null);

  const lines = useMemo(() => splitLines(deferredContent), [deferredContent]);
  const lineNumberWidth = Math.max(2, String(lines.length).length);
  const rowVirtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => viewerRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 18,
  });

  useEffect(() => {
    if (!lineTarget || !activePath) {
      return;
    }
    rowVirtualizer.scrollToIndex(Math.max(0, lineTarget - 1), {
      align: "center",
    });
  }, [activePath, lineTarget, rowVirtualizer]);

  if (props.openFiles.length === 0 || !activePath) {
    return (
      <div className="flex h-full min-h-[380px] items-center justify-center px-8 py-12">
        <div className="max-w-md rounded-2xl border border-dashed border-[#30363d] bg-[#161b22]/60 px-8 py-10 text-center">
          <PanelTopOpen className="mx-auto size-10 text-[#58a6ff]" />
          <div className="mt-4 text-xl font-semibold text-[#e6edf3]">
            Select a file to view
          </div>
          <p className="mt-2 text-sm text-[#8b949e]">
            Open a file from the tree to inspect source, switch between tabs, and jump to a line.
          </p>
        </div>
      </div>
    );
  }

  const metadata = contentQuery.data;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0d1117]">
      <div className="border-b border-[#30363d] bg-[#010409]/85">
        <div className="flex min-w-0 items-center overflow-x-auto">
          {props.openFiles.map((path) => {
            const isActive = path === activePath;
            const Icon = getFileIcon(path, isActive ? metadata?.language : undefined);
            const label = basenameOf(path);
            return (
              <div
                key={path}
                className={cn(
                  "group flex shrink-0 items-center border-r border-[#30363d] text-sm transition-colors",
                  isActive
                    ? "bg-[#161b22] text-[#e6edf3]"
                    : "bg-[#010409]/85 text-[#8b949e] hover:bg-[#161b22]/80 hover:text-[#c9d1d9]",
                )}
              >
                <button
                  type="button"
                  onClick={() => props.onSelectFile(path)}
                  className="flex min-w-0 items-center gap-2 px-3 py-2"
                  title={path}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="max-w-44 truncate">{label}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Close ${label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onCloseFile(path);
                  }}
                  className="mr-2 rounded p-0.5 text-[#6e7681] transition-colors group-hover:text-[#8b949e] hover:bg-[#30363d] hover:text-[#e6edf3]"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-2 text-xs text-[#8b949e]">
          <div className="min-w-0 truncate">{activePath}</div>
          <div className="shrink-0">
            {lineTarget ? `Line ${lineTarget}` : "Ready"}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {contentQuery.isLoading ? (
          <StatePanel
            icon={<LoaderCircle className="size-8 animate-spin text-[#58a6ff]" />}
            title="Loading file"
            description={`Fetching ${activePath}`}
          />
        ) : contentQuery.isError ? (
          <StatePanel
            icon={<FileCode2 className="size-8 text-[#f85149]" />}
            title="Unable to open file"
            description={`The workspace API could not read ${activePath}.`}
          />
        ) : metadata ? (
          <div ref={viewerRef} className="h-full overflow-auto">
            <div
              className="relative min-w-max"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((row) => {
                const lineNumber = row.index + 1;
                const lineText = lines[row.index] ?? "";
                const highlighted = lineTarget === lineNumber;
                return (
                  <div
                    key={row.key}
                    className={cn(
                      "absolute left-0 flex w-full min-w-max border-b border-[#161b22] font-mono text-[12px] text-[#c9d1d9]",
                      highlighted && "bg-[#1f6feb20]",
                    )}
                    style={{
                      height: `${row.size}px`,
                      transform: `translateY(${row.start}px)`,
                    }}
                  >
                    <div
                      className={cn(
                        "sticky left-0 z-10 shrink-0 select-none border-r border-[#30363d] bg-[#010409] px-3 text-right leading-[22px] text-[#6e7681]",
                        highlighted && "bg-[#0d1117] text-[#8b949e]",
                      )}
                      style={{ width: `${lineNumberWidth + 3}ch` }}
                    >
                      {lineNumber}
                    </div>
                    <pre className="min-w-max px-4 leading-[22px] whitespace-pre">
                      {renderHighlightedLine(lineText, metadata.language)}
                    </pre>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 border-t border-[#30363d] bg-[#010409] px-4 py-2 text-xs text-[#8b949e]">
        <span>{getLanguageLabel(metadata?.language)}</span>
        <span className="text-[#30363d]">|</span>
        <span>{formatBytes(metadata?.size)}</span>
        <span className="text-[#30363d]">|</span>
        <span>{lines.length} lines</span>
      </div>
    </div>
  );
}

function StatePanel({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full items-center justify-center px-8 py-12">
      <div className="max-w-md rounded-2xl border border-[#30363d] bg-[#161b22] px-8 py-10 text-center">
        <div className="mx-auto flex justify-center">{icon}</div>
        <div className="mt-4 text-lg font-semibold text-[#e6edf3]">{title}</div>
        <p className="mt-2 break-all text-sm text-[#8b949e]">{description}</p>
      </div>
    </div>
  );
}

function splitLines(source: string) {
  return source.split(/\r?\n/);
}

function renderHighlightedLine(line: string, language: string) {
  if (line.length === 0) {
    return <span> </span>;
  }

  if (!KEYWORD_LANGUAGES.has(language)) {
    return <span>{line}</span>;
  }

  const tokens = tokenizeLine(line, language);
  if (tokens.length === 1 && tokens[0]?.type === "plain") {
    return <span>{line}</span>;
  }

  return tokens.map((token, index) => (
    <span key={`${token.type}:${index}`} className={TOKEN_CLASS[token.type]}>
      {token.value}
    </span>
  ));
}

type TokenType =
  | "plain"
  | "comment"
  | "string"
  | "keyword"
  | "number"
  | "property"
  | "operator";

interface Token {
  type: TokenType;
  value: string;
}

const TOKEN_CLASS: Record<TokenType, string> = {
  plain: "text-[#c9d1d9]",
  comment: "text-[#8b949e]",
  string: "text-[#a5d6ff]",
  keyword: "text-[#ff7b72]",
  number: "text-[#79c0ff]",
  property: "text-[#d2a8ff]",
  operator: "text-[#f2cc60]",
};

const GENERIC_KEYWORDS = [
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "interface",
  "let",
  "new",
  "null",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "static",
  "switch",
  "throw",
  "true",
  "try",
  "type",
  "undefined",
  "var",
  "while",
];

function tokenizeLine(line: string, language: string): Token[] {
  if (language === "json") {
    return tokenizeJsonLine(line);
  }

  if (language === "markdown") {
    return tokenizeMarkdownLine(line);
  }

  const tokens: Token[] = [];
  const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|#.*$|\/\*.*\*\/|\b\d+(?:\.\d+)?\b|\b(?:async|await|break|case|catch|class|const|continue|default|else|enum|export|extends|false|finally|for|from|function|if|implements|import|in|interface|let|new|null|private|protected|public|readonly|return|static|switch|throw|true|try|type|undefined|var|while)\b|[{}()[\]=<>:+\-*/|&!%]+)/g;
  let lastIndex = 0;

  for (const match of line.matchAll(pattern)) {
    const [value] = match;
    const start = match.index ?? 0;
    if (start > lastIndex) {
      tokens.push({ type: "plain", value: line.slice(lastIndex, start) });
    }

    tokens.push({ type: classifyToken(value, language), value });
    lastIndex = start + value.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ type: "plain", value: line.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: "plain", value: line }];
}

function tokenizeJsonLine(line: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|\b\d+(?:\.\d+)?\b|[{}[\],:])/g;
  let lastIndex = 0;

  for (const match of line.matchAll(pattern)) {
    const [value] = match;
    const start = match.index ?? 0;
    if (start > lastIndex) {
      tokens.push({ type: "plain", value: line.slice(lastIndex, start) });
    }

    const nextNonWhitespaceCharacter = line.slice(start + value.length).trimStart()[0];
    tokens.push({
      type: value.startsWith('"') && nextNonWhitespaceCharacter === ":"
        ? "property"
        : classifyJsonToken(value),
      value,
    });
    lastIndex = start + value.length;
  }

  if (lastIndex < line.length) {
    tokens.push({ type: "plain", value: line.slice(lastIndex) });
  }

  return tokens.length > 0 ? tokens : [{ type: "plain", value: line }];
}

function tokenizeMarkdownLine(line: string): Token[] {
  const trimmed = line.trimStart();

  if (/^#{1,6}\s/.test(trimmed)) {
    return [{ type: "keyword", value: line }];
  }
  if (/^>/.test(trimmed)) {
    return [{ type: "comment", value: line }];
  }
  if (/^(```|~~~)/.test(trimmed)) {
    return [{ type: "operator", value: line }];
  }
  if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
    return [{ type: "property", value: line }];
  }

  return [{ type: "plain", value: line }];
}

function classifyJsonToken(value: string): TokenType {
  if (value.startsWith('"')) {
    return "string";
  }
  if (/^\d/.test(value)) {
    return "number";
  }
  if (value === "true" || value === "false" || value === "null") {
    return "keyword";
  }
  return "operator";
}

function classifyToken(value: string, language: string): TokenType {
  if (value.startsWith("//") || value.startsWith("#") || value.startsWith("/*")) {
    return "comment";
  }
  if (
    value.startsWith('"') ||
    value.startsWith("'") ||
    value.startsWith("`")
  ) {
    return "string";
  }
  if (/^\d/.test(value)) {
    return "number";
  }
  if (/^[{}()[\]=<>:+\-*/|&!%]+$/.test(value)) {
    return "operator";
  }
  if (GENERIC_KEYWORDS.includes(value)) {
    return language === "bash" && value === "in" ? "plain" : "keyword";
  }
  return "plain";
}
