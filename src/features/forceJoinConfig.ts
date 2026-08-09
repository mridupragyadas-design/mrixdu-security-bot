import { Telegraf } from "telegraf";
import { getChatConfig, saveChatConfig } from "../db";
import { requireAdmin } from "../utils";

export function registerForceJoinConfig(bot: Telegraf): void {
  bot.command("setjoin", async (ctx) => {
    if (!(await requireAdmin(ctx))) return;
    const parts = (ctx.message as any).text.split(" ").slice(1);
    const arg = parts[0];
    const config = getChatConfig(ctx.chat.id);

    if (!arg || arg.toLowerCase() === "off") {
      config.forceJoinChannel = null;
      config.forceJoinInviteLink = null;
      saveChatConfig(ctx.chat.id, config);
      return ctx.reply("✅ Force Join disabled.");
    }

    // Public channel: /setjoin @channelusername
    if (arg.startsWith("@")) {
      config.forceJoinChannel = arg;
      config.forceJoinInviteLink = `https://t.me/${arg.replace("@", "")}`;
      saveChatConfig(ctx.chat.id, config);
      return ctx.reply(`✅ Force Join enabled: users must join ${arg} before posting.`);
    }

    // Private channel: /setjoin -1001234567890 https://t.me/+inviteHash
    if (/^-?\d+$/.test(arg)) {
      const channelId = arg;
      let inviteLink = parts[1];

      if (!inviteLink) {
        // Try to auto-generate one if the bot is an admin there with invite rights
        try {
          inviteLink = await ctx.telegram.exportChatInviteLink(channelId);
        } catch {
          return ctx.reply(
            "This looks like a private channel ID, but I couldn't auto-generate an invite link " +
              "(I may not be an admin there with invite permissions).\n\n" +
              "Usage: /setjoin <channel_id> <invite_link>\n" +
              "Get the invite link from the channel: Channel Info → Invite Links."
          );
        }
      }

      config.forceJoinChannel = channelId;
      config.forceJoinInviteLink = inviteLink;
      saveChatConfig(ctx.chat.id, config);
      return ctx.reply(`✅ Force Join enabled for private channel. Users must join before posting.`);
    }

    return ctx.reply(
      "Usage:\n" +
        "• Public channel: /setjoin @channelusername\n" +
        "• Private channel: /setjoin <channel_id> <invite_link>\n" +
        "• Disable: /setjoin off\n\n" +
        "The bot must be an admin of the target channel to verify membership either way."
    );
  });
}
