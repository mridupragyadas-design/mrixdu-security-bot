import "dotenv/config";
import { Telegraf } from "telegraf";
import http from "http";

import { initDatabase, getAllChatConfigs } from "./db";
import { registerAdminActions } from "./features/adminActions";
import { registerMedia } from "./features/media";
import { registerNightMode, restoreNightModeSchedules } from "./features/nightMode";
import { registerFilters } from "./features/filters";
import { registerBlacklist } from "./features/blacklist";
import { registerBlockPack } from "./features/blockPack";
import { registerForceJoin } from "./features/forceJoin";
import { registerForceJoinConfig } from "./features/forceJoinConfig";
import { registerEditGuardian } from "./features/editGuardian";
import { registerAdminAlert } from "./features/adminAlert";
import { registerClean } from "./features/clean";
import { registerAntiSpam } from "./features/antiSpam";
import { registerStats } from "./features/stats";
import { registerPin } from "./features/pin";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Missing BOT_TOKEN in environment. Set it in .env or your host's env vars.");
  process.exit(1);
}

const bot = new Telegraf(token);

const HELP_TEXT = `*Advanced Group Management*

Hello\\! I am your automated moderator, designed to keep your community safe, clean, and active 24/7\\.

🎮 *Admin Control Panel*
• /media on\\|off — text\\-only mode \\(off \\= delete all non\\-text\\)
• /setnight \\[HH:MM\\] \\[HH:MM\\] — Night Mode window \\(IST, auto\\-deletes messages\\)
• /nighton, /nightoff — Quick Night Mode toggle
• /antispam on\\|off — Flood protection
• /setjoin @channel — Force Join \\(public channel\\)
• /setjoin — reply to a forwarded channel post to auto\\-detect a private channel
• /pin, /unpin — reply to a message
• /ban, /kick, /mute \\[duration\\], /unmute, /unban, /info — reply to a user
• @admin — Alert all moderators instantly

📝 *Content Filters*
• /filter \\[trigger\\] \\[reply\\] — Set auto\\-reply
• /delfilter \\[trigger\\] — Remove auto\\-reply
• /filters — List active filters

🚫 *Blacklist & Stickers*
• /addslang \\[word\\], /delslang \\[word\\], /slanglist — word blacklist
• /blockpack, /unblockpack — \\(reply to sticker\\) ban/unban a whole pack
• /blocksticker, /unblocksticker — \\(reply to sticker\\) ban/unban one sticker
• /stickerlist — view blocked packs/stickers
• /clean — Remove tracked deleted accounts \\(best\\-effort\\)

📊 *Stats*
• /mystatus — your message count today / this week / this month, plus your rank
• /leaderboard \\[today\\|week\\|month\\] — top 10 most active members

✨ *Active Protections*
✅ Force Join: Verification for Channel
✅ Edit Guardian: Anti\\-spam edit removal
✅ Anti\\-Spam: Flood protection
✅ Night Mode: Auto\\-delete window

_Developed by MRIXDU for @BGMIPOPULARITYOG_`;

bot.start((ctx) => ctx.replyWithMarkdownV2(HELP_TEXT));
bot.help((ctx) => ctx.replyWithMarkdownV2(HELP_TEXT));

// Stats tracking runs first so every message — including ones handled by a
// command below, or later deleted by moderation — gets counted exactly once.
// Everything after it still runs normally via next().
registerStats(bot);
registerNightMode(bot);
registerAntiSpam(bot);
registerMedia(bot);
registerBlacklist(bot);
registerBlockPack(bot);
registerForceJoinConfig(bot);
registerForceJoin(bot);
registerFilters(bot);
registerPin(bot);
registerAdminActions(bot);
// registerEditGuardian(bot); // disabled: was deleting edited messages from non-admins
registerAdminAlert(bot);
registerClean(bot);

bot.catch((err, ctx) => {
  console.error(`Error handling update ${ctx.updateType}:`, err);
});

// Render's Web Service plan requires the app to bind to a port, or it
// assumes the deploy failed. This bot doesn't need to serve HTTP traffic —
// it just polls Telegram — so this is a minimal server purely to satisfy
// that health check. It returns 200 OK to any request.
function startHealthCheckServer(): void {
  const port = process.env.PORT || 3000;
  http
    .createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Bot is running.");
    })
    .listen(port, () => {
      console.log(`Health check server listening on port ${port}`);
    });
}

async function main() {
  startHealthCheckServer();
  await initDatabase();

  // Re-arm night mode announcement schedules for any chats that had it
  // enabled before restart. The deletion logic itself works live and
  // doesn't depend on this.
  const allChats = getAllChatConfigs();
  const nightModeChatIds = Object.entries(allChats)
    .filter(([, cfg]) => cfg.nightMode?.enabled)
    .map(([id]) => parseInt(id, 10));
  restoreNightModeSchedules(bot, nightModeChatIds);

  await bot.launch();
  console.log("Bot is up and polling for updates.");
}

main();

// Graceful shutdown (important on Render, which sends SIGTERM on redeploy)
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
