import { Telegraf } from "telegraf";
import { requireAdmin, targetUserFromReplyOrArg, isReplyToMessage } from "../utils";

function parseDuration(input?: string): number {
  if (!input) return 0;
  const match = /^(\d+)([mhd])$/.exec(input.trim());
  if (!match) return 0;
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === "m") return amount * 60;
  if (unit === "h") return amount * 3600;
  return amount * 86400;
}

function explainMissingTarget(ctx: any, commandName: string, extra = ""): void {
  const arg = (ctx.message as any).text.split(" ")[1];
  if (arg && arg.startsWith("@")) {
    ctx.reply(
      `Couldn't find ${arg} — I can only resolve usernames for people who've sent at least one ` +
        `message in this group since this feature was added. Try replying to their message instead, ` +
        `or use their numeric user ID.`
    );
    return;
  }
  ctx.reply(
    `Reply to a user's message with /${commandName}, or use /${commandName} <user_id> or /${commandName} @username` +
      (extra ? ` ${extra}` : "") +
      ` (username only works if they've posted here before).`
  );
}

export function registerAdminActions(bot: Telegraf): void {
  bot.command("ban", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const chatId = ctx.chat.id;
    const targetId = targetUserFromReplyOrArg(ctx);
    if (!targetId) return explainMissingTarget(ctx, "ban");
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
    if (!targetId) return explainMissingTarget(ctx, "kick");
    try {
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
      return explainMissingTarget(ctx, "unban", "(a banned user can't be replied to, so use their ID or username)");
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
    if (!targetId) return explainMissingTarget(ctx, "unmute");
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
    if (!targetId) return explainMissingTarget(ctx, "mute", "[duration], e.g. /mute @user 30m, /mute @user 2h");
    const text = (ctx.message as any)?.text as string;
    const parts = text.split(" ");
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

  bot.command("promote", async (ctx) => {
  if (!(await requireAdmin(ctx))) return;
  const chatId = ctx.chat.id;
  const targetId = targetUserFromReplyOrArg(ctx);
  if (!targetId) return explainMissingTarget(ctx, "promote");
  const titleArg = isReplyToMessage(ctx)
    ? (ctx.message as any).text.split(" ").slice(1).join(" ").trim()
    : (ctx.message as any).text.split(" ").slice(2).join(" ").trim();
  try {
    await ctx.telegram.promoteChatMember(chatId, targetId, {
      can_change_info: true,
      can_delete_messages: true,
      can_invite_users: true,
      can_restrict_members: true,
      can_pin_messages: true,
      can_promote_members: false,
      can_manage_video_chats: true,
    });
    if (titleArg) {
      try {
        await ctx.telegram.setChatAdministratorCustomTitle(chatId, targetId, titleArg.slice(0, 16));
      } catch {
        // custom title is best-effort (e.g. bot lacks rights, or target is the chat owner)
      }
    }
    await ctx.reply(`⬆️ User ${targetId} has been promoted to admin.`);
  } catch (err) {
    await ctx.reply(`Couldn't promote that user: ${(err as Error).message}`);
  }
});

bot.command("demote", async (ctx) => {
  if (!(await requireAdmin(ctx))) return;
  const chatId = ctx.chat.id;
  const targetId = targetUserFromReplyOrArg(ctx);
  if (!targetId) return explainMissingTarget(ctx, "demote");
  try {
    await ctx.telegram.promoteChatMember(chatId, targetId, {
      can_change_info: false,
      can_delete_messages: false,
      can_invite_users: false,
      can_restrict_members: false,
      can_pin_messages: false,
      can_promote_members: false,
      can_manage_video_chats: false,
    });
    await ctx.reply(`⬇️ User ${targetId} has been demoted.`);
  } catch (err) {
    await ctx.reply(`Couldn't demote that user: ${(err as Error).message}`);
  }
});

bot.command("del", async (ctx) => {
  if (!(await requireAdmin(ctx))) return;
  const reply = (ctx.message as any).reply_to_message;
  if (!reply) {
    return ctx.reply("Reply to the message you want to delete with /del.");
  }
  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, reply.message_id);
    try {
      await ctx.deleteMessage(); // also remove the /del command itself
    } catch {
      // ignore
    }
  } catch (err) {
    await ctx.reply(`Couldn't delete that message: ${(err as Error).message}`);
  }
});
}
