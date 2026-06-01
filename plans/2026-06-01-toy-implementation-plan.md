# 🧸 智能对话毛绒玩具 Node.js 服务端实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个在本地闲置笔记本电脑运行的纯 Node.js 服务，对接蓝牙玩具的音频输入/输出，实现离线/低成本的声音克隆（GPT-SoVITS）和语音转文字（Whisper.cpp），并调用云端大模型 API（DeepSeek/豆包）实现长效记忆对话。

**Architecture:** 本服务不含前端界面（Headless）。Node.js 的 `node-record-lpcm16` 捕获蓝牙麦克风输入，录制为 WAV；通过子进程调用本地 `whisper.cpp` 编译好的命令行输出文字；文字通过 `openai` SDK 传给大模型 API，并融合本地的长期记忆和内存的会话上下文；大模型的文字回复发给本地 `GPT-SoVITS` 接口克隆出您的声音 MP3；最后通过系统音频工具（Mac 下的 `afplay`）将 MP3 播回玩具。

**Tech Stack:** Node.js, `whisper.cpp` (ggml-tiny), GPT-SoVITS (本地API), `node-record-lpcm16`, `play-sound`, `dotenv`, `axios`.

---

### Task 1: 初始化项目结构与安装前置依赖

**Files:**
- Create: `/Users/mac/Desktop/toy-companion/src/package.json`
- Create: `/Users/mac/Desktop/toy-companion/.env`
- Create: `/Users/mac/Desktop/toy-companion/src/user_profile.json`

- [ ] **Step 1: 创建 `package.json` 文件**

写入 `/Users/mac/Desktop/toy-companion/src/package.json`，配置项目依赖：
```json
{
  "name": "toy-companion",
  "version": "1.0.0",
  "description": "智能毛绒玩具 Node 后端",
  "main": "app.js",
  "scripts": {
    "start": "node app.js"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "dotenv": "^16.4.5",
    "node-record-lpcm16": "^1.3.0",
    "openai": "^4.52.0",
    "play-sound": "^1.1.6"
  }
}
```

- [ ] **Step 2: 创建环境变量模板 `.env`**

写入 `/Users/mac/Desktop/toy-companion/.env`，保存 API 配置信息（以 DeepSeek 为例，用户可按需更换）：
```env
# 大模型 API 配置 (DeepSeek 或 豆包)
LLM_API_KEY=your_deepseek_api_key_here
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat

# 本地 TTS 与 ASR 路径配置
SOVITS_API_URL=http://127.0.0.1:9880
WHISPER_PATH=/Users/mac/Desktop/toy-companion/whisper.cpp
```

- [ ] **Step 3: 创建长期记忆配置文件 `user_profile.json`**

写入 `/Users/mac/Desktop/toy-companion/src/user_profile.json`：
```json
{
  "userName": "天天",
  "favoriteToy": "霸王龙",
  "pet": "小猫咪咪",
  "birthday": "10月20日"
}
```

- [ ] **Step 4: 安装 Node 依赖包**

由于全局规则要求使用 pnpm 且我们不在原工作树中，我们直接在该项目目录下运行 pnpm 安装依赖：
运行: `pnpm install` 在目录 `/Users/mac/Desktop/toy-companion/src` 下（我们会通过 Terminal 执行）。

---

### Task 2: 编译与准备本地 Whisper.cpp（语音转文字）

**Files:**
- Create: `/Users/mac/Desktop/toy-companion/whisper.cpp/` (克隆自官方仓)

- [ ] **Step 1: 克隆并编译 whisper.cpp**

在 `/Users/mac/Desktop/toy-companion` 目录下，克隆官方轻量仓库并编译：
运行: `git clone https://github.com/ggerganov/whisper.cpp.git`
运行: `cd whisper.cpp && make`
预期结果: 编译出 `main` 二进制可执行文件。

- [ ] **Step 2: 下载 whisper 中文微型 (tiny) 语音模型**

在 `whisper.cpp` 目录下，下载体积小、对配置要求低的 tiny 模型（约 75MB）：
运行: `bash ./models/download-ggml-model.sh tiny`
预期结果: 生成 `models/ggml-tiny.bin` 文件。

---

### Task 3: 编写配置管理与记忆融合模块

**Files:**
- Create: `/Users/mac/Desktop/toy-companion/src/config.js`
- Create: `/Users/mac/Desktop/toy-companion/src/memory.js`

- [ ] **Step 1: 编写 `config.js`**

用于解析环境变量：
```javascript
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

module.exports = {
  llm: {
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL,
    model: process.env.LLM_MODEL,
  },
  sovitsApiUrl: process.env.SOVITS_API_URL || 'http://127.0.0.1:9880',
  whisperPath: process.env.WHISPER_PATH || path.join(__dirname, '../whisper.cpp'),
  tempDir: path.join(__dirname, '../temp')
};
```

- [ ] **Step 2: 编写 `memory.js`**

处理短期会话（最近 10 次对话）和本地长期配置的融合：
```javascript
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
```

---

### Task 4: 编写 ASR 语音识别与 LLM 脑力请求模块

**Files:**
- Create: `/Users/mac/Desktop/toy-companion/src/asr.js`
- Create: `/Users/mac/Desktop/toy-companion/src/llm.js`

- [ ] **Step 1: 编写 `asr.js`**

调用本地 whisper.cpp 命令行解析录制的 `.wav` 声音文件：
```javascript
const { exec } = require('child_process');
const path = require('path');
const config = require('./config');

function speechToText(wavFilePath) {
  return new Promise((resolve, reject) => {
    const whisperMain = path.join(config.whisperPath, 'main');
    const modelPath = path.join(config.whisperPath, 'models/ggml-tiny.bin');
    
    // 执行 whisper.cpp 命令行，用 tiny 中文模式，并且不打印 verbose 冗余信息
    const cmd = `"${whisperMain}" -m "${modelPath}" -f "${wavFilePath}" -l zh -nt`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      // whisper 命令行会将识别文本输出到终端
      const result = stdout.trim()
        .replace(/\[\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}\]/g, '') // 过滤时间戳
        .replace(/\n/g, '')
        .trim();
      resolve(result);
    });
  });
}

module.exports = {
  speechToText
};
```

- [ ] **Step 2: 编写 `llm.js`**

利用 openai SDK 调用云端模型 API：
```javascript
const { OpenAI } = require('openai');
const config = require('./config');
const memory = require('./memory');

const openai = new OpenAI({
  apiKey: config.llm.apiKey,
  baseURL: config.llm.baseUrl
});

async function askLLM(text) {
  const messages = memory.buildMessages(text);
  
  try {
    const completion = await openai.chat.completions.create({
      model: config.llm.model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 150
    });
    
    const reply = completion.choices[0].message.content.trim();
    memory.appendHistory(text, reply);
    return reply;
  } catch (error) {
    console.error('LLM 请求错误：', error);
    throw error;
  }
}

module.exports = {
  askLLM
};
```

---

### Task 5: 编写本地 TTS 声音合成与播放模块

**Files:**
- Create: `/Users/mac/Desktop/toy-companion/src/tts.js`
- Create: `/Users/mac/Desktop/toy-companion/src/player.js`

- [ ] **Step 1: 编写 `tts.js`**

调用本地训练好的 GPT-SoVITS 服务接口（假设本地运行在 `http://127.0.0.1:9880` 端口）：
```javascript
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// 调用 GPT-SoVITS 的 API 渲染声音
async function textToSpeech(text, outputWavName = 'reply.wav') {
  const outputPath = path.join(config.tempDir, outputWavName);
  
  // 确保临时目录存在
  if (!fs.existsSync(config.tempDir)) {
    fs.mkdirSync(config.tempDir, { recursive: true });
  }

  try {
    // GPT-SoVITS 默认全套推导 API 格式。我们需要配置参考音频的路径和文字，这里按默认标准设置
    // 假设在本地配置了 API 的默认参数
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
    console.error('TTS 合成错误：', error);
    throw error;
  }
}

module.exports = {
  textToSpeech
};
```

- [ ] **Step 2: 编写 `player.js`**

调用系统本地播放器（这里使用 `play-sound` 库，Mac 下会默认调用底层的 `afplay` 命令）：
```javascript
const player = require('play-sound')({});
const path = require('path');

function playAudioFile(filePath) {
  return new Promise((resolve, reject) => {
    player.play(filePath, (err) => {
      if (err) {
        console.error('音频播放错误：', err);
        return reject(err);
      }
      resolve();
    });
  });
}

module.exports = {
  playAudioFile
};
```

---

### Task 6: 编写麦克风录音控制（静音检测）与主程序运行模块

**Files:**
- Create: `/Users/mac/Desktop/toy-companion/src/recorder.js`
- Create: `/Users/mac/Desktop/toy-companion/src/app.js`

- [ ] **Step 1: 编写 `recorder.js`**

调用 `node-record-lpcm16` 进行录音，并根据音量包大小实现静音自动裁剪：
```javascript
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
    // 使用 16000Hz 采样率, 16bit, 单声道 (Whisper.cpp 最标准的要求)
    const recording = record.record({
      sampleRate: 16000,
      threshold: 0,
      verbose: false,
      recordProgram: 'rec', // Mac/Linux 上需要通过 sox 编译的 rec 工具
      silence: '2.0', // 2 秒静音则自动停止
    });

    recording.stream().pipe(fileStream);
    console.log('🗣️ 玩具小熊正在倾听中...（请开始说话，说完后请安静）');

    fileStream.on('finish', () => {
      console.log('🤫 听到您说完啦，录音完成。');
      resolve(outputPath);
    });

    fileStream.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = {
  startAudioRecord
};
```

- [ ] **Step 2: 编写 `app.js` 主运行循环**

串联所有模块，实现不断的 录音 -> ASR -> LLM -> TTS -> 播放 的闭环循环：
```javascript
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
      console.error('💔 本轮对话发生异常，将在 3 秒后重试...', error);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

mainLoop();
```

---

### Task 7: 物理设备前置依赖安装与调试说明

**Files:**
- Create: `/Users/mac/Desktop/toy-companion/README.md`
- Create: `/Users/mac/Desktop/toy-companion/scripts/start-toy.sh`

- [ ] **Step 1: 创建运行脚本并配置运行权限**

写入 `/Users/mac/Desktop/toy-companion/scripts/start-toy.sh`，设置死循环守护：
```bash
#!/bin/bash
echo "正在启动玩具智能伴侣..."
cd /Users/mac/Desktop/toy-companion/src
while true
do
    pnpm start
    echo "主服务异常退出，3秒后自动重启..."
    sleep 3
done
```
运行: `chmod +x /Users/mac/Desktop/toy-companion/scripts/start-toy.sh`

- [ ] **Step 2: 创建项目依赖指南说明 `README.md`**

写入关于 Mac 编译 sox、配置蓝牙录音的说明：
```markdown
# 🧸 智能小熊 Node.js 服务端运行指南

## 💻 笔记本电脑前置要求 (Mac OS)

1.  **录音命令行工具 (sox)**:
    `node-record-lpcm16` 依赖底层的 `rec` 命令。Mac 下请在终端中运行：
    ```bash
    brew install sox
    ```
2.  **默认音频设备设置**:
    把毛绒玩具的蓝牙开机，并在 Mac 系统的**声音设置**中：
    *   将 **输入设备 (Input)** 设为：`毛绒玩具的蓝牙麦克风`
    *   将 **输出设备 (Output)** 设为：`毛绒玩具的蓝牙喇叭`

## ⚙️ 声音克隆 (GPT-SoVITS) 本地接口配置
本服务调用本地 `http://127.0.0.1:9880` 端口的声音克隆 API。
*   请使用克隆好的您的声音模型，并在闲置笔记本上先开启 GPT-SoVITS 的 API 模式服务。

## 🚀 启动
运行：
```bash
./scripts/start-toy.sh
```
```
