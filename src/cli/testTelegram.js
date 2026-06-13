// Phase 1 smoke test.
//
//  - With no chat id configured yet, run this after messaging your bot/group:
//      it prints the chat ids the bot can see, so you can grab the group id.
//  - With TELEGRAM_CHAT_ID set, it sends a test message to that chat.
import { config } from "../config.js";
import { sendMessage, getUpdates } from "../telegram.js";

const hasChatId = Boolean(process.env.TELEGRAM_CHAT_ID);

if (!hasChatId) {
  console.log(
    "No TELEGRAM_CHAT_ID set. Looking for chats that have messaged the bot...\n" +
      "(Add the bot to your group and send a message there first.)\n",
  );
  const updates = await getUpdates();
  if (updates.length === 0) {
    console.log(
      "No updates yet. Send a message in the group (mention the bot), then re-run.",
    );
  } else {
    const seen = new Map();
    for (const u of updates) {
      const chat = u.message?.chat || u.channel_post?.chat;
      if (chat) seen.set(chat.id, chat);
    }
    console.log("Chats the bot can see:");
    for (const chat of seen.values()) {
      console.log(`  ${chat.id}  (${chat.type})  ${chat.title || chat.username || ""}`);
    }
    console.log("\nCopy the negative group id into TELEGRAM_CHAT_ID in your .env.");
  }
} else {
  const result = await sendMessage(
    "<b>Superbru bot</b> ✅\nPhase 1 wired up — Telegram sending works.",
  );
  console.log(`Sent message ${result.message_id} to chat ${config.telegramChatId}.`);
}
