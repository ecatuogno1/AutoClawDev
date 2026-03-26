import type { ChatMessage } from "@autoclawdev/types";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { CornerDownLeft, LoaderCircle, Paperclip, Square } from "lucide-react";
import { useProjects } from "@/lib/api";
import {
  CHAT_HISTORY_EVENT,
  addRecentChat,
  clearStoredChatSession,
  getStoredChatProvider,
  getStoredChatSession,
  setStoredChatProvider,
  setStoredChatSession,
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
  onAssistantMessage?: (message: {
    id: string;
    provider: ChatProvider;
    text: string;
  }) => void;
}

type ChatConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

interface SessionHistoryMessage {
  type: "session-created" | "session-resumed";
  sessionId: string;
  provider: ChatProvider;
  cwd: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  alive: boolean;
  history: ChatMessage[];
}

interface MessageStartedMessage {
  type: "message-started";
  sessionId: string;
  provider: ChatProvider;
  cwd: string;
  timestamp: string;
  messageCount: number;
}

interface AssistantDeltaMessage {
  type: "assistant-delta";
  sessionId: string;
  id: string;
  provider: ChatProvider;
  text: string;
}

interface AssistantMessage {
  type: "assistant-message";
  sessionId: string;
  id: string;
  provider: ChatProvider;
  text: string;
}

interface ToolMessage {
  type: "tool-call" | "tool-update";
  sessionId: string;
  tool: ChatToolCall;
}

interface MessageCompleteMessage {
  type: "message-complete";
  sessionId: string;
  code: number | null;
  signal: string | null;
}

interface SessionStoppedMessage {
  type: "session-stopped";
  sessionId: string;
}

interface ErrorMessage {
  type: "error";
  sessionId?: string;
  message: string;
}

type ServerMessage =
  | SessionHistoryMessage
  | MessageStartedMessage
  | AssistantDeltaMessage
  | AssistantMessage
  | ToolMessage
  | MessageCompleteMessage
  | SessionStoppedMessage
  | ErrorMessage;

type SessionRequest =
  | { type: "create"; provider: ChatProvider }
  | { type: "resume"; provider: ChatProvider; sessionId: string };

export function Chat({
  currentFilePath = null,
  initialProjectKey,
  onAssistantMessage,
  onOpenFile,
  projectKeyLocked = false,
}: ChatProps) {
  const [timeline, setTimeline] = useState<ChatTimelineItem[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [provider, setProvider] = useState<ChatProvider>(() => getStoredChatProvider());
  const [projectKey, setProjectKey] = useState(initialProjectKey ?? "");
  const [sessionId, setSessionId] = useState("");
  const [includeCurrentFile, setIncludeCurrentFile] = useState(Boolean(currentFilePath));
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<ChatConnectionState>("disconnected");
  const [sessionCreatedAt, setSessionCreatedAt] = useState<string | null>(null);
  const [sessionCwd, setSessionCwd] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const sessionIdRef = useRef("");
  const providerRef = useRef(provider);
  const projectKeyRef = useRef(projectKey);
  const announcedAssistantIdsRef = useRef(new Set<string>());
  const sessionRequestRef = useRef<SessionRequest | null>(null);
  const didMountProviderRef = useRef(false);
  const ignoreNextProviderResetRef = useRef(false);
  const { data: projects } = useProjects();

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  useEffect(() => {
    projectKeyRef.current = projectKey;
  }, [projectKey]);

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

  const visibleMessageCount = useMemo(
    () =>
      timeline.filter(
        (item) => item.type === "user-message" || item.type === "assistant-message",
      ).length,
    [timeline],
  );

  const sessionStartedLabel = useMemo(() => {
    if (!sessionCreatedAt) {
      return null;
    }

    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(sessionCreatedAt));
    } catch {
      return null;
    }
  }, [sessionCreatedAt]);

  const appendItem = useCallback((item: ChatTimelineItem) => {
    setTimeline((current) => [...current, item]);
  }, []);

  const upsertAssistantMessage = useCallback(
    (payload: {
      id: string;
      provider: ChatProvider;
      text: string;
      append?: boolean;
      streaming?: boolean;
    }) => {
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

  const announceAssistantMessage = useCallback(
    (message: { id: string; provider: ChatProvider; text: string }) => {
      if (announcedAssistantIdsRef.current.has(message.id)) {
        return;
      }

      announcedAssistantIdsRef.current.add(message.id);
      onAssistantMessage?.(message);
    },
    [onAssistantMessage],
  );

  const applySessionHistory = useCallback((history: ChatMessage[]) => {
    announcedAssistantIdsRef.current = new Set(
      history
        .filter((message) => message.role === "assistant")
        .map((message) => message.id),
    );

    setTimeline(
      history.map((message) => {
        if (message.role === "user") {
          return {
            id: message.id,
            type: "user-message",
            text: message.text,
            timestamp: message.timestamp,
            referencedFiles: message.referencedFiles,
          };
        }

        if (message.role === "assistant") {
          return {
            id: message.id,
            type: "assistant-message",
            provider: message.provider,
            text: message.text,
            timestamp: message.timestamp,
            streaming: false,
          };
        }

        return {
          id: message.id,
          type: "system",
          text: message.text,
          tone: message.tone ?? "info",
          timestamp: message.timestamp,
        };
      }),
    );
  }, []);

  const syncSession = useCallback(
    (message: SessionHistoryMessage) => {
      sessionRequestRef.current = null;
      sessionIdRef.current = message.sessionId;
      setSessionId(message.sessionId);
      setSessionCreatedAt(message.createdAt);
      setSessionCwd(message.cwd);
      setPendingApprovalId(null);
      setStreaming(false);
      markStreamingComplete();
      applySessionHistory(message.history);
      setStoredChatSession({
        provider: message.provider,
        sessionId: message.sessionId,
      });

      if (message.provider !== providerRef.current) {
        ignoreNextProviderResetRef.current = true;
        setProvider(message.provider);
      }
    },
    [applySessionHistory, markStreamingComplete],
  );

  const sendSocketMessage = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify(payload));
    return true;
  }, []);

  const dispatchSessionRequest = useCallback(
    (request: SessionRequest) => {
      sessionRequestRef.current = request;

      if (request.type === "resume") {
        return sendSocketMessage({
          type: "resume-session",
          sessionId: request.sessionId,
        });
      }

      return sendSocketMessage({
        type: "create-session",
        provider: request.provider,
        projectKey: projectKeyRef.current || undefined,
      });
    },
    [sendSocketMessage],
  );

  const queueDefaultSessionRequest = useCallback(() => {
    const storedSession = getStoredChatSession();
    if (storedSession && storedSession.provider === providerRef.current) {
      return dispatchSessionRequest({
        type: "resume",
        provider: storedSession.provider,
        sessionId: storedSession.sessionId,
      });
    }

    clearStoredChatSession();
    return dispatchSessionRequest({
      type: "create",
      provider: providerRef.current,
    });
  }, [dispatchSessionRequest]);

  const connectSocket = useCallback(() => {
    if (disposedRef.current) {
      return;
    }

    const activeSocket = socketRef.current;
    if (
      activeSocket &&
      (activeSocket.readyState === WebSocket.OPEN ||
        activeSocket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setConnectionState(activeSocket ? "reconnecting" : "connecting");

    const socket = new WebSocket(buildChatSocketUrl());
    socketRef.current = socket;

    socket.onopen = () => {
      setConnectionState("connected");
      if (sessionRequestRef.current) {
        dispatchSessionRequest(sessionRequestRef.current);
        return;
      }
      queueDefaultSessionRequest();
    };

    socket.onmessage = (event) => {
      let message: ServerMessage | null = null;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        message = null;
      }

      if (!message) {
        return;
      }

      switch (message.type) {
        case "session-created":
        case "session-resumed":
          syncSession(message);
          return;
        case "message-started":
          sessionIdRef.current = message.sessionId;
          setSessionId(message.sessionId);
          setSessionCwd(message.cwd);
          setStreaming(true);
          return;
        case "assistant-delta":
          announceAssistantMessage({
            id: message.id,
            provider: message.provider,
            text: message.text,
          });
          upsertAssistantMessage({
            id: message.id,
            provider: message.provider,
            text: message.text,
            append: true,
            streaming: true,
          });
          return;
        case "assistant-message":
          announceAssistantMessage({
            id: message.id,
            provider: message.provider,
            text: message.text,
          });
          upsertAssistantMessage({
            id: message.id,
            provider: message.provider,
            text: message.text,
            streaming: false,
          });
          return;
        case "tool-call":
        case "tool-update":
          upsertToolCall(message.tool);
          return;
        case "message-complete":
        case "session-stopped":
          markStreamingComplete();
          setStreaming(false);
          return;
        case "error":
          if (
            message.message === "Chat session not found" &&
            sessionRequestRef.current?.type === "resume" &&
            message.sessionId === sessionRequestRef.current.sessionId
          ) {
            clearStoredChatSession();
            dispatchSessionRequest({
              type: "create",
              provider: providerRef.current,
            });
            appendItem({
              id: `session-reset:${Date.now()}`,
              type: "system",
              text: "Previous chat session was unavailable. Started a new session.",
              tone: "info",
              timestamp: new Date().toISOString(),
            });
            return;
          }

          appendItem({
            id: `error:${Date.now()}`,
            type: "system",
            text: message.message || "Unknown chat error",
            tone: "error",
            timestamp: new Date().toISOString(),
          });
          markStreamingComplete();
          setStreaming(false);
      }
    };

    socket.onclose = () => {
      socketRef.current = null;
      if (disposedRef.current) {
        setConnectionState("disconnected");
        return;
      }

      setConnectionState("reconnecting");
      markStreamingComplete();
      setStreaming(false);
      reconnectTimerRef.current = window.setTimeout(() => {
        connectSocket();
      }, 1500);
    };

    socket.onerror = () => {
      socket.close();
    };
  }, [
    announceAssistantMessage,
    appendItem,
    dispatchSessionRequest,
    markStreamingComplete,
    queueDefaultSessionRequest,
    syncSession,
    upsertAssistantMessage,
    upsertToolCall,
  ]);

  const deleteSession = useCallback(async (id: string) => {
    await fetch(`/api/chat/session/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }, []);

  const startFreshSession = useEffectEvent(async (nextProvider: ChatProvider) => {
    const previousSessionId = sessionIdRef.current || getStoredChatSession()?.sessionId || "";

    clearStoredChatSession();
    sessionIdRef.current = "";
    sessionRequestRef.current = { type: "create", provider: nextProvider };
    announcedAssistantIdsRef.current.clear();
    setTimeline([]);
    setSessionId("");
    setSessionCreatedAt(null);
    setSessionCwd(null);
    setPendingApprovalId(null);
    setStreaming(false);
    markStreamingComplete();

    if (previousSessionId) {
      void deleteSession(previousSessionId);
    }

    if (!dispatchSessionRequest({ type: "create", provider: nextProvider })) {
      connectSocket();
    }
  });

  useEffect(() => {
    disposedRef.current = false;
    connectSocket();

    return () => {
      disposedRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connectSocket]);

  useEffect(() => {
    if (!didMountProviderRef.current) {
      didMountProviderRef.current = true;
      return;
    }

    if (ignoreNextProviderResetRef.current) {
      ignoreNextProviderResetRef.current = false;
      return;
    }

    void startFreshSession(provider);
  }, [provider]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    const activeSessionId = sessionIdRef.current;

    if (!text || streaming) {
      return;
    }

    if (!activeSessionId) {
      appendItem({
        id: `session-wait:${Date.now()}`,
        type: "system",
        text: "Connecting to the persistent chat session. Try again in a moment.",
        tone: "info",
        timestamp: new Date().toISOString(),
      });
      connectSocket();
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

    const sent = sendSocketMessage({
      type: "send-message",
      sessionId: activeSessionId,
      content: text,
      referencedFiles,
    });

    if (!sent) {
      appendItem({
        id: `error:${Date.now()}`,
        type: "system",
        text: "Chat socket is disconnected. Reconnecting now.",
        tone: "error",
        timestamp: new Date().toISOString(),
      });
      markStreamingComplete();
      setStreaming(false);
      connectSocket();
    }
  }, [
    appendItem,
    connectSocket,
    input,
    markStreamingComplete,
    projectKey,
    provider,
    referencedFiles,
    sendSocketMessage,
    streaming,
  ]);

  const stopStreaming = useCallback(() => {
    const activeSessionId = sessionIdRef.current;
    if (!activeSessionId) {
      return;
    }

    sendSocketMessage({
      type: "stop",
      sessionId: activeSessionId,
    });

    markStreamingComplete();
    setStreaming(false);
  }, [markStreamingComplete, sendSocketMessage]);

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

  const connectionLabel =
    connectionState === "connected"
      ? "Connected"
      : connectionState === "connecting"
        ? "Connecting"
        : connectionState === "reconnecting"
          ? "Reconnecting"
          : "Disconnected";

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

          <button
            type="button"
            onClick={() => void startFreshSession(provider)}
            className="rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3]"
          >
            New session
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#8b949e]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#30363d] bg-[#0d1117] px-2.5 py-1">
            <span
              className={cn(
                "size-2 rounded-full",
                connectionState === "connected"
                  ? "bg-[#3fb950]"
                  : connectionState === "disconnected"
                    ? "bg-[#f85149]"
                    : "bg-[#d29922]",
              )}
            />
            {connectionLabel}
          </span>

          <span>
            Session {sessionId ? "ready" : "pending"}
            {visibleMessageCount > 0 ? ` • ${visibleMessageCount} messages` : ""}
          </span>

          {sessionStartedLabel ? <span>Started {sessionStartedLabel}</span> : null}
          {sessionCwd ? <span className="truncate">cwd: {sessionCwd}</span> : null}
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
                stopStreaming();
              } else {
                void sendMessage();
              }
            }}
            disabled={
              !streaming &&
              (input.trim().length === 0 ||
                connectionState !== "connected" ||
                sessionId.length === 0)
            }
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
              streaming
                ? "border-[#6f2f35] bg-[#221116] text-[#f85149] hover:border-[#f85149]"
                : "border-[#1f6feb] bg-[#1f6feb] text-white hover:bg-[#388bfd]",
              !streaming &&
                (input.trim().length === 0 ||
                  connectionState !== "connected" ||
                  sessionId.length === 0) &&
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
        <h2 className="mt-4 text-xl font-semibold text-[#f0f6fc]">Persistent Workspace Chat</h2>
        <p className="mt-2 text-sm leading-7 text-[#8b949e]">
          Continue the same conversation across pages, inspect tool calls inline, and review
          proposed file edits before applying them.
        </p>
        {currentFilePath ? (
          <p className="mt-2 text-xs text-[#6e7681]">Current file available: {currentFilePath}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {[
            `Summarize the current state of ${activeProjectLabel}`,
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

function buildChatSocketUrl() {
  const url = new URL("/ws/chat", window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
