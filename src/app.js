const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const recorder = require('./recorder');
const asr = require('./asr');
const llm = require('./llm');
const tts = require('./tts');
const player = require('./player');
const config = require('./config');

// 检查指定的蓝牙设备当前是否已连接到 Mac
function isBluetoothConnected(deviceName) {
  return new Promise((resolve) => {
    // 匹配蓝牙设备信息块中的 "Connected: Yes"
    const cmd = `system_profiler SPBluetoothDataType | grep -A 10 "${deviceName}" | grep "Connected: Yes"`;
    exec(cmd, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

async function mainLoop() {
  console.log('================================================');
  console.log('🧸 智能玩具熊本地 Node.js 伴侣进程已运行...');
  console.log(`📡 监听玩具蓝牙名称: "${config.bluetoothDeviceName}"`);
  console.log('================================================');

  // 确保临时目录存在
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }

  let isConnectedBefore = false;

  while (true) {
    try {
      // 1. 检查物理开关（蓝牙连接状态）
      const isConnected = await isBluetoothConnected(config.bluetoothDeviceName);
      
      if (!isConnected) {
        if (isConnectedBefore || chatHistoryResetNeeded()) {
          console.log(`💤 玩具蓝牙 [${config.bluetoothDeviceName}] 已断开或未开机。服务挂起中，彻底停止录音与 API 计费...`);
          isConnectedBefore = false;
        }
        // 蓝牙未连上，每 3 秒检测一次，彻底阻断后续的录音和大模型流程
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      if (!isConnectedBefore) {
        console.log(`✨ 玩具蓝牙 [${config.bluetoothDeviceName}] 已连上电脑！`);
        console.log('🤖 唤醒成功，开始监听玩具的麦克风输入...');
        isConnectedBefore = true;
      }

      // 2. 只有连接成功才执行录音 (静音 2s 自动停止)
      const wavPath = await recorder.startAudioRecord('input.wav');
      
      // 3. 识别文字 (ASR)
      console.log('⏳ 正在进行本地语音识别...');
      const userText = await asr.speechToText(wavPath);
      
      if (!userText || userText.length < 2) {
        console.log('💨 没听清，或者只是杂音，继续睡觉...');
        try { fs.unlinkSync(wavPath); } catch (e) {}
        continue;
      }
      console.log(`💬 孩子说: "${userText}"`);

      // 4. 大模型回复 (LLM)
      console.log('🧠 正在请求大模型头脑...');
      const replyText = await llm.askLLM(userText);
      console.log(`🤖 小熊回复文本: "${replyText}"`);

      // 5. 本地声音克隆 (TTS)
      console.log('🎙️ 正在进行本地声音克隆合成...');
      const replyWavPath = await tts.textToSpeech(replyText, 'reply.wav');

      // 6. 播音 (Player)
      console.log('🔊 小熊正在说话...');
      await player.playAudioFile(replyWavPath);

      // 7. 清理本地产生的临时音频缓存
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

// 辅助：重置会话标志，玩具关机后重新开机可以视为一次新会话
function chatHistoryResetNeeded() {
  // 如果需要每次玩具重新开机就重置聊天上下文，可以在这里编写重置内存逻辑
  return true;
}

mainLoop();
