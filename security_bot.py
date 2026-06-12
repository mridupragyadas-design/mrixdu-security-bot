import os
import json
import asyncio
import re
import sqlite3
from datetime import datetime, timedelta
from threading import Thread
from flask import Flask
from telegram import Update, ChatPermissions, ChatMember, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, MessageHandler, CallbackQueryHandler,
    ContextTypes, filters
)
import pytz

# -------------------- Flask web server --------------------
flask_app = Flask(__name__)

@flask_app.route('/')
def health():
    return "Mrixdu Security++ Bot is running!"

def run_flask():
    port = int(os.environ.get('PORT', 8080))
    flask_app.run(host='0.0.0.0', port=port)

Thread(target=run_flask, daemon=True).start()
# ---------------------------------------------------------

# -------------------- SQLite Database --------------------
DB_FILE = "users.db"
db_conn = sqlite3.connect(DB_FILE, check_same_thread=False)
db_cursor = db_conn.cursor()
db_cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        full_name TEXT
    )
""")
db_conn.commit()

def save_user(user):
    if not user.username:
        return
    db_cursor.execute("""
        INSERT OR REPLACE INTO users (user_id, username, full_name)
        VALUES (?, ?, ?)
    """, (user.id, user.username.lower(), user.full_name))
    db_conn.commit()

def get_user_by_username(username: str):
    db_cursor.execute("SELECT user_id, full_name FROM users WHERE username = ?", (username.lower(),))
    return db_cursor.fetchone()
# ---------------------------------------------------------

# -------------------- Configuration --------------------
BOT_TOKEN = os.environ.get('SECURITY_BOT_TOKEN', '8970227707:AAE7gHha6huxmuSvfgIzCwOOgBXC6_GsOyw')
DATA_FILE = "security_bot_data.json"

DEFAULT_NIGHT_ON = "01:00"
DEFAULT_NIGHT_OFF = "07:00"

SPAM_WINDOW = 5
SPAM_MAX_MSGS = 5
MUTE_DURATION = 300

data = {}
msg_tracker = {}
force_join_waiting = {}
IST = pytz.timezone('Asia/Kolkata')

# -------------------- Helper functions --------------------
def load_data():
    global data
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            data = json.load(f)
    else:
        data = {}

def save_data():
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def get_chat_settings(chat_id):
    chat_id_str = str(chat_id)
    if chat_id_str not in data:
        data[chat_id_str] = {
            "night_mode": False,
            "night_on": DEFAULT_NIGHT_ON,
            "night_off": DEFAULT_NIGHT_OFF,
            "blocked_words": [],
            "blocked_stickers": [],
            "banned_sticker_packs": [],
            "filters": {},
            "anti_spam": False,
            "force_subscribe": None,
            "media_off": False
        }
        save_data()
    return data[chat_id_str]

async def is_group_admin(update: Update, user_id: int) -> bool:
    chat = update.effective_chat
    if chat.type not in ["group", "supergroup"]:
        return False
    try:
        member = await chat.get_member(user_id)
        return member.status in (ChatMember.ADMINISTRATOR, ChatMember.OWNER)
    except:
        return False

async def is_user_in_channel(user_id: int, channel_username: str, bot) -> bool:
    try:
        chat_member = await bot.get_chat_member(chat_id=channel_username, user_id=user_id)
        return chat_member.status in (ChatMember.MEMBER, ChatMember.ADMINISTRATOR, ChatMember.OWNER)
    except:
        return False

async def mute_user(chat_id, user_id, until_date, bot):
    perms = ChatPermissions(can_send_messages=False)
    await bot.restrict_chat_member(chat_id, user_id, perms, until_date=until_date)

async def unmute_user(chat_id, user_id, bot):
    perms = ChatPermissions(can_send_messages=True, can_send_other_messages=True)
    await bot.restrict_chat_member(chat_id, user_id, perms)

async def delete_message_safe(message):
    try:
        await message.delete()
    except:
        pass

def parse_time_with_am_pm(time_str):
    time_str = time_str.strip().upper()
    match = re.match(r'(\d{1,2}):(\d{2})(?:\s*([AP]M))?', time_str)
    if not match:
        return None
    hour, minute, am_pm = int(match.group(1)), int(match.group(2)), match.group(3)
    if am_pm:
        if am_pm == 'PM' and hour != 12:
            hour += 12
        elif am_pm == 'AM' and hour == 12:
            hour = 0
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return f"{hour:02d}:{minute:02d}"

# -------------------- Auto night mode scheduler --------------------
async def auto_night_scheduler(bot):
    while True:
        now = datetime.now(IST)
        current_time = now.strftime("%H:%M")
        for chat_id_str, settings in list(data.items()):
            chat_id = int(chat_id_str)
            on = settings.get("night_on", DEFAULT_NIGHT_ON)
            off = settings.get("night_off", DEFAULT_NIGHT_OFF)
            if on <= off:
                should = (on <= current_time < off)
            else:
                should = (current_time >= on or current_time < off)
            if should and not settings.get("night_mode", False):
                settings["night_mode"] = True
                save_data()
                try:
                    await bot.send_message(chat_id, "🌙 *Night Mode Enabled* (auto)\nAll non-admin messages will be deleted.", parse_mode="Markdown")
                except:
                    pass
            elif not should and settings.get("night_mode", False):
                settings["night_mode"] = False
                save_data()
                try:
                    await bot.send_message(chat_id, "☀️ *Night Mode Disabled* (auto)\nMessage deletion turned off.", parse_mode="Markdown")
                except:
                    pass
        await asyncio.sleep(60)
        # -------------------- Command handlers --------------------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.type == "private":
        msg = (
            "🛡️ **Welcome to MRIXDU Protection Bot**\n\n"
            "Hey there! 👋\n\n"
            "I'm MRIXDU Protection Bot — your advanced Telegram group security and management assistant, built to keep your community safe, organized, and spam‑free.\n\n"
            "━━━━━━━━━━━━━━━━━━\n\n"
            "⚡ **Features**\n\n"
            "👮 **User Moderation**\n"
            "• Kick, Ban & Mute Members\n"
            "• User Information Lookup\n"
            "• Admin Management Tools\n\n"
            "🛡️ **Security Protection**\n"
            "• Anti‑Spam System\n"
            "• Media Protection\n"
            "• Force Subscribe Verification\n"
            "• Auto Moderation Features\n\n"
            "🌙 **Night Mode**\n"
            "• Automatic Group Lockdown\n"
            "• Custom Night Schedule\n\n"
            "🚫 **Filters & Blacklists**\n"
            "• Word Filtering\n"
            "• Blacklisted Words Control\n"
            "• Sticker & Sticker Pack Protection\n\n"
            "📌 **Utilities**\n"
            "• Pin Messages\n"
            "• Admin Mentions\n"
            "• Group Management Tools\n\n"
            "━━━━━━━━━━━━━━━━━━\n\n"
            "📋 **View All Commands**\n"
            "➜ /commands\n\n"
            "━━━━━━━━━━━━━━━━━━\n\n"
            "🌐 **Official Network**\n\n"
            "👥 Community Group\n"
            "@BGMIPOPULARITYOG\n\n"
            "📢 Official Channel\n"
            "@MAXITEMARKET\n\n"
            "🌍 Support Group\n"
            "@MAXITEWORLD\n\n"
            "━━━━━━━━━━━━━━━━━━\n\n"
            "💎 **Need Your Own Bot?**\n\n"
            "Want a clone of this bot, custom features, or a private setup?\n\n"
            "👑 Owner & Developer\n"
            "@MRIXDU\n\n"
            "━━━━━━━━━━━━━━━━━━\n\n"
            "🔒 Stay Safe • Stay Protected\n"
            "⚙️ Powered by MRIXDU Protection Bot"
        )
        await update.message.reply_text(msg, parse_mode="Markdown", disable_web_page_preview=True)
    else:
        await update.message.reply_text("Use /start in private chat to see my commands.")

async def commands_list(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.type == "private":
        text = (
            "📋 **All Commands**\n\n"
            "• `/ban @username`\n"
            "• `/kick @username`\n"
            "• `/mute @username`\n"
            "• `/unmute @username`\n"
            "• `/info @username`\n"
            "• `/nighton` / `/nightoff`\n"
            "• `/setnight HH:MM HH:MM`\n"
            "• `/block word` / `/unblock word`\n"
            "• `/filter word` / `/delfilter word`\n"
            "• `/blocksticker` / `/unblocksticker`\n"
            "• `/banstickerpack` / `/unbanstickerpack`\n"
            "• `/antispamon` / `/antispamoff`\n"
            "• `/mediaoff` / `/mediaon`\n"
            "• `/forcesubscribe @channel`\n"
            "• `/pin`\n"
            "• `@admin`\n"
            "• `/checkadmin`"
        )
        await update.message.reply_text(text, parse_mode="Markdown")

async def check_admin(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        bot_member = await update.effective_chat.get_member(context.bot.id)
        is_admin = bot_member.status in (ChatMember.ADMINISTRATOR, ChatMember.OWNER)
        await update.message.reply_text(f"Bot is admin: {is_admin}\nStatus: {bot_member.status}")
    except Exception as e:
        await update.message.reply_text(f"Cannot check admin status: {e}")

async def nighton(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Only group admins can use this command.")
        return
    settings = get_chat_settings(update.effective_chat.id)
    settings["night_mode"] = True
    save_data()
    await update.message.reply_text("🌙 Night mode enabled. Non-admin messages will be deleted.")

async def nightoff(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Only group admins can use this command.")
        return
    settings = get_chat_settings(update.effective_chat.id)
    settings["night_mode"] = False
    save_data()
    await update.message.reply_text("☀️ Night mode disabled.")

async def setnight(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Only group admins can use this command.")
        return
    if len(context.args) != 2:
        await update.message.reply_text("Usage: /setnight 01:00 07:00 or /setnight 1:00 PM 7:00 AM")
        return
    on_24h = parse_time_with_am_pm(context.args[0])
    off_24h = parse_time_with_am_pm(context.args[1])
    if not on_24h or not off_24h:
        await update.message.reply_text("Invalid time format. Use HH:MM or HH:MM AM/PM")
        return
    settings = get_chat_settings(update.effective_chat.id)
    settings["night_on"] = on_24h
    settings["night_off"] = off_24h
    save_data()
    await update.message.reply_text(f"✅ Auto night set: ON {on_24h} IST, OFF {off_24h} IST.")

async def ban_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return

    target_user = None

    # Case 1: reply to a message
    if update.message.reply_to_message:
        target_user = update.message.reply_to_message.from_user
    # Case 2: /ban @username
    elif context.args:
        username = context.args[0].lstrip('@')
        user_info = get_user_by_username(username)
        if not user_info:
            await update.message.reply_text(f"❌ User @{username} not found in database.\nThey must have spoken in the group after the bot was added.")
            return
        user_id = user_info[0]
        try:
            member = await update.effective_chat.get_member(user_id)
            target_user = member.user
        except:
            await update.message.reply_text(f"User @{username} found in DB but not in group.")
            return
    else:
        await update.message.reply_text("Usage: /ban @username or reply to a user's message with /ban")
        return

    try:
        await update.effective_chat.ban_member(target_user.id)
        await update.message.reply_text(f"✅ Banned {target_user.first_name} (ID: {target_user.id})")
    except Exception as e:
        await update.message.reply_text(f"Failed to ban: {e}")
        
# ========== unban_user function (correctly placed, not nested) ==========
async def unban_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return

    target_id = None
    # Case 1: reply to a message (the user may be banned, but we can still get their ID)
    if update.message.reply_to_message:
        target_id = update.message.reply_to_message.from_user.id
    # Case 2: /unban @username
    elif context.args:
        username = context.args[0].lstrip('@')
        user_info = get_user_by_username(username)
        if not user_info:
            await update.message.reply_text(f"❌ User @{username} not found in database.\nThey must have spoken in the group after the bot was added.")
            return
        target_id = user_info[0]
    else:
        await update.message.reply_text("Usage: /unban @username or reply to a banned user's message (if available)")
        return

    try:
        await update.effective_chat.unban_member(target_id)
        await update.message.reply_text(f"✅ Unbanned user ID {target_id}")
    except Exception as e:
        await update.message.reply_text(f"Failed to unban: {e}")

async def kick_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return

    target_user = None

    # Case 1: reply to a message
    if update.message.reply_to_message:
        target_user = update.message.reply_to_message.from_user
    # Case 2: /kick @username
    elif context.args:
        username = context.args[0].lstrip('@')
        user_info = get_user_by_username(username)
        if not user_info:
            await update.message.reply_text(f"❌ User @{username} not found in database.\nThey must have spoken in the group after the bot was added.")
            return
        user_id = user_info[0]
        try:
            member = await update.effective_chat.get_member(user_id)
            target_user = member.user
        except:
            await update.message.reply_text(f"User @{username} found in DB but not in group.")
            return
    else:
        await update.message.reply_text("Usage: /kick @username or reply to a user's message with /kick")
        return

    try:
        await update.effective_chat.ban_member(target_user.id)
        await update.effective_chat.unban_member(target_user.id)
        await update.message.reply_text(f"✅ Kicked {target_user.first_name}")
    except Exception as e:
        await update.message.reply_text(f"Failed to kick: {e}")
        
async def mute_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return

    target_user = None

    # Case 1: reply to a message
    if update.message.reply_to_message:
        target_user = update.message.reply_to_message.from_user
    # Case 2: /mute @username
    elif context.args:
        username = context.args[0].lstrip('@')
        user_info = get_user_by_username(username)
        if not user_info:
            await update.message.reply_text(f"❌ User @{username} not found in database.\nThey must have spoken in the group after the bot was added.")
            return
        user_id = user_info[0]
        try:
            member = await update.effective_chat.get_member(user_id)
            target_user = member.user
        except:
            await update.message.reply_text(f"User @{username} found in DB but not in group.")
            return
    else:
        await update.message.reply_text("Usage: /mute @username or reply to a user's message with /mute")
        return

    try:
        perms = ChatPermissions(can_send_messages=False)
        await update.effective_chat.restrict_member(target_user.id, perms)
        await update.message.reply_text(f"🔇 Muted {target_user.first_name} (ID: {target_user.id})")
    except Exception as e:
        await update.message.reply_text(f"Failed to mute: {e}")

async def unmute_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return

    target_user = None

    # Case 1: reply to a message
    if update.message.reply_to_message:
        target_user = update.message.reply_to_message.from_user
    # Case 2: /unmute @username
    elif context.args:
        username = context.args[0].lstrip('@')
        user_info = get_user_by_username(username)
        if not user_info:
            await update.message.reply_text(f"❌ User @{username} not found in database.\nThey must have spoken in the group after the bot was added.")
            return
        user_id = user_info[0]
        try:
            member = await update.effective_chat.get_member(user_id)
            target_user = member.user
        except:
            await update.message.reply_text(f"User @{username} found in DB but not in group.")
            return
    else:
        await update.message.reply_text("Usage: /unmute @username or reply to a user's message with /unmute")
        return

    try:
        perms = ChatPermissions(can_send_messages=True, can_send_other_messages=True)
        await update.effective_chat.restrict_member(target_user.id, perms)
        await update.message.reply_text(f"🔊 Unmuted {target_user.first_name} (ID: {target_user.id})")
    except Exception as e:
        await update.message.reply_text(f"Failed to unmute: {e}")

async def user_info(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return

    target_user = None

    # Case 1: reply to a message
    if update.message.reply_to_message:
        target_user = update.message.reply_to_message.from_user
    # Case 2: /info @username
    elif context.args:
        username = context.args[0].lstrip('@')
        user_data = get_user_by_username(username)
        if user_data:
            user_id, full_name = user_data
            try:
                member = await update.effective_chat.get_member(user_id)
                target_user = member.user
            except:
                await update.message.reply_text(f"User @{username} found in DB but not in group.")
                return
        else:
            await update.message.reply_text(f"❌ User @{username} not found in database.\nThey must have spoken in the group after the bot was added.")
            return
    else:
        await update.message.reply_text("Usage: /info @username or reply to a user's message with /info")
        return

    if not target_user:
        await update.message.reply_text("Could not identify target user.")
        return

    user_id = target_user.id
    full_name = target_user.full_name
    username = target_user.username or "NoUsername"

    # Get status by checking admin list first (reliable)
    status_str = "Member"
    try:
        admins = await update.effective_chat.get_administrators()
        for admin in admins:
            if admin.user.id == user_id:
                status_str = "Creator" if admin.status == "creator" else "Administrator"
                break
        else:
            # Not an admin – try to get member status (restricted, left, banned)
            try:
                member = await update.effective_chat.get_member(user_id)
                if member.status == "restricted":
                    status_str = "Restricted"
                elif member.status == "left":
                    status_str = "Left"
                elif member.status == "banned":
                    status_str = "Banned"
                else:
                    status_str = "Member"
            except:
                pass
    except:
        pass

    msg = (
        f"👤 **User Info**\n"
        f"🆔 ID: `{user_id}`\n"
        f"📛 Name: {full_name}\n"
        f"👤 Username: @{username}\n"
        f"🔗 [User link](tg://user?id={user_id})\n"
        f"📌 Status in group: {status_str}"
    )
    await update.message.reply_text(msg, parse_mode="Markdown", disable_web_page_preview=True)
    # -------------------- Word, Sticker, Filter, Media, Anti-spam --------------------
async def block_word(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    if not context.args:
        await update.message.reply_text("Usage: /block word1 word2 ...")
        return
    settings = get_chat_settings(update.effective_chat.id)
    words = [w.lower() for w in context.args if w not in settings["blocked_words"]]
    settings["blocked_words"].extend(words)
    save_data()
    await update.message.reply_text(f"🚫 Blocked words: {', '.join(words)}")

async def unblock_word(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    if not context.args:
        await update.message.reply_text("Usage: /unblock word1 word2 ...")
        return
    settings = get_chat_settings(update.effective_chat.id)
    removed = []
    for w in context.args:
        wl = w.lower()
        if wl in settings["blocked_words"]:
            settings["blocked_words"].remove(wl)
            removed.append(w)
    save_data()
    await update.message.reply_text(f"✅ Unblocked: {', '.join(removed) if removed else 'None'}")

async def block_sticker(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    if not update.message.reply_to_message or not update.message.reply_to_message.sticker:
        await update.message.reply_text("Reply to a sticker to block it.")
        return
    sticker_id = update.message.reply_to_message.sticker.file_id
    settings = get_chat_settings(update.effective_chat.id)
    if sticker_id not in settings["blocked_stickers"]:
        settings["blocked_stickers"].append(sticker_id)
        save_data()
        await update.message.reply_text("🚫 Sticker blocked.")
    else:
        await update.message.reply_text("Sticker already blocked.")

async def unblock_sticker(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    if not update.message.reply_to_message or not update.message.reply_to_message.sticker:
        await update.message.reply_text("Reply to a sticker to unblock it.")
        return
    sticker_id = update.message.reply_to_message.sticker.file_id
    settings = get_chat_settings(update.effective_chat.id)
    if sticker_id in settings["blocked_stickers"]:
        settings["blocked_stickers"].remove(sticker_id)
        save_data()
        await update.message.reply_text("✅ Sticker unblocked.")
    else:
        await update.message.reply_text("Sticker not blocked.")

async def ban_sticker_pack(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    if not update.message.reply_to_message or not update.message.reply_to_message.sticker:
        await update.message.reply_text("Reply to a sticker to ban its entire pack.")
        return
    sticker = update.message.reply_to_message.sticker
    pack_name = sticker.set_name
    if not pack_name:
        await update.message.reply_text("This sticker does not belong to a pack.")
        return
    settings = get_chat_settings(update.effective_chat.id)
    if pack_name not in settings["banned_sticker_packs"]:
        settings["banned_sticker_packs"].append(pack_name)
        save_data()
        await update.message.reply_text(f"🚫 Sticker pack `{pack_name}` banned. Any sticker from this pack will be deleted.", parse_mode="Markdown")
    else:
        await update.message.reply_text("This sticker pack is already banned.")

async def unban_sticker_pack(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    if not update.message.reply_to_message or not update.message.reply_to_message.sticker:
        await update.message.reply_text("Reply to a sticker from the banned pack to unban it.")
        return
    sticker = update.message.reply_to_message.sticker
    pack_name = sticker.set_name
    if not pack_name:
        await update.message.reply_text("This sticker does not belong to a pack.")
        return
    settings = get_chat_settings(update.effective_chat.id)
    if pack_name in settings["banned_sticker_packs"]:
        settings["banned_sticker_packs"].remove(pack_name)
        save_data()
        await update.message.reply_text(f"✅ Sticker pack `{pack_name}` unbanned.", parse_mode="Markdown")
    else:
        await update.message.reply_text("This sticker pack was not banned.")

async def pin_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    if not update.message.reply_to_message:
        await update.message.reply_text("Reply to a message to pin it.")
        return
    try:
        await update.message.reply_to_message.pin()
        await update.message.reply_text("📌 Message pinned.")
    except Exception as e:
        await update.message.reply_text(f"Failed to pin: {e}")

async def filter_word(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return

    # Check if the command is a reply to a photo
    photo_file_id = None
    if update.message.reply_to_message and update.message.reply_to_message.photo:
        photo_file_id = update.message.reply_to_message.photo[-1].file_id

    if not context.args:
        await update.message.reply_text("Usage: /filter word [reply to a photo] or /filter word reply_text")
        return

    word = context.args[0].lower()
    settings = get_chat_settings(update.effective_chat.id)

    if photo_file_id:
        # Store the photo file_id as the filter reply
        settings["filters"][word] = photo_file_id
        save_data()
        await update.message.reply_text(f"🔍 Filter added: when someone says '{word}', I'll send that photo.")
    else:
        # Store text reply (everything after the word)
        if len(context.args) < 2:
            await update.message.reply_text("Usage: /filter word reply_text\nExample: /filter done Hero")
            return
        reply = " ".join(context.args[1:])
        settings["filters"][word] = reply
        save_data()
        await update.message.reply_text(f"🔍 Filter added: when someone says '{word}', I'll reply: '{reply}'")

async def delfilter(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    if not context.args:
        await update.message.reply_text("Usage: /delfilter word")
        return
    word = context.args[0].lower()
    settings = get_chat_settings(update.effective_chat.id)
    if word in settings["filters"]:
        del settings["filters"][word]
        save_data()
        await update.message.reply_text(f"✅ Filter removed for: {word}")
    else:
        await update.message.reply_text("Filter not found.")

async def antispam_on(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    settings = get_chat_settings(update.effective_chat.id)
    settings["anti_spam"] = True
    save_data()
    await update.message.reply_text("🛡️ Anti-spam enabled.")

async def antispam_off(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    settings = get_chat_settings(update.effective_chat.id)
    settings["anti_spam"] = False
    save_data()
    await update.message.reply_text("✅ Anti-spam disabled.")

async def media_off(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    settings = get_chat_settings(update.effective_chat.id)
    settings["media_off"] = True
    save_data()
    await update.message.reply_text("📵 Media will be deleted for non-admins.")

async def media_on(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    settings = get_chat_settings(update.effective_chat.id)
    settings["media_off"] = False
    save_data()
    await update.message.reply_text("✅ Media allowed for everyone.")

async def admin_mention(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return
    text = update.message.text
    if text and "@admin" in text.lower():
        chat = update.effective_chat
        try:
            admins = []
            async for member in chat.get_administrators():
                if not member.user.is_bot:
                    admins.append(member.user)
            if admins:
                mentions = []
                for admin in admins:
                    if admin.username:
                        mentions.append(f"@{admin.username}")
                    else:
                        mentions.append(f'<a href="tg://user?id={admin.id}">Admin</a>')
                await update.message.reply_text(f"🚨 Admins notified: {' '.join(mentions)}", parse_mode="HTML")
            else:
                await update.message.reply_text("No non‑bot admins found.")
        except:
            await update.message.reply_text("⚠️ @admin only works in **supergroups**. Please upgrade this group to a supergroup.")
            # -------------------- Forcesubscribe (added) and callback (corrected) --------------------
async def forcesubscribe(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    if not context.args:
        await update.message.reply_text("Usage: /forcesubscribe @channelusername\nTo remove: /forcesubscribe off")
        return
    channel = context.args[0]
    chat_id = update.effective_chat.id
    settings = get_chat_settings(chat_id)
    if channel.lower() == "off":
        settings["force_subscribe"] = None
        save_data()
        await update.message.reply_text("Force subscribe removed.")
        return
    if not channel.startswith("@"):
        await update.message.reply_text("Channel must start with @")
        return
    settings["force_subscribe"] = channel
    save_data()
    await update.message.reply_text(f"✅ Users must join {channel} before talking.\nNew users will be muted and receive a verification message.\nMake sure I am admin in the channel to verify membership.")

async def force_subscribe_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    user = query.from_user
    info = force_join_waiting.get(user.id)
    if not info:
        await query.edit_message_text("Verification expired. Please rejoin the group or contact an admin.")
        return
    chat_id = info["chat_id"]
    channel = info["channel"]
    if await is_user_in_channel(user.id, channel, context.bot):
        await unmute_user(chat_id, user.id, context.bot)
        await query.edit_message_text("✅ Verification successful! You may now chat in the group.")
        await context.bot.send_message(chat_id, f"@{user.username or user.first_name} has verified and can now talk.")
        force_join_waiting.pop(user.id, None)
    else:
        # Do NOT remove the button – just alert the user
        await query.answer("❌ You haven't joined the channel yet. Please join first, then click again.", show_alert=True)
        try:
            await context.bot.send_message(chat_id, f"@{user.username or user.first_name}, you must join {channel} before clicking the button.", disable_notification=True)
        except:
            pass

async def guard_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return
    save_user(update.effective_user)
    chat = update.effective_chat
    user = update.effective_user
    if chat.type not in ["group", "supergroup"]:
        return
    if user.id == context.bot.id:
        return
    chat_id = chat.id
    user_id = user.id
    settings = get_chat_settings(chat_id)

    if settings.get("night_mode", False) and not await is_group_admin(update, user_id):
        await delete_message_safe(update.message)
        return

    # Force subscribe (mute non‑subscribed users)
    if not await is_group_admin(update, user_id):
        channel = settings.get("force_subscribe")
        if channel:
            if not await is_user_in_channel(user_id, channel, context.bot):
                try:
                    await mute_user(chat_id, user_id, datetime.now() + timedelta(days=365), context.bot)
                except:
                    pass
                await delete_message_safe(update.message)
                if user_id not in force_join_waiting:
                    keyboard = InlineKeyboardMarkup([
                        [InlineKeyboardButton("📢 Subscribe to channel", url=f"https://t.me/{channel[1:]}")],
                        [InlineKeyboardButton("✅ I subscribed", callback_data="check_subscribe")]
                    ])
                    sent = await context.bot.send_message(chat_id, f"@{user.username or user.first_name}, you must join {channel} to talk here.\n\nAfter joining, click the button below to verify:", reply_markup=keyboard)
                    force_join_waiting[user_id] = {"chat_id": chat_id, "channel": channel, "message_id": sent.message_id}
                return

    # Auto-unmute if user has joined the channel (no button click needed)
    if not await is_group_admin(update, user_id):
        channel = settings.get("force_subscribe")
        if channel and await is_user_in_channel(user_id, channel, context.bot):
            try:
                member = await chat.get_member(user_id)
                if member.status == ChatMember.RESTRICTED and not member.can_send_messages:
                    await unmute_user(chat_id, user_id, context.bot)
                    await context.bot.send_message(chat_id, f"@{user.username or user.first_name} has joined {channel} and has been unmuted automatically.")
            except:
                pass

    if settings.get("media_off", False) and not await is_group_admin(update, user_id):
        if update.message.photo or update.message.video or update.message.document or update.message.audio:
            await delete_message_safe(update.message)
            return

    if update.message.sticker:
        if update.message.sticker.file_id in settings.get("blocked_stickers", []):
            await delete_message_safe(update.message)
            return
        pack_name = update.message.sticker.set_name
        if pack_name and pack_name in settings.get("banned_sticker_packs", []):
            await delete_message_safe(update.message)
            return

    text = update.message.text or update.message.caption or ""
    text_lower = text.lower()
    if any(word in text_lower for word in settings.get("blocked_words", [])):
        await delete_message_safe(update.message)
        return

    # Check filters (auto‑reply, supports photos)
    for word, stored in settings.get("filters", {}).items():
        if word in text_lower.split():
            if isinstance(stored, str) and (stored.startswith("AgAC") or stored.startswith("BQAC") or stored.startswith("CAAC")):
                try:
                    await update.message.reply_photo(stored)
                except:
                    await update.message.reply_text("Error sending photo.")
            else:
                await update.message.reply_text(stored)
            await delete_message_safe(update.message)
            break

    if settings.get("anti_spam", False) and not await is_group_admin(update, user_id):
        key = (chat_id, user_id)
        now_ts = datetime.now().timestamp()
        if key not in msg_tracker:
            msg_tracker[key] = []
        msg_tracker[key] = [t for t in msg_tracker[key] if now_ts - t < SPAM_WINDOW]
        msg_tracker[key].append(now_ts)
        if len(msg_tracker[key]) > SPAM_MAX_MSGS:
            until = datetime.now() + timedelta(seconds=MUTE_DURATION)
            await mute_user(chat_id, user_id, until, context.bot)
            await context.bot.send_message(chat_id, f"🚫 {user.mention_html()} has been muted for 5 minutes (spam).", parse_mode="HTML")
            await delete_message_safe(update.message)
            msg_tracker[key] = []
            return

async def post_init(app):
    load_data()
    asyncio.create_task(auto_night_scheduler(app.bot))

def main():
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    app.post_init = post_init
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("commands", commands_list))
    app.add_handler(CommandHandler("checkadmin", check_admin))
    app.add_handler(CommandHandler("nighton", nighton))
    app.add_handler(CommandHandler("nightoff", nightoff))
    app.add_handler(CommandHandler("setnight", setnight))
    app.add_handler(CommandHandler("ban", ban_user))
    app.add_handler(CommandHandler("unban", unban_user))
    app.add_handler(CommandHandler("kick", kick_user))
    app.add_handler(CommandHandler("mute", mute_command))
    app.add_handler(CommandHandler("unmute", unmute_command))
    app.add_handler(CommandHandler("block", block_word))
    app.add_handler(CommandHandler("unblock", unblock_word))
    app.add_handler(CommandHandler("blocksticker", block_sticker))
    app.add_handler(CommandHandler("unblocksticker", unblock_sticker))
    app.add_handler(CommandHandler("banstickerpack", ban_sticker_pack))
    app.add_handler(CommandHandler("unbanstickerpack", unban_sticker_pack))
    app.add_handler(CommandHandler("pin", pin_message))
    app.add_handler(CommandHandler("filter", filter_word))
    app.add_handler(CommandHandler("delfilter", delfilter))
    app.add_handler(CommandHandler("antispamon", antispam_on))
    app.add_handler(CommandHandler("antispamoff", antispam_off))
    app.add_handler(CommandHandler("info", user_info))
    app.add_handler(CommandHandler("forcesubscribe", forcesubscribe))
    app.add_handler(CommandHandler("mediaoff", media_off))
    app.add_handler(CommandHandler("mediaon", media_on))
    app.add_handler(CallbackQueryHandler(force_subscribe_callback, pattern="check_subscribe"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, admin_mention), group=0)
    app.add_handler(MessageHandler(filters.ALL & ~filters.COMMAND, guard_message), group=1)
    print("🛡️ MRIXDU Protection Bot is running...")
    app.run_polling()

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
