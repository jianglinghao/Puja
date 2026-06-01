const { OpenAI } = require('openai');
const config = require('./config');
const memory = require('./memory');

const openai = new OpenAI({
  apiKey: config.llm.apiKey,
  baseURL: config.llm.baseUrl
});

async function askLLM(text) {
  const messages = memory.buildMessages(text);
  
  try {
    const completion = await openai.chat.completions.create({
      model: config.llm.model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 150
    });
    
    const reply = completion.choices[0].message.content.trim();
    // 写入短期记忆上下文
    memory.appendHistory(text, reply);
    return reply;
  } catch (error) {
    console.error('LLM 请求错误：', error);
    throw error;
  }
}

module.exports = {
  askLLM
};
