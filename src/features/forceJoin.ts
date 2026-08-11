import { Telegraf, Markup } from "telegraf";
import { getChatConfig } from "../db";
import { mentionUserHtml, formatDateTime, isUserAdmin } from "../utils";

const MUTE_DURATION_SECONDS = 24 * 60 * 60; // fallback auto-unmute if they never verify

async function isChannelMember(telegram: any, channel: string, userId: number): Promise<boolean> {
  try {
    const member = await telegram.getChatMember(channel, userId);
    return member.status !== "left" && member.status !== "kicked";
  } catch {
    // If the bot can't check (e.g. not admin of the channel), fail open
    // rather than locking out the whole group.
    return true;
  }
}

async function sendVerificationGate(
  bot: Telegraf,
  chatId: number,
  chatTitle: string,
  userId: number,
  userFirstName: string
): Promise<void> {
  const config = getChatConfig(chatId);
  if (!config.forceJoinChannel) return;

  const untilDate = Math.floor(Date.now() / 1000) + MUTE_DURATION_SECONDS;
  try {
    await bot.telegram.restrictChatMember(chatId, userId, {
      permissions: {
        can_send_messages: false,
        can_send_photos: false,
        can_send_videos: false,
        can_send_other_messages: false,
      },
      until_date: untilDate,
    });
  } catch {
    // Bot may lack restrict rights; still send the prompt so the user knows to join.
  }

  const mention = mentionUserHtml(userId, userFirstName);
  const untilText = formatDateTime(new Date(untilDate * 1000));
  const text =
    `<b><i>${chatTitle} Security Bot</i></b>\n\n` +
    `${mention} [${userId}] to be accepted in the group, please subscribe to our channel. ` +
    `Once joined, click the button below.\n\n` +
    `<b>Action:</b> Muted \u{1F507} until <b>${untilText}</b>.`;

  const buttons: any[] = [];
  if (config.forceJoinInviteLink) {
    buttons.push([Markup.button.url("\u{1F4E2} Subscribe to channel", config.forceJoinInviteLink)]);
  }
  buttons.push([Markup.button.callback("\u2705 OK | I subscribed", `verify_join:${userId}`)]);

  try {
    await bot.telegram.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons },
    } as any);
  } catch {
    // ignore send failures
  }
}

export function registerForceJoin(bot: Telegraf): void {
  // Gate new members the moment they join
  bot.on("new_chat_members", async (ctx) => {
    const config = getChatConfig(ctx.chat.id);
    if (!config.forceJoinChannel) return;
    const newMembers = (ctx.message as any).new_chat_members as any[];
    const chatTitle = (ctx.chat as any).title || "Group";
    for (const member of newMembers) {
      if (member.is_bot) continue;
      if (await isUserAdmin(ctx, member.id)) continue; // admins are exempt from the gate
      const alreadyMember = await isChannelMember(ctx.telegram, config.forceJoinChannel, member.id);
      if (alreadyMember) continue;
      await sendVerificationGate(bot, ctx.chat.id, chatTitle, member.id, member.first_name);
    }
  });

  // Fallback for users who joined before Force Join was turned on, or whose
  // mute already expired: catch their message and re-gate them.
  bot.on("message", async (ctx, next) => {
    const config = getChatConfig(ctx.chat.id);
    if (!config.forceJoinChannel) return next();
    if (ctx.chat.type === "private") return next();
    if ((ctx as any).senderChat || ctx.from?.id === 777000) return next(); // skip channel posts
    const userId = ctx.from?.id;
    if (!userId) return next();
    if (await isUserAdmin(ctx)) return next(); // group admins are exempt from the force-join gate

    const member = await isChannelMember(ctx.telegram, config.forceJoinChannel, userId);
    if (member) return next();

    try {
      await ctx.deleteMessage();
    } catch {
      // ignore
    }
    const chatTitle = (ctx.chat as any).title || "Group";
    await sendVerificationGate(bot, ctx.chat.id, chatTitle, userId, ctx.from?.first_name || "there");
  });

  // "OK | I subscribed" button
  bot.action(/^verify_join:(\d+)$/, async (ctx) => {
    const targetId = parseInt(ctx.match[1], 10);
    const clickerId = ctx.from.id;
    if (clickerId !== targetId) {
      return ctx.answerCbQuery("This button isn't for you.", { show_alert: true });
    }
    const chatId = ctx.chat!.id;
    const config = getChatConfig(chatId);
    if (!config.forceJoinChannel) {
      return ctx.answerCbQuery("Force Join is no longer active here.");
    }

    const joined = await isChannelMember(ctx.telegram, config.forceJoinChannel, targetId);
    if (!joined) {
      return ctx.answerCbQuery("You haven't joined the channel yet. Join it, then tap this again.", {
        show_alert: true,
      });
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
    } catch {
      // ignore, e.g. bot lost admin rights
    }

    await ctx.answerCbQuery("\u2705 Verified! You can chat now.");
    try {
      await ctx.editMessageText("\u2705 Verified \u2014 welcome to the group!");
    } catch {
      // ignore if message can't be edited
    }
  });
}
