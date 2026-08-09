import { Telegraf } from "telegraf";
import { requireAdmin, targetUserFromReplyOrArg, isReplyToMessage } from "../utils";

// Parses duration strings like "10m", "2h", "1d" into seconds. Returns 0 for permanent.
function parseDuration(input?: string): number {
  if (!input) return 0;
  const match = /^(\d+)([mhd])$/.exec(input.trim());
  if (!match) return 0;
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === "m") return amount * 60;
  if (unit === "h") return amount * 3600;
  return amount * 86400; // d
}

export function registerAdminActions(bot: Telegraf): void {
  bot.command("ban", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const chatId = ctx.chat.id;
    const targetId = targetUserFromReplyOrArg(ctx);
    if (!targetId) {
      return ctx.reply("Reply to a user's message with /ban, or use /ban <user_id>.");
    }
    try {
      await ctx.telegram.banChatMember(chatId, targetId);
      await ctx.reply(`🔨 User ${targetId} has been banned.`);
    } catch (err) {
      await ctx.reply(`Couldn't ban that user: ${(err as Error).message}`);
    }
  });

  bot.command("kick", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const chatId = ctx.chat.id;
    const targetId = targetUserFromReplyOrArg(ctx);
    if (!targetId) {
      return ctx.reply("Reply to a user's message with /kick, or use /kick <user_id>.");
    }
    try {
      // Ban then immediately unban = kick (removes without a permanent ban)
      await ctx.telegram.banChatMember(chatId, targetId);
      await ctx.telegram.unbanChatMember(chatId, targetId);
      await ctx.reply(`👢 User ${targetId} has been kicked.`);
    } catch (err) {
      await ctx.reply(`Couldn't kick that user: ${(err as Error).message}`);
    }
  });

  bot.command("unban", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const chatId = ctx.chat.id;
    const targetId = targetUserFromReplyOrArg(ctx);
    if (!targetId) {
      return ctx.reply("Usage: /unban <user_id>  (unban needs the numeric ID since a banned user can't be replied to)");
    }
    try {
      await ctx.telegram.unbanChatMember(chatId, targetId, { only_if_banned: true });
      await ctx.reply(`✅ User ${targetId} has been unbanned.`);
    } catch (err) {
      await ctx.reply(`Couldn't unban that user: ${(err as Error).message}`);
    }
  });

  bot.command("unmute", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const chatId = ctx.chat.id;
    const targetId = targetUserFromReplyOrArg(ctx);
    if (!targetId) {
      return ctx.reply("Reply to a user's message with /unmute, or use /unmute <user_id>.");
    }
    try {
      await ctx.telegram.restrictChatMember(chatId, targetId, {
        permissions: {
          can_send_messages: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_other_messages: true,
        },
        until_date: 0,
      });
      await ctx.reply(`🔊 User ${targetId} has been unmuted.`);
    } catch (err) {
      await ctx.reply(`Couldn't unmute that user: ${(err as Error).message}`);
    }
  });

  bot.command("mute", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const chatId = ctx.chat.id;
    const targetId = targetUserFromReplyOrArg(ctx);
    if (!targetId) {
      return ctx.reply("Reply to a user's message with /mute [duration], e.g. /mute 30m, /mute 2h, /mute 1d. Omit duration to mute indefinitely.");
    }
    const text = (ctx.message as any)?.text as string;
    const parts = text.split(" ");
    // Duration is whichever arg isn't the numeric user id (if using reply, arg[1] is duration)
    const durationArg = isReplyToMessage(ctx) ? parts[1] : parts[2];
    const seconds = parseDuration(durationArg);
    const untilDate = seconds > 0 ? Math.floor(Date.now() / 1000) + seconds : 0;

    try {
      await ctx.telegram.restrictChatMember(chatId, targetId, {
        permissions: {
          can_send_messages: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_other_messages: false,
        },
        until_date: untilDate,
      });
      const durationText = seconds > 0 ? `for ${durationArg}` : "indefinitely";
      await ctx.reply(`🔇 User ${targetId} has been muted ${durationText}.`);
    } catch (err) {
      await ctx.reply(`Couldn't mute that user: ${(err as Error).message}`);
    }
  });

  bot.command("info", async (ctx) => {
    const chatId = ctx.chat.id;
    const targetId = targetUserFromReplyOrArg(ctx) ?? ctx.from.id;
    try {
      const member = await ctx.telegram.getChatMember(chatId, targetId);
      const user = member.user;
      const lines = [
        `👤 *User Info*`,
        `Name: ${user.first_name}${user.last_name ? " " + user.last_name : ""}`,
        `Username: ${user.username ? "@" + user.username : "none"}`,
        `ID: \`${user.id}\``,
        `Status: ${member.status}`,
      ];
      await ctx.replyWithMarkdown(lines.join("\n"));
    } catch (err) {
      await ctx.reply(`Couldn't fetch info: ${(err as Error).message}`);
    }
  });
}
