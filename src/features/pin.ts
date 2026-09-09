import { Telegraf } from "telegraf";
import { requireAdmin } from "../utils";

export function registerPin(bot: Telegraf): void {
  bot.command("pin", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const reply = (ctx.message as any).reply_to_message;
    if (!reply) {
      return ctx.reply("Reply to the message you want to pin with /pin.");
    }
    const silent = (ctx.message as any).text.split(" ")[1]?.toLowerCase() === "silent";
    try {
      await ctx.telegram.pinChatMessage(ctx.chat.id, reply.message_id, {
        disable_notification: silent,
      });
      await ctx.reply("📌 Pinned.");
    } catch (err) {
      await ctx.reply(`Couldn't pin that message: ${(err as Error).message}`);
    }
  });

  bot.command("unpin", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const reply = (ctx.message as any).reply_to_message;
    try {
      if (reply) {
        await ctx.telegram.unpinChatMessage(ctx.chat.id, reply.message_id);
      } else {
        await ctx.telegram.unpinChatMessage(ctx.chat.id); // unpins the most recent pin
      }
      await ctx.reply("📌 Unpinned.");
    } catch (err) {
      await ctx.reply(`Couldn't unpin: ${(err as Error).message}`);
    }
  });
}
