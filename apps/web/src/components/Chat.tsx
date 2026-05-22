import type { ChatMessage, ChatModel } from "@autoclawdev/types";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LoaderCircle } from "lucide-react";
import { useProjects } from "@/lib/api";
import {
  CHAT_HISTORY_EVENT,
  addRecentChat,
  clearStoredChatSession,
  getStoredChatModelSelections,
  getStoredChatProvider,
  getStoredChatSession,
  setStoredChatModelSelection,
  setStoredChatProvider,
  setStoredChatSession,
} from "@/lib/chatHistory";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { ChatComposer } from "@/components/chat/ChatComposer";
import type { ComposerPromptEditorHandle } from "@/components/chat/ComposerPromptEditor";
import { ToolCallCard } from "@/components/chat/ToolCallCard";
import type { ChatProvider, ChatTimelineItem, ChatToolCall } from "@/components/chat/types";
import { cn } from "@/lib/cn";

const CHAT_MODEL_OPTIONS: Record<ChatProvider, Array<{ value: ChatModel; label: string }>> = {
  claude: [
    { value: "opus", label: "Opus" },
    { value: "sonnet", label: "Sonnet" },
  ],
  codex: [
    { value: "gpt-5.4", label: "GPT-5.4" },
    { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  ],
};

interface ChatProps {
  initialProjectKey?: string;
  projectKeyLocked?: boolean;
  currentFilePath?: string | null;
  sessionScopeKey?: string | null;
  afterTimeline?: ReactNode;
  onOpenFile?: (path: string) => void;
  surface?: "workspace" | "floating";
  onCreateTaskFromAssistant?: (draft: {
    title: string;
    description: string;
    sourceMessageId: string;
  }) => void;
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
  model: ChatModel;
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
  model: ChatModel;
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
  | { type: "create"; provider: ChatProvider; model: ChatModel }
  | { type: "resume"; provider: ChatProvider; model: ChatModel; sessionId: string };

function getSessionRequestKey(request: SessionRequest) {
  return request.type === "resume"
    ? `resume:${request.provider}:${request.model}:${request.sessionId}`
    : `create:${request.provider}:${request.model}`;
}

export function Chat({
  afterTimeline,
  currentFilePath = null,
  initialProjectKey,
  onCreateTaskFromAssistant,
  onAssistantMessage,
  onOpenFile,
  projectKeyLocked = false,
  sessionScopeKey = null,
  surface = "workspace",
}: ChatProps) {
  const [timeline, setTimeline] = useState<ChatTimelineItem[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [provider, setProvider] = useState<ChatProvider>(() => getStoredChatProvider());
  const [modelSelections, setModelSelections] = useState<Record<ChatProvider, ChatModel>>(() =>
    getStoredChatModelSelections(),
  );
  const [projectKey, setProjectKey] = useState(initialProjectKey ?? "");
  const [sessionId, setSessionId] = useState("");
  const [includeCurrentFile, setIncludeCurrentFile] = useState(Boolean(currentFilePath));
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<ChatConnectionState>("disconnected");
  const [sessionCreatedAt, setSessionCreatedAt] = useState<string | null>(null);
  const [sessionCwd, setSessionCwd] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerPromptEditorHandle>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const sessionIdRef = useRef("");
  const providerRef = useRef(provider);
  const modelSelectionsRef = useRef(modelSelections);
  const projectKeyRef = useRef(projectKey);
  const inflightSessionRequestRef = useRef<string | null>(null);
  const announcedAssistantIdsRef = useRef(new Set<string>());
  const sessionRequestRef = useRef<SessionRequest | null>(null);
  const didMountProviderRef = useRef(false);
  const didMountSessionScopeRef = useRef(false);
  const ignoreNextProviderResetRef = useRef(false);
  const { data: projects } = useProjects();

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    providerRef.current = provider;
  }, [provider]);

  useEffect(() => {
    modelSelectionsRef.current = modelSelections;
  }, [modelSelections]);

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
      setModelSelections(getStoredChatModelSelections());
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

  const selectedModel = modelSelections[provider];

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
      inflightSessionRequestRef.current = null;
      sessionIdRef.current = message.sessionId;
      setSessionId(message.sessionId);
      setSessionCreatedAt(message.createdAt);
      setSessionCwd(message.cwd);
      setPendingApprovalId(null);
      setStreaming(false);
      markStreamingComplete();
      applySessionHistory(message.history);
      setStoredChatSession(
        {
          provider: message.provider,
          model: message.model,
          sessionId: message.sessionId,
        },
        sessionScopeKey,
      );

      if (message.provider !== providerRef.current) {
        ignoreNextProviderResetRef.current = true;
        setProvider(message.provider);
      }

      setModelSelections((current) => {
        if (current[message.provider] === message.model) {
          return current;
        }
        return { ...current, [message.provider]: message.model };
      });
      setStoredChatModelSelection(message.provider, message.model);
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
      const requestKey = getSessionRequestKey(request);
      const socket = socketRef.current;

      if (
        inflightSessionRequestRef.current === requestKey &&
        socket?.readyState === WebSocket.OPEN
      ) {
        sessionRequestRef.current = request;
        return true;
      }

      sessionRequestRef.current = request;
      const sent =
        request.type === "resume"
          ? sendSocketMessage({
              type: "resume-session",
              sessionId: request.sessionId,
            })
          : sendSocketMessage({
              type: "create-session",
              model: request.model,
              provider: request.provider,
              projectKey: projectKeyRef.current || undefined,
            });

      if (sent) {
        inflightSessionRequestRef.current = requestKey;
      }

      return sent;
    },
    [sendSocketMessage],
  );

  const queueDefaultSessionRequest = useCallback(() => {
    const storedSession = getStoredChatSession(sessionScopeKey);
    const currentProvider = providerRef.current;
    const currentModel = modelSelectionsRef.current[currentProvider];

    if (
      storedSession &&
      storedSession.provider === currentProvider &&
      storedSession.model === currentModel
    ) {
      return dispatchSessionRequest({
        type: "resume",
        provider: storedSession.provider,
        model: storedSession.model,
        sessionId: storedSession.sessionId,
      });
    }

    clearStoredChatSession(sessionScopeKey);
    return dispatchSessionRequest({
      type: "create",
      model: currentModel,
      provider: currentProvider,
    });
  }, [dispatchSessionRequest, sessionScopeKey]);

  const connectSocket = useEffectEvent(() => {
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
      inflightSessionRequestRef.current = null;
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
          inflightSessionRequestRef.current = null;
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
            clearStoredChatSession(sessionScopeKey);
            inflightSessionRequestRef.current = null;
            dispatchSessionRequest({
              type: "create",
              model: modelSelectionsRef.current[providerRef.current],
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
      inflightSessionRequestRef.current = null;
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
  });

  const deleteSession = useCallback(async (id: string) => {
    await fetch(`/api/chat/session/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => undefined);
  }, []);

  const startFreshSession = useEffectEvent(async (nextProvider: ChatProvider, nextModel: ChatModel) => {
    const previousSessionId =
      sessionIdRef.current || getStoredChatSession(sessionScopeKey)?.sessionId || "";

    clearStoredChatSession(sessionScopeKey);
    sessionIdRef.current = "";
    sessionRequestRef.current = { type: "create", provider: nextProvider, model: nextModel };
    inflightSessionRequestRef.current = null;
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

    if (!dispatchSessionRequest({ type: "create", provider: nextProvider, model: nextModel })) {
      connectSocket();
    }
  });

  useEffect(() => {
    if (!didMountSessionScopeRef.current) {
      didMountSessionScopeRef.current = true;
      return;
    }
    void startFreshSession(providerRef.current, modelSelectionsRef.current[providerRef.current]);
  }, [sessionScopeKey]);

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
  }, []);

  useEffect(() => {
    if (!didMountProviderRef.current) {
      didMountProviderRef.current = true;
      return;
    }

    if (ignoreNextProviderResetRef.current) {
      ignoreNextProviderResetRef.current = false;
      return;
    }

    void startFreshSession(provider, modelSelectionsRef.current[provider]);
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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        {timeline.length === 0 ? (
          <EmptyState
            activeProjectLabel={activeProjectLabel}
            currentFilePath={currentFilePath}
            onSelectSuggestion={(suggestion) => {
              setInput(suggestion);
              composerRef.current?.focusAtEnd();
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
                      {!item.streaming && onCreateTaskFromAssistant ? (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() =>
                              onCreateTaskFromAssistant({
                                title: summarizeTaskTitle(item.text),
                                description: item.text,
                                sourceMessageId: item.id,
                              })
                            }
                            className="rounded-full border border-[#30363d] bg-[#0d1117] px-3 py-1.5 text-xs text-[#8b949e] transition-colors hover:border-[#58a6ff] hover:text-[#e6edf3]"
                          >
                            Create Task
                          </button>
                        </div>
                      ) : null}
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

      {afterTimeline ? (
        <div className="border-t border-[#30363d] bg-[#0d1117] px-4 py-4 sm:px-5">
          {afterTimeline}
        </div>
      ) : null}

      <div className="mt-auto flex-none bg-[#0d1117]">
        <ChatComposer
          surface={surface}
          provider={provider}
          projectKey={projectKey}
          projectKeyLocked={projectKeyLocked}
          activeProjectLabel={activeProjectLabel}
          currentFilePath={currentFilePath}
          includeCurrentFile={includeCurrentFile}
          input={input}
          model={selectedModel}
          modelOptions={CHAT_MODEL_OPTIONS[provider]}
          streaming={streaming}
          connectionState={connectionState}
          connectionLabel={connectionLabel}
          sessionId={sessionId}
          visibleMessageCount={visibleMessageCount}
          sessionStartedLabel={sessionStartedLabel}
          sessionCwd={sessionCwd}
          projects={projects}
          editorRef={composerRef}
          setProvider={setProvider}
          setProjectKey={setProjectKey}
          setIncludeCurrentFile={setIncludeCurrentFile}
          onInputChange={setInput}
          onModelSelect={(model) => {
            setModelSelections((current) => ({ ...current, [provider]: model }));
            setStoredChatModelSelection(provider, model);
            void startFreshSession(provider, model);
          }}
          onSubmit={() => {
            void sendMessage();
          }}
          onStop={stopStreaming}
          onStartFreshSession={() => {
            void startFreshSession(provider, selectedModel);
          }}
        />
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

function summarizeTaskTitle(text: string) {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "New task";
  }

  return (
    firstLine
      .replace(/^[-*#>\d.\s`]+/, "")
      .replace(/\s+/g, " ")
      .slice(0, 80) || "New task"
  );
}
