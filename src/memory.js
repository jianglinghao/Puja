const fs = require('fs');
const path = require('path');

// 短期会话历史 (内存中)
let chatHistory = [];
const MAX_HISTORY = 10;

// 读取本地长期记忆
function getSystemPrompt() {
  const profilePath = path.join(__dirname, 'user_profile.json');
  let profile = { userName: '小朋友', favoriteToy: '小熊', pet: '猫咪' };
  try {
    profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  } catch (e) {
    console.warn('读取 user_profile.json 失败，将使用默认配置。');
  }

  return `你是一只名叫波波的玩具熊，是小主人最好的朋友。你今年只有3岁。
你的小主人名字叫 ${profile.userName}。他最喜欢的玩具是 ${profile.favoriteToy}，他家里养了一只叫 ${profile.pet} 的宠物。
请用极其温柔、童趣、活泼的声音和语气回答，多使用叠词（例如：抱抱、乖乖、开心哦），每句话字数严格控制在30字以内。
在聊天时可以适当提起他的喜好和宠物。`;
}

// 组装大模型输入
function buildMessages(newText) {
  const systemPrompt = getSystemPrompt();
  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: newText }
  ];
  return messages;
}

// 追加记忆
function appendHistory(userText, assistantText) {
  chatHistory.push({ role: 'user', content: userText });
  chatHistory.push({ role: 'assistant', content: assistantText });
  // 保持历史限制
  if (chatHistory.length > MAX_HISTORY * 2) {
    chatHistory = chatHistory.slice(-MAX_HISTORY * 2);
  }
}

module.exports = {
  buildMessages,
  appendHistory
};
