const functions = require('@google-cloud/functions-framework');
const { GoogleGenerativeAI } = require('@google/generative-ai');

functions.http('geminiProxy', async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { messages, systemPrompt } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request: messages array required' });
    }

    // Get API key from environment (stored securely in Cloud Run)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Initialize Gemini with secure API key
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-pro-latest'
    });

    // Format messages for Gemini
    const formattedMessages = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Build system prompt
    const systemMsg = systemPrompt || 'You are a helpful AI assistant for geolocation analysis.';

    // Call Gemini API
    const chat = model.startChat({
      history: formattedMessages.slice(0, -1),
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.7,
      }
    });

    const response = await chat.sendMessage(formattedMessages[formattedMessages.length - 1].parts[0].text);
    const responseText = response.response.text();

    res.json({ 
      success: true,
      text: responseText,
      usedGemini: true 
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ 
      error: 'Failed to process request',
      details: error.message 
    });
  }
});
