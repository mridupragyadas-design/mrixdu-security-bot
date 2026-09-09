import { Telegraf } from "telegraf";
import { getChatConfig, saveChatConfig } from "../db";
import { requireAdmin } from "../utils";

export function registerFilters(bot: Telegraf): void {
  bot.command("filter", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const text = (ctx.message as any).text as string;
    const parts = text.split(" ").slice(1);
    if (parts.length < 2) {
      return ctx.reply("Usage: /filter <trigger> <reply text>");
    }
    const trigger = parts[0].toLowerCase();
    const reply = parts.slice(1).join(" ");
    const config = getChatConfig(ctx.chat.id);
    config.filters[trigger] = reply;
    saveChatConfig(ctx.chat.id, config);
    await ctx.reply(`✅ Filter set: "${trigger}" → "${reply}"`);
  });

  bot.command("delfilter", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const trigger = (ctx.message as any).text.split(" ")[1]?.toLowerCase();
    if (!trigger) return ctx.reply("Usage: /delfilter <trigger>");
    const config = getChatConfig(ctx.chat.id);
    if (!(trigger in config.filters)) {
      return ctx.reply(`No filter found for "${trigger}".`);
    }
    delete config.filters[trigger];
    saveChatConfig(ctx.chat.id, config);
    await ctx.reply(`🗑️ Filter "${trigger}" removed.`);
  });

  bot.command("filters", async (ctx) => {
    const config = getChatConfig(ctx.chat.id);
    const entries = Object.entries(config.filters);
    if (entries.length === 0) return ctx.reply("No active filters.");
    const list = entries.map(([trigger, reply]) => `• ${trigger} → ${reply}`).join("\n");
    await ctx.reply(`📝 Active Filters:\n${list}`);
  });

  bot.on("message", async (ctx, next) => {
    const msg: any = ctx.message;
    const text: string | undefined = msg.text;
    if (!text || text.startsWith("/")) return next();
    const config = getChatConfig(ctx.chat.id);
    const lower = text.toLowerCase();
    for (const [trigger, reply] of Object.entries(config.filters)) {
      if (lower.includes(trigger)) {
        await ctx.reply(reply);
        break;
      }
    }
    return next();
  });
}
