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

  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }

  let isConnectedBefore = false;

  while (true) {
    try {
      // 1. 检查物理开关（蓝牙状态）
      const isConnected = await isBluetoothConnected(config.bluetoothDeviceName);
      
      if (!isConnected) {
        if (isConnectedBefore) {
          console.log(`💤 玩具蓝牙 [${config.bluetoothDeviceName}] 已断开或未开机。服务挂起中，彻底停止录音与 API 计费...`);
          isConnectedBefore = false;
        }
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

      // 4. 大模型流式脑请求与声音异步合成流水线 (极速响应)
      console.log('🧠 开启大模型流式响应与本地音频合成流水线...');
      
      const audioQueue = []; // 音频文件播放队列
      let isLlmDone = false;  // 大模型流式输出完毕的标志
      let sentenceIndex = 0;  // 句子序号计数

      // 播放队列的消费者服务 (在后台运行，按顺序依次播放)
      const playQueueConsumer = async () => {
        while (audioQueue.length > 0 || !isLlmDone) {
          if (audioQueue.length > 0) {
            const nextAudioWav = audioQueue.shift();
            console.log(`🔊 [播放中] 播放分句语音: ${path.basename(nextAudioWav)}`);
            try {
              // 阻塞播放完这一句
              await player.playAudioFile(nextAudioWav);
            } catch (e) {
              console.error('播音异常:', e.message);
            } finally {
              // 播放完后立即销毁本地 MP3 缓存，保持本地空间干净
              try { fs.unlinkSync(nextAudioWav); } catch (e) {}
            }
          } else {
            // 如果队列空了，但大模型还没有全部生成完毕，则小憩 100 毫秒等候下一个切片
            await new Promise(r => setTimeout(r, 100));
          }
        }
        console.log('✅ 音频播放消费队列全部执行完毕。');
      };

      // 异步开启播放消费线程 (非阻塞)
      const playPromise = playQueueConsumer();

      // 本地主线程：开始从大模型流式拉取断好的句子，并立即交给本地 GPT-SoVITS 转换
      try {
        // asycn generator 异步迭代大模型吐出的句子
        for await (const sentence of llm.askLLMStream(userText)) {
          const idx = ++sentenceIndex;
          console.log(`⚡ 收到大模型分句 [${idx}]: "${sentence}"`);
          
          // 对这句分句立即进行 GPT-SoVITS 合成，一旦合成成功，立刻塞进待播放队列里
          const wavName = `reply-chunk-${Date.now()}-${idx}.wav`;
          console.log(`🎙️ 声音克隆合成中 [${idx}]...`);
          const replyWavPath = await tts.textToSpeech(sentence, wavName);
          console.log(`📦 [合成成功] 已入列等待播放 [${idx}]`);
          
          audioQueue.push(replyWavPath);
        }
      } catch (err) {
        console.error('大模型流式输出或声音合成中断：', err.message);
      } finally {
        isLlmDone = true; // 大模型完全停止输出，标记生产者结束
      }

      // 等待最后一句话播放完成，整个对话闭环才算结束
      await playPromise;

      // 清理本次录音临时 wav
      try { fs.unlinkSync(wavPath); } catch (e) {}

    } catch (error) {
      console.error('💔 本轮对话发生异常，将在 3 秒后重试...', error.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

mainLoop();
