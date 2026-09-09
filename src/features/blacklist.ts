import { Telegraf } from "telegraf";
import { getChatConfig, saveChatConfig } from "../db";
import { requireAdmin, isUserAdmin } from "../utils";

export function registerBlacklist(bot: Telegraf): void {
  bot.command("addslang", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const word = (ctx.message as any).text.split(" ").slice(1).join(" ").toLowerCase().trim();
    if (!word) return ctx.reply("Usage: /addslang <word>");
    const config = getChatConfig(ctx.chat.id);
    if (!config.blacklist.includes(word)) {
      config.blacklist.push(word);
      saveChatConfig(ctx.chat.id, config);
    }
    await ctx.reply(`🚫 "${word}" added to the blacklist.`);
  });

  bot.command("delslang", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const word = (ctx.message as any).text.split(" ").slice(1).join(" ").toLowerCase().trim();
    if (!word) return ctx.reply("Usage: /delslang <word>");
    const config = getChatConfig(ctx.chat.id);
    config.blacklist = config.blacklist.filter((w) => w !== word);
    saveChatConfig(ctx.chat.id, config);
    await ctx.reply(`✅ "${word}" removed from the blacklist.`);
  });

  bot.command("slanglist", async (ctx) => {
    const config = getChatConfig(ctx.chat.id);
    if (config.blacklist.length === 0) return ctx.reply("Blacklist is empty.");
    await ctx.reply(`🚫 Blocked words:\n${config.blacklist.join(", ")}`);
  });

  bot.on("message", async (ctx, next) => {
    const msg: any = ctx.message;
    const text: string | undefined = msg.text || msg.caption;
    if (!text) return next();
    const config = getChatConfig(ctx.chat.id);
    if (config.blacklist.length === 0) return next();
    if (await isUserAdmin(ctx)) return next();

    const lower = text.toLowerCase();
    const hit = config.blacklist.some((word) => {
      const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      return pattern.test(lower);
    });
    if (hit) {
      try {
        await ctx.deleteMessage();
      } catch {
        // ignore
      }
      return; // don't call next(), message is gone
    }
    return next();
  });
}
