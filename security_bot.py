import os
import json
import asyncio
from datetime import datetime, timedelta
from threading import Thread
from flask import Flask
from telegram import Update, ChatPermissions, ChatMember, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, CommandHandler, MessageHandler, CallbackQueryHandler,
    ContextTypes, filters
)

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
    # Compatible with older PTB versions
    perms = ChatPermissions(can_send_messages=True, can_send_other_messages=True)
    await bot.restrict_chat_member(chat_id, user_id, perms)

async def get_user_by_username(chat, username: str):
    """Search chat members for a user with given username (case-insensitive)."""
    username = username.lower().lstrip('@')
    try:
        # First try get_member (might work in supergroups for active users)
        member = await chat.get_member(username)
        return member.user
    except:
        # If fails, iterate over members (limit to 200 for performance)
        try:
            async for member in chat.get_members():
                if member.user.username and member.user.username.lower() == username:
                    return member.user
                if len(force_join_waiting) > 200:  # just a safety break
                    break
        except:
            pass
    return None

async def get_target_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    target = None
    if update.message.reply_to_message:
        target = update.message.reply_to_message.from_user
    elif context.args:
        username = context.args[0].lstrip('@')
        # First try to get by username from chat members
        user = await get_user_by_username(update.effective_chat, username)
        if user:
            target = user
        else:
            await update.message.reply_text(f"❌ Could not find user @{username}.\nMake sure the user is still in the group and that I am an admin.")
            return None
    return target

async def delete_message_safe(message):
    try:
        await message.delete()
    except:
        pass

# -------------------- Auto night mode scheduler --------------------
async def auto_night_scheduler(bot):
    while True:
        now = datetime.now()
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
        await update.message.reply_text("Usage: /setnight 01:00 07:00")
        return
    on_time, off_time = context.args[0], context.args[1]
    try:
        datetime.strptime(on_time, "%H:%M")
        datetime.strptime(off_time, "%H:%M")
    except:
        await update.message.reply_text("Invalid time format. Use HH:MM (24h).")
        return
    settings = get_chat_settings(update.effective_chat.id)
    settings["night_on"] = on_time
    settings["night_off"] = off_time
    save_data()
    await update.message.reply_text(f"✅ Auto night mode set: ON {on_time}, OFF {off_time}.")

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

async def user_info(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not await is_group_admin(update, update.effective_user.id):
        await update.message.reply_text("⚠️ Admins only.")
        return
    target = await get_target_user(update, context)
    if not target:
        return
    try:
        member = await update.effective_chat.get_member(target.id)
        status = member.status
        status_str = {
            ChatMember.CREATOR: "Creator",
            ChatMember.ADMINISTRATOR: "Administrator",
            ChatMember.MEMBER: "Member",
            ChatMember.RESTRICTED: "Restricted",
            ChatMember.LEFT: "Left",
            ChatMember.BANNED: "Banned"
        }.get(status, "Unknown")
    except Exception as e:
        status_str = f"Error: {e}"
    msg = (
        f"👤 **User Info**\n"
        f"🆔 ID: `{target.id}`\n"
        f"📛 Name: {target.first_name or ''} {target.last_name or ''}\n"
        f"👤 Username: @{target.username or 'N/A'}\n"
        f"🔗 [User link](tg://user?id={target.id})\n"
        f"📌 Status: {status_str}"
    )
    await update.message.reply_text(msg, parse_mode="Markdown", disable_web_page_preview=True)

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

# -------------------- @admin mention (works in normal groups too) --------------------
async def admin_mention(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return
    text = update.message.text
    if text and "@admin" in text.lower():
        chat = update.effective_chat
        admins = []
        try:
            # Try to get admin list (supergroups only)
            async for member in chat.get_administrators():
                if not member.user.is_bot:
                    admins.append(member.user)
        except Exception as e:
            # In normal groups, fallback: send a message to bot's owner? Or just reply that group needs upgrade.
            await update.message.reply_text("This group is not a supergroup. Please upgrade the group or make me admin in a supergroup for @admin to work.")
            return
        if admins:
            mentions = []
            for admin in admins:
                if admin.username:
  
