import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export type WorkspaceTerminalConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "exited";

interface WorkspaceTerminalProps {
  sessionId: string;
  projectKey: string;
  cwd: string;
  active: boolean;
  closing?: boolean;
  onClosed?: () => void;
  onStateChange?: (
    state: WorkspaceTerminalConnectionState,
    meta?: { exitCode: number | null; signal: string | null },
  ) => void;
}

interface TerminalSnapshotMessage {
  type: "snapshot";
  sessionId: string;
  cwd: string;
  history: string;
  status: "running" | "exited";
  exitCode: number | null;
  signal: string | null;
  cols: number;
  rows: number;
}

interface TerminalOutputMessage {
  type: "output";
  sessionId: string;
  data: string;
}

interface TerminalExitMessage {
  type: "exit";
  sessionId: string;
  code: number | null;
  signal: string | null;
}

interface TerminalErrorMessage {
  type: "error";
  sessionId?: string;
  message: string;
}

type ServerMessage =
  | TerminalSnapshotMessage
  | TerminalOutputMessage
  | TerminalExitMessage
  | TerminalErrorMessage;

const TERMINAL_THEME: ITheme = {
  background: "#010409",
  foreground: "#e6edf3",
  cursor: "#58a6ff",
  selectionBackground: "#1f6feb44",
  black: "#484f58",
  red: "#f85149",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39c5cf",
  white: "#b1bac4",
  brightBlack: "#6e7681",
  brightRed: "#ff7b72",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d4dd",
  brightWhite: "#f0f6fc",
};

export function WorkspaceTerminal(props: WorkspaceTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const disposedRef = useRef(false);
  const manualCloseRef = useRef(false);
  const onStateChangeRef = useRef(props.onStateChange);
  const onClosedRef = useRef(props.onClosed);

  useEffect(() => {
    onStateChangeRef.current = props.onStateChange;
  }, [props.onStateChange]);

  useEffect(() => {
    onClosedRef.current = props.onClosed;
  }, [props.onClosed]);

  useEffect(() => {
    const mountNode = containerRef.current;
    if (!mountNode) {
      return;
    }

    disposedRef.current = false;
    manualCloseRef.current = false;

    const fitAddon = new FitAddon();
    const terminal = new XTerm({
      convertEol: true,
      cursorBlink: true,
      fontFamily:
        '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: TERMINAL_THEME,
    });

    terminal.loadAddon(fitAddon);
    terminal.open(mountNode);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const updateState = (
      state: WorkspaceTerminalConnectionState,
      meta?: { exitCode: number | null; signal: string | null },
    ) => {
      onStateChangeRef.current?.(state, meta);
    };

    const sendMessage = (message: Record<string, unknown>) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      socket.send(JSON.stringify(message));
    };

    const fitTerminal = () => {
      const nextTerminal = terminalRef.current;
      const nextFitAddon = fitAddonRef.current;
      const nextContainer = containerRef.current;
      if (!nextTerminal || !nextFitAddon || !nextContainer) {
        return;
      }
      if (nextContainer.clientWidth === 0 || nextContainer.clientHeight === 0) {
        return;
      }
      nextFitAddon.fit();
      sendMessage({
        type: "resize",
        sessionId: props.sessionId,
        cols: nextTerminal.cols,
        rows: nextTerminal.rows,
      });
    };

    const connect = () => {
      if (disposedRef.current || manualCloseRef.current) {
        return;
      }

      updateState(socketRef.current ? "reconnecting" : "connecting");
      const socket = new WebSocket(buildTerminalSocketUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        updateState("connected");
        fitTerminal();
        sendMessage({
          type: "connect",
          sessionId: props.sessionId,
          projectKey: props.projectKey,
          cwd: props.cwd,
          cols: terminal.cols,
          rows: terminal.rows,
        });
      };

      socket.onmessage = (event) => {
        let message: ServerMessage | null = null;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          message = null;
        }
        if (!message || ("sessionId" in message && message.sessionId !== props.sessionId)) {
          return;
        }

        switch (message.type) {
          case "snapshot":
            terminal.reset();
            if (message.history) {
              terminal.write(message.history);
            }
            updateState(
              message.status === "exited" ? "exited" : "connected",
              {
                exitCode: message.exitCode,
                signal: message.signal,
              },
            );
            if (props.active) {
              window.requestAnimationFrame(() => {
                fitTerminal();
                terminal.focus();
              });
            }
            break;
          case "output":
            terminal.write(message.data);
            break;
          case "exit":
            updateState("exited", {
              exitCode: message.code,
              signal: message.signal,
            });
            terminal.write(
              `\r\n[process exited${formatExitSuffix(message.code, message.signal)}]\r\n`,
            );
            break;
          case "error":
            terminal.write(`\r\n[terminal] ${message.message}\r\n`);
            break;
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (disposedRef.current || manualCloseRef.current) {
          updateState("disconnected");
          return;
        }
        updateState("reconnecting");
        reconnectTimerRef.current = window.setTimeout(connect, 1500);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    const dataDisposable = terminal.onData((data) => {
      sendMessage({
        type: "input",
        sessionId: props.sessionId,
        data,
      });
    });

    resizeObserverRef.current = new ResizeObserver(() => {
      if (!props.active) {
        return;
      }
      window.requestAnimationFrame(fitTerminal);
    });
    resizeObserverRef.current.observe(mountNode);

    connect();

    return () => {
      disposedRef.current = true;
      dataDisposable.dispose();
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      resizeObserverRef.current?.disconnect();
      socketRef.current?.close();
      fitAddon.dispose();
      terminal.dispose();
      fitAddonRef.current = null;
      terminalRef.current = null;
      socketRef.current = null;
    };
  }, [props.cwd, props.projectKey, props.sessionId]);

  useEffect(() => {
    if (!props.active) {
      return;
    }

    window.requestAnimationFrame(() => {
      const fitAddon = fitAddonRef.current;
      const terminal = terminalRef.current;
      const socket = socketRef.current;
      const container = containerRef.current;
      if (!fitAddon || !terminal || !container) {
        return;
      }
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        return;
      }
      fitAddon.fit();
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "resize",
            sessionId: props.sessionId,
            cols: terminal.cols,
            rows: terminal.rows,
          }),
        );
      }
      terminal.focus();
    });
  }, [props.active, props.sessionId]);

  useEffect(() => {
    if (!props.closing || manualCloseRef.current) {
      return;
    }

    manualCloseRef.current = true;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
    }
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "close",
          sessionId: props.sessionId,
        }),
      );
    }
    socketRef.current?.close();
    onClosedRef.current?.();
  }, [props.closing, props.sessionId]);

  return (
    <div
      className={cn(
        "h-full min-h-0",
        props.active ? "block" : "hidden",
      )}
    >
      <div ref={containerRef} className="h-full w-full bg-[#010409]" />
    </div>
  );
}

function buildTerminalSocketUrl() {
  const url = new URL("/ws/terminal", window.location.href);
  url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function formatExitSuffix(code: number | null, signal: string | null) {
  if (signal) {
    return `: ${signal}`;
  }
  if (code === null) {
    return "";
  }
  return `: ${code}`;
}
