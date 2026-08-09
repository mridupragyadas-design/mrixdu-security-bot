import fs from "fs";
import path from "path";
import { ChatConfig, Database, defaultChatConfig } from "./types";

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

function ensureFile(): void {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ chats: {} }, null, 2));
  }
}

let cache: Database | null = null;
let writeTimer: NodeJS.Timeout | null = null;

function load(): Database {
  if (cache) return cache;
  ensureFile();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  cache = JSON.parse(raw) as Database;
  return cache;
}

function scheduleWrite(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    if (cache) fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
  }, 250);
}

export function getChatConfig(chatId: number): ChatConfig {
  const db = load();
  const key = String(chatId);
  if (!db.chats[key]) {
    db.chats[key] = defaultChatConfig();
    scheduleWrite();
  }
  return db.chats[key];
}

export function saveChatConfig(chatId: number, config: ChatConfig): void {
  const db = load();
  db.chats[String(chatId)] = config;
  scheduleWrite();
}

export function trackUser(chatId: number, userId: number): void {
  const config = getChatConfig(chatId);
  if (!config.knownUserIds.includes(userId)) {
    config.knownUserIds.push(userId);
    saveChatConfig(chatId, config);
  }
}
