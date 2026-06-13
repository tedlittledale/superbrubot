// Always lists the chats the bot can see, regardless of TELEGRAM_CHAT_ID.
// Use this for first-time setup to find your group's chat id.
//
//   1. Add the bot to your group
//   2. Send any message in the group (or @-mention the bot)
//   3. node src/cli/chatId.js
import { getUpdates } from "../telegram.js";

const updates = await getUpdates();

if (updates.length === 0) {
  console.log(
    "No updates yet. The bot can't see any chats.\n\n" +
      "Checklist:\n" +
      "  • Is the bot added to your group?\n" +
      "  • Did you send a message in the group AFTER adding it?\n" +
      "  • Privacy mode: bots ignore normal group messages by default.\n" +
      "    Either @-mention the bot, or message @BotFather → /setprivacy →\n" +
      "    your bot → Disable, then remove + re-add the bot and post again.\n",
  );
  process.exit(0);
}

const seen = new Map();
for (const u of updates) {
  const chat = u.message?.chat || u.channel_post?.chat || u.my_chat_member?.chat;
  if (chat) seen.set(chat.id, chat);
}

console.log("Chats the bot can see:\n");
for (const chat of seen.values()) {
  const name = chat.title || chat.username || `${chat.first_name || ""}`.trim();
  console.log(`  ${chat.id}\t(${chat.type})\t${name}`);
}
console.log("\nCopy the group id (a negative number) into TELEGRAM_CHAT_ID in your .env.");
