import { Telegraf } from "telegraf";
import { mentionUser } from "../utils";

export function registerAdminAlert(bot: Telegraf): void {
  bot.on("message", async (ctx, next) => {
    const text: string | undefined = (ctx.message as any).text;
    if (!text || !/(^|\s)@admin(\s|$)/i.test(text)) return next();
    if (ctx.chat.type === "private") return next();

    try {
      const admins = await ctx.telegram.getChatAdministrators(ctx.chat.id);
      const humans = admins.filter((a) => !a.user.is_bot);
      if (humans.length === 0) return next();
      const mentions = humans.map((a) => mentionUser(a.user.id, a.user.first_name)).join(" ");
      await ctx.reply(`🚨 Admin attention requested by ${ctx.from?.first_name}:\n${mentions}`, {
        parse_mode: "MarkdownV2",
        reply_parameters: { message_id: ctx.message!.message_id },
      } as any);
    } catch {
      // ignore
    }
    return next();
  });
}
