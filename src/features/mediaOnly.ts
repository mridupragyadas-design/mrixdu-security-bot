import { Telegraf } from "telegraf";
import { getChatConfig, saveChatConfig } from "../db";
import { requireAdmin, isUserAdmin } from "../utils";

export function registerMediaOnly(bot: Telegraf): void {
  bot.command("media", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const arg = (ctx.message as any).text.split(" ")[1]?.toLowerCase();
    if (arg !== "on" && arg !== "off") {
      return ctx.reply("Usage: /media on  |  /media off");
    }
    const config = getChatConfig(ctx.chat.id);
    config.mediaOnly = arg === "on";
    saveChatConfig(ctx.chat.id, config);
    await ctx.reply(`📸 Media-Only mode is now ${config.mediaOnly ? "ON" : "OFF"}.`);
  });

  bot.on("message", async (ctx, next) => {
    const config = getChatConfig(ctx.chat.id);
    if (!config.mediaOnly) return next();

    const msg: any = ctx.message;
    const hasMedia = Boolean(
      msg.photo || msg.video || msg.animation || msg.document || msg.sticker || msg.voice || msg.video_note
    );
    if (hasMedia) return next();
    // Text-only message while media-only is on: delete unless sender is admin
    if (await isUserAdmin(ctx)) return next();
    try {
      await ctx.deleteMessage();
    } catch {
      // ignore if bot lacks delete rights
    }
  });
}
