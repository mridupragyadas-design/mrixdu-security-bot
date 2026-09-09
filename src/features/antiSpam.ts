import { Telegraf } from "telegraf";
import { getChatConfig, saveChatConfig } from "../db";
import { requireAdmin, isUserAdmin } from "../utils";

const FLOOD_WINDOW_MS = 8000; // look at messages in the last 8 seconds
const FLOOD_THRESHOLD = 5; // more than this many in the window = spam
const MUTE_SECONDS = 5 * 60;
const WARNING_COOLDOWN_MS = 30000; // don't spam a warning for the same user repeatedly

// In-memory only (not persisted) — flood detection is inherently about
// recent activity, so losing this on restart is harmless.
const recentMessages = new Map<string, number[]>(); // "chatId:userId" -> timestamps
const recentWarnings = new Map<string, number>(); // "chatId:userId" -> last warning time

export function registerAntiSpam(bot: Telegraf): void {
  bot.command("antispam", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const arg = (ctx.message as any).text.split(" ")[1]?.toLowerCase();
    if (arg !== "on" && arg !== "off") {
      return ctx.reply("Usage: /antispam on  |  /antispam off");
    }
    const config = getChatConfig(ctx.chat.id);
    config.antiSpamEnabled = arg === "on";
    saveChatConfig(ctx.chat.id, config);
    await ctx.reply(`🛡️ Anti-Spam is now ${config.antiSpamEnabled ? "ON" : "OFF"}.`);
  });

  bot.on("message", async (ctx, next) => {
    const config = getChatConfig(ctx.chat.id);
    if (!config.antiSpamEnabled) return next();
    const userId = ctx.from?.id;
    if (!userId) return next();
    if (await isUserAdmin(ctx)) return next();

    const key = `${ctx.chat.id}:${userId}`;
    const now = Date.now();
    const timestamps = (recentMessages.get(key) || []).filter((t) => now - t < FLOOD_WINDOW_MS);
    timestamps.push(now);
    recentMessages.set(key, timestamps);

    if (timestamps.length <= FLOOD_THRESHOLD) return next();

    // Flooding: delete the message and mute briefly
    try {
      await ctx.deleteMessage();
    } catch {
      // ignore
    }
    try {
      await ctx.telegram.restrictChatMember(ctx.chat.id, userId, {
        permissions: {
          can_send_messages: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_other_messages: false,
        },
        until_date: Math.floor(now / 1000) + MUTE_SECONDS,
      });
    } catch {
      // ignore, e.g. bot lacks restrict rights
    }

    const lastWarned = recentWarnings.get(key) || 0;
    if (now - lastWarned > WARNING_COOLDOWN_MS) {
      recentWarnings.set(key, now);
      try {
        await ctx.reply(`🛡️ Anti-Spam: muted a user for ${MUTE_SECONDS / 60} minutes for flooding the chat.`);
      } catch {
        // ignore
      }
    }
    // message already deleted, don't pass along
  });
}
