export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'DEEPSEEK_API_KEY не добавлен в Vercel Settings' });

  const { messages, system } = req.body || {};
  if (!messages) return res.status(400).json({ error: 'messages required' });

  const fullMessages = [];
  if (system) fullMessages.push({ role: 'system', content: system });
  (messages || []).forEach(m => {
    if (m.role && m.content) fullMessages.push({ role: m.role, content: String(m.content).slice(0, 2000) });
  });

  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 600,
        messages: fullMessages
      })
    });

    const raw = await r.text();
    let data;
    try { data = JSON.parse(raw); } catch(e) {
      return res.status(500).json({ error: 'DeepSeek вернул не JSON: ' + raw.slice(0, 200) });
    }

    if (!r.ok) {
      // Return full error so we can debug
      const errMsg = data?.error?.message || data?.error?.code || JSON.stringify(data);
      return res.status(r.status).json({ error: errMsg });
    }

    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content: [{ type: 'text', text }] });

  } catch(e) {
    return res.status(500).json({ error: 'Fetch failed: ' + e.message });
  }
}
