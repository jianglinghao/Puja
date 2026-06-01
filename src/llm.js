const { OpenAI } = require('openai');
const config = require('./config');
const memory = require('./memory');

const openai = new OpenAI({
  apiKey: config.llm.apiKey,
  baseURL: config.llm.baseUrl
});

// 使用异步生成器函数实现流式大模型调用与即时断句
async function* askLLMStream(text) {
  const messages = memory.buildMessages(text);
  
  try {
    const responseStream = await openai.chat.completions.create({
      model: config.llm.model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 150,
      stream: true // 开启 API 的流式输出模式
    });
    
    let buffer = '';
    let fullReply = '';
    
    // 正则表达式：识别中文中常见的断句标点（，。！？；… \n）以及英文标点（,!?）
    // 遇到这些符号，立刻将缓冲池中的字符切割为一句，传导给 TTS 模块合成
    const sentenceEndings = /[，。！？；…\n,!?]/;

    for await (const chunk of responseStream) {
      const content = chunk.choices[0]?.delta?.content || '';
      buffer += content;
      fullReply += content;

      // 检查当前缓冲池里是否包含断句标点
      const match = buffer.match(sentenceEndings);
      if (match) {
        const index = match.index + 1; // 截取位置包含标点符号本身
        const sentence = buffer.substring(0, index).trim();
        buffer = buffer.substring(index); // 剩下的内容留给下一句

        if (sentence.length > 0) {
          yield sentence; // 即时产出断好的一句话
        }
      }
    }

    // 处理大模型输出结束时，缓冲池内可能残余的半截句子
    if (buffer.trim().length > 0) {
      yield buffer.trim();
    }

    // 整个对话输出完成后，一次性更新短期记忆上下文
    memory.appendHistory(text, fullReply);

  } catch (error) {
    console.error('LLM 流式请求异常：', error.message);
    throw error;
  }
}

module.exports = {
  askLLMStream
};
