const player = require('play-sound')({});
const path = require('path');
const fs = require('fs');

function playAudioFile(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`要播放的音频文件不存在: ${filePath}`));
    }

    // play-sound 库在 Mac 下会默认使用 afplay，afplay 是系统内置的音频流播放工具
    player.play(filePath, (err) => {
      if (err) {
        console.error('播放音频失败，错误：', err);
        return reject(err);
      }
      resolve();
    });
  });
}

module.exports = {
  playAudioFile
};
