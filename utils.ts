import { Context } from "telegraf";

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
  // MarkdownV2-safe inline mention that works even without a username
  const escaped = escapeMarkdownV2(name);
  return `[${escaped}](tg://user?id=${id})`;
}

export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, (m) => `\\${m}`);
}

// Parses "HH:MM" -> { hour, minute } or null if invalid
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
  if (arg && /^\d+$/.test(arg)) return parseInt(arg, 10);
  return null;
}
