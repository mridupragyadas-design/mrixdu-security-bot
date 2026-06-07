import os
import json
import asyncio
import re
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

# -------------------- Configuration --------------------
BOT_TOKEN = os.environ.get('SECURITY_BOT_TOKEN', '8970227707:AAHjmxUxZV4JfbMHy-onov7cvUqwXiT6H2w')
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

async def get_target_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Extract user from reply or @username (reliable method)."""
    target = None
    if update.message.reply_to_message:
        target = update.message.reply_to_message.from_user
    elif context.args:
        user_input = context.args[0].lstrip('@')
        try:
            member = await update.effective_chat.get_member(user_input)
            target = member.user
        except Exception as e:
            await update.message.reply_text(f"❌ Could not find user: {user_input}\nError: {e}\nMake sure the user is in the group and I am admin.")
            return None
    return target

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

# -------------------- Auto night mode scheduler (IST) --------------------
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
        help_text = (
            "👋 HEYY I'M MRIXDU SECURITY BOT\n\n"
            "📜 **My Commands (Group Admins only)**\n"
            "• `/kick @username` – Kick a user\n"
            "• `/ban @username` – Ban a user\n"
            "• `/mute @username` – Mute a user\n"
            "• `/unmute @username` – Unmute a user\n"
            "• `/info @username` – Show user info\n"
            "• `/nighton` – Enable night mode (delete all non-admin messages)\n"
            "• `/nightoff` – Disable night mode\n"
            "• `/setnight HH:MM HH:MM` – Set auto night schedule (24h or 12h AM/PM)\n"
            "• `/block word1 word2` – Block words\n"
            "• `/unblock word1 word2` – Unblock words\n"
            "• `/filter word` – Delete messages containing exact word\n"
            "• `/delfilter word` – Remove filter\n"
            "• `/blocksticker` (reply) – Block a sticker\n"
            "• `/unblocksticker` (reply) – Unblock a sticker\n"
            "• `/banstickerpack` (reply) – Ban entire sticker pack\n"
            "• `/unbanstickerpack` (reply) – Unban sticker pack\n"
            "• `/antispamon` / `/antispamoff` – Toggle anti-spam\n"
            "• `/mediaoff` / `/mediaon` – Block/allow media\n"
            "• `/forcesubscribe @channel` – Require joining a channel\n"
            "• `/pin` (reply) – Pin a message\n"
            "• `@admin` – Notify group admins\n"
            "• `/checkadmin` – Verify bot's admin status\n\n"
            "➡️ Add me to a group as **admin** and use these commands."
        )
        await update.message.reply_text(help_text, parse_mode="Markdown")
    else:
        await update.message.reply_text("Use /start in private chat to see my commands.")

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
    await update.message.reply_text("🌙 Night mode enabled. All non-admin messages will be deleted.")

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
        await update.message.reply_text("Usage: /setnight 01:00 07:00 or /setnight 1:00 PM 7:00 AM\nExample: `/setnight 01:00 07:00` (24h) or `/setnight 10:00 PM 6:00 AM` (12h with AM/PM)", parse_mode="Markdown")
        return

    on_24h = parse_time_with_am_pm(context.args[0])
    off_24h = parse_time_with_am_pm(context.args[1])

    if not on_24h or not off_24h:
        await update.message.reply_text("Invalid time format. Use 24h (HH:MM) or 12h with AM/PM (e.g., 1:00 PM).")
        return

    settings = get_chat_settings(update.effective_chat.id)
    settings["night_on"] = on_24h
    settings["night_off"] = off_24h
    save_data()
    await update.message.reply_text(f"✅ Auto night mode set: ON {on_24h} IST, OFF {off_24h} IST.")

async def ban_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    target = await get_target_user(update, context)
    if not target:
        return
    try:
        await update.effective_chat.ban_member(target.id)
        await update.message.reply_text(f"✅ Banned {target.first_name} (ID: {target.id})")
    except Exception as e:
        await update.message.reply_text(f"Failed to ban: {e}")

async def kick_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    target = await get_target_user(update, context)
    if not target:
        return
    try:
        await update.effective_chat.ban_member(target.id)
        await update.effective_chat.unban_member(target.id)
        await update.message.reply_text(f"✅ Kicked {target.first_name}")
    except Exception as e:
        await update.message.reply_text(f"Failed to kick: {e}")

async def mute_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    target = await get_target_user(update, context)
    if not target:
        return
    try:
        perms = ChatPermissions(can_send_messages=False)
        await update.effective_chat.restrict_member(target.id, perms)
        await update.message.reply_text(f"🔇 Muted {target.first_name}")
    except Exception as e:
        await update.message.reply_text(f"Failed to mute: {e}")

async def unmute_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    target = await get_target_user(update, context)
    if not target:
        return
    try:
        perms = ChatPermissions(can_send_messages=True, can_send_other_messages=True)
        await update.effective_chat.restrict_member(target.id, perms)
        await update.message.reply_text(f"🔊 Unmuted {target.first_name}")
    except Exception as e:
        await update.message.reply_text(f"Failed to unmute: {e}")

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
        await update.message.reply_text("This sticker does not belong to a pack (or is a custom emoji).")
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
        await update.message.reply_text(f"✅ Sticker pack `{pack_name}` unbanned. Stickers from this pack are now allowed.", parse_mode="Markdown")
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
    if not context.args:
        await update.message.reply_text("Usage: /filter word")
        return
    word = context.args[0].lower()
    settings = get_chat_settings(update.effective_chat.id)
    if word not in settings["filters"]:
        settings["filters"][word] = "delete"
        save_data()
        await update.message.reply_text(f"🔍 Filter added for: {word}")
    else:
        await update.message.reply_text("Filter already exists.")

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

async def user_info(update: Upd
