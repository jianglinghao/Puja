const record = require('node-record-lpcm16');
const fs = require('fs');
const path = require('path');
const config = require('./config');

function startAudioRecord(outputWavName = 'input.wav') {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(config.tempDir, outputWavName);
    if (!fs.existsSync(config.tempDir)) {
      fs.mkdirSync(config.tempDir, { recursive: true });
    }

    const fileStream = fs.createWriteStream(outputPath, { encoding: 'binary' });

    // 开始捕获音频输入
    // 使用 16000Hz 采样率, 16bit, 单声道 (这是 Whisper 语音转文字的标准最优格式)
    const recording = record.record({
      sampleRate: 16000,
      threshold: 0,
      verbose: false,
      recordProgram: 'rec', // Mac 下配合 brew install sox 使用系统内置编译的 rec 命令
      silence: '2.0',       // 2.0 秒静音则判定说话结束，自动切断录音并保存
    });

    recording.stream().pipe(fileStream);
    console.log('🗣️ 玩具小熊正在倾听中...（请开始说话，说完后请安静）');

    fileStream.on('finish', () => {
      console.log('🤫 听到您说完啦，录音完成。');
      resolve(outputPath);
    });

    fileStream.on('error', (err) => {
      console.error('录音出错啦，请检查是否安装了 sox (brew install sox) 或系统录音权限。');
      reject(err);
    });
  });
}

module.exports = {
  startAudioRecord
};
