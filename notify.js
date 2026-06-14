// api/notify.js — Telegram notification proxy
// Required Vercel env vars: TG_BOT_TOKEN, TG_CHAT_ID

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET health check
  if (req.method === 'GET') {
    const token  = process.env.TG_BOT_TOKEN;
    const chatId = process.env.TG_CHAT_ID;
    return res.status(200).json({
      status: 'ok',
      tg_token_set:    !!token,
      tg_chat_id_set:  !!chatId,
      tg_token_preview: token  ? token.slice(0,8)+'...' : null,
      tg_chat_preview:  chatId || null,
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token  = process.env.TG_BOT_TOKEN;
  const chatId = process.env.TG_CHAT_ID;

  if (!token)  return res.status(500).json({ error: 'TG_BOT_TOKEN not set in Vercel env' });
  if (!chatId) return res.status(500).json({ error: 'TG_CHAT_ID not set in Vercel env' });

  const { text, parse_mode } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });

  try {
    const tgRes = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4096),
        parse_mode: parse_mode || 'Markdown'
      })
    });
    const data = await tgRes.json();
    if (!data.ok) return res.status(400).json({ ok: false, error: data.description, error_code: data.error_code });
    return res.status(200).json({ ok: true });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
