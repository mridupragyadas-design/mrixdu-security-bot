import { Telegraf, Markup } from "telegraf";
import { getChatConfig } from "../db";

export function registerForceJoin(bot: Telegraf): void {
  bot.on("message", async (ctx, next) => {
    const config = getChatConfig(ctx.chat.id);
    if (!config.forceJoinChannel) return next();
    if (ctx.chat.type === "private") return next();
    const userId = ctx.from?.id;
    if (!userId) return next();

    try {
      const member = await ctx.telegram.getChatMember(config.forceJoinChannel, userId);
      if (member.status === "left" || member.status === "kicked") {
        try {
          await ctx.deleteMessage();
        } catch {
          // ignore
        }
        await ctx.reply(
          `👋 Please join ${config.forceJoinChannel} first, then send your message again.`,
          Markup.inlineKeyboard([
            Markup.button.url("Join Channel", `https://t.me/${config.forceJoinChannel.replace("@", "")}`),
          ])
        );
        return;
      }
    } catch {
      // If the bot can't check (e.g. not admin of the channel), fail open rather than blocking everyone
    }
    return next();
  });
}
