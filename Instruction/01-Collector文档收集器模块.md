# Collector 文档收集器模块

## 模块概述

Collector（文档收集器）是一个独立的 Express.js 微服务，运行在端口 `8888`，专门负责接收和处理各种格式的文档文件，将其转换为可用于嵌入（embedding）和向量化的标准文本格式。

## 目录结构

```
collector/
├── index.js                 # 服务入口文件
├── package.json             # 依赖配置
├── nodemon.json             # 开发热重载配置
├── .env.example             # 环境变量模板
├── extensions/              # 扩展数据源集成
│   ├── index.js             # 扩展路由注册
│   └── resync/              # 重新同步功能
├── hotdir/                  # 热目录（文件自动处理）
├── middleware/              # 中间件
│   ├── httpLogger.js        # HTTP 请求日志
│   ├── setDataSigner.js     # 数据签名设置
│   └── verifyIntegrity.js   # 请求完整性验证
├── processLink/             # 链接处理
│   ├── index.js             # 链接处理入口
│   ├── convert/             # 链接内容转换
│   └── helpers/             # 辅助工具
├── processRawText/          # 原始文本处理
│   └── index.js
├── processSingleFile/       # 单文件处理
│   ├── index.js             # 文件处理入口
│   └── convert/             # 各格式转换器
├── storage/                 # 本地存储目录
└── utils/                   # 工具函数库
```

## 核心 API 端点

### POST `/process`
- **功能**: 处理单个文件并生成文档向量
- **中间件**: `verifyPayloadIntegrity`（验证请求完整性）
- **参数**:
  - `filename`: 待处理的文件名
  - `options`: 处理选项（可选）
  - `metadata`: 文档元数据（可选）
- **返回**: `{ filename, success, reason, documents }`

### POST `/parse`
- **功能**: 仅解析文件内容（不生成向量）
- **参数**:
  - `filename`: 待处理的文件名
  - `options`: 处理选项，支持 `parseOnly` 和 `absolutePath`
- **返回**: `{ filename, success, reason, documents }`

### POST `/process-link`
- **功能**: 处理网页链接，抓取内容并转为文档
- **参数**:
  - `link`: 目标 URL
  - `scraperHeaders`: 自定义抓取请求头（可选）
  - `metadata`: 文档元数据（可选）
- **返回**: `{ url, success, reason, documents }`

### POST `/process-raw-text`
- **功能**: 处理原始文本内容
- **参数**:
  - `textContent`: 文本内容
  - `metadata`: 文档元数据（需包含 `title`）
- **返回**: `{ filename, success, reason, documents }`

### POST `/util/get-link`
- **功能**: 获取链接的纯文本内容
- **参数**:
  - `link`: 目标 URL
  - `captureAs`: 捕获格式，默认为 `text`
- **返回**: `{ url, success, content }`

### GET `/accepts`
- **功能**: 返回支持的 MIME 类型列表

## 支持的文件格式转换器

位于 `processSingleFile/convert/` 目录下：

| 转换器 | 说明 |
|--------|------|
| `asPDF` | PDF 文档解析（含自定义 PDFLoader） |
| `asDocx` | Word 文档解析 |
| `asTxt` | 纯文本文件 |
| `asXlsx` | Excel 表格解析 |
| `asEPub` | 电子书解析 |
| `asMbox` | 邮箱归档文件解析 |
| `asOfficeMime` | 其他 Office 格式 |
| `asAudio` | 音频文件（通过 Whisper 转录） |
| `asImage` | 图片文件（通过 OCR 识别） |

## 扩展数据源（Extensions）

位于 `utils/extensions/` 目录下，支持从外部数据源导入文档：

| 扩展 | 说明 |
|------|------|
| `Confluence` | Atlassian Confluence 文档 |
| `DrupalWiki` | Drupal Wiki 页面 |
| `ObsidianVault` | Obsidian 笔记库 |
| `PaperlessNgx` | Paperless-ngx 文档管理系统 |
| `RepoLoader` | 代码仓库加载（GitHub / GitLab） |
| `WebsiteDepth` | 网站深度爬取 |
| `YoutubeTranscript` | YouTube 视频字幕提取 |

## 工具函数库（Utils）

| 工具 | 说明 |
|------|------|
| `comKey` | 通信密钥管理 |
| `downloadURIToFile` | 下载远程文件到本地 |
| `EncryptionWorker` | 加密工作器 |
| `files` | 文件系统操作工具 |
| `http` | HTTP 请求工具 |
| `logger` | 日志记录器（Winston） |
| `OCRLoader` | OCR 光学字符识别（Tesseract.js） |
| `runtimeSettings` | 运行时设置管理 |
| `tokenizer` | 文本分词器（tiktoken） |
| `url` | URL 解析工具 |
| `WhisperProviders` | 语音转文字（本地 Whisper / OpenAI Whisper） |

## 关键依赖

- **langchain**: 文档加载和处理链
- **pdf-parse**: PDF 文件解析
- **mammoth**: Word 文档解析
- **puppeteer**: 网页爬取和渲染
- **tesseract.js**: OCR 文字识别
- **sharp**: 图片处理
- **openai**: OpenAI Whisper 语音转文字
- **youtube-transcript-plus**: YouTube 字幕获取

## 安全机制

- 所有 API 端点使用 `verifyPayloadIntegrity` 中间件验证请求完整性
- 文件路径使用 `path.normalize` 并过滤目录遍历攻击（`../`）
- 文件大小限制为 3GB
- 服务启动时自动清理 collector 存储目录
