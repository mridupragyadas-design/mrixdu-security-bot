import { Telegraf } from "telegraf";
import { getChatConfig, saveChatConfig } from "../db";
import { requireAdmin, isUserAdmin } from "../utils";

export function registerBlockPack(bot: Telegraf): void {
  bot.command("blockpack", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const reply = (ctx.message as any).reply_to_message;
    const sticker = reply?.sticker;
    if (!sticker) {
      return ctx.reply("Reply to a sticker message with /blockpack to ban its pack.");
    }
    if (!sticker.set_name) {
      return ctx.reply("This sticker isn't part of a named pack, so it can't be blocked by pack.");
    }
    const config = getChatConfig(ctx.chat.id);
    if (!config.blockedPacks.includes(sticker.set_name)) {
      config.blockedPacks.push(sticker.set_name);
      saveChatConfig(ctx.chat.id, config);
    }
    await ctx.reply(`🚫 Sticker pack "${sticker.set_name}" is now blocked.`);
  });

  bot.on("message", async (ctx, next) => {
    const sticker = (ctx.message as any).sticker;
    if (!sticker?.set_name) return next();
    const config = getChatConfig(ctx.chat.id);
    if (!config.blockedPacks.includes(sticker.set_name)) return next();
    if (await isUserAdmin(ctx)) return next();
    try {
      await ctx.deleteMessage();
    } catch {
      // ignore
    }
  });
}
