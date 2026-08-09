export interface NightModeConfig {
  enabled: boolean;
  start: string; // "HH:MM" in IST
  end: string; // "HH:MM" in IST
}

export interface ChatConfig {
  mediaOnly: boolean;
  nightMode: NightModeConfig;
  filters: Record<string, string>; // trigger (lowercase) -> reply text
  blacklist: string[]; // lowercase words/phrases
  blockedPacks: string[]; // sticker set_name values
  forceJoinChannel: string | null; // "@mychannel" (public) or "-1001234567890" (private channel id)
  forceJoinInviteLink: string | null; // link shown on the "Subscribe" button, required for private channels
  knownUserIds: number[]; // users we've seen post, for /clean best-effort
  wasLockedByNightMode: boolean; // internal flag so we don't clobber manual locks
}

export const defaultChatConfig = (): ChatConfig => ({
  mediaOnly: false,
  nightMode: { enabled: false, start: "23:00", end: "06:00" },
  filters: {},
  blacklist: [],
  blockedPacks: [],
  forceJoinChannel: null,
  forceJoinInviteLink: null,
  knownUserIds: [],
  wasLockedByNightMode: false,
});

export interface Database {
  chats: Record<string, ChatConfig>; // key = chat id as string
}
