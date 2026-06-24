const OWM_BASE = 'https://api.openweathermap.org';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const key = process.env.OWM_API_KEY;
  if (!key) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Weather API key not configured.' }) };

  const { type, lat, lon, city } = event.queryStringParameters || {};

  try {
    let url;
    if (type === 'geo' && city) {
      url = `${OWM_BASE}/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${key}`;
    } else if (type === 'current' && lat && lon) {
      url = `${OWM_BASE}/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${key}&units=metric`;
    } else if (type === 'forecast' && lat && lon) {
      url = `${OWM_BASE}/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${key}&units=metric`;
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid parameters.' }) };
    }

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) return { statusCode: res.status, headers, body: JSON.stringify({ error: data.message || 'OWM error' }) };

    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Failed to reach weather service.' }) };
  }
};
