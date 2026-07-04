export interface Env {
  DB: D1Database;
  BOT_KV: KVNamespace;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
}

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TgChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
}

export interface TgSticker {
  file_id: string;
  set_name?: string;
}

export interface TgPhotoSize {
  file_id: string;
}

export interface TgMessage {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  caption?: string;
  reply_to_message?: TgMessage;
  new_chat_members?: TgUser[];
  sticker?: TgSticker;
  photo?: TgPhotoSize[];
  video?: unknown;
  document?: unknown;
  audio?: unknown;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export interface TgChatMember {
  status: 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
  user: TgUser;
  can_send_messages?: boolean;
  can_restrict_members?: boolean;
  can_delete_messages?: boolean;
  can_invite_users?: boolean;
  can_pin_messages?: boolean;
  can_change_info?: boolean;
}

// -------------------- Bot data shapes (mirrors the original JSON files) ---
export interface ChatSettings {
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
  permanent_night: boolean;
}

export interface HistoryEntry {
  value: string;
  date: string;
}

export interface UserHistory {
  names: HistoryEntry[];
  usernames: HistoryEntry[];
}

export interface ForceJoinWaiting {
  chat_id: number;
  channel: string;
  message_id: number;
}

export const DEFAULT_NIGHT_ON = '01:00';
export const DEFAULT_NIGHT_OFF = '07:00';
export const SPAM_WINDOW_SECONDS = 5;
export const SPAM_MAX_MSGS = 5;
export const MUTE_DURATION_SECONDS = 300;
export const IST = 'Asia/Kolkata';

export function defaultChatSettings(): ChatSettings {
  return {
    night_mode: false,
    night_on: DEFAULT_NIGHT_ON,
    night_off: DEFAULT_NIGHT_OFF,
    blocked_words: [],
    blocked_stickers: [],
    banned_sticker_packs: [],
    filters: {},
    anti_spam: false,
    force_subscribe: null,
    media_off: false,
    permanent_night: false
  };
}
import type { TgChat, TgChatMember, TgMessage, TgUser } from './types';

export class TelegramError extends Error {}

export class Telegram {
  private base: string;

  constructor(token: string) {
    this.base = `https://api.telegram.org/bot${token}`;
  }

  private async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const json: any = await res.json();
    if (!json.ok) {
      throw new TelegramError(json.description || `Telegram API error calling ${method}`);
    }
    return json.result as T;
  }

  getMe() {
    return this.call<TgUser>('getMe');
  }

  sendMessage(chatId: number | string, text: string, opts: Record<string, unknown> = {}) {
    return this.call<TgMessage>('sendMessage', { chat_id: chatId, text, ...opts });
  }

  sendPhoto(chatId: number | string, photo: string, opts: Record<string, unknown> = {}) {
    return this.call<TgMessage>('sendPhoto', { chat_id: chatId, photo, ...opts });
  }

  editMessageText(
    text: string,
    opts: { chat_id: number | string; message_id: number; parse_mode?: 'Markdown' | 'HTML' }
  ) {
    return this.call<TgMessage | true>('editMessageText', { text, ...opts });
  }

  deleteMessage(chatId: number | string, messageId: number) {
    return this.call<true>('deleteMessage', { chat_id: chatId, message_id: messageId });
  }

  banChatMember(chatId: number | string, userId: number) {
    return this.call<true>('banChatMember', { chat_id: chatId, user_id: userId });
  }

  unbanChatMember(chatId: number | string, userId: number, onlyIfBanned = true) {
    return this.call<true>('unbanChatMember', {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: onlyIfBanned
    });
  }

  restrictChatMember(
    chatId: number | string,
    userId: number,
    permissions: Record<string, boolean>,
    untilDate?: number
  ) {
    return this.call<true>('restrictChatMember', {
      chat_id: chatId,
      user_id: userId,
      permissions,
      ...(untilDate ? { until_date: untilDate } : {})
    });
  }

  promoteChatMember(chatId: number | string, userId: number, rights: Record<string, boolean>) {
    return this.call<true>('promoteChatMember', { chat_id: chatId, user_id: userId, ...rights });
  }

  pinChatMessage(chatId: number | string, messageId: number) {
    return this.call<true>('pinChatMessage', { chat_id: chatId, message_id: messageId });
  }

  getChatMember(chatId: number | string, userId: number) {
    return this.call<TgChatMember>('getChatMember', { chat_id: chatId, user_id: userId });
  }

  getChatAdministrators(chatId: number | string) {
    return this.call<TgChatMember[]>('getChatAdministrators', { chat_id: chatId });
  }

  getChatMemberCount(chatId: number | string) {
    return this.call<number>('getChatMemberCount', { chat_id: chatId });
  }

  getChat(chatId: number | string) {
    return this.call<TgChat>('getChat', { chat_id: chatId });
  }

  answerCallbackQuery(callbackQueryId: string, opts: { text?: string; show_alert?: boolean } = {}) {
    return this.call<true>('answerCallbackQuery', { callback_query_id: callbackQueryId, ...opts });
  }

  setWebhook(url: string, secretToken: string) {
    return this.call<true>('setWebhook', { url, secret_token: secretToken });
  }

  deleteWebhook() {
    return this.call<true>('deleteWebhook');
  }
}

export const FULL_RESTRICT_PERMISSIONS = {
  can_send_messages: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false
};

export const FULL_RESTORE_PERMISSIONS = {
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_send_polls: true,
  can_send_other_messages: true,
  can_add_web_page_previews: true,
  can_change_info: false,
  can_invite_users: true,
  can_pin_messages: false,
  can_manage_topics: false
};
import type { Env, TgUser } from './types';

export async function saveUser(env: Env, user: TgUser): Promise<void> {
  if (!user.username) return;
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  await env.DB.prepare(
    `INSERT INTO users (user_id, username, full_name) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, full_name = excluded.full_name`
  )
    .bind(user.id, user.username.toLowerCase(), fullName)
    .run();
}

export async function getUserByUsername(
  env: Env,
  username: string
): Promise<{ user_id: number; full_name: string } | null> {
  const row = await env.DB.prepare('SELECT user_id, full_name FROM users WHERE username = ?')
    .bind(username.toLowerCase())
    .first<{ user_id: number; full_name: string }>();
  return row ?? null;
}
import type { ChatSettings, Env, ForceJoinWaiting, UserHistory } from './types';
import { defaultChatSettings } from './types';

const CHAT_LIST_KEY = 'meta:chat_list';
const AUTOCLEAN_LIST_KEY = 'meta:autoclean_list';

async function getJson<T>(env: Env, key: string): Promise<T | null> {
  const raw = await env.BOT_KV.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function putJson(env: Env, key: string, value: unknown): Promise<void> {
  return env.BOT_KV.put(key, JSON.stringify(value));
}

// -------------------- Chat settings --------------------
export async function getChatSettings(env: Env, chatId: number | string): Promise<ChatSettings> {
  const key = `settings:${chatId}`;
  const existing = await getJson<ChatSettings>(env, key);
  if (existing) return existing;
  const fresh = defaultChatSettings();
  await putJson(env, key, fresh);
  await addToChatList(env, Number(chatId));
  return fresh;
}

export async function saveChatSettings(env: Env, chatId: number | string, settings: ChatSettings): Promise<void> {
  await putJson(env, `settings:${chatId}`, settings);
}

async function addToChatList(env: Env, chatId: number): Promise<void> {
  const list = (await getJson<number[]>(env, CHAT_LIST_KEY)) || [];
  if (!list.includes(chatId)) {
    list.push(chatId);
    await putJson(env, CHAT_LIST_KEY, list);
  }
}

export async function getAllChatIds(env: Env): Promise<number[]> {
  return (await getJson<number[]>(env, CHAT_LIST_KEY)) || [];
}

// -------------------- User history --------------------
export async function getUserHistory(env: Env, userId: number | string): Promise<UserHistory | null> {
  return getJson<UserHistory>(env, `history:${userId}`);
}

export async function saveUserHistory(env: Env, userId: number | string, history: UserHistory): Promise<void> {
  await putJson(env, `history:${userId}`, history);
}

// A small reverse index so /history @username can find the user id without
// scanning every history record (KV has no query support).
export async function setUsernameToId(env: Env, username: string, userId: number): Promise<void> {
  await env.BOT_KV.put(`unameidx:${username.toLowerCase()}`, String(userId));
}

export async function getIdByUsername(env: Env, username: string): Promise<number | null> {
  const raw = await env.BOT_KV.get(`unameidx:${username.toLowerCase()}`);
  return raw ? Number(raw) : null;
}

// -------------------- Group member tracking --------------------
export async function getMembers(env: Env, chatId: number | string): Promise<number[]> {
  return (await getJson<number[]>(env, `members:${chatId}`)) || [];
}

export async function saveMember(env: Env, chatId: number | string, userId: number): Promise<void> {
  const key = `members:${chatId}`;
  const members = (await getJson<number[]>(env, key)) || [];
  if (!members.includes(userId)) {
    members.push(userId);
    await putJson(env, key, members);
  }
}

// -------------------- Force-subscribe waiting state --------------------
export async function getForceJoinWaiting(env: Env, userId: number): Promise<ForceJoinWaiting | null> {
  return getJson<ForceJoinWaiting>(env, `forcejoin:${userId}`);
}

export async function setForceJoinWaiting(env: Env, userId: number, info: ForceJoinWaiting): Promise<void> {
  await putJson(env, `forcejoin:${userId}`, info);
}

export async function clearForceJoinWaiting(env: Env, userId: number): Promise<void> {
  await env.BOT_KV.delete(`forcejoin:${userId}`);
}

// -------------------- Anti-spam message tracker --------------------
// Stores recent message timestamps (ms) per chat+user, self-pruned on read.
export async function trackSpamMessage(
  env: Env,
  chatId: number,
  userId: number,
  windowSeconds: number
): Promise<number> {
  const key = `spam:${chatId}:${userId}`;
  const now = Date.now();
  const existing = (await getJson<number[]>(env, key)) || [];
  const pruned = existing.filter((t) => now - t < windowSeconds * 1000);
  pruned.push(now);
  // Expire the key shortly after the window closes so we don't accumulate
  // stale spam-tracking keys forever.
  await env.BOT_KV.put(key, JSON.stringify(pruned), { expirationTtl: windowSeconds + 60 });
  return pruned.length;
}

export async function resetSpamTracker(env: Env, chatId: number, userId: number): Promise<void> {
  await env.BOT_KV.delete(`spam:${chatId}:${userId}`);
}

// -------------------- Auto-clean (per-chat, cron-driven) --------------------
interface AutoCleanState {
  enabled: boolean;
  lastRun: number; // epoch ms
}

export async function getAutoCleanState(env: Env, chatId: number | string): Promise<AutoCleanState> {
  return (await getJson<AutoCleanState>(env, `autoclean:${chatId}`)) || { enabled: false, lastRun: 0 };
}

export async function setAutoCleanEnabled(env: Env, chatId: number, enabled: boolean): Promise<void> {
  const state = await getAutoCleanState(env, chatId);
  state.enabled = enabled;
  if (enabled && state.lastRun === 0) state.lastRun = Date.now();
  await putJson(env, `autoclean:${chatId}`, state);
  const list = (await getJson<number[]>(env, AUTOCLEAN_LIST_KEY)) || [];
  if (enabled && !list.includes(chatId)) {
    list.push(chatId);
    await putJson(env, AUTOCLEAN_LIST_KEY, list);
  } else if (!enabled) {
    await putJson(
      env,
      AUTOCLEAN_LIST_KEY,
      list.filter((c) => c !== chatId)
    );
  }
}

export async function markAutoCleanRun(env: Env, chatId: number): Promise<void> {
  const state = await getAutoCleanState(env, chatId);
  state.lastRun = Date.now();
  await putJson(env, `autoclean:${chatId}`, state);
}

export async function getAutoCleanChatIds(env: Env): Promise<number[]> {
  return (await getJson<number[]>(env, AUTOCLEAN_LIST_KEY)) || [];
}

// -------------------- Cached bot id --------------------
export async function getCachedBotId(env: Env): Promise<number | null> {
  const raw = await env.BOT_KV.get('meta:bot_id');
  return raw ? Number(raw) : null;
}

export async function setCachedBotId(env: Env, id: number): Promise<void> {
  await env.BOT_KV.put('meta:bot_id', String(id));
}
import { Telegram, FULL_RESTRICT_PERMISSIONS, FULL_RESTORE_PERMISSIONS } from './telegram';
import type { Env, TgUser } from './types';
import { IST } from './types';
import { getUserHistory, saveUserHistory, setUsernameToId } from './kv';

export function parseTimeWithAmPm(timeStr: string): string | null {
  const trimmed = timeStr.trim().toUpperCase();
  const match = trimmed.match(/(\d{1,2}):(\d{2})(?:\s*([AP]M))?/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const amPm = match[3];

  if (amPm) {
    if (amPm === 'PM' && hour !== 12) hour += 12;
    if (amPm === 'AM' && hour === 12) hour = 0;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function isDeletedAccount(user: TgUser | undefined | null): boolean {
  if (!user) return true;
  if (user.first_name === 'Deleted Account') return true;
  if (!user.first_name && !user.last_name && !user.username) return true;
  return false;
}

// HH:mm in IST, using Intl instead of moment-timezone.
export function getCurrentTimeIST(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

export function getCurrentTimestampIST(): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function getUserDisplayName(user: TgUser): string {
  return user.username ? `@${user.username}` : user.first_name || 'Unknown User';
}

export async function isGroupAdmin(tg: Telegram, chatId: number, userId: number): Promise<boolean> {
  try {
    const member = await tg.getChatMember(chatId, userId);
    return member.status === 'administrator' || member.status === 'creator';
  } catch {
    return false;
  }
}

export async function isUserInChannel(tg: Telegram, userId: number, channelIdentifier: string): Promise<boolean> {
  try {
    const member = await tg.getChatMember(channelIdentifier, userId);
    return member.status === 'member' || member.status === 'administrator' || member.status === 'creator';
  } catch {
    return false;
  }
}

export async function muteUser(tg: Telegram, chatId: number, userId: number, untilDate: Date): Promise<void> {
  await tg.restrictChatMember(chatId, userId, FULL_RESTRICT_PERMISSIONS, Math.floor(untilDate.getTime() / 1000));
}

export async function unmuteUser(tg: Telegram, chatId: number, userId: number): Promise<void> {
  await tg.restrictChatMember(chatId, userId, FULL_RESTORE_PERMISSIONS);
}

export async function trackUserHistory(env: Env, user: TgUser): Promise<void> {
  const userId = String(user.id);
  const now = getCurrentTimestampIST();
  const currentName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
  const currentUsername = user.username || 'No username';

  const existing = (await getUserHistory(env, userId)) || { names: [], usernames: [] };

  if (!existing.names.length || existing.names[existing.names.length - 1].value !== currentName) {
    existing.names.push({ value: currentName, date: now });
  }

  if (!existing.usernames.length || existing.usernames[existing.usernames.length - 1].value !== currentUsername) {
    existing.usernames.push({ value: currentUsername, date: now });
  }

  await saveUserHistory(env, userId, existing);
  if (user.username) await setUsernameToId(env, user.username, user.id);
  }
import { Telegram } from './telegram';
import type { Env } from './types';
import { getMembers, saveMember } from './kv';
import { isDeletedAccount, getCurrentTimestampIST } from './utils';

export interface ScanResult {
  scanned: number;
  deleted: number;
  failed: number;
  deletedUsers: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function doScan(
  tg: Telegram,
  env: Env,
  chatId: number,
  onProgress?: (text: string) => Promise<void>
): Promise<ScanResult> {
  let deletedCount = 0;
  let failedCount = 0;
  let scannedCount = 0;
  const deletedUsers: string[] = [];

  let memberIds = await getMembers(env, chatId);

  try {
    const admins = await tg.getChatAdministrators(chatId);
    for (const admin of admins) {
      if (!memberIds.includes(admin.user.id)) {
        memberIds.push(admin.user.id);
        await saveMember(env, chatId, admin.user.id);
      }
    }
  } catch {
    /* ignore */
  }

  const total = memberIds.length;

  if (onProgress) {
    await onProgress(`👥 <b>Found ${total} tracked members</b>\n🔍 Scanning for deleted accounts...`);
  }

  for (const uid of memberIds) {
    scannedCount++;

    if (onProgress && scannedCount % 50 === 0) {
      await onProgress(
        `🔍 <b>Scanning...</b>\n👤 Scanned: ${scannedCount}/${total}\n🗑 Deleted found: ${deletedCount}`
      );
    }

    try {
      const member = await tg.getChatMember(chatId, uid);
      if (isDeletedAccount(member.user)) {
        try {
          await tg.banChatMember(chatId, uid);
          await sleep(500);
          await tg.unbanChatMember(chatId, uid);
          deletedCount++;
          deletedUsers.push(`• ID: <code>${uid}</code>`);
        } catch {
          failedCount++;
        }
      }
    } catch {
      try {
        await tg.banChatMember(chatId, uid);
        await sleep(300);
        await tg.unbanChatMember(chatId, uid);
        deletedCount++;
        deletedUsers.push(`• ID: <code>${uid}</code>`);
      } catch {
        failedCount++;
      }
    }

    await sleep(50);
  }

  return { scanned: scannedCount, deleted: deletedCount, failed: failedCount, deletedUsers };
}

export async function autoCleanJob(tg: Telegram, env: Env, chatId: number): Promise<void> {
  try {
    const { deleted } = await doScan(tg, env, chatId);
    if (deleted > 0) {
      await tg.sendMessage(
        chatId,
        `🤖 <b>Auto Clean Complete!</b>\n🗑 Removed <b>${deleted}</b> deleted accounts.\n🕐 <b>Time:</b> ${getCurrentTimestampIST()} IST\n⚡ Powered by MRIXDU BOT`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    console.error('Auto clean error:', error);
  }
}
export const START_TEXT =
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
  '• Custom Night Schedule\n' +
  '• Permanent Night Mode (/nightoff perma)\n\n' +
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
  '🔒 Stay Safe • Stay Protected\n' +
  '⚙️ Powered by MRIXDU Protection Bot';

export const COMMANDS_TEXT =
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
  '• `/nightoff perma` - Enable permanent night mode\n' +
  '• `/nighton perma` - Disable permanent night mode\n' +
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
  '• `/checkbotpermissions` - Check bot permissions\n' +
  '• `@admin` - Mention all admins\n' +
  '• `/commands` - Show this list';
import { Telegram } from './telegram';
import type { Env, TgMessage, TgUser } from './types';
import { getUserByUsername } from './db';
import { getIdByUsername } from './kv';

export interface Ctx {
  tg: Telegram;
  env: Env;
  msg: TgMessage;
  chatId: number;
  userId: number;
  waitUntil: (p: Promise<unknown>) => void;
}

export function reply(ctx: Ctx, text: string, opts: Record<string, unknown> = {}) {
  return ctx.tg.sendMessage(ctx.chatId, text, opts);
}

// Resolves a command's target user from either a reply-to-message or an
// "@username" argument, using the D1 lookup table (same behavior as the
// original sqlite-backed getUserByUsername).
export async function resolveTargetUser(
  ctx: Ctx,
  usernameArg: string | undefined
): Promise<{ user: TgUser | null; error: string | null }> {
  if (ctx.msg.reply_to_message?.from) {
    return { user: ctx.msg.reply_to_message.from, error: null };
  }
  if (usernameArg) {
    const userInfo = await getUserByUsername(ctx.env, usernameArg);
    if (!userInfo) {
      return {
        user: null,
        error: `❌ User @${usernameArg} not found in database.\nThey must have spoken in the group after the bot was added.`
      };
    }
    try {
      const member = await ctx.tg.getChatMember(ctx.chatId, userInfo.user_id);
      return { user: member.user, error: null };
    } catch {
      return { user: null, error: `User @${usernameArg} found in DB but not in group.` };
    }
  }
  return { user: null, error: null };
}

// Used by /history, which looks a user up across all chats via the KV
// username index rather than the per-chat D1 table.
export async function resolveHistoryUserId(ctx: Ctx, usernameArg: string | undefined): Promise<number | null> {
  if (ctx.msg.reply_to_message?.from) return ctx.msg.reply_to_message.from.id;
  if (usernameArg) return getIdByUsername(ctx.env, usernameArg.toLowerCase());
  return null;
}
import { Telegram } from './telegram';
import type { Env, TgCallbackQuery } from './types';
import { getForceJoinWaiting, clearForceJoinWaiting } from './kv';
import { isUserInChannel, unmuteUser } from './utils';

export async function handleCallbackQuery(tg: Telegram, env: Env, cq: TgCallbackQuery): Promise<void> {
  const chatId = cq.message?.chat.id;
  const messageId = cq.message?.message_id;
  const userId = cq.from.id;

  if (!chatId || !messageId) {
    await tg.answerCallbackQuery(cq.id, { text: 'Error processing request.' });
    return;
  }

  if (cq.data === 'check_subscribe') {
    await tg.answerCallbackQuery(cq.id);

    const info = await getForceJoinWaiting(env, userId);
    if (!info) {
      await tg.editMessageText('Verification expired. Please rejoin the group or contact an admin.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }

    const isSubscribed = await isUserInChannel(tg, userId, info.channel);
    if (isSubscribed) {
      try {
        await unmuteUser(tg, info.chat_id, userId);
        const userName = cq.from.username || cq.from.first_name;
        await tg.editMessageText(`✅ @${userName} has been verified and unmuted!`, {
          chat_id: chatId,
          message_id: messageId
        });
        await tg.sendMessage(info.chat_id, `✅ @${userName} has been verified and unmuted!`);
        await clearForceJoinWaiting(env, userId);
      } catch (e: any) {
        await tg.editMessageText(
          `❌ Failed to unmute: ${e.message}\n\nMake sure the bot has "Restrict Members" permission.`,
          { chat_id: chatId, message_id: messageId }
        );
      }
    } else {
      await tg.answerCallbackQuery(cq.id, {
        text: "❌ You haven't joined the channel yet. Please join first, then click again.",
        show_alert: true
      });
    }
    return;
  }

  if (cq.data === 'private_channel_info') {
    await tg.answerCallbackQuery(cq.id, {
      text: 'ℹ️ Please contact a group admin to get the invite link for the private channel.',
      show_alert: true
    });
  }
}
import { Telegram, FULL_RESTRICT_PERMISSIONS } from './telegram';
import type { Env, TgMessage } from './types';
import { getChatSettings } from './kv';
import { setForceJoinWaiting, getForceJoinWaiting, trackSpamMessage, resetSpamTracker } from './kv';
import { isUserInChannel, unmuteUser, muteUser } from './utils';
import { SPAM_WINDOW_SECONDS, SPAM_MAX_MSGS, MUTE_DURATION_SECONDS } from './types';

/**
 * Runs the passive moderation pipeline against a non-command group message.
 * Returns true if the message was deleted/handled (caller should stop).
 */
export async function runMessagePipeline(
  tg: Telegram,
  env: Env,
  msg: TgMessage,
  chatId: number,
  isAdmin: boolean
): Promise<boolean> {
  const user = msg.from;
  if (!user) return false;

  const settings = await getChatSettings(env, chatId);

  // Night mode
  if (settings.night_mode && !isAdmin) {
    try {
      await tg.deleteMessage(chatId, msg.message_id);
    } catch {
      /* ignore */
    }
    return true;
  }

  // Force subscribe
  if (!isAdmin && settings.force_subscribe) {
    const channel = settings.force_subscribe;
    const isSubscribed = await isUserInChannel(tg, user.id, channel);
    if (!isSubscribed) {
      try {
        await tg.restrictChatMember(chatId, user.id, FULL_RESTRICT_PERMISSIONS);
      } catch (e) {
        console.error('Failed to mute user:', e);
      }
      try {
        await tg.deleteMessage(chatId, msg.message_id);
      } catch {
        /* ignore */
      }

      const alreadyWaiting = await getForceJoinWaiting(env, user.id);
      if (!alreadyWaiting) {
        const messageText = `@${user.username || user.first_name}, to be accepted in the group, please subscribe to our channel. Once joined, click the button below.`;
        const buttons: unknown[][] = [];
        if (channel.startsWith('-100')) {
          buttons.push([{ text: 'ℹ️ Contact Admin for Invite', callback_data: 'private_channel_info' }]);
        } else {
          const cleanChannel = channel.startsWith('@') ? channel.substring(1) : channel;
          buttons.push([{ text: '📢 Subscribe to Channel', url: `https://t.me/${cleanChannel}` }]);
        }
        buttons.push([{ text: '✅ OK | I Subscribed', callback_data: 'check_subscribe' }]);

        try {
          const sent = await tg.sendMessage(chatId, messageText, { reply_markup: { inline_keyboard: buttons } });
          await setForceJoinWaiting(env, user.id, { chat_id: chatId, channel, message_id: sent.message_id });
        } catch (e) {
          console.error('Failed to send force subscribe message:', e);
          await tg.sendMessage(
            chatId,
            `@${user.username || user.first_name}, you must join ${channel} to talk here. After joining, type /verify to confirm.`
          );
        }
      }
      return true;
    }

    // Auto-unmute once subscribed
    try {
      const member = await tg.getChatMember(chatId, user.id);
      if (member.status === 'restricted' && !member.can_send_messages) {
        await unmuteUser(tg, chatId, user.id);
        await tg.sendMessage(chatId, `@${user.username || user.first_name} has joined ${channel} and has been unmuted automatically.`);
      }
    } catch {
      /* ignore */
    }
  }

  // Media off
  if (settings.media_off && !isAdmin) {
    if (msg.photo || msg.video || msg.document || msg.audio) {
      try {
        await tg.deleteMessage(chatId, msg.message_id);
      } catch {
        /* ignore */
      }
      return true;
    }
  }

  // Blocked stickers / sticker packs
  if (msg.sticker) {
    if (settings.blocked_stickers.includes(msg.sticker.file_id)) {
      try {
        await tg.deleteMessage(chatId, msg.message_id);
      } catch {
        /* ignore */
      }
      return true;
    }
    const packName = msg.sticker.set_name;
    if (packName && settings.banned_sticker_packs.includes(packName)) {
      try {
        await tg.deleteMessage(chatId, msg.message_id);
      } catch {
        /* ignore */
      }
      return true;
    }
  }

  // Blocked words
  const text = msg.text || msg.caption || '';
  const textLower = text.toLowerCase();
  for (const word of settings.blocked_words) {
    if (textLower.includes(word)) {
      try {
        await tg.deleteMessage(chatId, msg.message_id);
      } catch {
        /* ignore */
      }
      return true;
    }
  }

  // Filters
  for (const [word, stored] of Object.entries(settings.filters)) {
    if (textLower.split(' ').includes(word)) {
      try {
        await tg.deleteMessage(chatId, msg.message_id);
      } catch {
        /* ignore */
      }
      if (/^[A-Za-z0-9_-]{20,}$/.test(stored)) {
        try {
          await tg.sendPhoto(chatId, stored);
        } catch {
          /* ignore */
        }
      } else {
        await tg.sendMessage(chatId, stored);
      }
      break;
    }
  }

  // Anti-spam
  if (settings.anti_spam && !isAdmin) {
    const count = await trackSpamMessage(env, chatId, user.id, SPAM_WINDOW_SECONDS);
    if (count > SPAM_MAX_MSGS) {
      const until = new Date(Date.now() + MUTE_DURATION_SECONDS * 1000);
      await muteUser(tg, chatId, user.id, until);
      await tg.sendMessage(chatId, `🚫 ${user.first_name} has been muted for 5 minutes (spam).`, { parse_mode: 'HTML' });
      try {
        await tg.deleteMessage(chatId, msg.message_id);
      } catch {
        /* ignore */
      }
      await resetSpamTracker(env, chatId, user.id);
      return true;
    }
  }

  return false;
      }
import { Telegram } from './telegram';
import type { Env } from './types';
import { DEFAULT_NIGHT_ON, DEFAULT_NIGHT_OFF } from './types';
import { getAllChatIds, getChatSettings, saveChatSettings, getAutoCleanChatIds, getAutoCleanState, markAutoCleanRun } from './kv';
import { getCurrentTimeIST } from './utils';
import { autoCleanJob } from './scan';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function runScheduledTasks(env: Env): Promise<void> {
  const tg = new Telegram(env.BOT_TOKEN);
  await runNightModeTick(tg, env);
  await runAutoCleanTick(tg, env);
}

async function runNightModeTick(tg: Telegram, env: Env): Promise<void> {
  const currentTime = getCurrentTimeIST();
  const chatIds = await getAllChatIds(env);

  for (const chatId of chatIds) {
    const settings = await getChatSettings(env, chatId);

    if (settings.permanent_night) {
      if (!settings.night_mode) {
        settings.night_mode = true;
        await saveChatSettings(env, chatId, settings);
        try {
          await tg.sendMessage(chatId, '🌙 *Permanent Night Mode Active*\nAll non-admin messages will be deleted.', {
            parse_mode: 'Markdown'
          });
        } catch {
          /* ignore */
        }
      }
      continue;
    }

    const on = settings.night_on || DEFAULT_NIGHT_ON;
    const off = settings.night_off || DEFAULT_NIGHT_OFF;

    let should: boolean;
    if (on <= off) {
      should = on <= currentTime && currentTime < off;
    } else {
      should = currentTime >= on || currentTime < off;
    }

    if (should && !settings.night_mode) {
      settings.night_mode = true;
      await saveChatSettings(env, chatId, settings);
      try {
        await tg.sendMessage(chatId, '🌙 *Night Mode Enabled* (auto)\nAll non-admin messages will be deleted.', {
          parse_mode: 'Markdown'
        });
      } catch {
        /* ignore */
      }
    } else if (!should && settings.night_mode) {
      settings.night_mode = false;
      await saveChatSettings(env, chatId, settings);
      try {
        await tg.sendMessage(chatId, '☀️ *Night Mode Disabled* (auto)\nMessage deletion turned off.', {
          parse_mode: 'Markdown'
        });
      } catch {
        /* ignore */
      }
    }
  }
}

async function runAutoCleanTick(tg: Telegram, env: Env): Promise<void> {
  const chatIds = await getAutoCleanChatIds(env);
  for (const chatId of chatIds) {
    const state = await getAutoCleanState(env, chatId);
    if (!state.enabled) continue;
    if (Date.now() - state.lastRun >= TWENTY_FOUR_HOURS_MS) {
      await markAutoCleanRun(env, chatId);
      await autoCleanJob(tg, env, chatId);
    }
  }
    }
import { Telegram } from './telegram';
import type { Env, TgMessage } from './types';
import type { Ctx } from './context';
import { isGroupAdmin } from './utils';
import { START_TEXT, COMMANDS_TEXT } from './text';
import * as mod from './commands/moderation';
import * as set from './commands/settings';
import * as filt from './commands/filters';
import * as clean from './commands/cleanup';
import * as misc from './commands/misc';

interface CommandDef {
  requireGroup?: boolean;
  requireAdmin?: boolean;
  run: (ctx: Ctx, args: string) => Promise<void>;
}

// Pulls a leading "@username" (without the @) out of an args string, if present.
function firstUsernameArg(args: string): string | undefined {
  const m = args.trim().match(/^@(\w+)/);
  return m ? m[1] : undefined;
}

const commands: Record<string, CommandDef> = {
  start: {
    run: async (ctx) => {
      if (ctx.msg.chat.type === 'private') {
        await ctx.tg.sendMessage(ctx.chatId, START_TEXT, { parse_mode: 'Markdown', disable_web_page_preview: true });
      } else {
        await ctx.tg.sendMessage(ctx.chatId, 'Use /start in private chat to see my commands.');
      }
    }
  },
  commands: {
    run: async (ctx) => {
      if (ctx.msg.chat.type === 'private') {
        await ctx.tg.sendMessage(ctx.chatId, COMMANDS_TEXT, { parse_mode: 'Markdown' });
      }
    }
  },
  checkadmin: { run: (ctx) => misc.cmdCheckAdmin(ctx) },
  checkbotpermissions: { requireAdmin: true, run: (ctx) => misc.cmdCheckBotPermissions(ctx) },

  nighton: { requireAdmin: true, run: (ctx, args) => set.cmdNightOn(ctx, args.trim() || undefined) },
  nightoff: { requireAdmin: true, run: (ctx, args) => set.cmdNightOff(ctx, args.trim() || undefined) },
  setnight: {
    requireAdmin: true,
    run: (ctx, args) => {
      const [on, off] = args.trim().split(/\s+/);
      return set.cmdSetNight(ctx, on, off);
    }
  },
  antispamon: { requireAdmin: true, run: (ctx) => set.cmdAntiSpamOn(ctx) },
  antispamoff: { requireAdmin: true, run: (ctx) => set.cmdAntiSpamOff(ctx) },
  mediaoff: { requireAdmin: true, run: (ctx) => set.cmdMediaOff(ctx) },
  mediaon: { requireAdmin: true, run: (ctx) => set.cmdMediaOn(ctx) },
  forcesubscribe: { requireAdmin: true, run: (ctx, args) => set.cmdForceSubscribe(ctx, args.trim() || undefined) },
  forcesubscribeoff: { requireAdmin: true, run: (ctx) => set.cmdForceSubscribeOff(ctx) },
  verify: { run: (ctx) => set.cmdVerify(ctx) },

  ban: { requireAdmin: true, run: (ctx, args) => mod.cmdBan(ctx, firstUsernameArg(args)) },
  unban: { requireAdmin: true, run: (ctx, args) => mod.cmdUnban(ctx, firstUsernameArg(args)) },
  kick: { requireAdmin: true, run: (ctx, args) => mod.cmdKick(ctx, firstUsernameArg(args)) },
  mute: { requireAdmin: true, run: (ctx, args) => mod.cmdMute(ctx, firstUsernameArg(args)) },
  unmute: { requireAdmin: true, run: (ctx, args) => mod.cmdUnmute(ctx, firstUsernameArg(args)) },
  info: { requireAdmin: true, run: (ctx, args) => mod.cmdInfo(ctx, firstUsernameArg(args)) },
  promote: { requireAdmin: true, run: (ctx, args) => mod.cmdPromote(ctx, firstUsernameArg(args)) },
  demote: { requireAdmin: true, run: (ctx, args) => mod.cmdDemote(ctx, firstUsernameArg(args)) },

  block: { requireAdmin: true, run: (ctx, args) => filt.cmdBlock(ctx, args.trim() || undefined) },
  unblock: { requireAdmin: true, run: (ctx, args) => filt.cmdUnblock(ctx, args.trim() || undefined) },
  blocksticker: { requireAdmin: true, run: (ctx) => filt.cmdBlockSticker(ctx) },
  unblocksticker: { requireAdmin: true, run: (ctx) => filt.cmdUnblockSticker(ctx) },
  banstickerpack: { requireAdmin: true, run: (ctx) => filt.cmdBanStickerPack(ctx) },
  unbanstickerpack: { requireAdmin: true, run: (ctx) => filt.cmdUnbanStickerPack(ctx) },
  pin: { requireAdmin: true, run: (ctx) => filt.cmdPin(ctx) },
  filter: {
    requireAdmin: true,
    run: (ctx, args) => {
      const trimmed = args.trim();
      const spaceIdx = trimmed.indexOf(' ');
      const word = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const rest = spaceIdx === -1 ? undefined : trimmed.slice(spaceIdx + 1);
      return filt.cmdFilter(ctx, word || undefined, rest);
    }
  },
  delfilter: { requireAdmin: true, run: (ctx, args) => filt.cmdDelFilter(ctx, args.trim().split(/\s+/)[0]) },

  history: { requireGroup: true, run: (ctx, args) => clean.cmdHistory(ctx, firstUsernameArg(args)) },
  stats: { requireGroup: true, run: (ctx) => clean.cmdStats(ctx) },
  clean: { requireGroup: true, requireAdmin: true, run: (ctx) => clean.cmdClean(ctx) },
  autoclean: { requireGroup: true, requireAdmin: true, run: (ctx) => clean.cmdAutoClean(ctx) },
  disableautoclean: { requireGroup: true, requireAdmin: true, run: (ctx) => clean.cmdDisableAutoClean(ctx) }
};

function parseCommand(text: string): { cmd: string; args: string } | null {
  // Matches "/cmd", "/cmd@BotName args", "/cmd args" — the optional
  // "@BotName" suffix is stripped without verifying it, since these groups
  // only ever host this one bot.
  const m = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), args: m[2] || '' };
}

export async function tryDispatchCommand(tg: Telegram, env: Env, msg: TgMessage, waitUntil: (p: Promise<unknown>) => void): Promise<boolean> {
  const text = msg.text || '';
  const parsed = parseCommand(text);
  if (!parsed) return false;
  const def = commands[parsed.cmd];
  if (!def) return false;

  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  if (!userId) return true;

  const ctx: Ctx = { tg, env, msg, chatId, userId, waitUntil };

  if (def.requireGroup && msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
    await tg.sendMessage(chatId, '❌ This command only works in groups!');
    return true;
  }

  if (def.requireAdmin) {
    const admin = await isGroupAdmin(tg, chatId, userId);
    if (!admin) {
      await tg.sendMessage(chatId, '⚠️ Only group admins can use this command.');
      return true;
    }
  }

  await def.run(ctx, parsed.args);
  return true;
    }
import { Telegram } from './telegram';
import type { Env, TgUpdate } from './types';
import { saveUser } from './db';
import { trackUserHistory, isGroupAdmin } from './utils';
import { saveMember } from './kv';
import { tryDispatchCommand } from './dispatch';
import { runMessagePipeline } from './pipeline';
import { handleCallbackQuery } from './callback';
import { handleAdminMention } from './commands/misc';
import { runScheduledTasks } from './scheduler';

async function handleUpdate(update: TgUpdate, env: Env, waitUntil: (p: Promise<unknown>) => void): Promise<void> {
  const tg = new Telegram(env.BOT_TOKEN);

  if (update.callback_query) {
    await handleCallbackQuery(tg, env, update.callback_query);
    return;
  }

  const msg = update.message;
  if (!msg || !msg.from) return;

  const user = msg.from;
  const chatId = msg.chat.id;
  const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  // Always track the user, mirroring the original messageHandler.
  await saveUser(env, user);
  await trackUserHistory(env, user);
  if (isGroup) {
    await saveMember(env, chatId, user.id);
    if (msg.new_chat_members) {
      for (const nu of msg.new_chat_members) await saveMember(env, chatId, nu.id);
    }
  }

  // Try command dispatch first (covers /start, /commands in private chat too).
  const handled = await tryDispatchCommand(tg, env, msg, waitUntil);
  if (handled) return;

  if (!isGroup) return;

  // "@admin" mention (only for plain messages, not already-handled commands).
  // Anyone can trigger this — no admin gate, matching the original bot.
  const text = msg.text || '';
  if (text.toLowerCase().includes('@admin')) {
    await handleAdminMention({ tg, env, msg, chatId, userId: user.id, waitUntil });
    return;
  }

  // Passive moderation pipeline (night mode, force-subscribe, filters, anti-spam).
  const isAdmin = await isGroupAdmin(tg, chatId, user.id);
  await runMessagePipeline(tg, env, msg, chatId, isAdmin);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('Mrixdu Security++ Bot is running!', { status: 200 });
    }

    // One-time setup helper: hit this URL from a browser once after deploying
    // to register the webhook with Telegram. Protected by WEBHOOK_SECRET.
    if (url.pathname === '/setup' && request.method === 'GET') {
      const secret = url.searchParams.get('secret');
      if (secret !== env.WEBHOOK_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
      const tg = new Telegram(env.BOT_TOKEN);
      const webhookUrl = `${url.origin}/webhook`;
      await tg.setWebhook(webhookUrl, env.WEBHOOK_SECRET);
      return new Response(`Webhook set to ${webhookUrl}`, { status: 200 });
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (secretHeader !== env.WEBHOOK_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
      let update: TgUpdate;
      try {
        update = await request.json();
      } catch {
        return new Response('Bad Request', { status: 400 });
      }
      try {
        await handleUpdate(update, env, (p) => ctx.waitUntil(p));
      } catch (e) {
        console.error('Error handling update:', e);
      }
      return new Response('OK', { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledTasks(env));
  }
};
import type { Ctx } from '../context';
import { reply, resolveTargetUser } from '../context';
import { unmuteUser } from '../utils';

export async function cmdBan(ctx: Ctx, usernameArg?: string) {
  const { user, error } = await resolveTargetUser(ctx, usernameArg);
  if (error) return void (await reply(ctx, error));
  if (!user) return void (await reply(ctx, "Usage: /ban @username or reply to a user's message with /ban"));
  try {
    await ctx.tg.banChatMember(ctx.chatId, user.id);
    await reply(ctx, `✅ Banned ${user.first_name} (ID: ${user.id})`);
  } catch (e: any) {
    await reply(ctx, `Failed to ban: ${e.message}`);
  }
}

export async function cmdUnban(ctx: Ctx, usernameArg?: string) {
  let targetId: number | null = null;
  if (ctx.msg.reply_to_message?.from) {
    targetId = ctx.msg.reply_to_message.from.id;
  } else if (usernameArg) {
    const { user, error } = await resolveTargetUser(ctx, usernameArg);
    if (error) return void (await reply(ctx, error));
    targetId = user?.id ?? null;
  }
  if (!targetId) {
    return void (await reply(ctx, "Usage: /unban @username or reply to a banned user's message"));
  }
  try {
    await ctx.tg.unbanChatMember(ctx.chatId, targetId);
    await reply(ctx, `✅ Unbanned user ID ${targetId}`);
  } catch (e: any) {
    await reply(ctx, `Failed to unban: ${e.message}`);
  }
}

export async function cmdKick(ctx: Ctx, usernameArg?: string) {
  const { user, error } = await resolveTargetUser(ctx, usernameArg);
  if (error) return void (await reply(ctx, error));
  if (!user) return void (await reply(ctx, "Usage: /kick @username or reply to a user's message with /kick"));
  try {
    await ctx.tg.banChatMember(ctx.chatId, user.id);
    await ctx.tg.unbanChatMember(ctx.chatId, user.id);
    await reply(ctx, `✅ Kicked ${user.first_name}`);
  } catch (e: any) {
    await reply(ctx, `Failed to kick: ${e.message}`);
  }
}

export async function cmdMute(ctx: Ctx, usernameArg?: string) {
  const { user, error } = await resolveTargetUser(ctx, usernameArg);
  if (error) return void (await reply(ctx, error));
  if (!user) return void (await reply(ctx, "Usage: /mute @username or reply to a user's message with /mute"));
  try {
    await ctx.tg.restrictChatMember(ctx.chatId, user.id, { can_send_messages: false });
    await reply(ctx, `🔇 Muted ${user.first_name} (ID: ${user.id})`);
  } catch (e: any) {
    await reply(ctx, `Failed to mute: ${e.message}`);
  }
}

export async function cmdUnmute(ctx: Ctx, usernameArg?: string) {
  const { user, error } = await resolveTargetUser(ctx, usernameArg);
  if (error) return void (await reply(ctx, error));
  if (!user) return void (await reply(ctx, "Usage: /unmute @username or reply to a user's message with /unmute"));
  try {
    await unmuteUser(ctx.tg, ctx.chatId, user.id);
    await reply(ctx, `🔊 Unmuted ${user.first_name} (ID: ${user.id})`);
  } catch (e: any) {
    await reply(ctx, `Failed to unmute: ${e.message}`);
  }
}

export async function cmdInfo(ctx: Ctx, usernameArg?: string) {
  const { user, error } = await resolveTargetUser(ctx, usernameArg);
  if (error) return void (await reply(ctx, error));
  if (!user) return void (await reply(ctx, "Usage: /info @username or reply to a user's message with /info"));

  let statusStr = 'Member';
  try {
    const admins = await ctx.tg.getChatAdministrators(ctx.chatId);
    const adminEntry = admins.find((a) => a.user.id === user.id);
    if (adminEntry) {
      statusStr = adminEntry.status === 'creator' ? 'Creator' : 'Administrator';
    } else {
      try {
        const member = await ctx.tg.getChatMember(ctx.chatId, user.id);
        if (member.status === 'restricted') statusStr = 'Restricted';
        else if (member.status === 'left') statusStr = 'Left';
        else if (member.status === 'kicked') statusStr = 'Banned';
        else statusStr = 'Member';
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  const text =
    `👤 **User Info**\n` +
    `🆔 ID: \`${user.id}\`\n` +
    `📛 Name: ${user.first_name}${user.last_name ? ` ${user.last_name}` : ''}\n` +
    `👤 Username: @${user.username || 'NoUsername'}\n` +
    `🔗 [User link](tg://user?id=${user.id})\n` +
    `📌 Status in group: ${statusStr}`;

  await reply(ctx, text, { parse_mode: 'Markdown', disable_web_page_preview: true });
}

export async function cmdPromote(ctx: Ctx, usernameArg?: string) {
  const { user, error } = await resolveTargetUser(ctx, usernameArg);
  if (error) return void (await reply(ctx, error));
  if (!user) return void (await reply(ctx, "Usage: /promote @username or reply to a user's message with /promote"));
  try {
    await ctx.tg.promoteChatMember(ctx.chatId, user.id, {
      can_change_info: true,
      can_delete_messages: true,
      can_invite_users: true,
      can_restrict_members: true,
      can_pin_messages: true,
      can_promote_members: false,
      can_manage_chat: true,
      can_manage_video_chats: true
    });
    await reply(ctx, `⭐ Promoted ${user.first_name} to admin.`);
  } catch (e: any) {
    await reply(ctx, `Failed to promote: ${e.message}`);
  }
}

export async function cmdDemote(ctx: Ctx, usernameArg?: string) {
  const { user, error } = await resolveTargetUser(ctx, usernameArg);
  if (error) return void (await reply(ctx, error));
  if (!user) return void (await reply(ctx, "Usage: /demote @username or reply to a user's message with /demote"));
  try {
    await ctx.tg.promoteChatMember(ctx.chatId, user.id, {
      can_change_info: false,
      can_delete_messages: false,
      can_invite_users: false,
      can_restrict_members: false,
      can_pin_messages: false,
      can_promote_members: false,
      can_manage_chat: false,
      can_manage_video_chats: false
    });
    await reply(ctx, `⬇️ Demoted ${user.first_name} from admin.`);
  } catch (e: any) {
    await reply(ctx, `Failed to demote: ${e.message}`);
  }
    }
import type { Ctx } from '../context';
import { reply } from '../context';
import { getChatSettings, saveChatSettings } from '../kv';
import { parseTimeWithAmPm, isUserInChannel, unmuteUser } from '../utils';

export async function cmdNightOn(ctx: Ctx, permaArg?: string) {
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  if (permaArg?.toLowerCase() === 'perma') {
    settings.permanent_night = false;
    settings.night_mode = true;
    await saveChatSettings(ctx.env, ctx.chatId, settings);
    return void (await reply(ctx, '🌙 Permanent night mode disabled. Night mode enabled normally.'));
  }
  settings.night_mode = true;
  await saveChatSettings(ctx.env, ctx.chatId, settings);
  await reply(ctx, '🌙 Night mode enabled. Non-admin messages will be deleted.');
}

export async function cmdNightOff(ctx: Ctx, permaArg?: string) {
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  if (permaArg?.toLowerCase() === 'perma') {
    settings.permanent_night = true;
    settings.night_mode = true;
    await saveChatSettings(ctx.env, ctx.chatId, settings);
    return void (await reply(ctx, '🌙 Permanent night mode enabled! Night mode will never turn off automatically.'));
  }
  settings.night_mode = false;
  settings.permanent_night = false;
  await saveChatSettings(ctx.env, ctx.chatId, settings);
  await reply(ctx, '☀️ Night mode disabled.');
}

export async function cmdSetNight(ctx: Ctx, onRaw?: string, offRaw?: string) {
  if (!onRaw || !offRaw) return void (await reply(ctx, 'Usage: /setnight 01:00 07:00'));
  const onTime = parseTimeWithAmPm(onRaw);
  const offTime = parseTimeWithAmPm(offRaw);
  if (!onTime || !offTime) return void (await reply(ctx, 'Invalid time format. Use HH:MM or HH:MM AM/PM'));
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  settings.night_on = onTime;
  settings.night_off = offTime;
  await saveChatSettings(ctx.env, ctx.chatId, settings);
  await reply(ctx, `✅ Auto night set: ON ${onTime} IST, OFF ${offTime} IST.`);
}

export async function cmdAntiSpamOn(ctx: Ctx) {
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  settings.anti_spam = true;
  await saveChatSettings(ctx.env, ctx.chatId, settings);
  await reply(ctx, '🛡️ Anti-spam protection enabled.');
}

export async function cmdAntiSpamOff(ctx: Ctx) {
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  settings.anti_spam = false;
  await saveChatSettings(ctx.env, ctx.chatId, settings);
  await reply(ctx, '🛡️ Anti-spam protection disabled.');
}

export async function cmdMediaOff(ctx: Ctx) {
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  settings.media_off = true;
  await saveChatSettings(ctx.env, ctx.chatId, settings);
  await reply(ctx, '🚫 Media messages are now blocked for non-admins.');
}

export async function cmdMediaOn(ctx: Ctx) {
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  settings.media_off = false;
  await saveChatSettings(ctx.env, ctx.chatId, settings);
  await reply(ctx, '✅ Media messages are now allowed.');
}

export async function cmdForceSubscribe(ctx: Ctx, channelArg?: string) {
  if (!channelArg) {
    return void (await reply(
      ctx,
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
    ));
  }

  const channelInput = channelArg.trim();
  const isChannelId = channelInput.startsWith('-100') || /^-?\d+$/.test(channelInput);

  try {
    let channelIdentifier = channelInput;
    if (isChannelId) {
      if (!channelInput.startsWith('-100') && /^\d+$/.test(channelInput)) {
        channelIdentifier = `-100${channelInput}`;
      }
    } else {
      channelIdentifier = channelInput.startsWith('@') ? channelInput : `@${channelInput}`;
    }

    const chatInfo = await ctx.tg.getChat(channelIdentifier);
    if (!chatInfo || chatInfo.type !== 'channel') {
      return void (await reply(ctx, '❌ Invalid channel. Please provide a valid channel username or ID.'));
    }

    const settings = await getChatSettings(ctx.env, ctx.chatId);
    settings.force_subscribe = channelIdentifier;
    await saveChatSettings(ctx.env, ctx.chatId, settings);

    const channelType = isChannelId ? '🔒 Private' : '📢 Public';
    await reply(
      ctx,
      `✅ **Force Subscribe Enabled!**\n\n` +
        `📌 **Channel:** ${chatInfo.title}\n` +
        `🔗 **Identifier:** \`${channelIdentifier}\`\n` +
        `📂 **Type:** ${channelType}\n` +
        `🔒 **Requirement:** Members must join this channel to chat.\n\n` +
        `⚠️ **Important:** Bot must remain an admin in the channel.`,
      { parse_mode: 'Markdown' }
    );
  } catch (e: any) {
    await reply(
      ctx,
      `❌ **Error:** ${e.message}\n\n` +
        `**Troubleshooting:**\n` +
        `• For private channels: Bot must be an admin in the channel\n` +
        `• Verify the channel ID is correct (format: -1001234567890)\n` +
        `• For public channels: Use @username format\n\n` +
        `**Get channel ID:** Forward a message to @userinfobot`,
      { parse_mode: 'Markdown' }
    );
  }
}

export async function cmdForceSubscribeOff(ctx: Ctx) {
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  settings.force_subscribe = null;
  await saveChatSettings(ctx.env, ctx.chatId, settings);
  await reply(ctx, '✅ Force subscribe disabled.');
}

export async function cmdVerify(ctx: Ctx) {
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  const channel = settings.force_subscribe;
  if (!channel) return void (await reply(ctx, 'ℹ️ Force subscribe is not enabled in this group.'));

  const isSubscribed = await isUserInChannel(ctx.tg, ctx.userId, channel);
  if (isSubscribed) {
    try {
      await unmuteUser(ctx.tg, ctx.chatId, ctx.userId);
      await reply(ctx, `✅ @${ctx.msg.from?.username || ctx.userId} has been verified and unmuted!`);
    } catch (e: any) {
      await reply(ctx, `❌ Failed to unmute: ${e.message}\n\nMake sure the bot has "Restrict Members" permission.`);
    }
  } else {
    await reply(ctx, `❌ You haven't joined ${channel} yet.\nPlease join first, then use /verify again.`);
  }
}
import type { Ctx } from '../context';
import { reply } from '../context';
import { getChatSettings, saveChatSettings } from '../kv';

export async function cmdBlock(ctx: Ctx, wordsArg?: string) {
  if (!wordsArg) return void (await reply(ctx, 'Usage: /block word1 word2 ...'));
  const words = wordsArg.split(/\s+/);
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  const newWords = words.filter((w) => !settings.blocked_words.includes(w.toLowerCase()));
  settings.blocked_words.push(...newWords.map((w) => w.toLowerCase()));
  await saveChatSettings(ctx.env, ctx.chatId, settings);
  await reply(ctx, `🚫 Blocked words: ${newWords.join(', ')}`);
}

export async function cmdUnblock(ctx: Ctx, wordsArg?: string) {
  if (!wordsArg) return void (await reply(ctx, 'Usage: /unblock word1 word2 ...'));
  const words = wordsArg.split(/\s+/);
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  const removed: string[] = [];
  for (const w of words) {
    const wl = w.toLowerCase();
    const idx = settings.blocked_words.indexOf(wl);
    if (idx !== -1) {
      settings.blocked_words.splice(idx, 1);
      removed.push(w);
    }
  }
  await saveChatSettings(ctx.env, ctx.chatId, settings);
  await reply(ctx, `✅ Unblocked: ${removed.length ? removed.join(', ') : 'None'}`);
}

export async function cmdBlockSticker(ctx: Ctx) {
  const sticker = ctx.msg.reply_to_message?.sticker;
  if (!sticker) return void (await reply(ctx, 'Reply to a sticker to block it.'));
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  if (!settings.blocked_stickers.includes(sticker.file_id)) {
    settings.blocked_stickers.push(sticker.file_id);
    await saveChatSettings(ctx.env, ctx.chatId, settings);
    await reply(ctx, '🚫 Sticker blocked.');
  } else {
    await reply(ctx, 'Sticker already blocked.');
  }
}

export async function cmdUnblockSticker(ctx: Ctx) {
  const sticker = ctx.msg.reply_to_message?.sticker;
  if (!sticker) return void (await reply(ctx, 'Reply to a sticker to unblock it.'));
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  const idx = settings.blocked_stickers.indexOf(sticker.file_id);
  if (idx !== -1) {
    settings.blocked_stickers.splice(idx, 1);
    await saveChatSettings(ctx.env, ctx.chatId, settings);
    await reply(ctx, '✅ Sticker unblocked.');
  } else {
    await reply(ctx, 'Sticker not blocked.');
  }
}

export async function cmdBanStickerPack(ctx: Ctx) {
  const sticker = ctx.msg.reply_to_message?.sticker;
  if (!sticker) return void (await reply(ctx, 'Reply to a sticker to ban its entire pack.'));
  const packName = sticker.set_name;
  if (!packName) return void (await reply(ctx, 'This sticker does not belong to a pack.'));
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  if (!settings.banned_sticker_packs.includes(packName)) {
    settings.banned_sticker_packs.push(packName);
    await saveChatSettings(ctx.env, ctx.chatId, settings);
    await reply(ctx, `🚫 Sticker pack \`${packName}\` banned.`, { parse_mode: 'Markdown' });
  } else {
    await reply(ctx, 'This sticker pack is already banned.');
  }
}

export async function cmdUnbanStickerPack(ctx: Ctx) {
  const sticker = ctx.msg.reply_to_message?.sticker;
  if (!sticker) return void (await reply(ctx, 'Reply to a sticker from the banned pack to unban it.'));
  const packName = sticker.set_name;
  if (!packName) return void (await reply(ctx, 'This sticker does not belong to a pack.'));
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  const idx = settings.banned_sticker_packs.indexOf(packName);
  if (idx !== -1) {
    settings.banned_sticker_packs.splice(idx, 1);
    await saveChatSettings(ctx.env, ctx.chatId, settings);
    await reply(ctx, `✅ Sticker pack \`${packName}\` unbanned.`, { parse_mode: 'Markdown' });
  } else {
    await reply(ctx, 'This sticker pack was not banned.');
  }
}

export async function cmdPin(ctx: Ctx) {
  if (!ctx.msg.reply_to_message) return void (await reply(ctx, 'Reply to a message to pin it.'));
  try {
    await ctx.tg.pinChatMessage(ctx.chatId, ctx.msg.reply_to_message.message_id);
    await reply(ctx, '📌 Message pinned.');
  } catch (e: any) {
    await reply(ctx, `Failed to pin: ${e.message}`);
  }
}

export async function cmdFilter(ctx: Ctx, wordArg?: string, replyArg?: string) {
  if (!wordArg) return void (await reply(ctx, "Usage: /filter word reply_text\nExample: /filter done Hero"));
  const word = wordArg.toLowerCase();
  const settings = await getChatSettings(ctx.env, ctx.chatId);

  const photo = ctx.msg.reply_to_message?.photo;
  const photoFileId = photo?.length ? photo[photo.length - 1].file_id : null;

  if (photoFileId) {
    settings.filters[word] = photoFileId;
    await saveChatSettings(ctx.env, ctx.chatId, settings);
    await reply(ctx, `🔍 Filter added: when someone says '${word}', I'll send that photo.`);
  } else if (replyArg) {
    settings.filters[word] = replyArg;
    await saveChatSettings(ctx.env, ctx.chatId, settings);
    await reply(ctx, `🔍 Filter added: when someone says '${word}', I'll reply: '${replyArg}'`);
  } else {
    await reply(ctx, "Usage: /filter word reply_text\nExample: /filter done Hero");
  }
}

export async function cmdDelFilter(ctx: Ctx, wordArg?: string) {
  if (!wordArg) return void (await reply(ctx, 'Usage: /delfilter word'));
  const word = wordArg.toLowerCase();
  const settings = await getChatSettings(ctx.env, ctx.chatId);
  if (settings.filters[word]) {
    delete settings.filters[word];
    await saveChatSettings(ctx.env, ctx.chatId, settings);
    await reply(ctx, `✅ Filter removed for: ${word}`);
  } else {
    await reply(ctx, 'Filter not found.');
  }
  }
import type { Ctx } from '../context';
import { reply, resolveHistoryUserId } from '../context';
import { getUserHistory, getMembers, getAutoCleanState, setAutoCleanEnabled } from '../kv';
import { getCurrentTimestampIST } from '../utils';
import { doScan } from '../scan';

export async function cmdHistory(ctx: Ctx, usernameArg?: string) {
  const userId = await resolveHistoryUserId(ctx, usernameArg);
  if (!userId) {
    if (usernameArg) return void (await reply(ctx, '❌ User not found in history! They must have sent a message first.'));
    return void (await reply(ctx, '❌ Usage: /history @username or reply to a user.'));
  }

  const history = await getUserHistory(ctx.env, userId);
  if (!history) return void (await reply(ctx, '❌ No history found! User must send a message first.'));

  const targetFromReply = ctx.msg.reply_to_message?.from;
  const names = history.names || [];
  const usernames = history.usernames || [];

  let currentUsername = 'N/A';
  if (targetFromReply?.username) {
    currentUsername = `@${targetFromReply.username}`;
  } else if (usernames.length) {
    currentUsername = `@${usernames[usernames.length - 1].value}`;
  }

  let text = `📋 <b>History for</b> ${currentUsername}\n`;
  text += `🆔 <code>${userId}</code>\n`;
  text += '━━━━━━━━━━━━━━━━━━━━\n';

  text += `\n👤 <b>Name History (${names.length} records):</b>\n`;
  if (names.length) {
    const recent = names.slice(-10).reverse();
    recent.forEach((n, i) => {
      text += `  ${i + 1}. <b>${n.value}</b>\n      🕐 ${n.date}\n`;
    });
  } else {
    text += '  No name history found.\n';
  }

  text += `\n🔖 <b>Username History (${usernames.length} records):</b>\n`;
  if (usernames.length) {
    const recent = usernames.slice(-10).reverse();
    recent.forEach((u, i) => {
      text += `  ${i + 1}. <b>@${u.value}</b>\n      🕐 ${u.date}\n`;
    });
  } else {
    text += '  No username history found.\n';
  }

  text += '\n━━━━━━━━━━━━━━━━━━━━\n⚡ Powered by MRIXDU BOT';
  await reply(ctx, text, { parse_mode: 'HTML' });
}

export async function cmdStats(ctx: Ctx) {
  try {
    const total = await ctx.tg.getChatMemberCount(ctx.chatId);
    const tracked = (await getMembers(ctx.env, ctx.chatId)).length;
    const text =
      `📊 <b>Group Statistics</b>\n\n` +
      `👥 <b>Group:</b> ${ctx.msg.chat.title}\n` +
      `🆔 <b>Chat ID:</b> <code>${ctx.chatId}</code>\n` +
      `👤 <b>Total Members:</b> ${total}\n` +
      `🔍 <b>Tracked Members:</b> ${tracked}\n` +
      `🕐 <b>Checked at:</b> ${getCurrentTimestampIST()} IST\n\n` +
      `Run /clean to remove deleted accounts!`;
    await reply(ctx, text, { parse_mode: 'HTML' });
  } catch (e: any) {
    await reply(ctx, `❌ Error: ${e.message}`);
  }
}

export async function cmdClean(ctx: Ctx) {
  const sent = await reply(ctx, '🔍 <b>Fetching tracked members...</b>\n⏳ Please wait!', { parse_mode: 'HTML' });

  const run = async () => {
    try {
      const { scanned, deleted, failed, deletedUsers } = await doScan(ctx.tg, ctx.env, ctx.chatId, async (text) => {
        try {
          await ctx.tg.editMessageText(text, { chat_id: ctx.chatId, message_id: sent.message_id, parse_mode: 'HTML' });
        } catch {
          /* ignore transient edit failures */
        }
      });

      let result =
        `✅ <b>Scan Complete!</b>\n\n` +
        `👥 <b>Total Scanned:</b> ${scanned}\n` +
        `🗑 <b>Deleted Removed:</b> ${deleted}\n` +
        `⚠️ <b>Failed:</b> ${failed}\n` +
        `🕐 <b>Time:</b> ${getCurrentTimestampIST()} IST\n`;

      if (deletedUsers.length) {
        result += '\n<b>Removed IDs:</b>\n' + deletedUsers.slice(0, 20).join('\n');
        if (deletedUsers.length > 20) result += `\n... and ${deletedUsers.length - 20} more`;
      }
      if (deleted === 0) result += '\n\n🎉 <b>Group is clean! No deleted accounts found.</b>';
      result += '\n\n⚡ <b>Powered by MRIXDU BOT</b>';

      await ctx.tg.editMessageText(result, { chat_id: ctx.chatId, message_id: sent.message_id, parse_mode: 'HTML' });
    } catch (e: any) {
      await ctx.tg.editMessageText(
        `❌ <b>Error:</b> ${e.message}\n\nMake sure:\n1. Bot is admin with Ban Users permission\n2. This is a supergroup`,
        { chat_id: ctx.chatId, message_id: sent.message_id, parse_mode: 'HTML' }
      );
    }
  };

  // Scans can take a while for large groups; run in the background instead
  // of blocking the webhook response.
  ctx.waitUntil(run());
}

export async function cmdAutoClean(ctx: Ctx) {
  await setAutoCleanEnabled(ctx.env, ctx.chatId, true);
  await reply(
    ctx,
    `✅ <b>Auto Clean Enabled!</b>\n🕐 Scans every <b>24 hours</b> automatically (checked via a scheduled task)!\n🇮🇳 Time zone: <b>IST (India)</b>\n\n⚡ Powered by MRIXDU BOT`,
    { parse_mode: 'HTML' }
  );
}

export async function cmdDisableAutoClean(ctx: Ctx) {
  const state = await getAutoCleanState(ctx.env, ctx.chatId);
  if (!state.enabled) return void (await reply(ctx, '⚠️ Auto clean was not enabled!'));
  await setAutoCleanEnabled(ctx.env, ctx.chatId, false);
  await reply(ctx, '🛑 <b>Auto Clean Disabled!</b>\n\n⚡ Powered by MRIXDU BOT', { parse_mode: 'HTML' });
}
import type { Ctx } from '../context';
import { reply } from '../context';

export async function cmdCheckAdmin(ctx: Ctx) {
  try {
    const me = await ctx.tg.getMe();
    const botMember = await ctx.tg.getChatMember(ctx.chatId, me.id);
    const isAdmin = botMember.status === 'administrator' || botMember.status === 'creator';
    await reply(ctx, `Bot is admin: ${isAdmin}\nStatus: ${botMember.status}`);
  } catch (e: any) {
    await reply(ctx, `Cannot check admin status: ${e.message}`);
  }
}

export async function cmdCheckBotPermissions(ctx: Ctx) {
  try {
    const me = await ctx.tg.getMe();
    const botMember = await ctx.tg.getChatMember(ctx.chatId, me.id);

    let text = `🤖 **Bot Permissions in this group:**\n\nStatus: ${botMember.status}\n`;
    if (botMember.status === 'administrator' || botMember.status === 'creator') {
      text += `\n**Admin Rights:**\n`;
      text += `• Can restrict members: ${botMember.can_restrict_members ? '✅' : '❌'}\n`;
      text += `• Can delete messages: ${botMember.can_delete_messages ? '✅' : '❌'}\n`;
      text += `• Can invite users: ${botMember.can_invite_users ? '✅' : '❌'}\n`;
      text += `• Can pin messages: ${botMember.can_pin_messages ? '✅' : '❌'}\n`;
      text += `• Can change info: ${botMember.can_change_info ? '✅' : '❌'}\n`;
    } else {
      text += `\n⚠️ **Bot is NOT an admin!**\nPlease promote the bot to admin with "Restrict Members" permission.`;
    }
    await reply(ctx, text, { parse_mode: 'Markdown' });
  } catch (e: any) {
    await reply(ctx, `❌ Error: ${e.message}`);
  }
}

export async function handleAdminMention(ctx: Ctx) {
  try {
    const admins = await ctx.tg.getChatAdministrators(ctx.chatId);
    const mentions: string[] = [];
    for (const admin of admins) {
      const user = admin.user;
      if (!user.is_bot) {
        mentions.push(user.username ? `@${user.username}` : `<a href="tg://user?id=${user.id}">${user.first_name}</a>`);
      }
    }
    if (mentions.length) {
      await reply(ctx, `🚨 Admins notified:\n${mentions.join(' ')}`, { parse_mode: 'HTML' });
    } else {
      await reply(ctx, 'No non‑bot admins found.');
    }
  } catch (e: any) {
    await reply(ctx, `❌ Error: ${e.message}\nMake sure I am an admin and the group is a supergroup.`);
  }
}
