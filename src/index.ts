import "dotenv/config";
import { Telegraf } from "telegraf";
import fs from "fs";
import path from "path";
import http from "http";

import { registerAdminActions } from "./features/adminActions";
import { registerMediaOnly } from "./features/mediaOnly";
import { registerNightMode, restoreNightModeSchedules } from "./features/nightMode";
import { registerFilters } from "./features/filters";
import { registerBlacklist } from "./features/blacklist";
import { registerBlockPack } from "./features/blockPack";
import { registerForceJoin } from "./features/forceJoin";
import { registerForceJoinConfig } from "./features/forceJoinConfig";
import { registerEditGuardian } from "./features/editGuardian";
import { registerAdminAlert } from "./features/adminAlert";
import { registerClean } from "./features/clean";

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("Missing BOT_TOKEN in environment. Set it in .env or your host's env vars.");
  process.exit(1);
}

const bot = new Telegraf(token);

const HELP_TEXT = `*Advanced Group Management*

Hello\\! I am your automated moderator, designed to keep your community safe, clean, and active 24/7\\.

🎮 *Admin Control Panel*
• /media on\\|off — Toggle Media\\-Only mode
• /setnight \\[HH:MM\\] \\[HH:MM\\] — Configure Night Mode hours \\(IST\\)
• /nighton, /nightoff — Quick Night Mode toggle
• /setjoin @channel — Force Join \\(public channel\\)
• /setjoin \\[channel\\_id\\] \\[invite\\_link\\] — Force Join \\(private channel\\)
• /ban, /kick, /mute \\[duration\\], /unmute, /unban, /info — reply to a user
• @admin — Alert all moderators instantly

📝 *Content Filters*
• /filter \\[trigger\\] \\[reply\\] — Set auto\\-reply
• /delfilter \\[trigger\\] — Remove auto\\-reply
• /filters — List active filters

🚫 *Blacklist Management*
• /addslang \\[word\\] — Block a new word
• /delslang \\[word\\] — Unblock a word
• /slanglist — View blocked words
• /blockpack — \\(Reply to Sticker\\) Ban a pack
• /clean — Remove tracked deleted accounts \\(best\\-effort\\)

✨ *Active Protections*
✅ Force Join: Verification for Channel
✅ Edit Guardian: Anti\\-spam edit removal
✅ Night Mode: Automatic IST lockdown`;

bot.start((ctx) => ctx.replyWithMarkdownV2(HELP_TEXT));
bot.help((ctx) => ctx.replyWithMarkdownV2(HELP_TEXT));

registerAdminActions(bot);
registerMediaOnly(bot);
registerNightMode(bot);
registerFilters(bot);
registerBlacklist(bot);
registerBlockPack(bot);
registerForceJoinConfig(bot);
registerForceJoin(bot);
registerEditGuardian(bot);
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

  // Re-arm night mode schedules for any chats that had it enabled before restart
  const dbPath = path.join(__dirname, "..", "data", "db.json");
  if (fs.existsSync(dbPath)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
      const nightModeChatIds = Object.entries(db.chats || {})
        .filter(([, cfg]: [string, any]) => cfg.nightMode?.enabled)
        .map(([id]) => parseInt(id, 10));
      restoreNightModeSchedules(bot, nightModeChatIds);
    } catch {
      // ignore malformed/missing db on first run
    }
  }

  await bot.launch();
  console.log("Bot is up and polling for updates.");
}

main();

// Graceful shutdown (important on Render, which sends SIGTERM on redeploy)
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
