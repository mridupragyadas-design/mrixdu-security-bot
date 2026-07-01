// Part 1: Imports, Type Definitions, and Configuration

import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import * as sqlite3 from 'sqlite3';
import TelegramBot from 'node-telegram-bot-api';
import moment from 'moment-timezone';

// -------------------- Type Definitions --------------------
interface User {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  is_bot?: boolean;
}

interface ChatSettings {
  night_mode: boolean;
  night_on: string;
  night_off: string;
  blocked_words: string[];
  blocked_stickers: string[];
  banned_sticker_packs: string[];
  filters: Record<string, string>;
  anti_spam: boolean;
  force_subscribe: string | null;
  media_off: boolean;
}

interface UserHistory {
  names: Array<{ value: string; date: string }>;
  usernames: Array<{ value: string; date: string }>;
}

interface ForceJoinWaiting {
  chat_id: number;
  channel: string;
  message_id: number;
}

interface MessageTracker {
  [key: string]: number[];
}

// -------------------- Configuration --------------------
const BOT_TOKEN = process.env.SECURITY_BOT_TOKEN || '8970227707:AAFUUr70Wdo7MnbY1kHUkkATtUNgiibpGf0';
const DATA_FILE = 'security_bot_data.json';
const DB_FILE = 'users.db';
const HISTORY_FILE = 'user_history.json';
const MEMBERS_FILE = 'members.json';

const DEFAULT_NIGHT_ON = '01:00';
const DEFAULT_NIGHT_OFF = '07:00';
const SPAM_WINDOW = 5;
const SPAM_MAX_MSGS = 5;
const MUTE_DURATION = 300;

const IST = 'Asia/Kolkata';

// -------------------- Express Server --------------------
const app = express();
const port = parseInt(process.env.PORT || '8080');

app.get('/', (req, res) => {
  res.send('Mrixdu Security++ Bot is running!');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🌐 Web server running on port ${port}`);
});
// Part 2: Database & Data Management

// -------------------- SQLite Database --------------------
const db = new sqlite3.Database(DB_FILE);

db.run(`
  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    full_name TEXT
  )
`);

function saveUser(user: User): void {
  if (!user.username) return;
  db.run(
    `INSERT OR REPLACE INTO users (user_id, username, full_name) VALUES (?, ?, ?)`,
    [user.id, user.username.toLowerCase(), `${user.first_name || ''} ${user.last_name || ''}`.trim()]
  );
}

function getUserByUsername(username: string): Promise<{ user_id: number; full_name: string } | null> {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT user_id, full_name FROM users WHERE username = ?',
      [username.toLowerCase()],
      (err, row: any) => {
        if (err) reject(err);
        resolve(row || null);
      }
    );
  });
}

// -------------------- Data Management --------------------
function loadData(): Record<string, ChatSettings> {
  if (fs.existsSync(DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveData(data: Record<string, ChatSettings>): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data: Record<string, ChatSettings> = loadData();

function getChatSettings(chatId: number | string): ChatSettings {
  const chatIdStr = String(chatId);
  if (!data[chatIdStr]) {
    data[chatIdStr] = {
      night_mode: false,
      night_on: DEFAULT_NIGHT_ON,
      night_off: DEFAULT_NIGHT_OFF,
      blocked_words: [],
      blocked_stickers: [],
      banned_sticker_packs: [],
      filters: {},
      anti_spam: false,
      force_subscribe: null,
      media_off: false
    };
    saveData(data);
  }
  return data[chatIdStr];
}

function loadHistory(): Record<string, UserHistory> {
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveHistory(data: Record<string, UserHistory>): void {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

let historyDb: Record<string, UserHistory> = loadHistory();

function loadMembers(): Record<string, number[]> {
  if (fs.existsSync(MEMBERS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MEMBERS_FILE, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveMembers(data: Record<string, number[]>): void {
  fs.writeFileSync(MEMBERS_FILE, JSON.stringify(data, null, 2));
}

function saveMember(userId: number, chatId: number): void {
  const members = loadMembers();
  const chatKey = String(chatId);
  if (!members[chatKey]) {
    members[chatKey] = [];
  }
  if (!members[chatKey].includes(userId)) {
    members[chatKey].push(userId);
    saveMembers(members);
  }
}

function getMembers(chatId: number): number[] {
  const members = loadMembers();
  return members[String(chatId)] || [];
                    }
// Part 3: Helper Functions

// -------------------- Helper Functions --------------------
function parseTimeWithAmPm(timeStr: string): string | null {
  const trimmed = timeStr.trim().toUpperCase();
  const match = trimmed.match(/(\d{1,2}):(\d{2})(?:\s*([AP]M))?/);
  if (!match) return null;
  
  let hour = parseInt(match[1]);
  const minute = parseInt(match[2]);
  const amPm = match[3];
  
  if (amPm) {
    if (amPm === 'PM' && hour !== 12) hour += 12;
    if (amPm === 'AM' && hour === 12) hour = 0;
  }
  
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function isDeleted(user: TelegramBot.User): boolean {
  if (!user) return true;
  if (user.first_name === 'Deleted Account') return true;
  if (!user.first_name && !user.last_name && !user.username) return true;
  return false;
}

function getCurrentTime(): string {
  return moment().tz(IST).format('HH:mm');
}

function getCurrentTimestamp(): string {
  return moment().tz(IST).format('YYYY-MM-DD HH:mm:ss');
}

function getUserDisplayName(user: TelegramBot.User): string {
  return user.username ? `@${user.username}` : user.first_name || 'Unknown User';
}

// -------------------- Bot State --------------------
let msgTracker: MessageTracker = {};
let forceJoinWaiting: Record<number, ForceJoinWaiting> = {};

// -------------------- Admin Check Functions --------------------
async function isGroupAdmin(bot: TelegramBot, chatId: number, userId: number): Promise<boolean> {
  try {
    const member = await bot.getChatMember(chatId, userId);
    return member.status === 'administrator' || member.status === 'creator';
  } catch {
    return false;
  }
}

async function isUserInChannel(bot: TelegramBot, userId: number, channelUsername: string): Promise<boolean> {
  try {
    const member = await bot.getChatMember(channelUsername, userId);
    return member.status === 'member' || member.status === 'administrator' || member.status === 'creator';
  } catch {
    return false;
  }
}

async function muteUser(bot: TelegramBot, chatId: number, userId: number, untilDate: Date): Promise<void> {
  await bot.restrictChatMember(chatId, userId, {
    permissions: {
      can_send_messages: false
    }
  });
}

async function unmuteUser(bot: TelegramBot, chatId: number, userId: number): Promise<void> {
  await bot.restrictChatMember(chatId, userId, {
    permissions: {
      can_send_messages: true,
      can_send_photos: true,
      can_send_videos: true,
      can_send_audios: true,
      can_send_documents: true,
      can_send_video_notes: true,
      can_send_voice_notes: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true
    }
  });
}

async function deleteMessageSafe(bot: TelegramBot, chatId: number, messageId: number): Promise<void> {
  try {
    await bot.deleteMessage(chatId, messageId);
  } catch {}
}

// -------------------- Track User History --------------------
function trackUserHistory(user: TelegramBot.User): void {
  const userId = String(user.id);
  const now = getCurrentTimestamp();
  const currentName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  const currentUsername = user.username || 'No username';
  
  if (!historyDb[userId]) {
    historyDb[userId] = { names: [], usernames: [] };
  }
  
  const userData = historyDb[userId];
  
  if (!userData.names.length || userData.names[userData.names.length - 1].value !== currentName) {
    userData.names.push({ value: currentName, date: now });
  }
  
  if (!userData.usernames.length || userData.usernames[userData.usernames.length - 1].value !== currentUsername) {
    userData.usernames.push({ value: currentUsername, date: now });
  }
  
  saveHistory(historyDb);
}
// Part 4: Auto Night Scheduler & Scan Functions

// -------------------- Auto Night Mode Scheduler --------------------
async function autoNightScheduler(bot: TelegramBot): Promise<void> {
  while (true) {
    const currentTime = getCurrentTime();
    const currentData = loadData();
    
    for (const [chatIdStr, settings] of Object.entries(currentData)) {
      const chatId = parseInt(chatIdStr);
      const on = settings.night_on || DEFAULT_NIGHT_ON;
      const off = settings.night_off || DEFAULT_NIGHT_OFF;
      
      let should: boolean;
      if (on <= off) {
        should = (on <= currentTime && currentTime < off);
      } else {
        should = (currentTime >= on || currentTime < off);
      }
      
      if (should && !settings.night_mode) {
        settings.night_mode = true;
        saveData(currentData);
        try {
          await bot.sendMessage(chatId, '🌙 *Night Mode Enabled* (auto)\nAll non-admin messages will be deleted.', { parse_mode: 'Markdown' });
        } catch {}
      } else if (!should && settings.night_mode) {
        settings.night_mode = false;
        saveData(currentData);
        try {
          await bot.sendMessage(chatId, '☀️ *Night Mode Disabled* (auto)\nMessage deletion turned off.', { parse_mode: 'Markdown' });
        } catch {}
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 60000));
  }
}

// -------------------- Core Scan Function --------------------
async function doScan(bot: TelegramBot, chatId: number, msg?: TelegramBot.Message): Promise<{
  scanned: number;
  deleted: number;
  failed: number;
  deletedUsers: string[];
}> {
  let deletedCount = 0;
  let failedCount = 0;
  let scannedCount = 0;
  const deletedUsers: string[] = [];
  
  let memberIds = getMembers(chatId);
  
  try {
    const admins = await bot.getChatAdministrators(chatId);
    for (const admin of admins) {
      if (!memberIds.includes(admin.user.id)) {
        memberIds.push(admin.user.id);
        saveMember(admin.user.id, chatId);
      }
    }
  } catch {}
  
  const total = memberIds.length;
  
  if (msg) {
    try {
      await bot.editMessageText(
        `👥 <b>Found ${total} tracked members</b>\n🔍 Scanning for deleted accounts...`,
        { chat_id: chatId, message_id: msg.message_id, parse_mode: 'HTML' }
      );
    } catch {}
  }
  
  for (const uid of memberIds) {
    scannedCount++;
    
    if (msg && scannedCount % 50 === 0) {
      try {
        await bot.editMessageText(
          `🔍 <b>Scanning...</b>\n👤 Scanned: ${scannedCount}/${total}\n🗑 Deleted found: ${deletedCount}`,
          { chat_id: chatId, message_id: msg.message_id, parse_mode: 'HTML' }
        );
      } catch {}
    }
    
    try {
      const member = await bot.getChatMember(chatId, uid);
      if (isDeleted(member.user)) {
        try {
          await bot.banChatMember(chatId, uid);
          await new Promise(resolve => setTimeout(resolve, 500));
          await bot.unbanChatMember(chatId, uid);
          deletedCount++;
          deletedUsers.push(`• ID: <code>${uid}</code>`);
        } catch {
          failedCount++;
        }
      }
    } catch {
      try {
        await bot.banChatMember(chatId, uid);
        await new Promise(resolve => setTimeout(resolve, 300));
        await bot.unbanChatMember(chatId, uid);
        deletedCount++;
        deletedUsers.push(`• ID: <code>${uid}</code>`);
      } catch {
        failedCount++;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  return { scanned: scannedCount, deleted: deletedCount, failed: failedCount, deletedUsers };
}

// -------------------- Auto Clean Job --------------------
async function autoCleanJob(bot: TelegramBot, chatId: number): Promise<void> {
  try {
    const { deleted } = await doScan(bot, chatId);
    if (deleted > 0) {
      await bot.sendMessage(
        chatId,
        `🤖 <b>Auto Clean Complete!</b>\n🗑 Removed <b>${deleted}</b> deleted accounts.\n🕐 <b>Time:</b> ${getCurrentTimestamp()} IST\n⚡ Powered by MRIXDU BOT`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    console.error('Auto clean error:', error);
  }
}
// Part 5: Command Handlers (Part 1) - Start through Mute commands

// -------------------- Command Handlers --------------------
// /start
function startCommand(bot: TelegramBot) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (msg.chat.type === 'private') {
      const text = 
        '🛡️ **Welcome to MRIXDU Protection Bot**\n\n' +
        'Hey there! 👋\n\n' +
        "I'm MRIXDU Protection Bot — your advanced Telegram group security and management assistant, built to keep your community safe, organized, and spam‑free.\n\n" +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '⚡ **Features**\n\n' +
        '👮 **User Moderation**\n' +
        '• Kick, Ban & Mute Members\n' +
        '• User Information Lookup\n' +
        '• Admin Management Tools\n' +
        '• Promote / Demote Admins\n\n' +
        '🛡️ **Security Protection**\n' +
        '• Anti‑Spam System\n' +
        '• Media Protection\n' +
        '• Force Subscribe Verification\n' +
        '• Auto Moderation Features\n' +
        '• Deleted Account Cleanup\n\n' +
        '🌙 **Night Mode**\n' +
        '• Automatic Group Lockdown\n' +
        '• Custom Night Schedule\n\n' +
        '🚫 **Filters & Blacklists**\n' +
        '• Word Filtering\n' +
        '• Blacklisted Words Control\n' +
        '• Sticker & Sticker Pack Protection\n' +
        '• Custom Auto-Reply Filters\n\n' +
        '📌 **Utilities**\n' +
        '• Pin Messages\n' +
        '• Admin Mentions\n' +
        '• User History Tracking\n' +
        '• Group Statistics\n\n' +
        '🗑️ **Cleanup Tools**\n' +
        '• Remove Deleted Accounts\n' +
        '• Auto Clean Schedule (24hrs)\n' +
        '• Group Member Tracking\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '📋 **View All Commands**\n' +
        '➜ /commands\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '🌐 **Official Network**\n\n' +
        '👥 Community Group\n' +
        '@BGMIPOPULARITYOG\n\n' +
        '📢 Official Channel\n' +
        '@MAXITEMARKET\n\n' +
        '🌍 Support Group\n' +
        '@MAXITEWORLD\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '💎 **Need Your Own Bot?**\n\n' +
        'Want a clone of this bot, custom features, or a private setup?\n\n' +
        '👑 Owner & Developer\n' +
        '@MRIXDU\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '🔒 Stay Safe • Stay Protected\n' +
        '⚙️ Powered by MRIXDU Protection Bot';
      
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', disable_web_page_preview: true });
    } else {
      await bot.sendMessage(chatId, 'Use /start in private chat to see my commands.');
    }
  });
}

// /commands
function commandsListCommand(bot: TelegramBot) {
  bot.onText(/\/commands/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (msg.chat.type === 'private') {
      const text =
        '📋 **All Commands**\n\n' +
        '👮 **Moderation Commands**\n' +
        '• `/ban @username` - Ban a user\n' +
        '• `/unban @username` - Unban a user\n' +
        '• `/kick @username` - Kick a user\n' +
        '• `/mute @username` - Mute a user\n' +
        '• `/unmute @username` - Unmute a user\n' +
        '• `/promote @username` - Promote to admin\n' +
        '• `/demote @username` - Demote from admin\n' +
        '• `/info @username` - Get user info\n\n' +
        '🛡️ **Security Commands**\n' +
        '• `/forcesubscribe @channel` - Force channel join\n' +
        '• `/antispamon` - Enable anti-spam\n' +
        '• `/antispamoff` - Disable anti-spam\n' +
        '• `/mediaoff` - Block media from non-admins\n' +
        '• `/mediaon` - Allow media from everyone\n\n' +
        '🌙 **Night Mode**\n' +
        '• `/nighton` - Enable night mode\n' +
        '• `/nightoff` - Disable night mode\n' +
        '• `/setnight HH:MM HH:MM` - Set night schedule\n\n' +
        '🚫 **Filters & Blacklists**\n' +
        '• `/block word` - Block a word\n' +
        '• `/unblock word` - Unblock a word\n' +
        '• `/filter word reply` - Set auto-reply filter\n' +
        '• `/delfilter word` - Remove a filter\n' +
        '• `/blocksticker` - Block a sticker\n' +
        '• `/unblocksticker` - Unblock a sticker\n' +
        '• `/banstickerpack` - Ban a sticker pack\n' +
        '• `/unbanstickerpack` - Unban a sticker pack\n\n' +
        '🗑️ **Cleanup Commands**\n' +
        '• `/stats` - View group statistics\n' +
        '• `/clean` - Remove deleted accounts\n' +
        '• `/autoclean` - Enable auto-clean (24hrs)\n' +
        '• `/disableautoclean` - Disable auto-clean\n\n' +
        '📌 **Utility Commands**\n' +
        '• `/pin` - Pin a message (reply to message)\n' +
        '• `/history @username` - View user history\n' +
        '• `/checkadmin` - Check bot admin status\n' +
        '• `@admin` - Mention all admins\n' +
        '• `/commands` - Show this list';
      
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    }
  });
}

// /checkadmin
function checkAdminCommand(bot: TelegramBot) {
  bot.onText(/\/checkadmin/, async (msg) => {
    const chatId = msg.chat.id;
    const botInfo = await bot.getMe();
    
    try {
      const botMember = await bot.getChatMember(chatId, botInfo.id);
      const isAdmin = botMember.status === 'administrator' || botMember.status === 'creator';
      await bot.sendMessage(chatId, `Bot is admin: ${isAdmin}\nStatus: ${botMember.status}`);
    } catch (error: any) {
      await bot.sendMessage(chatId, `Cannot check admin status: ${error.message}`);
    }
  });
}

// Night Mode Commands
function nightModeCommands(bot: TelegramBot) {
  // /nighton
  bot.onText(/\/nighton/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Only group admins can use this command.');
      return;
    }
    
    const settings = getChatSettings(chatId);
    settings.night_mode = true;
    saveData(loadData());
    await bot.sendMessage(chatId, '🌙 Night mode enabled. Non-admin messages will be deleted.');
  });

  // /nightoff
  bot.onText(/\/nightoff/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Only group admins can use this command.');
      return;
    }
    
    const settings = getChatSettings(chatId);
    settings.night_mode = false;
    saveData(loadData());
    await bot.sendMessage(chatId, '☀️ Night mode disabled.');
  });

  // /setnight
  bot.onText(/\/setnight (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Only group admins can use this command.');
      return;
    }
    
    if (!match) {
      await bot.sendMessage(chatId, 'Usage: /setnight 01:00 07:00');
      return;
    }
    
    const onTime = parseTimeWithAmPm(match[1]);
    const offTime = parseTimeWithAmPm(match[2]);
    
    if (!onTime || !offTime) {
      await bot.sendMessage(chatId, 'Invalid time format. Use HH:MM or HH:MM AM/PM');
      return;
    }
    
    const settings = getChatSettings(chatId);
    settings.night_on = onTime;
    settings.night_off = offTime;
    saveData(loadData());
    await bot.sendMessage(chatId, `✅ Auto night set: ON ${onTime} IST, OFF ${offTime} IST.`);
  });
        }
// Part 6: Command Handlers (Part 2) - Ban through Unmute

// Ban/Unban/Kick/Mute/Unmute Commands
function moderationCommands(bot: TelegramBot) {
  // /ban
  bot.onText(/\/ban(?:\s+@(\w+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    let targetUser: TelegramBot.User | null = null;
    
    if (msg.reply_to_message && msg.reply_to_message.from) {
      targetUser = msg.reply_to_message.from;
    } else if (match && match[1]) {
      const username = match[1];
      const userInfo = await getUserByUsername(username);
      if (!userInfo) {
        await bot.sendMessage(chatId, `❌ User @${username} not found in database.\nThey must have spoken in the group after the bot was added.`);
        return;
      }
      try {
        const member = await bot.getChatMember(chatId, userInfo.user_id);
        targetUser = member.user;
      } catch {
        await bot.sendMessage(chatId, `User @${username} found in DB but not in group.`);
        return;
      }
    } else {
      await bot.sendMessage(chatId, 'Usage: /ban @username or reply to a user\'s message with /ban');
      return;
    }
    
    if (!targetUser) {
      await bot.sendMessage(chatId, 'Could not identify target user.');
      return;
    }
    
    try {
      await bot.banChatMember(chatId, targetUser.id);
      await bot.sendMessage(chatId, `✅ Banned ${targetUser.first_name} (ID: ${targetUser.id})`);
    } catch (error: any) {
      await bot.sendMessage(chatId, `Failed to ban: ${error.message}`);
    }
  });

  // /unban
  bot.onText(/\/unban(?:\s+@(\w+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    let targetId: number | null = null;
    
    if (msg.reply_to_message && msg.reply_to_message.from) {
      targetId = msg.reply_to_message.from.id;
    } else if (match && match[1]) {
      const username = match[1];
      const userInfo = await getUserByUsername(username);
      if (!userInfo) {
        await bot.sendMessage(chatId, `❌ User @${username} not found in database.`);
        return;
      }
      targetId = userInfo.user_id;
    } else {
      await bot.sendMessage(chatId, 'Usage: /unban @username or reply to a banned user\'s message');
      return;
    }
    
    if (!targetId) {
      await bot.sendMessage(chatId, 'Could not identify target user.');
      return;
    }
    
    try {
      await bot.unbanChatMember(chatId, targetId);
      await bot.sendMessage(chatId, `✅ Unbanned user ID ${targetId}`);
    } catch (error: any) {
      await bot.sendMessage(chatId, `Failed to unban: ${error.message}`);
    }
  });

  // /kick
  bot.onText(/\/kick(?:\s+@(\w+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    let targetUser: TelegramBot.User | null = null;
    
    if (msg.reply_to_message && msg.reply_to_message.from) {
      targetUser = msg.reply_to_message.from;
    } else if (match && match[1]) {
      const username = match[1];
      const userInfo = await getUserByUsername(username);
      if (!userInfo) {
        await bot.sendMessage(chatId, `❌ User @${username} not found in database.`);
        return;
      }
      try {
        const member = await bot.getChatMember(chatId, userInfo.user_id);
        targetUser = member.user;
      } catch {
        await bot.sendMessage(chatId, `User @${username} found in DB but not in group.`);
        return;
      }
    } else {
      await bot.sendMessage(chatId, 'Usage: /kick @username or reply to a user\'s message with /kick');
      return;
    }
    
    if (!targetUser) {
      await bot.sendMessage(chatId, 'Could not identify target user.');
      return;
    }
    
    try {
      await bot.banChatMember(chatId, targetUser.id);
      await bot.unbanChatMember(chatId, targetUser.id);
      await bot.sendMessage(chatId, `✅ Kicked ${targetUser.first_name}`);
    } catch (error: any) {
      await bot.sendMessage(chatId, `Failed to kick: ${error.message}`);
    }
  });

  // /mute
  bot.onText(/\/mute(?:\s+@(\w+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    let targetUser: TelegramBot.User | null = null;
    
    if (msg.reply_to_message && msg.reply_to_message.from) {
      targetUser = msg.reply_to_message.from;
    } else if (match && match[1]) {
      const username = match[1];
      const userInfo = await getUserByUsername(username);
      if (!userInfo) {
        await bot.sendMessage(chatId, `❌ User @${username} not found in database.`);
        return;
      }
      try {
        const member = await bot.getChatMember(chatId, userInfo.user_id);
        targetUser = member.user;
      } catch {
        await bot.sendMessage(chatId, `User @${username} found in DB but not in group.`);
        return;
      }
    } else {
      await bot.sendMessage(chatId, 'Usage: /mute @username or reply to a user\'s message with /mute');
      return;
    }
    
    if (!targetUser) {
      await bot.sendMessage(chatId, 'Could not identify target user.');
      return;
    }
    
    try {
      await bot.restrictChatMember(chatId, targetUser.id, {
        permissions: {
          can_send_messages: false
        }
      });
      await bot.sendMessage(chatId, `🔇 Muted ${targetUser.first_name} (ID: ${targetUser.id})`);
    } catch (error: any) {
      await bot.sendMessage(chatId, `Failed to mute: ${error.message}`);
    }
  });

  // /unmute
  bot.onText(/\/unmute(?:\s+@(\w+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    let targetUser: TelegramBot.User | null = null;
    
    if (msg.reply_to_message && msg.reply_to_message.from) {
      targetUser = msg.reply_to_message.from;
    } else if (match && match[1]) {
      const username = match[1];
      const userInfo = await getUserByUsername(username);
      if (!userInfo) {
        await bot.sendMessage(chatId, `❌ User @${username} not found in database.`);
        return;
      }
      try {
        const member = await bot.getChatMember(chatId, userInfo.user_id);
        targetUser = member.user;
      } catch {
        await bot.sendMessage(chatId, `User @${username} found in DB but not in group.`);
        return;
      }
    } else {
      await bot.sendMessage(chatId, 'Usage: /unmute @username or reply to a user\'s message with /unmute');
      return;
    }
    
    if (!targetUser) {
      await bot.sendMessage(chatId, 'Could not identify target user.');
      return;
    }
    
    try {
      await bot.restrictChatMember(chatId, targetUser.id, {
        permissions: {
          can_send_messages: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true
        }
      });
      await bot.sendMessage(chatId, `🔊 Unmuted ${targetUser.first_name} (ID: ${targetUser.id})`);
    } catch (error: any) {
      await bot.sendMessage(chatId, `Failed to unmute: ${error.message}`);
    }
  });
                            }
// Part 7: Command Handlers (Part 3) - Info through Filter commands

// /info
function infoCommand(bot: TelegramBot) {
  bot.onText(/\/info(?:\s+@(\w+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    let targetUser: TelegramBot.User | null = null;
    
    if (msg.reply_to_message && msg.reply_to_message.from) {
      targetUser = msg.reply_to_message.from;
    } else if (match && match[1]) {
      const username = match[1];
      const userInfo = await getUserByUsername(username);
      if (userInfo) {
        try {
          const member = await bot.getChatMember(chatId, userInfo.user_id);
          targetUser = member.user;
        } catch {
          await bot.sendMessage(chatId, `User @${username} found in DB but not in group.`);
          return;
        }
      } else {
        await bot.sendMessage(chatId, `❌ User @${username} not found in database.`);
        return;
      }
    } else {
      await bot.sendMessage(chatId, 'Usage: /info @username or reply to a user\'s message with /info');
      return;
    }
    
    if (!targetUser) {
      await bot.sendMessage(chatId, 'Could not identify target user.');
      return;
    }
    
    let statusStr = 'Member';
    try {
      const admins = await bot.getChatAdministrators(chatId);
      const isAdmin = admins.some(a => a.user.id === targetUser.id);
      if (isAdmin) {
        const admin = admins.find(a => a.user.id === targetUser.id);
        statusStr = admin?.status === 'creator' ? 'Creator' : 'Administrator';
      } else {
        try {
          const member = await bot.getChatMember(chatId, targetUser.id);
          if (member.status === 'restricted') statusStr = 'Restricted';
          else if (member.status === 'left') statusStr = 'Left';
          else if (member.status === 'kicked') statusStr = 'Banned';
          else statusStr = 'Member';
        } catch {}
      }
    } catch {}
    
    const msgText =
      `👤 **User Info**\n` +
      `🆔 ID: \`${targetUser.id}\`\n` +
      `📛 Name: ${targetUser.first_name}${targetUser.last_name ? ` ${targetUser.last_name}` : ''}\n` +
      `👤 Username: @${targetUser.username || 'NoUsername'}\n` +
      `🔗 [User link](tg://user?id=${targetUser.id})\n` +
      `📌 Status in group: ${statusStr}`;
    
    await bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown', disable_web_page_preview: true });
  });
}

// Word, Sticker, Filter Commands
function filterCommands(bot: TelegramBot) {
  // /block
  bot.onText(/\/block (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    if (!match) {
      await bot.sendMessage(chatId, 'Usage: /block word1 word2 ...');
      return;
    }
    
    const words = match[1].split(/\s+/);
    const settings = getChatSettings(chatId);
    const newWords = words.filter(w => !settings.blocked_words.includes(w.toLowerCase()));
    settings.blocked_words.push(...newWords.map(w => w.toLowerCase()));
    saveData(loadData());
    await bot.sendMessage(chatId, `🚫 Blocked words: ${newWords.join(', ')}`);
  });

  // /unblock
  bot.onText(/\/unblock (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    if (!match) {
      await bot.sendMessage(chatId, 'Usage: /unblock word1 word2 ...');
      return;
    }
    
    const words = match[1].split(/\s+/);
    const settings = getChatSettings(chatId);
    const removed: string[] = [];
    for (const w of words) {
      const wl = w.toLowerCase();
      const index = settings.blocked_words.indexOf(wl);
      if (index !== -1) {
        settings.blocked_words.splice(index, 1);
        removed.push(w);
      }
    }
    saveData(loadData());
    await bot.sendMessage(chatId, `✅ Unblocked: ${removed.length ? removed.join(', ') : 'None'}`);
  });

  // /blocksticker
  bot.onText(/\/blocksticker/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    if (!msg.reply_to_message || !msg.reply_to_message.sticker) {
      await bot.sendMessage(chatId, 'Reply to a sticker to block it.');
      return;
    }
    
    const stickerId = msg.reply_to_message.sticker.file_id;
    const settings = getChatSettings(chatId);
    if (!settings.blocked_stickers.includes(stickerId)) {
      settings.blocked_stickers.push(stickerId);
      saveData(loadData());
      await bot.sendMessage(chatId, '🚫 Sticker blocked.');
    } else {
      await bot.sendMessage(chatId, 'Sticker already blocked.');
    }
  });

  // /unblocksticker
  bot.onText(/\/unblocksticker/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    if (!msg.reply_to_message || !msg.reply_to_message.sticker) {
      await bot.sendMessage(chatId, 'Reply to a sticker to unblock it.');
      return;
    }
    
    const stickerId = msg.reply_to_message.sticker.file_id;
    const settings = getChatSettings(chatId);
    const index = settings.blocked_stickers.indexOf(stickerId);
    if (index !== -1) {
      settings.blocked_stickers.splice(index, 1);
      saveData(loadData());
      await bot.sendMessage(chatId, '✅ Sticker unblocked.');
    } else {
      await bot.sendMessage(chatId, 'Sticker not blocked.');
    }
  });

  // /banstickerpack
  bot.onText(/\/banstickerpack/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    if (!msg.reply_to_message || !msg.reply_to_message.sticker) {
      await bot.sendMessage(chatId, 'Reply to a sticker to ban its entire pack.');
      return;
    }
    
    const packName = msg.reply_to_message.sticker.set_name;
    if (!packName) {
      await bot.sendMessage(chatId, 'This sticker does not belong to a pack.');
      return;
    }
    
    const settings = getChatSettings(chatId);
    if (!settings.banned_sticker_packs.includes(packName)) {
      settings.banned_sticker_packs.push(packName);
      saveData(loadData());
      await bot.sendMessage(chatId, `🚫 Sticker pack \`${packName}\` banned.`, { parse_mode: 'Markdown' });
    } else {
      await bot.sendMessage(chatId, 'This sticker pack is already banned.');
    }
  });

  // /unbanstickerpack
  bot.onText(/\/unbanstickerpack/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    if (!msg.reply_to_message || !msg.reply_to_message.sticker) {
      await bot.sendMessage(chatId, 'Reply to a sticker from the banned pack to unban it.');
      return;
    }
    
    const packName = msg.reply_to_message.sticker.set_name;
    if (!packName) {
      await bot.sendMessage(chatId, 'This sticker does not belong to a pack.');
      return;
    }
    
    const settings = getChatSettings(chatId);
    const index = settings.banned_sticker_packs.indexOf(packName);
    if (index !== -1) {
      settings.banned_sticker_packs.splice(index, 1);
      saveData(loadData());
      await bot.sendMessage(chatId, `✅ Sticker pack \`${packName}\` unbanned.`, { parse_mode: 'Markdown' });
    } else {
      await bot.sendMessage(chatId, 'This sticker pack was not banned.');
    }
  });

  // /pin
  bot.onText(/\/pin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    if (!msg.reply_to_message) {
      await bot.sendMessage(chatId, 'Reply to a message to pin it.');
      return;
    }
    
    try {
      await bot.pinChatMessage(chatId, msg.reply_to_message.message_id);
      await bot.sendMessage(chatId, '📌 Message pinned.');
    } catch (error: any) {
      await bot.sendMessage(chatId, `Failed to pin: ${error.message}`);
    }
  });

  // /filter
  bot.onText(/\/filter (\w+)(?: (.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    if (!match) {
      await bot.sendMessage(chatId, 'Usage: /filter word reply_text\nExample: /filter done Hero');
      return;
    }
    
    const word = match[1].toLowerCase();
    const settings = getChatSettings(chatId);
    
    let photoFileId: string | null = null;
    if (msg.reply_to_message?.photo) {
      photoFileId = msg.reply_to_message.photo[msg.reply_to_message.photo.length - 1].file_id;
    }
    
    if (photoFileId) {
      settings.filters[word] = photoFileId;
      saveData(loadData());
      await bot.sendMessage(chatId, `🔍 Filter added: when someone says '${word}', I'll send that photo.`);
    } else if (match[2]) {
      const reply = match[2];
      settings.filters[word] = reply;
      saveData(loadData());
      await bot.sendMessage(chatId, `🔍 Filter added: when someone says '${word}', I'll reply: '${reply}'`);
    } else {
      await bot.sendMessage(chatId, 'Usage: /filter word reply_text\nExample: /filter done Hero');
    }
  });

  // /delfilter
  bot.onText(/\/delfilter (\w+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    const botInfo = await bot.getMe();
    
    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Admins only.');
      return;
    }
    
    if (!match) {
      await bot.sendMessage(chatId, 'Usage: /delfilter word');
      return;
    }
    
    const word = match[1].toLowerCase();
    const settings = getChatSettings(chatId);
    
    if (settings.filters[word]) {
      delete settings.filters[word];
      saveData(loadData());
      await bot.sendMessage(chatId, `✅ Filter removed for: ${word}`);
    } else {
      await bot.sendMessage(chatId, 'Filter not found.');
    }
  });
      }
// Part 9: Command Handlers (Part 5) - History, Stats, Clean, AutoClean

// /history
function historyCommand(bot: TelegramBot) {
  bot.onText(/\/history(?:\s+@(\w+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    
    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
      await bot.sendMessage(chatId, '❌ This command only works in groups!');
      return;
    }
    
    let targetUser: TelegramBot.User | null = null;
    let userId: string | null = null;
    
    if (msg.reply_to_message && msg.reply_to_message.from) {
      targetUser = msg.reply_to_message.from;
      if (targetUser) userId = String(targetUser.id);
    } else if (match && match[1]) {
      const username = match[1].toLowerCase();
      for (const [uid, data] of Object.entries(historyDb)) {
        if (data.usernames.length) {
          const lastUsername = data.usernames[data.usernames.length - 1].value.toLowerCase().replace('@', '');
          if (lastUsername === username) {
            userId = uid;
            try {
              const member = await bot.getChatMember(chatId, parseInt(uid));
              targetUser = member.user;
            } catch {}
            break;
          }
        }
      }
      if (!userId) {
        await bot.sendMessage(chatId, '❌ User not found in history! They must have sent a message first.');
        return;
      }
    } else {
      await bot.sendMessage(chatId, '❌ Usage: /history @username or reply to a user.');
      return;
    }
    
    if (!userId || !historyDb[userId]) {
      await bot.sendMessage(chatId, '❌ No history found! User must send a message first.');
      return;
    }
    
    const data = historyDb[userId];
    const names = data.names || [];
    const usernames = data.usernames || [];
    
    let currentUsername = 'N/A';
    if (targetUser?.username) {
      currentUsername = `@${targetUser.username}`;
    } else if (usernames.length) {
      currentUsername = `@${usernames[usernames.length - 1].value}`;
    }
    
    let text = `📋 <b>History for</b> ${currentUsername}\n`;
    text += `🆔 <code>${userId}</code>\n`;
    text += '━━━━━━━━━━━━━━━━━━━━\n';
    
    text += `\n👤 <b>Name History (${names.length} records):</b>\n`;
    if (names.length) {
      const recentNames = names.slice(-10).reverse();
      for (let i = 0; i < recentNames.length; i++) {
        text += `  ${i + 1}. <b>${recentNames[i].value}</b>\n`;
        text += `      🕐 ${recentNames[i].date}\n`;
      }
    } else {
      text += '  No name history found.\n';
    }
    
    text += `\n🔖 <b>Username History (${usernames.length} records):</b>\n`;
    if (usernames.length) {
      const recentUsernames = usernames.slice(-10).reverse();
      for (let i = 0; i < recentUsernames.length; i++) {
        text += `  ${i + 1}. <b>@${recentUsernames[i].value}</b>\n`;
        text += `      🕐 ${recentUsernames[i].date}\n`;
      }
    } else {
      text += '  No username history found.\n';
    }
    
    text += '\n━━━━━━━━━━━━━━━━━━━━\n';
    text += '⚡ Powered by MRIXDU BOT';
    
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  });
}

// /stats
function statsCommand(bot: TelegramBot) {
  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
      await bot.sendMessage(chatId, '❌ This command only works in groups!');
      return;
    }
    
    try {
      const total = await bot.getChatMemberCount(chatId);
      const tracked = getMembers(chatId).length;
      const text =
        `📊 <b>Group Statistics</b>\n\n` +
        `👥 <b>Group:</b> ${msg.chat.title}\n` +
        `🆔 <b>Chat ID:</b> <code>${chatId}</code>\n` +
        `👤 <b>Total Members:</b> ${total}\n` +
        `🔍 <b>Tracked Members:</b> ${tracked}\n` +
        `🕐 <b>Checked at:</b> ${getCurrentTimestamp()} IST\n\n` +
        `Run /clean to remove deleted accounts!`;
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } catch (error: any) {
      await bot.sendMessage(chatId, `❌ Error: ${error.message}`);
    }
  });
}

// /clean
function cleanCommand(bot: TelegramBot) {
  bot.onText(/\/clean/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    
    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
      await bot.sendMessage(chatId, '❌ This command only works in groups!');
      return;
    }
    
    if (!userId) {
      await bot.sendMessage(chatId, '❌ Could not identify user.');
      return;
    }
    
    try {
      const member = await bot.getChatMember(chatId, userId);
      if (member.status !== 'administrator' && member.status !== 'creator') {
        await bot.sendMessage(chatId, '❌ Only admins can use this command!');
        return;
      }
    } catch {
      await bot.sendMessage(chatId, '❌ Cannot verify admin status!');
      return;
    }
    
    const sentMsg = await bot.sendMessage(chatId, '🔍 <b>Fetching tracked members...</b>\n⏳ Please wait!', { parse_mode: 'HTML' });
    
    try {
      const { scanned, deleted, failed, deletedUsers } = await doScan(bot, chatId, sentMsg);
      
      let result =
        `✅ <b>Scan Complete!</b>\n\n` +
        `👥 <b>Total Scanned:</b> ${scanned}\n` +
        `🗑 <b>Deleted Removed:</b> ${deleted}\n` +
        `⚠️ <b>Failed:</b> ${failed}\n` +
        `🕐 <b>Time:</b> ${getCurrentTimestamp()} IST\n`;
      
      if (deletedUsers.length) {
        result += '\n<b>Removed IDs:</b>\n' + deletedUsers.slice(0, 20).join('\n');
        if (deletedUsers.length > 20) {
          result += `\n... and ${deletedUsers.length - 20} more`;
        }
      }
      
      if (deleted === 0) {
        result += '\n\n🎉 <b>Group is clean! No deleted accounts found.</b>';
      }
      
      result += '\n\n⚡ <b>Powered by MRIXDU BOT</b>';
      
      await bot.editMessageText(result, {
        chat_id: chatId,
        message_id: sentMsg.message_id,
        parse_mode: 'HTML'
      });
    } catch (error: any) {
      await bot.editMessageText(
        `❌ <b>Error:</b> ${error.message}\n\nMake sure:\n1. Bot is admin with Ban Users permission\n2. This is a supergroup`,
        { chat_id: chatId, message_id: sentMsg.message_id, parse_mode: 'HTML' }
      );
    }
  });
}

// /autoclean & /disableautoclean
let autoCleanIntervals: Record<string, NodeJS.Timeout> = {};

function autoCleanCommands(bot: TelegramBot) {
  // /autoclean
  bot.onText(/\/autoclean/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    
    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
      await bot.sendMessage(chatId, '❌ Groups only!');
      return;
    }
    
    if (!userId) {
      await bot.sendMessage(chatId, '❌ Could not identify user.');
      return;
    }
    
    try {
      const member = await bot.getChatMember(chatId, userId);
      if (member.status !== 'administrator' && member.status !== 'creator') {
        await bot.sendMessage(chatId, '❌ Only admins can use this command!');
        return;
      }
    } catch {
      await bot.sendMessage(chatId, '❌ Cannot verify admin status!');
      return;
    }
    
    const jobKey = `auto_clean_${chatId}`;
    if (autoCleanIntervals[jobKey]) {
      clearInterval(autoCleanIntervals[jobKey]);
      delete autoCleanIntervals[jobKey];
    }
    
    autoCleanIntervals[jobKey] = setInterval(() => {
      autoCleanJob(bot, chatId);
    }, 86400000); // 24 hours
    
    await bot.sendMessage(
      chatId,
      `✅ <b>Auto Clean Enabled!</b>\n🕐 Scans every <b>24 hours</b> automatically!\n🇮🇳 Time zone: <b>IST (India)</b>\n\n⚡ Powered by MRIXDU BOT`,
      { parse_mode: 'HTML' }
    );
  });

  // /disableautoclean
  bot.onText(/\/disableautoclean/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;
    
    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
      await bot.sendMessage(chatId, '❌ Groups only!');
      return;
    }
    
    if (!userId) {
      await bot.sendMessage(chatId, '❌ Could not identify user.');
      return;
    }
    
    try {
      const member = await bot.getChatMember(chatId, userId);
      if (member.status !== 'administrator' && member.status !== 'creator') {
        await bot.sendMessage(chatId, '❌ Only admins can use this command!');
        return;
      }
    } catch {
      await bot.sendMessage(chatId, '❌ Cannot verify admin status!');
      return;
    }
    
    const jobKey = `auto_clean_${chatId}`;
    if (autoCleanIntervals[jobKey]) {
      clearInterval(autoCleanIntervals[jobKey]);
      delete autoCleanIntervals[jobKey];
      await bot.sendMessage(chatId, '🛑 <b>Auto Clean Disabled!</b>\n\n⚡ Powered by MRIXDU BOT', { parse_mode: 'HTML' });
    } else {
      await bot.sendMessage(chatId, '⚠️ Auto clean was not enabled!');
    }
  });
  }
// Part 10: Callback Handler, Message Handler, Admin Mention, Main

// -------------------- Callback Query Handler --------------------
function callbackHandler(bot: TelegramBot) {
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message?.chat.id;
    const userId = callbackQuery.from.id;
    const messageId = callbackQuery.message?.message_id;
    
    if (!chatId || !messageId) {
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'Error processing request.' });
      return;
    }
    
    if (callbackQuery.data === 'check_subscribe') {
      await bot.answerCallbackQuery(callbackQuery.id);
      
      const info = forceJoinWaiting[userId];
      if (!info) {
        await bot.editMessageText('Verification expired. Please rejoin the group or contact an admin.', {
          chat_id: chatId,
          message_id: messageId
        });
        return;
      }
      
      const isSubscribed = await isUserInChannel(bot, userId, info.channel);
      if (isSubscribed) {
        try {
          await unmuteUser(bot, info.chat_id, userId);
        } catch {}
        await bot.editMessageText('✅ Verification successful! You may now chat in the group.', {
          chat_id: chatId,
          message_id: messageId
        });
        await bot.sendMessage(info.chat_id, `${getUserDisplayName(callbackQuery.from)} has verified and can now talk.`);
        delete forceJoinWaiting[userId];
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '❌ You haven\'t joined the channel yet. Please join first, then click again.',
          show_alert: true
        });
      }
    }
    
    // Handle private channel info button
    if (callbackQuery.data === 'private_channel_info') {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: 'ℹ️ Please contact a group admin to get the invite link for the private channel.',
        show_alert: true
      });
    }
  });
}

// -------------------- Message Handler (Guard) --------------------
function messageHandler(bot: TelegramBot) {
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    
    if (!user) return;
    
    // Track user
    saveUser(user);
    trackUserHistory(user);
    
    // Track members
    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
      saveMember(user.id, chatId);
      if (msg.new_chat_members) {
        for (const newUser of msg.new_chat_members) {
          saveMember(newUser.id, chatId);
        }
      }
    }
    
    // Skip if not in group
    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') return;
    const botInfo = await bot.getMe();
    if (user.id === botInfo.id) return;
    
    const settings = getChatSettings(chatId);
    const isAdmin = await isGroupAdmin(bot, chatId, user.id);
    
    // Night mode
    if (settings.night_mode && !isAdmin) {
      try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
      return;
    }
    
    // Force subscribe - FIXED VERSION
    if (!isAdmin) {
      const channel = settings.force_subscribe;
      if (channel) {
        const isSubscribed = await isUserInChannel(bot, user.id, channel);
        if (!isSubscribed) {
          try {
            await muteUser(bot, chatId, user.id, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
          } catch {}
          try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
          
          if (!forceJoinWaiting[user.id]) {
            let messageText = `@${user.username || user.first_name}, you must join `;
            const buttons = [];
            
            // Check if it's a private channel (starts with -100)
            if (channel.startsWith('-100')) {
              messageText += `the private channel to talk here.`;
              // For private channels, we need a different approach
              // You need to store the invite link when setting up
              buttons.push([{ 
                text: 'ℹ️ Contact admin for invite', 
                callback_data: 'private_channel_info' 
              }]);
            } else {
              // Public channel - works with @username
              const cleanChannel = channel.startsWith('@') ? channel.slice(1) : channel;
              messageText += `${channel} to talk here.`;
              buttons.push([{ 
                text: '📢 Subscribe to channel', 
                url: `https://t.me/${cleanChannel}` 
              }]);
            }
            
            messageText += `\n\nAfter joining, click the button below to verify:`;
            buttons.push([{ text: '✅ I subscribed', callback_data: 'check_subscribe' }]);
            
            try {
              const sent = await bot.sendMessage(chatId, messageText, {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: buttons
                }
              });
              forceJoinWaiting[user.id] = { 
                chat_id: chatId, 
                channel: channel, 
                message_id: sent.message_id 
              };
            } catch (error) {
              console.error('Failed to send force subscribe message:', error);
              // Fallback: send a simple message without buttons
              await bot.sendMessage(chatId, 
                `@${user.username || user.first_name}, you must join ${channel} to talk here. ` +
                `After joining, use /verify to confirm.`
              );
            }
          }
          return;
        }
      }
    }
    
    // Auto-unmute if subscribed
    if (!isAdmin) {
      const channel = settings.force_subscribe;
      if (channel && await isUserInChannel(bot, user.id, channel)) {
        try {
          const member = await bot.getChatMember(chatId, user.id);
          if (member.status === 'restricted' && !member.can_send_messages) {
            await unmuteUser(bot, chatId, user.id);
            await bot.sendMessage(chatId, `@${user.username || user.first_name} has joined ${channel} and has been unmuted automatically.`);
          }
        } catch {}
      }
    }
    
    // Media off
    if (settings.media_off && !isAdmin) {
      if (msg.photo || msg.video || msg.document || msg.audio) {
        try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
        return;
      }
    }
    
    // Blocked stickers
    if (msg.sticker) {
      if (settings.blocked_stickers.includes(msg.sticker.file_id)) {
        try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
        return;
      }
      const packName = msg.sticker.set_name;
      if (packName && settings.banned_sticker_packs.includes(packName)) {
        try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
        return;
      }
    }
    
    // Blocked words
    const text = msg.text || msg.caption || '';
    const textLower = text.toLowerCase();
    for (const word of settings.blocked_words) {
      if (textLower.includes(word)) {
        try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
        return;
      }
    }
    
    // Filters
    for (const [word, stored] of Object.entries(settings.filters)) {
      if (textLower.split(' ').includes(word)) {
        try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
        if (stored.match(/^[A-Za-z0-9_-]{20,}$/)) {
          try { await bot.sendPhoto(chatId, stored); } catch {}
        } else {
          await bot.sendMessage(chatId, stored);
        }
        break;
      }
    }
    
    // Anti-spam
    if (settings.anti_spam && !isAdmin) {
      const key = `${chatId}_${user.id}`;
      const nowTs = Date.now();
      if (!msgTracker[key]) msgTracker[key] = [];
      msgTracker[key] = msgTracker[key].filter(t => nowTs - t < SPAM_WINDOW * 1000);
      msgTracker[key].push(nowTs);
      if (msgTracker[key].length > SPAM_MAX_MSGS) {
        const until = new Date(Date.now() + MUTE_DURATION * 1000);
        await muteUser(bot, chatId, user.id, until);
        await bot.sendMessage(
          chatId,
          `🚫 ${user.first_name} has been muted for 5 minutes (spam).`,
          { parse_mode: 'HTML' }
        );
        try { await bot.deleteMessage(chatId, msg.message_id); } catch {}
        msgTracker[key] = [];
        return;
      }
    }
  });
      }

// -------------------- Security Commands (Anti-Spam) --------------------
function securityCommands(bot: TelegramBot) {
  // /antispamon
  bot.onText(/\/antispamon/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Only group admins can use this command.');
      return;
    }

    const settings = getChatSettings(chatId);
    settings.anti_spam = true;
    saveData(loadData());
    await bot.sendMessage(chatId, '🛡️ Anti-spam protection enabled.');
  });

  // /antispamoff
  bot.onText(/\/antispamoff/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Only group admins can use this command.');
      return;
    }

    const settings = getChatSettings(chatId);
    settings.anti_spam = false;
    saveData(loadData());
    await bot.sendMessage(chatId, '🛡️ Anti-spam protection disabled.');
  });

  // /mediaoff
  bot.onText(/\/mediaoff/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Only group admins can use this command.');
      return;
    }

    const settings = getChatSettings(chatId);
    settings.media_off = true;
    saveData(loadData());
    await bot.sendMessage(chatId, '🚫 Media messages are now blocked for non-admins.');
  });

  // /mediaon
  bot.onText(/\/mediaon/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Only group admins can use this command.');
      return;
    }

    const settings = getChatSettings(chatId);
    settings.media_off = false;
    saveData(loadData());
    await bot.sendMessage(chatId, '✅ Media messages are now allowed.');
  });
}

                // -------------------- Force Subscribe Command --------------------
function forceSubscribeCommand(bot: TelegramBot) {
    // /forcesubscribe - Supports both public and private channels
    bot.onText(/\/forcesubscribe(?:\s+(.+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;

        if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
            await bot.sendMessage(chatId, '⚠️ Only group admins can use this command.');
            return;
        }

        if (!match || !match[1]) {
            await bot.sendMessage(chatId, 
                '📌 **Force Subscribe Setup**\n\n' +
                '**For PUBLIC channels:**\n' +
                '`/forcesubscribe @channelname`\n\n' +
                '**For PRIVATE channels:**\n' +
                '`/forcesubscribe -1001234567890`\n\n' +
                '**How to get private channel ID:**\n' +
                '1️⃣ Add bot as admin to private channel\n' +
                '2️⃣ Forward a message from channel to @userinfobot\n' +
                '3️⃣ Copy the Channel ID (starts with -100)\n\n' +
                '**Disable force subscribe:**\n' +
                '`/forcesubscribeoff`',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        let channelInput = match[1].trim();
        
        // Check if it's a channel ID (starts with -100 or is numeric)
        const isChannelId = channelInput.startsWith('-100') || /^-?\d+$/.test(channelInput);

        try {
            let channelIdentifier = channelInput;
            let chatInfo;

            if (isChannelId) {
                // Ensure proper format for private channel
                if (!channelInput.startsWith('-100') && /^\d+$/.test(channelInput)) {
                    channelIdentifier = `-100${channelInput}`;
                }
                chatInfo = await bot.getChat(channelIdentifier);
            } else {
                // Public channel - ensure @ symbol
                if (!channelInput.startsWith('@')) {
                    channelIdentifier = `@${channelInput}`;
                } else {
                    channelIdentifier = channelInput;
                }
                chatInfo = await bot.getChat(channelIdentifier);
            }

            if (!chatInfo || chatInfo.type !== 'channel') {
                await bot.sendMessage(chatId, '❌ Invalid channel. Please provide a valid channel username or ID.');
                return;
            }

            const settings = getChatSettings(chatId);
            settings.force_subscribe = channelIdentifier;
            saveData(loadData());

            const channelType = isChannelId ? '🔒 Private' : '📢 Public';
            await bot.sendMessage(chatId, 
                `✅ **Force Subscribe Enabled!**\n\n` +
                `📌 **Channel:** ${chatInfo.title}\n` +
                `🔗 **Identifier:** \`${channelIdentifier}\`\n` +
                `📂 **Type:** ${channelType}\n` +
                `🔒 **Requirement:** Members must join this channel to chat.\n\n` +
                `⚠️ **Important:** Bot must remain an admin in the channel.`,
                { parse_mode: 'Markdown' }
            );

        } catch (error: any) {
            await bot.sendMessage(chatId, 
                `❌ **Error:** ${error.message}\n\n` +
                `**Troubleshooting:**\n` +
                `• For private channels: Bot must be an admin in the channel\n` +
                `• Verify the channel ID is correct (format: -1001234567890)\n` +
                `• For public channels: Use @username format\n\n` +
                `**Get channel ID:** Forward a message to @userinfobot`,
                { parse_mode: 'Markdown' }
            );
        }
    }); // <-- Closes the /forcesubscribe handler

    // /forcesubscribeoff - Disable force subscribe
    bot.onText(/\/forcesubscribeoff/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from?.id;

        if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
            await bot.sendMessage(chatId, '⚠️ Only group admins can use this command.');
            return;
        }

        const settings = getChatSettings(chatId);
        settings.force_subscribe = null;
        saveData(loadData());
        await bot.sendMessage(chatId, '✅ Force subscribe disabled.');
    }); // <-- Closes the /forcesubscribeoff handler
} // <-- Closes the forceSubscribeCommand function

// -------------------- Promote / Demote Commands --------------------
function promoteDemoteCommands(bot: TelegramBot) {
  // /promote
  bot.onText(/\/promote(?:\s+@(\w+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Only group admins can use this command.');
      return;
    }

    let targetUser: TelegramBot.User | null = null;

    if (msg.reply_to_message && msg.reply_to_message.from) {
      targetUser = msg.reply_to_message.from;
    } else if (match && match[1]) {
      const username = match[1];
      const userInfo = await getUserByUsername(username);
      if (!userInfo) {
        await bot.sendMessage(chatId, `❌ User @${username} not found in database.`);
        return;
      }
      try {
        const member = await bot.getChatMember(chatId, userInfo.user_id);
        targetUser = member.user;
      } catch {
        await bot.sendMessage(chatId, `User @${username} found in DB but not in group.`);
        return;
      }
    } else {
      await bot.sendMessage(chatId, 'Usage: /promote @username or reply to a user\'s message with /promote');
      return;
    }

    if (!targetUser) {
      await bot.sendMessage(chatId, 'Could not identify target user.');
      return;
    }

    try {
      await bot.promoteChatMember(chatId, targetUser.id, {
        can_change_info: true,
        can_delete_messages: true,
        can_invite_users: true,
        can_restrict_members: true,
        can_pin_messages: true,
        can_promote_members: false,
        can_manage_chat: true,
        can_manage_video_chats: true
      });
      await bot.sendMessage(chatId, `⭐ Promoted ${targetUser.first_name} to admin.`);
    } catch (error: any) {
      await bot.sendMessage(chatId, `Failed to promote: ${error.message}`);
    }
  });

  // /demote
  bot.onText(/\/demote(?:\s+@(\w+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId || !await isGroupAdmin(bot, chatId, userId)) {
      await bot.sendMessage(chatId, '⚠️ Only group admins can use this command.');
      return;
    }

    let targetUser: TelegramBot.User | null = null;

    if (msg.reply_to_message && msg.reply_to_message.from) {
      targetUser = msg.reply_to_message.from;
    } else if (match && match[1]) {
      const username = match[1];
      const userInfo = await getUserByUsername(username);
      if (!userInfo) {
        await bot.sendMessage(chatId, `❌ User @${username} not found in database.`);
        return;
      }
      try {
        const member = await bot.getChatMember(chatId, userInfo.user_id);
        targetUser = member.user;
      } catch {
        await bot.sendMessage(chatId, `User @${username} found in DB but not in group.`);
        return;
      }
    } else {
      await bot.sendMessage(chatId, 'Usage: /demote @username or reply to a user\'s message with /demote');
      return;
    }

    if (!targetUser) {
      await bot.sendMessage(chatId, 'Could not identify target user.');
      return;
    }

    try {
      await bot.promoteChatMember(chatId, targetUser.id, {
        can_change_info: false,
        can_delete_messages: false,
        can_invite_users: false,
        can_restrict_members: false,
        can_pin_messages: false,
        can_promote_members: false,
        can_manage_chat: false,
        can_manage_video_chats: false
      });
      await bot.sendMessage(chatId, `⬇️ Demoted ${targetUser.first_name} from admin.`);
    } catch (error: any) {
      await bot.sendMessage(chatId, `Failed to demote: ${error.message}`);
    }
  });
}

// -------------------- Admin Mention Handler --------------------
function adminMentionHandler(bot: TelegramBot) {
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';
    
    if (text.toLowerCase().includes('@admin')) {
      if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
        await bot.sendMessage(chatId, 'This command only works in groups!');
        return;
      }
      
      try {
        const admins = await bot.getChatAdministrators(chatId);
        const mentions: string[] = [];
        for (const admin of admins) {
          const user = admin.user;
          if (!user.is_bot) {
            if (user.username) {
              mentions.push(`@${user.username}`);
            } else {
              mentions.push(`<a href="tg://user?id=${user.id}">${user.first_name}</a>`);
            }
          }
        }
        
        if (mentions.length) {
          await bot.sendMessage(chatId, `🚨 Admins notified:\n${mentions.join(' ')}`, { parse_mode: 'HTML' });
        } else {
          await bot.sendMessage(chatId, 'No non‑bot admins found.');
        }
      } catch (error: any) {
        await bot.sendMessage(chatId, `❌ Error: ${error.message}\nMake sure I am an admin and the group is a supergroup.`);
      }
    }
  });
}

// -------------------- Main Function --------------------
async function main(): Promise<void> {
  try {
    const bot = new TelegramBot(BOT_TOKEN, { polling: true });
    
    console.log('🛡️ MRIXDU Protection Bot is running...');
    
    // Register all command handlers
    startCommand(bot);
    commandsListCommand(bot);
    checkAdminCommand(bot);
    nightModeCommands(bot);
    moderationCommands(bot);
    infoCommand(bot);
    filterCommands(bot);
    securityCommands(bot);
    forceSubscribeCommand(bot);
    promoteDemoteCommands(bot);
    historyCommand(bot);
    statsCommand(bot);
    cleanCommand(bot);
    autoCleanCommands(bot);
    
    // Register handlers
    callbackHandler(bot);
    messageHandler(bot);
    adminMentionHandler(bot);
    
    // Start auto night scheduler
    autoNightScheduler(bot);
    
  } catch (error) {
    console.error('FATAL ERROR:', error);
    process.exit(1);
  }
}

// -------------------- Start --------------------
main();
