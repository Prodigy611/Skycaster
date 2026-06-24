const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Key missing.' }) };

  let w;
  try {
    w = JSON.parse(event.body || '{}').weather;
    if (!w) throw new Error();
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Bad request.' }) };
  }

  // SHORT prompt — saves tokens on every request
  const prompt = `Weather: ${w.description}, ${w.temp}°C feels ${w.feelsLike}°C, humidity ${w.humidity}%, wind ${w.wind}km/h, vis ${w.visibility}km. Location: ${w.name}, ${w.country}.
Return JSON array of 6 activities. Each: {emoji,title,description,tag}. title=max 5 words. description=1 sentence. tag=Outdoor|Indoor|Social|Wellness|Food|Creative. JSON only, no markdown.`;

  try {
    const res = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, headers, body: JSON.stringify({ error: data.error?.message || 'Gemini error' }) };

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const activities = JSON.parse(raw.replace(/```json|```/g, '').trim());

    return { statusCode: 200, headers, body: JSON.stringify({ activities }) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Gemini unreachable.' }) };
  }
};
