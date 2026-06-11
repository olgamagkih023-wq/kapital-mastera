// api/chat.js — DeepSeek proxy for Капитал Мастера
// Deploy: upload this file to api/chat.js in GitHub repo
// Env var required: DEEPSEEK_API_KEY

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Check API key
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('DEEPSEEK_API_KEY not set');
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  const { messages, system } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Build full messages array
  const fullMessages = [];
  if (system) fullMessages.push({ role: 'system', content: system });
  messages.forEach(function(m) {
    if (m.role && m.content) fullMessages.push({ role: m.role, content: m.content });
  });

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 800,
        temperature: 0.7,
        messages: fullMessages
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('DeepSeek error:', data);
      return res.status(400).json({ error: data.error?.message || 'DeepSeek API error' });
    }

    const text = data.choices?.[0]?.message?.content || '';
    // Return in format that client expects
    return res.status(200).json({
      content: [{ type: 'text', text: text }]
    });

  } catch (e) {
    console.error('Fetch error:', e);
    return res.status(500).json({ error: 'Ошибка соединения: ' + e.message });
  }
}
