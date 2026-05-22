import type { EventRecord } from "@autoclawdev/types";
import { getRunEventsById, getRunRecordById } from "../../lib/orchestrator.js";
import { readWebAuditEventsFromRoot } from "../../lib/webAudit.js";
import { handleTelegramCallback, handleTelegramCommand, type TelegramCommandResult } from "./commands.js";

interface TelegramUser {
  id: number;
  username?: string;
}

interface TelegramChat {
  id: number;
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: TelegramChat;
  from?: TelegramUser;
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: TelegramMessage;
  from?: TelegramUser;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result: T;
}

interface TelegramBotProfile {
  id: number;
  username?: string;
}

interface TelegramInlineKeyboardButton {
  text: string;
  callback_data: string;
}

interface TelegramRunWatchState {
  chatId: number;
  runId: string;
  lastStatus?: string;
  sentEventCount: number;
  startedAtMs: number;
}

export interface TelegramControlStatus {
  enabled: boolean;
  running: boolean;
  username?: string;
  allowedChats: number[];
  lastUpdateId?: number;
  lastError?: string;
}

function getAllowedChats(): number[] {
  return String(process.env.AUTOCLAWDEV_TELEGRAM_ALLOWED_CHAT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

class TelegramControlService {
  private readonly token = process.env.AUTOCLAWDEV_TELEGRAM_BOT_TOKEN ?? "";
  private running = false;
  private offset = 0;
  private username: string | undefined;
  private lastError: string | undefined;
  private loopPromise: Promise<void> | undefined;
  private readonly runWatches = new Map<string, TelegramRunWatchState>();

  isEnabled(): boolean {
    return this.token.trim().length > 0;
  }

  getStatus(): TelegramControlStatus {
    return {
      enabled: this.isEnabled(),
      running: this.running,
      username: this.username,
      allowedChats: getAllowedChats(),
      lastUpdateId: this.offset || undefined,
      lastError: this.lastError,
    };
  }

  async start(): Promise<void> {
    if (!this.isEnabled() || this.running) {
      return;
    }

    const profile = await this.callApi<TelegramBotProfile>("getMe", {});
    this.username = profile.username;
    this.running = true;
    this.loopPromise = this.pollLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loopPromise;
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        const updates = await this.callApi<TelegramUpdate[]>("getUpdates", {
          offset: this.offset + 1,
          timeout: Number(process.env.AUTOCLAWDEV_TELEGRAM_POLL_TIMEOUT_SECONDS ?? 25),
          allowed_updates: ["message", "callback_query"],
        });

        for (const update of updates) {
          this.offset = Math.max(this.offset, update.update_id);
          await this.handleUpdate(update);
        }
        this.lastError = undefined;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        await new Promise((resolve) => setTimeout(resolve, 3_000));
      }
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    const callbackQuery = update.callback_query;
    if (callbackQuery) {
      await this.handleCallbackQuery(callbackQuery);
      return;
    }

    const message = update.message;
    if (!message?.text?.trim()) {
      return;
    }

    if (!(await this.ensureAuthorizedChat(message.chat.id))) {
      return;
    }

    const result = await handleTelegramCommand(message.text.trim());
    await this.sendResult(message.chat.id, result);
  }

  private async handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    const chatId = query.message?.chat.id;
    if (!chatId || !query.data) {
      await this.answerCallbackQuery(query.id, "Missing callback payload.");
      return;
    }

    if (!(await this.ensureAuthorizedChat(chatId))) {
      await this.answerCallbackQuery(query.id, "Unauthorized chat.");
      return;
    }

    const result = await handleTelegramCallback(query.data);
    await this.answerCallbackQuery(query.id, "Updated.");
    await this.sendResult(chatId, result, query.message?.message_id);
  }

  private async ensureAuthorizedChat(chatId: number): Promise<boolean> {
    const allowedChats = getAllowedChats();
    if (allowedChats.length > 0 && !allowedChats.includes(chatId)) {
      await this.sendMessage(chatId, "This chat is not authorized for AutoClawDev control.");
      return false;
    }
    return true;
  }

  private async sendResult(chatId: number, result: TelegramCommandResult, editMessageId?: number): Promise<void> {
    const chunks = chunkText(result.text, 3500);
    const replyMarkup = result.buttons ? {
      inline_keyboard: result.buttons.map((row) => row.map<TelegramInlineKeyboardButton>((button) => ({
        text: button.text,
        callback_data: button.callbackData,
      }))),
    } : undefined;

    if (editMessageId && chunks.length === 1) {
      await this.callApi("editMessageText", {
        chat_id: chatId,
        message_id: editMessageId,
        text: chunks[0],
        reply_markup: replyMarkup,
      });
    } else {
      for (const [index, chunk] of chunks.entries()) {
        await this.callApi("sendMessage", {
          chat_id: chatId,
          text: chunk,
          reply_markup: index === chunks.length - 1 ? replyMarkup : undefined,
        });
      }
    }

    if (result.watchRunId) {
      void this.startRunWatch(chatId, result.watchRunId);
    }
  }

  private async sendMessage(chatId: number, text: string): Promise<void> {
    const chunks = chunkText(text, 3500);
    for (const chunk of chunks) {
      await this.callApi("sendMessage", {
        chat_id: chatId,
        text: chunk,
      });
    }
  }

  private async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.callApi("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
    });
  }

  private async startRunWatch(chatId: number, runId: string): Promise<void> {
    const key = `${chatId}:${runId}`;
    if (this.runWatches.has(key)) {
      return;
    }

    const located = await getRunRecordById(runId);
    const initialEvents = located
      ? (
          located.record.mode === "audit"
            ? readWebAuditEventsFromRoot(located.record.artifactRoot)
            : await getRunEventsById(runId)
        )
      : [];

    const state: TelegramRunWatchState = {
      chatId,
      runId,
      lastStatus: located?.record.status,
      sentEventCount: initialEvents.length,
      startedAtMs: Date.now(),
    };
    this.runWatches.set(key, state);
    void this.watchRunLoop(key, state);
  }

  private async watchRunLoop(key: string, state: TelegramRunWatchState): Promise<void> {
    const intervalMs = Number(process.env.AUTOCLAWDEV_TELEGRAM_STREAM_INTERVAL_MS ?? 4_000);
    const maxDurationMs = Number(process.env.AUTOCLAWDEV_TELEGRAM_STREAM_MAX_MS ?? 30 * 60_000);

    try {
      while (Date.now() - state.startedAtMs < maxDurationMs) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));

        const located = await getRunRecordById(state.runId);
        if (!located) {
          break;
        }

        const events = located.record.mode === "audit"
          ? readWebAuditEventsFromRoot(located.record.artifactRoot)
          : await getRunEventsById(state.runId);
        const freshEvents = events.slice(state.sentEventCount);
        state.sentEventCount = events.length;

        const summaryLines = summarizeRunEvents(freshEvents);
        if (summaryLines.length > 0) {
          await this.sendMessage(
            state.chatId,
            [`Run ${state.runId} update`, ...summaryLines].join("\n"),
          );
        }

        if (located.record.status !== state.lastStatus && located.record.status !== "running") {
          const statusResult = await handleTelegramCommand(`/status ${state.runId}`);
          await this.sendResult(state.chatId, statusResult);
        }
        state.lastStatus = located.record.status;

        if (isTerminalStatus(located.record.status)) {
          break;
        }
      }
    } finally {
      this.runWatches.delete(key);
    }
  }

  private async callApi<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(
        Number(process.env.AUTOCLAWDEV_TELEGRAM_API_TIMEOUT_MS ?? 15_000),
      ),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Telegram API ${method} failed with status ${response.status}`);
    }

    const body = (await response.json()) as TelegramApiResponse<T>;
    if (!body.ok) {
      throw new Error(`Telegram API ${method} returned ok=false`);
    }

    return body.result;
  }
}

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "stopped" || status === "cancelled" || status === "preflight_failed";
}

function summarizeRunEvents(
  events: Array<{ type: string; message?: string }>,
): string[] {
  const important = events.filter((event) => event.type !== "output");
  const selected = important.length > 0
    ? important.slice(-4)
    : events
        .filter((event) => event.message && event.message.trim().length > 0)
        .slice(-2);

  return selected.map(formatRunEventSummary);
}

function formatRunEventSummary(event: { type: string; message?: string }): string {
  const prefix = `- ${event.type}`;
  if (!event.message) {
    return prefix;
  }
  const singleLine = event.message.replace(/\s+/g, " ").trim();
  return `${prefix}: ${singleLine}`;
}

function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const slice = remaining.slice(0, limit);
    const splitAt = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
    const boundary = splitAt > 0 ? splitAt : limit;
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  if (remaining.length > 0) {
    chunks.push(remaining);
  }
  return chunks;
}

export const telegramControlService = new TelegramControlService();
