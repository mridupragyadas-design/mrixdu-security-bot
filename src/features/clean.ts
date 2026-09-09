import { Telegraf } from "telegraf";
import { getChatConfig, saveChatConfig, trackUser } from "../db";
import { requireAdmin } from "../utils";

// IMPORTANT LIMITATION:
// The Bot API does not let bots enumerate a full member list for groups/supergroups.
// This command can only check users the bot has actually seen post a message
// (tracked in knownUserIds). It is a best-effort cleanup, not a full sweep of
// every deleted account in the group. A true full sweep requires a userbot
// (MTProto, e.g. GramJS/Telethon) with admin export rights, which is a very
// different (and riskier) trust model than a bot token.
export function registerClean(bot: Telegraf): void {
  // Track every user who posts, so /clean has something to check later
  bot.on("message", async (ctx, next) => {
    if (ctx.from && !ctx.from.is_bot) {
      trackUser(ctx.chat.id, ctx.from.id);
    }
    return next();
  });

  bot.command("clean", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const config = getChatConfig(ctx.chat.id);
    if (config.knownUserIds.length === 0) {
      return ctx.reply("No tracked users yet to check. (See /clean limitations in the README.)");
    }

    const status = await ctx.reply(`🔍 Checking ${config.knownUserIds.length} known users for deleted accounts...`);
    let removed = 0;
    const stillKnown: number[] = [];

    for (const userId of config.knownUserIds) {
      try {
        const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
        const isDeletedAccount = member.user.first_name === "Deleted Account" && !member.user.username;
        if (isDeletedAccount && member.status !== "left" && member.status !== "kicked") {
          await ctx.telegram.banChatMember(ctx.chat.id, userId);
          removed += 1;
          // don't keep deleted accounts in the tracked list
        } else if (member.status !== "left" && member.status !== "kicked") {
          stillKnown.push(userId);
        }
      } catch {
        // user lookup failed (e.g. never in this chat) — drop from tracking
      }
    }

    config.knownUserIds = stillKnown;
    saveChatConfig(ctx.chat.id, config);

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      status.message_id,
      undefined,
      `🧹 Cleanup complete. Removed ${removed} deleted account(s) out of ${stillKnown.length + removed} checked.\n\nNote: this only covers users the bot has seen post — not a full member sweep (Bot API limitation).`
    );
  });
}
