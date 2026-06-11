// Vercel Serverless Function — Telegram notification proxy
// Token stored in Vercel Environment Variable TG_BOT_TOKEN
// Never exposed to client

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://kapital-mastera.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { return res.status(200).end(); }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  const token = process.env.TG_BOT_TOKEN;
  const chatId = process.env.TG_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({ error: 'Telegram not configured' });
  }

  const { text, parse_mode } = req.body || {};
  if (!text) { return res.status(400).json({ error: 'text required' }); }

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4096),  // Telegram limit
        parse_mode: parse_mode || 'Markdown'
      })
    });
    const data = await tgRes.json();
    return res.status(200).json({ ok: data.ok, description: data.description });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
