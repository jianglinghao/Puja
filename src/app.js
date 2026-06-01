const path = require('path');
const fs = require('fs');
const recorder = require('./recorder');
const asr = require('./asr');
const llm = require('./llm');
const tts = require('./tts');
const player = require('./player');
const config = require('./config');

async function mainLoop() {
  console.log('================================================');
  console.log('🧸 智能玩具熊本地 Node.js 伴侣进程已运行...');
  console.log('笔记本盖子已可闭合，请保持玩具蓝牙连接。');
  console.log('================================================');

  // 确保临时目录存在
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }

  while (true) {
    try {
      // 1. 录音
      const wavPath = await recorder.startAudioRecord('input.wav');
      
      // 2. 识别文字
      console.log('⏳ 正在进行本地语音识别...');
      const userText = await asr.speechToText(wavPath);
      
      if (!userText || userText.length < 2) {
        console.log('💨 没听清，或者音量太低，小熊继续睡觉...');
        try {
          fs.unlinkSync(wavPath);
        } catch (e) {}
        continue;
      }
      console.log(`💬 孩子说: "${userText}"`);

      // 3. 大模型回复
      console.log('🧠 正在请求大模型头脑...');
      const replyText = await llm.askLLM(userText);
      console.log(`🤖 小熊回复文本: "${replyText}"`);

      // 4. 本地声音克隆
      console.log('🎙️ 正在进行本地声音克隆合成...');
      const replyWavPath = await tts.textToSpeech(replyText, 'reply.wav');

      // 5. 播音
      console.log('🔊 小熊正在说话...');
      await player.playAudioFile(replyWavPath);

      // 清理本次产生的临时 wav，保持硬盘空间
      try {
        fs.unlinkSync(wavPath);
        fs.unlinkSync(replyWavPath);
      } catch (e) {}

    } catch (error) {
      console.error('💔 本轮对话发生异常，将在 3 秒后重试...', error.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

mainLoop();
