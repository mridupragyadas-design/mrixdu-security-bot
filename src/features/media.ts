import { Telegraf } from "telegraf";
import { getChatConfig, saveChatConfig } from "../db";
import { requireAdmin, isUserAdmin } from "../utils";

// /media on  = normal (photos, videos, stickers, etc. allowed)
// /media off = text-only mode: anything that isn't plain text gets deleted
export function registerMedia(bot: Telegraf): void {
  bot.command("media", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const arg = (ctx.message as any).text.split(" ")[1]?.toLowerCase();
    if (arg !== "on" && arg !== "off") {
      return ctx.reply("Usage: /media on  (allow everything)  |  /media off (text-only, auto-delete media)");
    }
    const config = getChatConfig(ctx.chat.id);
    config.mediaOff = arg === "off";
    saveChatConfig(ctx.chat.id, config);
    await ctx.reply(
      config.mediaOff
        ? "📵 Text-only mode is ON — photos, videos, stickers, GIFs, voice notes, and files will be deleted."
        : "📸 Text-only mode is OFF — media is allowed again."
    );
  });

  bot.on("message", async (ctx, next) => {
    const config = getChatConfig(ctx.chat.id);
    if (!config.mediaOff) return next();

    const msg: any = ctx.message;
    const hasNonText = Boolean(
      msg.photo ||
        msg.video ||
        msg.animation ||
        msg.document ||
        msg.sticker ||
        msg.voice ||
        msg.video_note ||
        msg.audio
    );
    if (!hasNonText) return next();
    if (await isUserAdmin(ctx)) return next();
    try {
      await ctx.deleteMessage();
    } catch {
      // ignore if bot lacks delete rights
    }
  });
}
