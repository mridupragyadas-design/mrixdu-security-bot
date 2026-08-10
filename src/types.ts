export interface NightModeConfig {
  enabled: boolean;
  start: string; // "HH:MM" in IST
  end: string; // "HH:MM" in IST
}

// userId (string) -> "YYYY-MM-DD" (IST) -> message count
export type MessageStats = Record<string, Record<string, number>>;

export interface ChatConfig {
  mediaOff: boolean; // true = only plain text allowed; photos/videos/stickers/etc get deleted
  nightMode: NightModeConfig;
  filters: Record<string, string>; // trigger (lowercase) -> reply text
  blacklist: string[]; // lowercase words/phrases
  blockedPacks: string[]; // sticker set_name values
  blockedStickers: string[]; // individual sticker file_unique_id values
  forceJoinChannel: string | null; // "@mychannel" (public) or "-1001234567890" (private channel id)
  forceJoinInviteLink: string | null; // link shown on the "Subscribe" button
  antiSpamEnabled: boolean;
  knownUserIds: number[]; // users we've seen post, for /clean best-effort
  messageStats: MessageStats;
  userNames: Record<string, string>; // userId -> last known first name, for leaderboard display
  usernameToId: Record<string, number>; // lowercase @username (no @) -> userId, for username-based commands
}

export const defaultChatConfig = (): ChatConfig => ({
  mediaOff: false,
  nightMode: { enabled: false, start: "23:00", end: "06:00" },
  filters: {},
  blacklist: [],
  blockedPacks: [],
  blockedStickers: [],
  forceJoinChannel: null,
  forceJoinInviteLink: null,
  antiSpamEnabled: false,
  knownUserIds: [],
  messageStats: {},
  userNames: {},
  usernameToId: {},
});

export interface Database {
  chats: Record<string, ChatConfig>; // key = chat id as string
}
