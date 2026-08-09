import { Telegraf } from "telegraf";
import { getChatConfig, saveChatConfig } from "../db";
import { requireAdmin, isUserAdmin } from "../utils";

export function registerBlockPack(bot: Telegraf): void {
  bot.command("blockpack", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const reply = (ctx.message as any).reply_to_message;
    const sticker = reply?.sticker;
    if (!sticker) {
      return ctx.reply("Reply to a sticker message with /blockpack to ban its whole pack.");
    }
    if (!sticker.set_name) {
      return ctx.reply("This sticker isn't part of a named pack, so it can't be blocked by pack. Try /blocksticker instead.");
    }
    const config = getChatConfig(ctx.chat.id);
    if (!config.blockedPacks.includes(sticker.set_name)) {
      config.blockedPacks.push(sticker.set_name);
      saveChatConfig(ctx.chat.id, config);
    }
    await ctx.reply(`🚫 Sticker pack "${sticker.set_name}" is now blocked.`);
  });

  bot.command("unblockpack", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const reply = (ctx.message as any).reply_to_message;
    const argName = (ctx.message as any).text.split(" ").slice(1).join(" ").trim();
    const packName = reply?.sticker?.set_name || argName;
    if (!packName) {
      return ctx.reply("Reply to a sticker from the pack with /unblockpack, or use /unblockpack <pack_name>.");
    }
    const config = getChatConfig(ctx.chat.id);
    if (!config.blockedPacks.includes(packName)) {
      return ctx.reply(`"${packName}" isn't currently blocked.`);
    }
    config.blockedPacks = config.blockedPacks.filter((p) => p !== packName);
    saveChatConfig(ctx.chat.id, config);
    await ctx.reply(`✅ Sticker pack "${packName}" unblocked.`);
  });

  bot.command("blocksticker", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const sticker = (ctx.message as any).reply_to_message?.sticker;
    if (!sticker) {
      return ctx.reply("Reply to a sticker message with /blocksticker to block just that one sticker.");
    }
    const config = getChatConfig(ctx.chat.id);
    if (!config.blockedStickers.includes(sticker.file_unique_id)) {
      config.blockedStickers.push(sticker.file_unique_id);
      saveChatConfig(ctx.chat.id, config);
    }
    await ctx.reply("🚫 That sticker is now blocked.");
  });

  bot.command("unblocksticker", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const sticker = (ctx.message as any).reply_to_message?.sticker;
    if (!sticker) {
      return ctx.reply("Reply to the blocked sticker with /unblocksticker to unblock it.");
    }
    const config = getChatConfig(ctx.chat.id);
    if (!config.blockedStickers.includes(sticker.file_unique_id)) {
      return ctx.reply("That sticker isn't currently blocked.");
    }
    config.blockedStickers = config.blockedStickers.filter((id) => id !== sticker.file_unique_id);
    saveChatConfig(ctx.chat.id, config);
    await ctx.reply("✅ That sticker is now unblocked.");
  });

  bot.command("stickerlist", async (ctx) => {
    const config = getChatConfig(ctx.chat.id);
    const packs = config.blockedPacks.length > 0 ? config.blockedPacks.join(", ") : "none";
    const singles = config.blockedStickers.length;
    await ctx.reply(`🚫 Blocked packs: ${packs}\n🚫 Individually blocked stickers: ${singles}`);
  });

  bot.on("message", async (ctx, next) => {
    const sticker = (ctx.message as any).sticker;
    if (!sticker) return next();
    const config = getChatConfig(ctx.chat.id);
    const isBlockedPack = sticker.set_name && config.blockedPacks.includes(sticker.set_name);
    const isBlockedSticker = config.blockedStickers.includes(sticker.file_unique_id);
    if (!isBlockedPack && !isBlockedSticker) return next();
    if (await isUserAdmin(ctx)) return next();
    try {
      await ctx.deleteMessage();
    } catch {
      // ignore
    }
  });
}
