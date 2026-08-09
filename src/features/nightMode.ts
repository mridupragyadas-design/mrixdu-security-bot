import { Telegraf } from "telegraf";
import * as cron from "node-cron";
import { getChatConfig, saveChatConfig } from "../db";
import { requireAdmin, parseTime } from "../utils";

const IST = "Asia/Kolkata";
const scheduledTasks = new Map<string, cron.ScheduledTask[]>();

function clearSchedules(chatId: number): void {
  const key = String(chatId);
  const tasks = scheduledTasks.get(key);
  if (tasks) {
    tasks.forEach((t) => t.stop());
    scheduledTasks.delete(key);
  }
}

function scheduleNightMode(bot: Telegraf, chatId: number): void {
  clearSchedules(chatId);
  const config = getChatConfig(chatId);
  if (!config.nightMode.enabled) return;

  const start = parseTime(config.nightMode.start);
  const end = parseTime(config.nightMode.end);
  if (!start || !end) return;

  const lockTask = cron.schedule(
    `${start.minute} ${start.hour} * * *`,
    async () => {
      try {
        await bot.telegram.setChatPermissions(chatId, {
          can_send_messages: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_other_messages: false,
        });
        const cfg = getChatConfig(chatId);
        cfg.wasLockedByNightMode = true;
        saveChatConfig(chatId, cfg);
        await bot.telegram.sendMessage(chatId, "🌙 Night Mode: the group is now locked until morning.");
      } catch {
        // ignore, e.g. bot lost admin rights
      }
    },
    { timezone: IST }
  );

  const unlockTask = cron.schedule(
    `${end.minute} ${end.hour} * * *`,
    async () => {
      try {
        await bot.telegram.setChatPermissions(chatId, {
          can_send_messages: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_other_messages: true,
        });
        const cfg = getChatConfig(chatId);
        cfg.wasLockedByNightMode = false;
        saveChatConfig(chatId, cfg);
        await bot.telegram.sendMessage(chatId, "☀️ Night Mode lifted. Good morning!");
      } catch {
        // ignore
      }
    },
    { timezone: IST }
  );

  scheduledTasks.set(String(chatId), [lockTask, unlockTask]);
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
    scheduleNightMode(bot, ctx.chat.id);
    await ctx.reply(`🌙 Night Mode set: locks at ${parts[0]} IST, unlocks at ${parts[1]} IST.`);
  });
}

// Call once at startup to re-arm schedules for all chats that had night mode enabled
export function restoreNightModeSchedules(bot: Telegraf, chatIds: number[]): void {
  chatIds.forEach((id) => scheduleNightMode(bot, id));
}
