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
  if (!geminiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Gemini API key not configured.' }) };

  let weather;
  try {
    const body = JSON.parse(event.body || '{}');
    weather = body.weather;
    if (!weather) throw new Error('Missing weather data');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  const prompt = `Current weather in ${weather.name}, ${weather.country}:
- Condition: ${weather.description}
- Temperature: ${weather.temp}°C (feels like ${weather.feelsLike}°C)
- Humidity: ${weather.humidity}%
- Wind: ${weather.wind} km/h
- Visibility: ${weather.visibility} km

Suggest exactly 6 activities suited to these conditions. Return ONLY a valid JSON array, no markdown. Each object must have:
- emoji (single emoji)
- title (max 5 words)
- description (1-2 sentences tied to the weather)
- tag (one of: Outdoor | Indoor | Social | Wellness | Food | Creative)`;

  try {
    const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
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
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to reach Gemini service.' }) };
  }
};
