import { Telegraf } from "telegraf";
import { getChatConfig, saveChatConfig } from "../db";
import { getISTDateKey } from "../utils";

function sumLastNDays(dayCounts: Record<string, number> = {}, days: number): number {
  let total = 0;
  const now = Date.now();
  for (let i = 0; i < days; i++) {
    const key = getISTDateKey(new Date(now - i * 24 * 60 * 60 * 1000));
    total += dayCounts[key] || 0;
  }
  return total;
}

function sumCurrentMonth(dayCounts: Record<string, number> = {}): number {
  const monthPrefix = getISTDateKey().slice(0, 7); // "YYYY-MM"
  let total = 0;
  for (const [key, count] of Object.entries(dayCounts)) {
    if (key.startsWith(monthPrefix)) total += count;
  }
  return total;
}

export function registerStats(bot: Telegraf): void {
  // Count every message (text or not) from real users
  bot.on("message", async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId && !ctx.from?.is_bot) {
      const config = getChatConfig(ctx.chat.id);
      const key = String(userId);
      const todayKey = getISTDateKey();
      if (!config.messageStats[key]) config.messageStats[key] = {};
      config.messageStats[key][todayKey] = (config.messageStats[key][todayKey] || 0) + 1;
      saveChatConfig(ctx.chat.id, config);
    }
    return next();
  });

  bot.command("mystatus", async (ctx) => {
    const userId = ctx.from.id;
    const config = getChatConfig(ctx.chat.id);
    const dayCounts = config.messageStats[String(userId)] || {};

    const today = dayCounts[getISTDateKey()] || 0;
    const week = sumLastNDays(dayCounts, 7);
    const month = sumCurrentMonth(dayCounts);

    await ctx.reply(
      `📊 *Your message stats in this group*\n\n` +
        `Today: ${today}\n` +
        `Last 7 days: ${week}\n` +
        `This month: ${month}`,
      { parse_mode: "Markdown" }
    );
  });
}
