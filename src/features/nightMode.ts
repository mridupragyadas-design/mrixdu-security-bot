import { Telegraf } from "telegraf";
import * as cron from "node-cron";
import { getChatConfig, saveChatConfig } from "../db";
import { requireAdmin, parseTime, getISTTime, isUserAdmin } from "../utils";

const IST = "Asia/Kolkata";
const announceTasks = new Map<string, cron.ScheduledTask[]>();

function clearSchedules(chatId: number): void {
  const key = String(chatId);
  const tasks = announceTasks.get(key);
  if (tasks) {
    tasks.forEach((t) => t.stop());
    announceTasks.delete(key);
  }
}

// True if the current IST time falls inside the configured night window.
// Handles windows that cross midnight (e.g. 23:00 -> 06:00).
function isWithinNightWindow(config: ReturnType<typeof getChatConfig>): boolean {
  if (!config.nightMode.enabled) return false;
  const start = parseTime(config.nightMode.start);
  const end = parseTime(config.nightMode.end);
  if (!start || !end) return false;

  const now = getISTTime();
  const nowMinutes = now.hour * 60 + now.minute;
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;
  if (startMinutes === endMinutes) return false;

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  // window wraps past midnight
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

// These cron jobs only send the announcement messages. The actual deletion
// is driven live off isWithinNightWindow() on every message, so it keeps
// working correctly even if the bot restarts mid-window and misses a cron tick.
function scheduleAnnouncements(bot: Telegraf, chatId: number): void {
  clearSchedules(chatId);
  const config = getChatConfig(chatId);
  if (!config.nightMode.enabled) return;

  const start = parseTime(config.nightMode.start);
  const end = parseTime(config.nightMode.end);
  if (!start || !end) return;

  const startTask = cron.schedule(
    `${start.minute} ${start.hour} * * *`,
    async () => {
      try {
        await bot.telegram.sendMessage(
          chatId,
          "🌙 Night Mode is now active — any messages sent until morning will be automatically deleted."
        );
      } catch {
        // ignore
      }
    },
    { timezone: IST }
  );

  const endTask = cron.schedule(
    `${end.minute} ${end.hour} * * *`,
    async () => {
      try {
        await bot.telegram.sendMessage(chatId, "☀️ Night Mode lifted. Good morning!");
      } catch {
        // ignore
      }
    },
    { timezone: IST }
  );

  announceTasks.set(String(chatId), [startTask, endTask]);
}

export function registerNightMode(bot: Telegraf): void {
  bot.command("setnight", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const parts = (ctx.message as any).text.split(" ").slice(1);
    if (parts.length === 1 && parts[0].toLowerCase() === "off") {
      const config = getChatConfig(ctx.chat.id);
      config.nightMode.enabled = false;
      saveChatConfig(ctx.chat.id, config);
      clearSchedules(ctx.chat.id);
      return ctx.reply("🌙 Night Mode disabled.");
    }
    if (parts.length !== 2) {
      return ctx.reply("Usage: /setnight HH:MM HH:MM  (IST, e.g. /setnight 23:00 06:00)\nOr: /setnight off");
    }
    const start = parseTime(parts[0]);
    const end = parseTime(parts[1]);
    if (!start || !end) {
      return ctx.reply("Times must be in 24-hour HH:MM format, e.g. 23:00");
    }
    const config = getChatConfig(ctx.chat.id);
    config.nightMode = { enabled: true, start: parts[0], end: parts[1] };
    saveChatConfig(ctx.chat.id, config);
    scheduleAnnouncements(bot, ctx.chat.id);
    await ctx.reply(
      `🌙 Night Mode set: from ${parts[0]} to ${parts[1]} IST, any message sent in that window gets auto-deleted.`
    );
  });

  bot.command("nighton", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const config = getChatConfig(ctx.chat.id);
    config.nightMode.enabled = true;
    saveChatConfig(ctx.chat.id, config);
    scheduleAnnouncements(bot, ctx.chat.id);
    await ctx.reply(
      `🌙 Night Mode enabled: ${config.nightMode.start} to ${config.nightMode.end} IST.\nUse /setnight HH:MM HH:MM to change the times.`
    );
  });

  bot.command("nightoff", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const config = getChatConfig(ctx.chat.id);
    config.nightMode.enabled = false;
    saveChatConfig(ctx.chat.id, config);
    clearSchedules(ctx.chat.id);
    await ctx.reply("☀️ Night Mode disabled.");
  });

  // The actual enforcement: delete any message from a non-admin sent during
  // the configured window. No permission locking involved.
  bot.on("message", async (ctx, next) => {
    const config = getChatConfig(ctx.chat.id);
    if (!isWithinNightWindow(config)) return next();
    if (await isUserAdmin(ctx)) return next();
    try {
      await ctx.deleteMessage();
    } catch {
      // ignore
    }
    return; // message removed, don't pass to later handlers
  });
}

// Call once at startup to re-arm announcement schedules for chats that had
// night mode enabled before the restart. Deletion itself works regardless.
export function restoreNightModeSchedules(bot: Telegraf, chatIds: number[]): void {
  chatIds.forEach((id) => scheduleAnnouncements(bot, id));
}
