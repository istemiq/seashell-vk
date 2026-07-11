/**
 * Send admin notifications via Telegram Bot API.
 * Recipients: only TELEGRAM_STATS_CHAT_IDS (not PREMIUM_USER_IDS).
 */

export function parseChatIdList(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  return [
    ...new Set(
      s
        .split(/[,;\s]+/)
        .map((p) => parseInt(p, 10))
        .filter((n) => Number.isFinite(n)),
    ),
  ];
}

export function resolveStatsChatIds() {
  return parseChatIdList(process.env.TELEGRAM_STATS_CHAT_IDS);
}

/**
 * @param {{ token: string, chatId: number, text: string, disableNotification?: boolean, retries?: number }} opts
 */
export async function sendTelegramMessage({
  token,
  chatId,
  text,
  disableNotification = false,
  retries = 2,
}) {
  const botToken = String(token ?? '').trim();
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is not set');

  const body = {
    chat_id: chatId,
    text: String(text).slice(0, 4090),
    disable_notification: disableNotification,
  };

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        const desc = data?.description ?? res.statusText ?? 'Unknown error';
        throw new Error(`Telegram sendMessage failed for chat ${chatId}: ${desc}`);
      }
      return data;
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * @param {string} text
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function sendStatsToAdmins(text, { dryRun = false } = {}) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
  const chatIds = resolveStatsChatIds();

  if (!chatIds.length) {
    throw new Error(
      'No recipients: set TELEGRAM_STATS_CHAT_IDS to your Telegram user id (after /start with the bot)',
    );
  }
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
  }

  if (dryRun) {
    console.log('[dry-run] Would send to chat ids:', chatIds.join(', '));
    console.log('');
    console.log(text);
    return { sent: 0, chatIds, dryRun: true };
  }

  const errors = [];
  let sent = 0;
  for (const chatId of chatIds) {
    try {
      await sendTelegramMessage({ token, chatId, text });
      sent += 1;
      console.log(`[telegram] sent to ${chatId}`);
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      console.error(e);
    }
  }

  if (!sent) {
    throw new Error(errors.join('; ') || 'Failed to send to all chats');
  }

  return { sent, chatIds, errors };
}
