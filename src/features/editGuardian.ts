import { Telegraf } from "telegraf";
import { isUserAdmin } from "../utils";

// Spammers often post a clean message then edit it to add spam/links after
// passing initial review. This deletes any edited message from non-admins.
export function registerEditGuardian(bot: Telegraf): void {
  bot.on("edited_message", async (ctx) => {
    if (await isUserAdmin(ctx)) return;
    try {
      await ctx.deleteMessage((ctx.update as any).edited_message.message_id);
    } catch {
      // ignore if bot lacks delete rights or message already gone
    }
  });
}
