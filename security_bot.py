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

# -------------------- Flask web server for Render --------------------
flask_app = Flask(__name__)

@flask_app.route('/')
def health():
    return "Mrixdu Security++ Bot is running!"

def run_flask():
    port = int(os.environ.get('PORT', 8080))
    flask_app.run(host='0.0.0.0', port=port)

Thread(target=run_flask, daemon=True).start()
# --------------------------------------------------------------------

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
force_join_waiting = {}  # {user_id: {"chat_id": int, "channel": str, "message_id": int}}

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
            "force_subscribe": None,      # channel username (with @)
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
    perms = ChatPermissions(
        can_send_messages=True,
        can_send_media_messages=True,
        can_send_other_messages=True,
        can_add_web_page_previews=True
    )
    await bot.restrict_chat_member(chat_id, user_id, perms)

async def get_target_user(update: Update, context: ContextTypes.DEFAULT_TYPE):
    target = None
    if update.message.reply_to_message:
        target = update.message.reply_to_message.from_user
    elif context.args:
        username = context.args[0].lstrip('@')
        try:
            # Try to get member by username
            member = await update.effective_chat.get_member(username)
            target = member.user
        except Exception as e:
            await update.message.reply_text(f"❌ Could not find user @{username}.\nError: {e}\nMake sure the user is in the group and that I am an admin.")
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
        await update.message.reply_text(f"🔇 Muted {target.first_name} (ID: {target.id})")
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
        perms = ChatPermissions(
            can_send_messages=True,
            can_send_media_messages=True,
            can_send_other_messages=True,
            can_add_web_page_previews=True
        )
        await update.effective_chat.restrict_member(target.id, perms)
        await update.message.reply_text(f"🔊 Unmuted {target.first_name} (ID: {target.id})")
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

# -------------------- @admin mention handler --------------------
async def admin_mention(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return
    text = update.message.text
    if text and "@admin" in text.lower():
        chat = update.effective_chat
        admins = []
        try:
            async for member in chat.get_administrators():
                if not member.user.is_bot:
                    admins.append(member.user)
        except Exception as e:
            print(f"Error fetching admins: {e}")
            await update.message.reply_text("Could not fetch admin list. Make sure I am an admin.")
            return
        if admins:
            mentions = []
            for admin in admins:
                if admin.username:
                    mentions.append(f"@{admin.username}")
                else:
                    mentions.append(f'<a href="tg://user?id={admin.id}">Admin</a>')
            await update.message.reply_text(f"🚨 Admins notified: {' '.join(mentions)}", parse_mode="HTML")
        else:
            await update.message.reply_text("No admins found (or I cannot see them).")

# -------------------- Force subscribe verification (callback) --------------------
async def force_subscribe_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    user = query.from_user
    data = query.data
    if data == "check_subscribe":
        chat_id = force_join_waiting.get(user.id, {}).get("chat_id")
        channel = force_join_waiting.get(user.id, {}).get("channel")
        if not chat_id or not channel:
            await query.edit_message_text("Verification expired. Please rejoin the group or contact an admin.")
            return
        # Check if user joined the channel
        if await is_user_in_channel(user.id, channel, context.bot):
            # Unmute user
            try:
                await unmute_user(chat_id, user.id, context.bot)
                await query.edit_message_text("✅ Verification successful! You may now chat in the group.")
                await context.bot.send_message(chat_id, f"@{user.username or user.first_name} has verified and can now talk.")
                # Remove from waiting dict
                force_join_waiting.pop(user.id, None)
            except Exception as e:
                await query.edit_message_text(f"Error unmuting: {e}")
        else:
            await query.edit_message_text(f"You have not joined {channel} yet. Please join first, then click the button again.")

# -------------------- Message handler (guard logic) --------------------
async def guard_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return
    chat = update.effective_chat
    user = update.effective_user
    if chat.type not in ["group", "supergroup"]:
        return
    if user.id == context.bot.id:
        return

    chat_id = chat.id
    user_id = user.id
    settings = get_chat_settings(chat_id)

    # Night mode delete
    if settings.get("night_mode", False) and not await is_group_admin(update, user_id):
        await delete_message_safe(update.message)
        return

    # Force subscribe (only for non-admins)
    if not await is_group_admin(update, user_id):
        channel = settings.get("force_subscribe")
        if channel:
            joined = await is_user_in_channel(user_id, channel, context.bot)
            if not joined:
                # Mute user if not already muted
                try:
                    await mute_user(chat_id, user_id, datetime.now() + timedelta(days=365), context.bot)
                except:
                    pass
                # Delete the message
                await delete_message_safe(update.message)
                # Send verification message if not already waiting
                if user_id not in force_join_waiting:
                    keyboard = InlineKeyboardMarkup([
                        [InlineKeyboardButton("📢 Subscribe to channel", url=f"https://t.me/{channel[1:]}")],
                        [InlineKeyboardButton("✅ I subscribed", callback_data="check_subscribe")]
                    ])
                    sent = await context.bot.send_message(
                        chat_id,
                        f"@{user.username or user.first_name}, you must join {channel} to talk here.\n\n"
                        "After joining, click the button below to verify:",
                        reply_markup=keyboard
                    )
                    force_join_waiting[user_id] = {"chat_id": chat_id, "channel": channel, "message_id": sent.message_id}
                return

    # Media off
    if settings.get("media_off", False) and not await is_group_admin(update, user_id):
        if update.message.photo or update.message.video or update.message.document or update.message.audio:
            await delete_message_safe(update.message)
            return

    # Sticker block
    if update.message.sticker:
        if update.message.sticker.file_id in settings.get("blocked_stickers", []):
            await delete_message_safe(update.message)
            return

    # Word block & filters
    text = update.message.text or update.message.caption or ""
    text_lower = text.lower()
    if any(word in text_lower for word in settings.get("blocked_words", [])):
        await delete_message_safe(update.message)
        return
    if any(word in text_lower.split() for word in settings.get("filters", {}).keys()):
        await delete_message_safe(update.message)
        return

    # Anti-spam
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

# -------------------- Startup & main --------------------
async def post_init(app):
    load_data()
    asyncio.create_task(auto_night_scheduler(app.bot))

def main():
    app = ApplicationBuilder().token(BOT_TOKEN).build()
    app.post_init = post_init

    # Command handlers
    app.add_handler(CommandHandler("checkadmin", check_admin))
    app.add_handler(CommandHandler("nighton", nighton))
    app.add_handler(CommandHandler("nightoff", nightoff))
    app.add_handler(CommandHandler("setnight", setnight))
    app.add_handler(CommandHandler("ban", ban_user))
    app.add_handler(CommandHandler("kick", kick_user))
    app.add_handler(CommandHandler("mute", mute_command))
    app.add_handler(CommandHandler("unmute", unmute_command))
    app.add_handler(CommandHandler("block", block_word))
    app.add_handler(CommandHandler("unblock", unblock_word))
    app.add_handler(CommandHandler("blocksticker", block_sticker))
    app.add_handler(CommandHandler("unblocksticker", unblock_sticker))
    app.add_handler(CommandHandler("pin", pin_message))
    app.add_handler(CommandHandler("filter", filter_word))
    app.add_handler(CommandHandler("delfilter", delfilter))
    app.add_handler(CommandHandler("antispamon", antispam_on))
    app.add_handler(CommandHandler("antispamoff", antispam_off))
    app.add_handler(CommandHandler("info", user_info))
    app.add_handler(CommandHandler("forcesubscribe", forcesubscribe))
    app.add_handler(CommandHandler("mediaoff", media_off))
    app.add_handler(CommandHandler("mediaon", media_on))

    # Callback query for verification button
    app.add_handler(CallbackQueryHandler(force_subscribe_callback, pattern="check_subscribe"))

    # Message handlers (order matters)
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, admin_mention), group=0)
    app.add_handler(MessageHandler(filters.ALL & ~filters.COMMAND, guard_message), group=1)

    print("🛡️ Mrixdu Security++ Bot is running...")
    app.run_polling()

if __name__ == "__main__":
    main()
