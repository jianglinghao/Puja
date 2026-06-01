const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { UniversalEdgeTTS } = require('edge-tts-universal');
const config = require('./config');

// 统一的 TTS 合成外观接口
async function textToSpeech(text, outputWavName = 'reply.wav') {
  const outputPath = path.join(config.tempDir, outputWavName);
  
  // 确保临时目录存在
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }

  // 根据 .env 配置的引擎进行智能分流
  if (config.ttsEngine === 'edge') {
    return runEdgeTTS(text, outputPath);
  } else {
    return runSoVitsTTS(text, outputPath);
  }
}

// 引擎 1：调用微软免 Key 在线 Edge-TTS 合成
async function runEdgeTTS(text, outputPath) {
  try {
    console.log(`🤖 [TTS-Edge] 正在使用微软 Edge-TTS [${config.edgeTtsVoice}] 进行语音合成...`);
    
    // 初始化微软 edge tts 客户端
    const tts = new UniversalEdgeTTS(text, config.edgeTtsVoice);
    
    // 合成并获得音频二进制 buffer
    const arrayBuffer = await tts.synthesize();
    const buffer = Buffer.from(arrayBuffer);
    
    // 将二进制写入本地临时 wav/mp3 路径
    fs.writeFileSync(outputPath, buffer);
    
    return outputPath;
  } catch (error) {
    console.error('❌ [TTS-Edge] 语音合成失败，请检查网络连接：', error.message);
    throw error;
  }
}

// 引擎 2：调用本地 GPT-SoVITS 端口合成您的声音
async function runSoVitsTTS(text, outputPath) {
  try {
    console.log(`🎙️ [TTS-SoVITS] 正在调用本地 GPT-SoVITS 服务进行您的声音克隆...`);
    
    const response = await axios({
      method: 'get',
      url: `${config.sovitsApiUrl}`,
      params: {
        text: text,
        text_language: 'zh'
      },
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(outputPath));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('❌ [TTS-SoVITS] 本地 SoVITS 推理失败，请检查 9880 端口是否正常开启：', error.message);
    // 如果 SoVITS 失败，做一层体验上的退级：自动降级为微软 Edge-TTS 备用，保证玩具不会卡死
    console.warn('⚠️ [TTS-SoVITS] 自动降级切换为备用 Edge-TTS 进行紧急播放...');
    return runEdgeTTS(text, outputPath);
  }
}

module.exports = {
  textToSpeech
};
