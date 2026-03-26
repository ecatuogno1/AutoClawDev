import { useState, useRef, useEffect, useCallback } from "react";
import { useProjects } from "@/lib/api";
import {
  CHAT_HISTORY_EVENT,
  addRecentChat,
  getStoredChatProvider,
  setStoredChatProvider,
} from "@/lib/chatHistory";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  provider?: string;
  projectKey?: string;
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [provider, setProvider] = useState<"claude" | "codex">(() => getStoredChatProvider());
  const [projectKey, setProjectKey] = useState<string>("");
  const [sessionId, setSessionId] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { data: projects } = useProjects();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

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

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
      provider,
      projectKey: projectKey || undefined,
    };

    addRecentChat({
      prompt: text,
      projectKey: projectKey || undefined,
      provider,
      timestamp: userMsg.timestamp,
    });
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    const id = `chat-${Date.now()}`;
    setSessionId(id);

    // Add empty assistant message to stream into
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      provider,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, provider, projectKey: projectKey || undefined, sessionId: id }),
      });

      if (!response.ok || !response.body) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: `Error: ${response.status} ${response.statusText}`,
          };
          return updated;
        });
        setStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      content: last.content + data.text,
                    };
                  }
                  return updated;
                });
              }
            } catch {
              // skip unparseable
            }
          }
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: `Error: ${(err as Error).message}`,
        };
        return updated;
      });
    }

    setStreaming(false);
    setSessionId("");
  };

  const stopStreaming = async () => {
    if (sessionId) {
      await fetch("/api/chat/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
    setStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <div className="text-4xl">🦞</div>
            <h2 className="text-lg font-semibold text-[#e6edf3]">AutoClawDev Chat</h2>
            <p className="text-sm text-[#8b949e] max-w-md mx-auto">
              Chat with Claude or Codex directly from the dashboard.
              Messages run from{" "}
              {projectKey
                ? projects?.find((p) => p.key === projectKey)?.name || projectKey
                : "your home directory"}
              .
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {[
                "What are the open findings for this project?",
                "Show me the git log for the last 5 commits",
                "What files were changed recently?",
                "Explain the architecture of this codebase",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                  className="text-xs bg-[#21262d] text-[#8b949e] px-3 py-1.5 rounded-lg hover:bg-[#30363d] hover:text-[#e6edf3] transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-[#1f6feb] text-white"
                  : "bg-[#161b22] border border-[#30363d] text-[#c9d1d9]"
              }`}
            >
              {msg.role === "assistant" ? (
                <pre className="text-sm whitespace-pre-wrap font-[inherit] leading-relaxed">
                  {msg.content || (streaming && i === messages.length - 1 ? (
                    <span className="text-[#8b949e] animate-pulse">Thinking...</span>
                  ) : "")}
                </pre>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-[#30363d] p-4 bg-[#0d1117]">
        {/* Controls row */}
        <div className="flex items-center gap-3 mb-3">
          {/* Provider toggle */}
          <div className="flex bg-[#21262d] rounded-lg p-0.5">
            <button
              onClick={() => setProvider("claude")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                provider === "claude"
                  ? "bg-[#d2a8ff20] text-[#d2a8ff]"
                  : "text-[#8b949e] hover:text-[#e6edf3]"
              }`}
            >
              Claude
            </button>
            <button
              onClick={() => setProvider("codex")}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                provider === "codex"
                  ? "bg-[#3fb95020] text-[#3fb950]"
                  : "text-[#8b949e] hover:text-[#e6edf3]"
              }`}
            >
              Codex
            </button>
          </div>

          {/* Project selector */}
          <select
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value)}
            className="bg-[#21262d] border border-[#30363d] rounded-lg px-2 py-1 text-xs text-[#e6edf3] focus:border-[#58a6ff] focus:outline-none"
          >
            <option value="">Home directory</option>
            {projects?.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>

          {streaming && (
            <button
              onClick={stopStreaming}
              className="ml-auto text-xs bg-[#f8514920] text-[#f85149] px-3 py-1 rounded-lg hover:bg-[#f8514930]"
            >
              Stop
            </button>
          )}
        </div>

        {/* Message input */}
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${provider === "claude" ? "Claude" : "Codex"}...`}
            rows={1}
            className="flex-1 bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-3 text-sm text-[#e6edf3] placeholder-[#484f58] resize-none focus:border-[#58a6ff] focus:outline-none"
            style={{ minHeight: "44px", maxHeight: "120px" }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = "44px";
              t.style.height = Math.min(t.scrollHeight, 120) + "px";
            }}
            disabled={streaming}
          />
          <button
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            className={`px-4 rounded-xl text-sm font-medium transition-colors ${
              streaming || !input.trim()
                ? "bg-[#21262d] text-[#484f58]"
                : "bg-[#1f6feb] text-white hover:bg-[#388bfd]"
            }`}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
