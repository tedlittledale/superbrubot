// Pinpoints "chat not found". Run locally with the SAME token + chat id you
// have in Railway (.env), after posting a message in the group:
//   node src/cli/diagnose.js
import { getMe, getChat, getUpdates } from "../telegram.js";

const configuredId = process.env.TELEGRAM_CHAT_ID;
console.log(`Configured TELEGRAM_CHAT_ID: ${JSON.stringify(configuredId)}\n`);

// 1. Which bot is this token?
try {
  const me = await getMe();
  console.log(`Token belongs to bot: @${me.username} (id ${me.id})`);
} catch (e) {
  console.log(`getMe failed — the BOT TOKEN is wrong: ${e.message}`);
  process.exit(1);
}

// 2. Can the bot see the configured chat?
if (configuredId) {
  try {
    const chat = await getChat(configuredId);
    console.log(
      `\n✅ Bot CAN see chat ${configuredId}: "${chat.title || chat.username || chat.first_name}" (${chat.type})`,
    );
    console.log("   → id is correct. If sending still fails, check bot posting permissions.");
  } catch (e) {
    console.log(`\n❌ Bot CANNOT see chat ${configuredId}: ${e.message}`);
    console.log("   → wrong/stale id, OR this bot isn't a member of that chat.");
  }
}

// 3. What chats CAN the bot see right now? (post in the group first)
console.log("\nChats this bot can currently see (from recent messages):");
const updates = await getUpdates();
const seen = new Map();
for (const u of updates) {
  const chat = u.message?.chat || u.channel_post?.chat || u.my_chat_member?.chat;
  if (chat) seen.set(chat.id, chat);
}
if (seen.size === 0) {
  console.log("  (none) — add the bot to the group and POST A MESSAGE there, then re-run.");
} else {
  for (const c of seen.values()) {
    const match = String(c.id) === String(configuredId) ? "  ← matches your config" : "";
    console.log(`  ${c.id}  (${c.type})  ${c.title || c.username || ""}${match}`);
  }
  console.log("\nUse the id above (the negative group id) as TELEGRAM_CHAT_ID.");
}
