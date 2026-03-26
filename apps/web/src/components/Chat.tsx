import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, LoaderCircle, Paperclip, Square } from "lucide-react";
import { useProjects } from "@/lib/api";
import {
  CHAT_HISTORY_EVENT,
  addRecentChat,
  getStoredChatProvider,
  setStoredChatProvider,
} from "@/lib/chatHistory";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { ToolCallCard } from "@/components/chat/ToolCallCard";
import type { ChatProvider, ChatTimelineItem, ChatToolCall } from "@/components/chat/types";
import { cn } from "@/lib/cn";

interface ChatProps {
  initialProjectKey?: string;
  projectKeyLocked?: boolean;
  currentFilePath?: string | null;
  onOpenFile?: (path: string) => void;
}

interface StreamEnvelope {
  event: string;
  data: unknown;
}

export function Chat({
  currentFilePath = null,
  initialProjectKey,
  onOpenFile,
  projectKeyLocked = false,
}: ChatProps) {
  const [timeline, setTimeline] = useState<ChatTimelineItem[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [provider, setProvider] = useState<ChatProvider>(() => getStoredChatProvider());
  const [projectKey, setProjectKey] = useState(initialProjectKey ?? "");
  const [sessionId, setSessionId] = useState<string>("");
  const [includeCurrentFile, setIncludeCurrentFile] = useState(Boolean(currentFilePath));
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { data: projects } = useProjects();

  useEffect(() => {
    if (typeof initialProjectKey === "string") {
      setProjectKey(initialProjectKey);
    }
  }, [initialProjectKey]);

  useEffect(() => {
    if (!currentFilePath) {
      setIncludeCurrentFile(false);
    }
  }, [currentFilePath]);

  useEffect(() => {
    const syncProvider = () => {
      setProvider(getStoredChatProvider());
    };

    window.addEventListener(CHAT_HISTORY_EVENT, syncProvider as EventListener);
    window.addEventListener("storage", syncProvider);
    return () => {
      window.removeEventListener(CHAT_HISTORY_EVENT, syncProvider as EventListener);
      window.removeEventListener("storage", syncProvider);
    };
  }, []);

  useEffect(() => {
    setStoredChatProvider(provider);
  }, [provider]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline]);

  const activeProjectLabel = useMemo(() => {
    if (!projectKey) {
      return "your home directory";
    }
    return projects?.find((project) => project.key === projectKey)?.name ?? projectKey;
  }, [projectKey, projects]);

  const appendItem = useCallback((item: ChatTimelineItem) => {
    setTimeline((current) => [...current, item]);
  }, []);

  const upsertAssistantMessage = useCallback(
    (payload: { id: string; provider: ChatProvider; text: string; append?: boolean; streaming?: boolean }) => {
      setTimeline((current) => {
        const index = current.findIndex(
          (item) => item.type === "assistant-message" && item.id === payload.id,
        );
        if (index === -1) {
          return [
            ...current,
            {
              id: payload.id,
              type: "assistant-message",
              provider: payload.provider,
              text: payload.text,
              timestamp: new Date().toISOString(),
              streaming: payload.streaming,
            },
          ];
        }

        const next = [...current];
        const existing = next[index];
        if (!existing || existing.type !== "assistant-message") {
          return current;
        }
        next[index] = {
          ...existing,
          text: payload.append ? `${existing.text}${payload.text}` : payload.text,
          streaming: payload.streaming,
        };
        return next;
      });
    },
    [],
  );

  const upsertToolCall = useCallback((tool: ChatToolCall) => {
    setTimeline((current) => {
      const index = current.findIndex(
        (item) => item.type === "tool-call" && item.tool.id === tool.id,
      );
      if (index === -1) {
        return [
          ...current,
          {
            id: `tool:${tool.id}`,
            type: "tool-call",
            tool,
            timestamp: new Date().toISOString(),
          },
        ];
      }

      const next = [...current];
      const existing = next[index];
      if (!existing || existing.type !== "tool-call") {
        return current;
      }
      next[index] = {
        ...existing,
        tool: {
          ...existing.tool,
          ...tool,
        },
      };
      return next;
    });
  }, []);

  const markStreamingComplete = useCallback(() => {
    setTimeline((current) =>
      current.map((item) =>
        item.type === "assistant-message" ? { ...item, streaming: false } : item,
      ),
    );
  }, []);

  const referencedFiles = includeCurrentFile && currentFilePath ? [currentFilePath] : [];

  const handleStreamEnvelope = useCallback((envelope: StreamEnvelope) => {
    const payload = (envelope.data ?? {}) as Record<string, unknown>;

    if (envelope.event === "start") {
      if (typeof payload.id === "string") {
        setSessionId(payload.id);
      }
      return;
    }

    if (envelope.event === "assistant-delta") {
      if (typeof payload.id === "string" && typeof payload.text === "string") {
        upsertAssistantMessage({
          id: payload.id,
          provider: (payload.provider as ChatProvider) ?? provider,
          text: payload.text,
          append: true,
          streaming: true,
        });
      }
      return;
    }

    if (envelope.event === "assistant-message") {
      if (typeof payload.id === "string" && typeof payload.text === "string") {
        upsertAssistantMessage({
          id: payload.id,
          provider: (payload.provider as ChatProvider) ?? provider,
          text: payload.text,
          streaming: false,
        });
      }
      return;
    }

    if (envelope.event === "tool-call" || envelope.event === "tool-update") {
      upsertToolCall(payload as unknown as ChatToolCall);
      return;
    }

    if (envelope.event === "error") {
      appendItem({
        id: `error:${Date.now()}`,
        type: "system",
        text: typeof payload.message === "string" ? payload.message : "Unknown chat error",
        tone: "error",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (envelope.event === "done") {
      markStreamingComplete();
      setStreaming(false);
      setSessionId("");
    }
  }, [appendItem, markStreamingComplete, provider, upsertAssistantMessage, upsertToolCall]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) {
      return;
    }

    const timestamp = new Date().toISOString();
    appendItem({
      id: `user:${timestamp}`,
      type: "user-message",
      text,
      timestamp,
      referencedFiles,
    });

    addRecentChat({
      prompt: text,
      projectKey: projectKey || undefined,
      provider,
      timestamp,
    });

    setInput("");
    setStreaming(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          projectKey: projectKey || undefined,
          provider,
          referencedFiles,
        }),
      });

      if (!response.ok || !response.body) {
        appendItem({
          id: `error:${Date.now()}`,
          type: "system",
          text: `Error: ${response.status} ${response.statusText}`,
          tone: "error",
          timestamp: new Date().toISOString(),
        });
        setStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const envelopes = consumeSseEnvelopes(buffer);
        buffer = envelopes.rest;

        for (const envelope of envelopes.events) {
          handleStreamEnvelope(envelope);
        }
      }

      if (buffer.trim()) {
        const envelopes = consumeSseEnvelopes(`${buffer}\n\n`);
        for (const envelope of envelopes.events) {
          handleStreamEnvelope(envelope);
        }
      }
    } catch (error) {
      appendItem({
        id: `error:${Date.now()}`,
        type: "system",
        text: `Error: ${(error as Error).message}`,
        tone: "error",
        timestamp: new Date().toISOString(),
      });
      markStreamingComplete();
      setStreaming(false);
      setSessionId("");
    }
  }, [
    appendItem,
    handleStreamEnvelope,
    input,
    markStreamingComplete,
    projectKey,
    provider,
    referencedFiles,
    streaming,
  ]);

  const stopStreaming = useCallback(async () => {
    if (!sessionId) {
      return;
    }

    await fetch("/api/chat/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }).catch(() => undefined);

    markStreamingComplete();
    setStreaming(false);
    setSessionId("");
  }, [markStreamingComplete, sessionId]);

  const resolveApproval = useCallback(
    async (requestId: string, action: "approve" | "reject") => {
      setPendingApprovalId(requestId);
      try {
        const response = await fetch("/api/chat/approval", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, action }),
        });

        const payload = (await response.json()) as {
          error?: string;
          status?: "approved" | "rejected";
          result?: {
            kind?: string;
            oldContent?: string;
            newContent?: string;
            output?: string;
          };
        };

        if (!response.ok) {
          throw new Error(payload.error || "Approval failed");
        }

        setTimeline((current) =>
          current.map((item) => {
            if (item.type !== "tool-call" || item.tool.requestId !== requestId) {
              return item;
            }

            return {
              ...item,
              tool: {
                ...item.tool,
                status: action === "approve" ? "approved" : "rejected",
                oldContent: payload.result?.oldContent ?? item.tool.oldContent,
                newContent: payload.result?.newContent ?? item.tool.newContent,
                output: payload.result?.output ?? item.tool.output,
                error: undefined,
              },
            };
          }),
        );
      } catch (error) {
        appendItem({
          id: `approval-error:${Date.now()}`,
          type: "system",
          text: `Approval failed: ${(error as Error).message}`,
          tone: "error",
          timestamp: new Date().toISOString(),
        });
      } finally {
        setPendingApprovalId(null);
      }
    },
    [appendItem],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0d1117]">
      <div className="border-b border-[#30363d] bg-[linear-gradient(180deg,#11161d_0%,#0d1117_100%)] px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg bg-[#21262d] p-0.5">
            {(["claude", "codex"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setProvider(option)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  provider === option
                    ? "bg-[#1f6feb] text-white"
                    : "text-[#8b949e] hover:text-[#e6edf3]",
                )}
              >
                {option === "claude" ? "Claude" : "Codex"}
              </button>
            ))}
          </div>

          {!projectKeyLocked ? (
            <select
              value={projectKey}
              onChange={(event) => setProjectKey(event.target.value)}
              className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs text-[#e6edf3]"
            >
              <option value="">Home directory</option>
              {projects?.map((project) => (
                <option key={project.key} value={project.key}>
                  {project.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs text-[#8b949e]">
              {activeProjectLabel}
            </div>
          )}

          {currentFilePath ? (
            <button
              type="button"
              onClick={() => setIncludeCurrentFile((current) => !current)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors",
                includeCurrentFile
                  ? "border-[#2b4a63] bg-[#101c29] text-[#d7ebff]"
                  : "border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:text-[#e6edf3]",
              )}
            >
              <Paperclip className="size-3.5" />
              {includeCurrentFile ? "Including current file" : "Reference current file"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        {timeline.length === 0 ? (
          <EmptyState
            activeProjectLabel={activeProjectLabel}
            currentFilePath={currentFilePath}
            onSelectSuggestion={(suggestion) => {
              setInput(suggestion);
              inputRef.current?.focus();
            }}
          />
        ) : (
          <div className="space-y-4">
            {timeline.map((item) => {
              if (item.type === "user-message") {
                return (
                  <div key={item.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-[24px] bg-[#1f6feb] px-4 py-3 text-sm text-white shadow-[0_20px_60px_rgba(31,111,235,0.25)]">
                      {item.referencedFiles?.length ? (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {item.referencedFiles.map((path) => (
                            <span
                              key={path}
                              className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]"
                            >
                              {path}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <p className="whitespace-pre-wrap">{item.text}</p>
                    </div>
                  </div>
                );
              }

              if (item.type === "assistant-message") {
                return (
                  <div key={item.id} className="flex justify-start">
                    <div className="max-w-[min(100%,56rem)] rounded-[28px] border border-[#30363d] bg-[#161b22] px-4 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
                      <ChatMarkdown text={item.text} isStreaming={item.streaming} />
                      {item.streaming ? (
                        <div className="mt-3 flex items-center gap-2 text-xs text-[#8b949e]">
                          <LoaderCircle className="size-3.5 animate-spin" />
                          Streaming
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              }

              if (item.type === "tool-call") {
                return (
                  <div key={item.id} className="flex justify-start">
                    <div className="max-w-[min(100%,58rem)] flex-1">
                      <ToolCallCard
                        tool={item.tool}
                        onOpenFile={onOpenFile}
                        onResolveApproval={resolveApproval}
                        pendingApprovalId={pendingApprovalId}
                      />
                    </div>
                  </div>
                );
              }

              return (
                <div key={item.id} className="flex justify-center">
                  <div
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs",
                      item.tone === "error"
                        ? "border-[#6f2f35] bg-[#221116] text-[#ffd8d6]"
                        : "border-[#30363d] bg-[#11161d] text-[#8b949e]",
                    )}
                  >
                    {item.text}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-[#30363d] bg-[#0d1117] p-4">
        <div className="mb-3 flex items-start gap-2 rounded-2xl border border-[#30363d] bg-[#11161d] px-4 py-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            placeholder={
              currentFilePath && includeCurrentFile
                ? `Ask about ${currentFilePath} or the ${activeProjectLabel} workspace…`
                : `Ask about ${activeProjectLabel}…`
            }
            className="min-h-[72px] flex-1 resize-none bg-transparent text-sm leading-6 text-[#e6edf3] outline-none placeholder:text-[#6e7681]"
          />
          <button
            type="button"
            onClick={() => {
              if (streaming) {
                void stopStreaming();
              } else {
                void sendMessage();
              }
            }}
            disabled={!streaming && input.trim().length === 0}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
              streaming
                ? "border-[#6f2f35] bg-[#221116] text-[#f85149] hover:border-[#f85149]"
                : "border-[#1f6feb] bg-[#1f6feb] text-white hover:bg-[#388bfd]",
              !streaming &&
                input.trim().length === 0 &&
                "cursor-not-allowed border-[#30363d] bg-[#161b22] text-[#6e7681]",
            )}
          >
            {streaming ? <Square className="size-4" /> : <CornerDownLeft className="size-4" />}
            {streaming ? "Stop" : "Send"}
          </button>
        </div>
        <p className="text-xs text-[#6e7681]">
          Enter sends. Shift+Enter adds a newline.
        </p>
      </div>
    </div>
  );
}

function EmptyState({
  activeProjectLabel,
  currentFilePath,
  onSelectSuggestion,
}: {
  activeProjectLabel: string;
  currentFilePath: string | null;
  onSelectSuggestion: (suggestion: string) => void;
}) {
  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="max-w-lg rounded-[32px] border border-[#222a32] bg-[#11161d] px-8 py-10 text-center shadow-[0_24px_80px_rgba(0,0,0,0.25)]">
        <div className="text-4xl">🦞</div>
        <h2 className="mt-4 text-xl font-semibold text-[#f0f6fc]">Enhanced Workspace Chat</h2>
        <p className="mt-2 text-sm leading-7 text-[#8b949e]">
          Ask about {activeProjectLabel}, inspect tool calls inline, and review proposed file edits
          before applying them.
        </p>
        {currentFilePath ? (
          <p className="mt-2 text-xs text-[#6e7681]">Current file available: {currentFilePath}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {[
            "Summarize the current project architecture",
            "Read the active file and explain what it does",
            "Run git status and explain the current working tree",
            "Propose a safe change and show me the diff first",
          ].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSelectSuggestion(suggestion)}
              className="rounded-full border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3]"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function consumeSseEnvelopes(buffer: string) {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events = parts
    .map(parseSseEnvelope)
    .filter((entry): entry is StreamEnvelope => entry !== null);
  return { events, rest };
}

function parseSseEnvelope(chunk: string): StreamEnvelope | null {
  const lines = chunk.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  try {
    return {
      event,
      data: JSON.parse(dataLines.join("\n")),
    };
  } catch {
    return null;
  }
}
