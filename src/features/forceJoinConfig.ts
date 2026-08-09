import { Telegraf } from "telegraf";
import { getChatConfig, saveChatConfig } from "../db";
import { requireAdmin } from "../utils";

export function registerForceJoinConfig(bot: Telegraf): void {
  bot.command("setjoin", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const parts = (ctx.message as any).text.split(" ").slice(1);
    const arg = parts[0];
    const config = getChatConfig(ctx.chat.id);
    const reply = (ctx.message as any).reply_to_message;
    const forwardedChat = reply?.forward_from_chat;

    if (arg && arg.toLowerCase() === "off") {
      config.forceJoinChannel = null;
      config.forceJoinInviteLink = null;
      saveChatConfig(ctx.chat.id, config);
      return ctx.reply("✅ Force Join disabled.");
    }

    // Easiest path for private channels: forward any post from the channel
    // into this group, then reply to that forward with /setjoin (no args).
    // No need to hunt down the numeric ID yourself.
    if (!arg && forwardedChat) {
      const channelId = String(forwardedChat.id);
      let inviteLink: string | undefined = forwardedChat.username
        ? `https://t.me/${forwardedChat.username}`
        : undefined;

      if (!inviteLink) {
        try {
          inviteLink = await ctx.telegram.exportChatInviteLink(channelId);
        } catch {
          return ctx.reply(
            `I detected the channel ("${forwardedChat.title}") from your forward, but couldn't generate ` +
              "an invite link automatically — I need to be an admin there with invite permissions.\n\n" +
              "Add me as admin to that channel, then reply to the forward with /setjoin again."
          );
        }
      }

      config.forceJoinChannel = channelId;
      config.forceJoinInviteLink = inviteLink;
      saveChatConfig(ctx.chat.id, config);
      return ctx.reply(`✅ Force Join enabled for "${forwardedChat.title}" (auto-detected from your forward).`);
    }

    if (!arg) {
      return ctx.reply(
        "Usage:\n" +
          "• Public channel: /setjoin @channelusername\n" +
          "• Private channel (easiest): forward a post from the channel here, then reply to it with /setjoin\n" +
          "• Private channel (manual): /setjoin <channel_id> <invite_link>\n" +
          "• Disable: /setjoin off\n\n" +
          "Either way, I need to be an admin of the target channel to check who's joined."
      );
    }

    // Public channel: /setjoin @channelusername
    if (arg.startsWith("@")) {
      config.forceJoinChannel = arg;
      config.forceJoinInviteLink = `https://t.me/${arg.replace("@", "")}`;
      saveChatConfig(ctx.chat.id, config);
      return ctx.reply(`✅ Force Join enabled: users must join ${arg} before posting.`);
    }

    // Private channel, manual: /setjoin -1001234567890 https://t.me/+inviteHash
    if (/^-?\d+$/.test(arg)) {
      const channelId = arg;
      let inviteLink = parts[1];

      if (!inviteLink) {
        try {
          inviteLink = await ctx.telegram.exportChatInviteLink(channelId);
        } catch {
          return ctx.reply(
            "This looks like a private channel ID, but I couldn't auto-generate an invite link " +
              "(I may not be an admin there with invite permissions).\n\n" +
              "Usage: /setjoin <channel_id> <invite_link>\n" +
              "Tip: forwarding a post from the channel and replying /setjoin is easier than typing the ID."
          );
        }
      }

      config.forceJoinChannel = channelId;
      config.forceJoinInviteLink = inviteLink;
      saveChatConfig(ctx.chat.id, config);
      return ctx.reply("✅ Force Join enabled for private channel. Users must join before posting.");
    }

    return ctx.reply(
      "Usage:\n" +
        "• Public channel: /setjoin @channelusername\n" +
        "• Private channel (easiest): forward a post from the channel here, then reply to it with /setjoin\n" +
        "• Private channel (manual): /setjoin <channel_id> <invite_link>\n" +
        "• Disable: /setjoin off"
    );
  });
}
