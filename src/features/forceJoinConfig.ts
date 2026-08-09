import { Telegraf } from "telegraf";
import { getChatConfig, saveChatConfig } from "../db";
import { requireAdmin } from "../utils";

export function registerForceJoinConfig(bot: Telegraf): void {
  bot.command("setjoin", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const arg = (ctx.message as any).text.split(" ")[1];
    const config = getChatConfig(ctx.chat.id);

    if (!arg || arg.toLowerCase() === "off") {
      config.forceJoinChannel = null;
      saveChatConfig(ctx.chat.id, config);
      return ctx.reply("✅ Force Join disabled.");
    }
    if (!arg.startsWith("@")) {
      return ctx.reply("Usage: /setjoin @channelusername   or   /setjoin off\n(Bot must be an admin of that channel.)");
    }
    config.forceJoinChannel = arg;
    saveChatConfig(ctx.chat.id, config);
    await ctx.reply(`✅ Force Join enabled: users must join ${arg} before posting.`);
  });
}
