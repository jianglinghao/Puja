const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

module.exports = {
  llm: {
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL,
    model: process.env.LLM_MODEL,
  },
  sovitsApiUrl: process.env.SOVITS_API_URL || 'http://127.0.0.1:9880',
  whisperPath: process.env.WHISPER_PATH || path.join(__dirname, '../whisper.cpp'),
  tempDir: path.join(__dirname, '../temp')
};
