import { cva } from "class-variance-authority";
import {
  Bot,
  ChevronDown,
  Code2,
  CornerDownLeft,
  Paperclip,
  RotateCcw,
  Square,
} from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { ChatModel } from "@autoclawdev/types";
import { cn } from "@/lib/cn";
import type { ChatProvider } from "@/components/chat/types";
import {
  ComposerPromptEditor,
  type ComposerPromptEditorHandle,
} from "@/components/chat/ComposerPromptEditor";

type ChatComposerSurface = "workspace" | "floating";
type ChatConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

interface ChatComposerProps {
  surface: ChatComposerSurface;
  provider: ChatProvider;
  model: ChatModel;
  modelOptions: Array<{ value: ChatModel; label: string }>;
  projectKey: string;
  projectKeyLocked: boolean;
  activeProjectLabel: string;
  currentFilePath: string | null;
  includeCurrentFile: boolean;
  input: string;
  streaming: boolean;
  connectionState: ChatConnectionState;
  connectionLabel: string;
  sessionId: string;
  visibleMessageCount: number;
  sessionStartedLabel: string | null;
  sessionCwd: string | null;
  projects?: Array<{ key: string; name: string }>;
  editorRef: RefObject<ComposerPromptEditorHandle | null>;
  setProvider: (provider: ChatProvider) => void;
  setProjectKey: (projectKey: string) => void;
  setIncludeCurrentFile: Dispatch<SetStateAction<boolean>>;
  onInputChange: (value: string) => void;
  onModelSelect: (model: ChatModel) => void;
  onSubmit: () => void;
  onStop: () => void;
  onStartFreshSession: () => void;
}

const composerFramePadding = cva("", {
  variants: {
    surface: {
      workspace: "px-2.5 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-3",
      floating: "px-2 pb-2.5 pt-2",
    },
  },
});

const composerWidth = cva("mx-auto w-full min-w-0", {
  variants: {
    surface: {
      workspace: "max-w-[56rem]",
      floating: "max-w-full",
    },
  },
});

const outerShell = cva(
  "group min-w-0 rounded-[24px] border border-[var(--color-composer-border)] bg-[var(--color-composer-frame)] shadow-[0_18px_36px_-30px_rgba(15,23,42,0.38)] transition-colors duration-200 focus-within:border-[var(--color-composer-ring)]",
  {
    variants: {
      surface: {
        workspace: "",
        floating: "rounded-[22px]",
      },
    },
  },
);

const bodyPadding = cva("relative min-w-0", {
  variants: {
    surface: {
      workspace: "px-3.5 pb-2.5 pt-3.5 sm:px-4.5 sm:pt-4",
      floating: "px-3 pb-2.5 pt-3.5",
    },
  },
});

const footerPadding = cva(
  "flex min-w-0 items-center justify-between border-t border-[var(--color-composer-border-soft)] bg-[var(--color-composer-footer)]",
  {
    variants: {
      surface: {
        workspace: "flex-wrap gap-2 px-3 pb-3 pt-2.5 sm:flex-nowrap sm:gap-0 sm:px-3.5",
        floating: "flex-wrap gap-1.5 px-3 pb-3 pt-2.5",
      },
    },
  },
);

const controlRail = cva("flex min-w-0 flex-1 items-center", {
  variants: {
    surface: {
      workspace: "gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      floating: "gap-1 overflow-hidden",
    },
  },
});

function connectionDotClass(connectionState: ChatConnectionState) {
  if (connectionState === "connected") {
    return "bg-[#3fb950]";
  }
  if (connectionState === "disconnected") {
    return "bg-[#f85149]";
  }
  return "bg-[#d29922]";
}

function providerLabel(provider: ChatProvider) {
  return provider === "claude" ? "Claude" : "Codex";
}

function modelLabel(model: ChatModel, modelOptions: Array<{ value: ChatModel; label: string }>) {
  return modelOptions.find((option) => option.value === model)?.label ?? model;
}

export function ChatComposer({
  activeProjectLabel,
  connectionLabel,
  connectionState,
  currentFilePath,
  editorRef,
  includeCurrentFile,
  input,
  model,
  modelOptions,
  onInputChange,
  onModelSelect,
  onStartFreshSession,
  onStop,
  onSubmit,
  projectKey,
  projectKeyLocked,
  projects,
  provider,
  sessionCwd,
  sessionId,
  sessionStartedLabel,
  setIncludeCurrentFile,
  setProjectKey,
  setProvider,
  streaming,
  surface,
  visibleMessageCount,
}: ChatComposerProps) {
  const canSend =
    input.trim().length > 0 && connectionState === "connected" && sessionId.length > 0;

  const placeholder =
    currentFilePath && includeCurrentFile
      ? `Ask about ${currentFilePath} or the ${activeProjectLabel} workspace…`
      : `Ask about ${activeProjectLabel}…`;

  return (
    <div className={cn(composerFramePadding({ surface }))}>
      <form className={cn(composerWidth({ surface }))}>
        <div className={cn(outerShell({ surface }))}>
          <div className={cn(bodyPadding({ surface }))}>
            <ComposerPromptEditor
              ref={editorRef}
              value={input}
              onChange={onInputChange}
              onSubmit={onSubmit}
              placeholder={placeholder}
            />
          </div>

          <div className={cn(footerPadding({ surface }))}>
            <div className={cn(controlRail({ surface }))}>
              <label className="relative min-w-0 shrink-0">
                <div className="flex h-8 min-w-[7.5rem] items-center gap-2 overflow-hidden rounded-lg border border-transparent px-2 text-xs text-[var(--color-composer-muted-foreground)] transition-colors hover:bg-[var(--color-composer-accent)] hover:text-[var(--color-composer-foreground)] sm:px-3">
                  {provider === "claude" ? (
                    <Bot className="size-3.5 shrink-0" />
                  ) : (
                    <Code2 className="size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{providerLabel(provider)}</span>
                  <ChevronDown className="size-3 shrink-0 opacity-60" />
                </div>
                <select
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as ChatProvider)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Model provider"
                >
                  <option value="claude">Claude</option>
                  <option value="codex">Codex</option>
                </select>
              </label>

              <label className="relative min-w-0 shrink-0">
                <div className="flex h-8 min-w-[8.5rem] items-center gap-2 overflow-hidden rounded-lg border border-transparent px-2 text-xs text-[var(--color-composer-muted-foreground)] transition-colors hover:bg-[var(--color-composer-accent)] hover:text-[var(--color-composer-foreground)] sm:px-3">
                  <span className="min-w-0 flex-1 truncate">{modelLabel(model, modelOptions)}</span>
                  <ChevronDown className="size-3 shrink-0 opacity-60" />
                </div>
                <select
                  value={model}
                  onChange={(event) => onModelSelect(event.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Provider model"
                >
                  {modelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {!projectKeyLocked ? (
                <select
                  value={projectKey}
                  onChange={(event) => setProjectKey(event.target.value)}
                  className="h-8 min-w-0 shrink-0 rounded-lg border border-[var(--color-composer-border)] bg-[var(--color-composer-surface)] px-2.5 text-xs text-[var(--color-composer-foreground)] outline-none transition-colors hover:bg-[var(--color-composer-accent)] sm:px-3"
                >
                  <option value="">Home directory</option>
                  {projects?.map((project) => (
                    <option key={project.key} value={project.key}>
                      {project.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="inline-flex h-8 shrink-0 items-center rounded-lg border border-[var(--color-composer-border)] bg-[var(--color-composer-surface)] px-2.5 text-xs text-[var(--color-composer-muted-foreground)] sm:px-3">
                  {activeProjectLabel}
                </div>
              )}

              {currentFilePath ? (
                <button
                  type="button"
                  onClick={() => setIncludeCurrentFile((current) => !current)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors sm:px-3",
                    includeCurrentFile
                      ? "border-[var(--color-composer-primary)]/40 bg-[var(--color-composer-primary)]/12 text-[var(--color-composer-foreground)]"
                      : "border-[var(--color-composer-border)] bg-[var(--color-composer-surface)] text-[var(--color-composer-muted-foreground)] hover:bg-[var(--color-composer-accent)] hover:text-[var(--color-composer-foreground)]",
                  )}
                >
                  <Paperclip className="size-3.5" />
                  {includeCurrentFile ? "Current file" : "Reference file"}
                </button>
              ) : null}

              <div className="hidden h-4 w-px shrink-0 bg-[var(--color-composer-border)]/80 sm:block" />

              <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-composer-border)] bg-[var(--color-composer-surface)] px-2.5 text-[11px] text-[var(--color-composer-muted-foreground)]">
                <span className={cn("size-2 rounded-full", connectionDotClass(connectionState))} />
                {connectionLabel}
              </span>

              <span className="inline-flex h-8 shrink-0 items-center rounded-full border border-[var(--color-composer-border)] bg-[var(--color-composer-surface)] px-2.5 text-[11px] text-[var(--color-composer-muted-foreground)]">
                Session {sessionId ? "ready" : "pending"}
                {visibleMessageCount > 0 ? ` • ${visibleMessageCount} messages` : ""}
              </span>

              {sessionStartedLabel ? (
                <span className="hidden shrink-0 text-[11px] text-[var(--color-composer-muted-foreground)] sm:inline">
                  Started {sessionStartedLabel}
                </span>
              ) : null}

              {sessionCwd ? (
                <span className="hidden max-w-[12rem] truncate text-[11px] text-[var(--color-composer-muted-foreground)] lg:inline">
                  cwd: {sessionCwd}
                </span>
              ) : null}

              <button
                type="button"
                onClick={onStartFreshSession}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-xs text-[var(--color-composer-muted-foreground)] transition-colors hover:bg-[var(--color-composer-accent)] hover:text-[var(--color-composer-foreground)] sm:px-3"
                title="Start a new session"
              >
                <RotateCcw className="size-3.5" />
                New
              </button>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {streaming ? (
                <button
                  type="button"
                  className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-rose-500/90 text-white transition-all duration-150 hover:scale-105 hover:bg-rose-500 sm:size-8"
                  onClick={onStop}
                  aria-label="Stop generation"
                >
                  <Square className="size-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={!canSend}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-composer-primary)] text-[var(--color-composer-primary-foreground)] transition-all duration-150 hover:scale-105 hover:bg-[var(--color-composer-primary-hover)] disabled:opacity-30 disabled:hover:scale-100 sm:h-8 sm:w-8"
                  aria-label="Send message"
                >
                  <CornerDownLeft className="size-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
