// ═══ api/notify.js — Капитал Мастера ═══
// Отправляет уведомление мастеру в Telegram при новой записи.
// Переменные окружения в Vercel: TG_BOT_TOKEN, TG_CHAT_ID.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Только POST' });
  }

  const token  = process.env.TG_BOT_TOKEN;
  const chatId = process.env.TG_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({
      ok: false,
      error: 'Не заданы TG_BOT_TOKEN или TG_CHAT_ID в переменных окружения Vercel'
    });
  }

  // Тело запроса может прийти строкой — на всякий случай разбираем сами.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const text       = (body && body.text) || '';
  const parse_mode = (body && body.parse_mode) || undefined;

  if (!text) {
    return res.status(400).json({ ok: false, error: 'Пустой текст сообщения' });
  }

  try {
    const tgRes = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: parse_mode })
    });
    const data = await tgRes.json();

    if (!data.ok) {
      // Telegram сам объясняет причину: "chat not found", "bot was blocked" и т.п.
      return res.status(502).json({ ok: false, error: 'Telegram отклонил сообщение', telegram: data });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Сбой запроса к Telegram', detail: String(e) });
  }
}
