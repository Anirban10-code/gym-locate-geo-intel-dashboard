const functions = require('@google-cloud/functions-framework');
const fetch = require('node-fetch');

functions.http('placesApiProxy', async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { endpoint, params } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: 'endpoint parameter required' });
    }

    // Get API key from environment (stored securely)
    const apiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Construct URL safely
    const url = new URL(`https://places.googleapis.com/${endpoint}`);
    url.searchParams.append('key', apiKey);
    
    // Add user params (whitelist allowed params for security)
    const allowedParams = ['query', 'location', 'radius', 'type', 'region', 'language'];
    Object.keys(params || {}).forEach(key => {
      if (allowedParams.includes(key)) {
        url.searchParams.append(key, params[key]);
      }
    });

    console.log(`Calling Places API: ${endpoint}`);

    // Call Google Places API
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Places API error:', data);
      return res.status(response.status).json(data);
    }

    res.json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('Places API Proxy Error:', error);
    res.status(500).json({ 
      error: 'Failed to call Places API',
      details: error.message 
    });
  }
});
