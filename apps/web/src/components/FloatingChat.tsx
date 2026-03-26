import { useEffect, useState, useEffectEvent } from "react";
import { MessageSquareText, Minus, X } from "lucide-react";
import { Chat } from "@/components/Chat";
import { cn } from "@/lib/cn";

const CHAT_OPEN_STORAGE_KEY = "autoclaw:floating-chat-open";
const CHAT_MINIMIZED_STORAGE_KEY = "autoclaw:floating-chat-minimized";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStoredBoolean(key: string, fallback: boolean) {
  if (!canUseStorage()) {
    return fallback;
  }

  const value = window.localStorage.getItem(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function writeStoredBoolean(key: string, value: boolean) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(key, value ? "true" : "false");
}

export function FloatingChat({
  activeProjectKey,
}: {
  activeProjectKey: string | null;
}) {
  const [isOpen, setIsOpen] = useState(() =>
    readStoredBoolean(CHAT_OPEN_STORAGE_KEY, false),
  );
  const [isMinimized, setIsMinimized] = useState(() =>
    readStoredBoolean(CHAT_MINIMIZED_STORAGE_KEY, false),
  );
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    writeStoredBoolean(CHAT_OPEN_STORAGE_KEY, isOpen);
  }, [isOpen]);

  useEffect(() => {
    writeStoredBoolean(CHAT_MINIMIZED_STORAGE_KEY, isMinimized);
  }, [isMinimized]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      setHasUnread(false);
    }
  }, [isMinimized, isOpen]);

  const closePanel = useEffectEvent(() => {
    setIsOpen(false);
    setIsMinimized(false);
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        closePanel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePanel, isMinimized, isOpen]);

  const restorePanel = () => {
    setIsOpen(true);
    setIsMinimized(false);
    setHasUnread(false);
  };

  const minimizePanel = () => {
    setIsOpen(true);
    setIsMinimized(true);
  };

  return (
    <>
      <button
        type="button"
        aria-label={isOpen && !isMinimized ? "Chat open" : "Open chat"}
        aria-expanded={isOpen && !isMinimized}
        onClick={restorePanel}
        className={cn(
          "fixed bottom-6 right-6 z-40 inline-flex size-12 items-center justify-center rounded-full border border-[#2f81f7]/60 bg-[#1f6feb] text-white shadow-[0_18px_48px_rgba(1,4,9,0.45)] transition-all duration-200 hover:bg-[#388bfd] focus:outline-none focus:ring-2 focus:ring-[#58a6ff] focus:ring-offset-2 focus:ring-offset-[#0d1117] motion-reduce:transition-none",
          isOpen && !isMinimized && "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        <MessageSquareText className="size-5" />
        {hasUnread ? (
          <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-[#f85149]" />
        ) : null}
      </button>

      {isOpen && !isMinimized ? (
        <div className="fixed bottom-6 right-6 z-40 origin-bottom-right translate-y-0 scale-100 opacity-100 transition-all duration-200 ease-out motion-reduce:transition-none">
          <section
            aria-label="Floating chat"
            className="relative flex h-[min(31.25rem,calc(100vh-6rem))] w-[min(25rem,calc(100vw-5rem))] max-w-[calc(100vw-5rem)] resize flex-col overflow-hidden rounded-2xl border border-[#30363d] bg-[#0d1117]/96 shadow-[0_30px_80px_rgba(1,4,9,0.55)] backdrop-blur-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#30363d] bg-[linear-gradient(180deg,#11161d_0%,#0d1117_100%)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#f0f6fc]">Chat</p>
                <p className="text-xs text-[#8b949e]">
                  Project-aware assistant available from any page.
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Minimize chat"
                  title="Minimize"
                  onClick={minimizePanel}
                  className="inline-flex size-8 items-center justify-center rounded-md text-[#8b949e] transition-colors hover:bg-[#161b22] hover:text-[#e6edf3]"
                >
                  <Minus className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Close chat"
                  title="Close"
                  onClick={closePanel}
                  className="inline-flex size-8 items-center justify-center rounded-md text-[#8b949e] transition-colors hover:bg-[#161b22] hover:text-[#e6edf3]"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1">
              <Chat
                initialProjectKey={activeProjectKey ?? undefined}
                onAssistantMessage={() => {
                  if (!isOpen || isMinimized) {
                    setHasUnread(true);
                  }
                }}
              />
            </div>

            <div className="pointer-events-none absolute bottom-2 right-2 text-[10px] uppercase tracking-[0.16em] text-[#6e7681]">
              Resize
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
