import { Telegraf } from "telegraf";
import { getChatConfig, saveChatConfig } from "../db";
import { getISTDateKey } from "../utils";
import { ChatConfig } from "../types";

type Period = "today" | "week" | "month";

function totalForPeriod(dayCounts: Record<string, number> = {}, period: Period): number {
  if (period === "today") {
    return dayCounts[getISTDateKey()] || 0;
  }
  if (period === "week") {
    let total = 0;
    const now = Date.now();
    for (let i = 0; i < 7; i++) {
      const key = getISTDateKey(new Date(now - i * 24 * 60 * 60 * 1000));
      total += dayCounts[key] || 0;
    }
    return total;
  }
  // month: current calendar month
  const monthPrefix = getISTDateKey().slice(0, 7);
  let total = 0;
  for (const [key, count] of Object.entries(dayCounts)) {
    if (key.startsWith(monthPrefix)) total += count;
  }
  return total;
}

function rankedTotals(config: ChatConfig, period: Period): Array<{ userId: string; total: number }> {
  return Object.entries(config.messageStats)
    .map(([userId, dayCounts]) => ({ userId, total: totalForPeriod(dayCounts, period) }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function registerStats(bot: Telegraf): void {
  // Count every message (text or not) from real users, and remember their name for the leaderboard
  bot.on("message", async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId && !ctx.from?.is_bot) {
      const config = getChatConfig(ctx.chat.id);
      const key = String(userId);
      const todayKey = getISTDateKey();
      if (!config.messageStats[key]) config.messageStats[key] = {};
      config.messageStats[key][todayKey] = (config.messageStats[key][todayKey] || 0) + 1;
      config.userNames[key] = ctx.from.first_name || config.userNames[key] || "Someone";
      saveChatConfig(ctx.chat.id, config);
    }
    return next();
  });

  bot.command("mystatus", async (ctx) => {
    const userId = ctx.from.id;
    const config = getChatConfig(ctx.chat.id);
    const dayCounts = config.messageStats[String(userId)] || {};

    const today = totalForPeriod(dayCounts, "today");
    const week = totalForPeriod(dayCounts, "week");
    const month = totalForPeriod(dayCounts, "month");

    const weekRanking = rankedTotals(config, "week");
    const rankIndex = weekRanking.findIndex((e) => e.userId === String(userId));
    const rankText =
      rankIndex >= 0
        ? `🏅 Rank #${rankIndex + 1} of ${weekRanking.length} this week`
        : "🏅 Not ranked yet this week — send a message!";

    await ctx.reply(
      `📊 *Your message stats in this group*\n\n` +
        `Today: ${today}\n` +
        `Last 7 days: ${week}\n` +
        `This month: ${month}\n\n` +
        `${rankText}`,
      { parse_mode: "Markdown" }
    );
  });

  bot.command("leaderboard", async (ctx) => {
    const arg = ((ctx.message as any).text.split(" ")[1] || "week").toLowerCase();
    const period: Period = arg === "today" || arg === "day" ? "today" : arg === "month" ? "month" : "week";
    const config = getChatConfig(ctx.chat.id);
    const ranking = rankedTotals(config, period).slice(0, 10);

    if (ranking.length === 0) {
      return ctx.reply("No messages tracked yet for this period.");
    }

    const medals = ["🥇", "🥈", "🥉"];
    const lines = ranking.map((entry, i) => {
      const medal = medals[i] || `${i + 1}.`;
      const name = config.userNames[entry.userId] || `User ${entry.userId}`;
      return `${medal} ${name} — ${entry.total}`;
    });

    const periodLabel = period === "today" ? "Today" : period === "month" ? "This Month" : "This Week";
    // Deliberately plain text, no parse_mode: usernames can contain almost
    // any character (including ones that break Markdown/HTML parsing), and
    // this list is just a readout, not something that needs bold/italic.
    await ctx.reply(
      `🏆 Leaderboard — ${periodLabel}\n\n${lines.join("\n")}\n\nTip: /leaderboard today|week|month`
    );
  });
}
