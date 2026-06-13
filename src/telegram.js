import { config } from "./config.js";

const API = "https://api.telegram.org/bot";

async function callApi(method, body) {
  const res = await fetch(`${API}${config.telegramToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.error_code} ${data.description}`);
  }
  return data.result;
}

/** Escape text for Telegram's HTML parse mode. */
export function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Send a message to the configured group. `text` may contain Telegram HTML. */
export async function sendMessage(text, { chatId = config.telegramChatId } = {}) {
  return callApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

/**
 * Helper for first-time setup: lists recent chats that have messaged the bot,
 * so you can find your group's chat id. Send any message in the group first.
 */
export async function getUpdates() {
  return callApi("getUpdates", {});
}
