const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// 调用 GPT-SoVITS 的一键推理 API 渲染声音
async function textToSpeech(text, outputWavName = 'reply.wav') {
  const outputPath = path.join(config.tempDir, outputWavName);
  
  // 确保临时目录存在
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }

  try {
    // GPT-SoVITS 默认的双端推理 API (通常本地推理接口为 http://127.0.0.1:9880)
    // 默认请求参数：text_language=zh, text=合成文本
    // 可以在这里直接使用 axios 发起流式 GET 请求并管道 pipe 下载到本地
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
    console.error('GPT-SoVITS 本地 TTS 合成异常，请检查接口是否开启。错误：', error.message);
    throw error;
  }
}

module.exports = {
  textToSpeech
};
