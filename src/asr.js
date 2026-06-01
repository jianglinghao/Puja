const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const config = require('./config');

function speechToText(wavFilePath) {
  return new Promise((resolve, reject) => {
    // 兼容 CMake 在不同平台下的二进制输出路径 (build/bin/main 或 bin/main)
    const mainPath1 = path.join(config.whisperPath, 'build/bin/main');
    const mainPath2 = path.join(config.whisperPath, 'bin/main');
    const whisperMain = fs.existsSync(mainPath1) ? mainPath1 : mainPath2;
    
    const modelPath = path.join(config.whisperPath, 'models/ggml-tiny.bin');
    
    if (!fs.existsSync(whisperMain)) {
      return reject(new Error(`未找到 whisper.cpp 可执行二进制文件，请确认是否已编译。路径: ${whisperMain}`));
    }
    if (!fs.existsSync(modelPath)) {
      return reject(new Error(`未找到 ggml-tiny.bin 模型文件，请检查路径: ${modelPath}`));
    }

    // 执行 whisper.cpp 命令行，用 tiny 中文模式 (-l zh)，并且不打印 C++ debug 信息 (-nt)
    const cmd = `"${whisperMain}" -m "${modelPath}" -f "${wavFilePath}" -l zh -nt`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      // whisper 命令行会将识别文本输出到 stdout，过滤掉时间戳
      const result = stdout.trim()
        .replace(/\[\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\]/g, '') // 过滤时间戳 [00:00:00.000 --> 00:00:03.000]
        .replace(/\n/g, '')
        .trim();
      resolve(result);
    });
  });
}

module.exports = {
  speechToText
};
