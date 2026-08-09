# Advanced Group Management Bot

A Telegram group moderation bot built with TypeScript + [Telegraf](https://telegraf.js.org/).

## Features

- **Media-Only mode** — `/media on|off`
- **Night Mode** — `/setnight HH:MM HH:MM` (IST, auto-locks/unlocks the group), `/setnight off`
- **Force Join** — `/setjoin @channel` requires users to join a channel before posting, `/setjoin off`
- **@admin alerts** — mentioning `@admin` in chat pings all human admins
- **Content filters** — `/filter <trigger> <reply>`, `/delfilter <trigger>`, `/filters`
- **Word blacklist** — `/addslang <word>`, `/delslang <word>`, `/slanglist`
- **Sticker pack blocking** — reply to a sticker with `/blockpack`
- **Deleted account cleanup** — `/clean` (see limitation below)
- **Admin actions** — `/ban`, `/kick`, `/mute [10m|2h|1d]`, `/info` (reply to a user, or pass a user ID)
- **Edit Guardian** — auto-deletes edited messages from non-admins (common spam evasion tactic)

### ⚠️ `/clean` limitation (read this)
The Telegram **Bot API does not let bots list all members of a group**. This bot can only
check users it has personally seen send a message (tracked automatically). So `/clean` is a
**best-effort** cleanup of *known* deleted accounts, not a full sweep of the entire member list.
A true full sweep requires a **userbot** (MTProto library like GramJS or Telethon, logged in as
a real account with admin rights) — a fundamentally different, higher-privilege setup than a bot
token. I didn't build that here since it requires a personal account login, not just a bot token.

## Local setup

```bash
npm install
cp .env.example .env
# edit .env and paste your bot token from @BotFather
npm run dev
```

Get a token: message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot`.

**Required bot permissions** (set via BotFather or as group admin): delete messages, ban users,
restrict members, pin messages. Also disable **Group Privacy Mode** via BotFather
(`/setprivacy` → Disable) so the bot can see all messages, not just commands.

## Deploying to Render

Render works well here as a **Background Worker** (not a Web Service) — this bot uses long
polling, so it doesn't need to bind to a port or serve HTTP traffic.

1. Push this project to a GitHub repo.
2. On Render: **New +** → **Background Worker** → connect your repo.
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Add an environment variable: `BOT_TOKEN` = your token from BotFather.
6. Deploy.

### Persisting data across deploys
This bot stores its config (filters, blacklist, night mode settings, etc.) in
`data/db.json` on local disk. **Render's default filesystem is ephemeral** — it resets on every
deploy/restart, so you'll lose settings unless you add a persistent disk:

1. In the Render service settings, add a **Disk** (e.g. 1 GB is plenty).
2. Set its **mount path** to `/opt/render/project/src/data`.
3. Redeploy.

Without this, the bot still works — it just forgets filters/blacklist/night-mode config
whenever Render restarts the service.

## Project structure

```
src/
  index.ts              - entrypoint, wires everything together
  db.ts                 - JSON file storage (per-chat config)
  types.ts              - shared types
  utils.ts               - admin checks, mentions, time parsing
  features/
    adminActions.ts     - /ban /kick /mute /info
    mediaOnly.ts         - /media
    nightMode.ts         - /setnight (cron-based lock/unlock)
    filters.ts            - /filter /delfilter /filters
    blacklist.ts          - /addslang /delslang /slanglist
    blockPack.ts           - /blockpack
    forceJoin.ts            - membership check on every message
    forceJoinConfig.ts       - /setjoin
    editGuardian.ts           - deletes edited messages
    adminAlert.ts              - @admin mention handling
    clean.ts                    - /clean (best-effort, see limitation above)
```
