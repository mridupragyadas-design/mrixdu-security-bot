import { Context } from "telegraf";
import { getChatConfig } from "./db";

export async function isUserAdmin(ctx: Context, userId?: number): Promise<boolean> {
  const chat = ctx.chat;
  const uid = userId ?? ctx.from?.id;
  if (!chat || !uid) return false;
  if (chat.type === "private") return true;
  try {
    const member = await ctx.telegram.getChatMember(chat.id, uid);
    return member.status === "administrator" || member.status === "creator";
  } catch {
    return false;
  }
}

export async function requireAdmin(ctx: Context): Promise<boolean> {
  const ok = await isUserAdmin(ctx);
  if (!ok) {
    await ctx.reply("🚫 This command is for group admins only.");
  }
  return ok;
}

export function mentionUser(id: number, name: string): string {
  const escaped = escapeMarkdownV2(name);
  return `[${escaped}](tg://user?id=${id})`;
}

export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, (m) => `\\${m}`);
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function mentionUserHtml(id: number, name: string): string {
  return `<a href="tg://user?id=${id}">${escapeHtml(name)}</a>`;
}

export function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
}

export function parseTime(value: string): { hour: number; minute: number } | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return { hour: parseInt(match[1], 10), minute: parseInt(match[2], 10) };
}

export function isReplyToMessage(ctx: any): boolean {
  return Boolean(ctx.message?.reply_to_message);
}

export function targetUserFromReplyOrArg(ctx: any): number | null {
  const reply = ctx.message?.reply_to_message;
  if (reply?.from?.id) return reply.from.id;
  const arg = ctx.message?.text?.split(" ")[1];
  if (!arg) return null;
  if (/^\d+$/.test(arg)) return parseInt(arg, 10);
  if (arg.startsWith("@")) {
    const config = getChatConfig(ctx.chat.id);
    const uname = arg.slice(1).toLowerCase();
    return config.usernameToId?.[uname] ?? null;
  }
  return null;
}

export function getISTTime(): { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
  return { hour, minute };
}

export function getISTDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
