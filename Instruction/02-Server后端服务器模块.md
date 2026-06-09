# Server 后端服务器模块

## 模块概述

Server 是项目的核心后端服务，基于 Express.js 构建，运行在端口 `3001`。它负责处理所有的业务逻辑，包括用户认证、工作空间管理、聊天处理、Agent 技能调度、向量数据库交互、SKILL Store 管理等。

## 目录结构

```
server/
├── index.js              # 服务入口文件
├── package.json          # 依赖配置
├── nodemon.json          # 开发热重载配置
├── .env.example          # 环境变量模板
├── endpoints/            # API 端点路由
├── models/               # 数据模型层
├── prisma/               # 数据库 Schema 和迁移
│   ├── schema.prisma     # Prisma 数据模型定义
│   ├── seed.js           # 种子数据
│   └── migrations/       # 数据库迁移文件
├── jobs/                 # 后台任务
├── middleware/           # 中间件
├── storage/              # 本地存储
│   ├── assets/           # 静态资源
│   └── models/           # 模型相关存储
├── swagger/              # API 文档
└── utils/                # 工具函数库
```

## API 端点总览

Server 通过 `/api` 前缀暴露所有 API 端点：

### 核心业务端点

| 端点模块 | 文件 | 功能说明 |
|----------|------|----------|
| `system` | `system.js` | 系统设置、状态检查、认证 |
| `workspaces` | `workspaces.js` | 工作空间的 CRUD |
| `workspaceThreads` | `workspaceThreads.js` | 工作空间内的对话线程管理 |
| `chat` | `chat.js` | 聊天消息处理和流式响应 |
| `document` | `document.js` | 文档管理和上传 |
| `admin` | `admin.js` | 管理员操作 |
| `invite` | `invite.js` | 用户邀请管理 |
| `memory` | `memory.js` | 记忆管理（长期对话记忆） |

### Agent 相关端点

| 端点模块 | 文件 | 功能说明 |
|----------|------|----------|
| `agentWebsocket` | `agentWebsocket.js` | Agent WebSocket 通信 |
| `agentSkillWhitelist` | `agentSkillWhitelist.js` | Agent 技能白名单管理 |
| `agentFileServer` | `agentFileServer.js` | Agent 文件服务器 |
| `agentFlows` | `agentFlows.js` | Agent 工作流管理 |
| `mcpServers` | `mcpServers.js` | MCP 服务器管理 |

### SKILL Store 端点

| 端点模块 | 文件 | 功能说明 |
|----------|------|----------|
| `skillStore` | `skillStore.js` | 技能商店的上传、列表、详情、安装、移交 |

### 集成和扩展端点

| 端点模块 | 文件 | 功能说明 |
|----------|------|----------|
| `communityHub` | `communityHub.js` | 社区中心 |
| `browserExtension` | `browserExtension.js` | 浏览器扩展 API |
| `telegram` | `telegram.js` | Telegram Bot 集成 |
| `webPush` | `webPush.js` | Web Push 通知 |
| `mobile` | `mobile.js` | 移动设备连接 |
| `embedManagement` | `embedManagement.js` | 嵌入式聊天组件管理 |
| `modelRouter` | `modelRouter.js` | 模型路由管理 |
| `scheduledJobs` | `scheduledJobs.js` | 定时任务管理 |

### 开发者 API

| 端点模块 | 文件 | 功能说明 |
|----------|------|----------|
| `api/` | `api/` | 面向开发者的外部 API |
| `experimental/` | `experimental/` | 实验性功能端点 |
| `extensions/` | `extensions/` | 扩展功能端点 |

## 数据模型（Prisma Schema）

### 数据库

使用 SQLite 作为默认数据库（支持切换到 PostgreSQL），通过 Prisma ORM 管理。

### 核心数据表

| 模型 | 说明 |
|------|------|
| `users` | 用户表，含用户名、密码、角色、配额等 |
| `workspaces` | 工作空间，含 LLM 配置、系统提示词、向量搜索模式等 |
| `workspace_documents` | 工作空间关联的文档 |
| `workspace_chats` | 聊天记录 |
| `workspace_threads` | 对话线程 |
| `workspace_agent_invocations` | Agent 调用记录 |
| `workspace_users` | 工作空间-用户关联 |
| `workspace_parsed_files` | 工作空间已解析文件 |

### 系统管理表

| 模型 | 说明 |
|------|------|
| `system_settings` | 系统设置键值对 |
| `api_keys` | API 密钥 |
| `invites` | 邀请码 |
| `event_logs` | 事件日志 |
| `cache_data` | 缓存数据 |

### 嵌入和向量表

| 模型 | 说明 |
|------|------|
| `embed_configs` | 嵌入式聊天组件配置 |
| `embed_chats` | 嵌入式聊天记录 |
| `document_vectors` | 文档向量映射 |

### 扩展功能表

| 模型 | 说明 |
|------|------|
| `scheduled_jobs` | 定时任务配置 |
| `scheduled_job_runs` | 定时任务执行记录 |
| `memories` | 对话记忆存储 |
| `model_routers` | 模型路由器 |
| `model_router_rules` | 模型路由规则 |
| `document_sync_queues` | 文档同步队列 |
| `external_communication_connectors` | 外部通信连接器（Telegram等） |
| `desktop_mobile_devices` | 移动设备连接 |
| `browser_extension_api_keys` | 浏览器扩展密钥 |
| `slash_command_presets` | 斜杠命令预设 |
| `system_prompt_variables` | 系统提示词变量 |
| `prompt_history` | 提示词历史 |

## SKILL Store 模型详解

位于 `server/models/skillStore.js`，是本项目的核心扩展功能：

### 存储路径

- **Store 根目录**: `server/storage/skill-store/` — 已发布的 skill 包
- **上传目录**: `server/storage/skill-store-uploads/` — 上传临时存放
- **暂存目录**: `server/storage/skill-store-staging/` — 解压暂存区

### 核心功能

#### `SkillStore.list()`
列出所有已发布的 skill，返回摘要信息数组，按 featured 优先和标题排序。

#### `SkillStore.get(slug)`
获取指定 slug 的 skill 详细信息，包含完整内容、文件列表和安装状态。

#### `SkillStore.install(slug)`
将 skill 安装到 Agent 插件目录（`server/storage/plugins/agent-skills/`）：
1. 验证 `plugin.json` 和 `handler.js` 文件存在
2. 复制文件到插件目录
3. 写入 `hubId` 和 `installedAt` 到 plugin.json

#### `SkillStore.ingestZipUpload(uploadedFile)`
处理上传的 zip 文件：
1. 验证文件为 `.zip` 格式
2. 安全解压到暂存目录
3. 自动展平单层顶层文件夹
4. 读取并标准化 `skill.json` 元数据
5. 执行验证规则检查
6. 复制到最终 store 目录
7. 写入标准化的 `skill.json`

#### `SkillStore.handoffToAgentImporter(slug)`
Agent 导入移交存根，返回包含 skill 信息的 payload，等待团队成员实现最终的 Agent 导入逻辑。

### 验证规则

- **必须**: 存在 `SKILL.md`（或配置的 `entryFile`）
- **阻止**: 包含 MCP 相关文件（如 `*.mcp.json`）
- **警告**: 无描述信息、无封面图、缺少 Agent 导入文件

## 后台任务（Jobs）

| 任务 | 说明 |
|------|------|
| `embedding-worker.js` | 嵌入向量工作器 |
| `extract-memories.js` | 记忆提取 |
| `sync-watched-documents.js` | 同步监视的文档 |
| `cleanup-generated-files.js` | 清理生成的文件 |
| `cleanup-orphan-documents.js` | 清理孤儿文档 |
| `handle-telegram-chat.js` | 处理 Telegram 聊天 |
| `run-scheduled-job.js` | 执行定时任务 |

## 工具函数库（Utils）

| 工具模块 | 说明 |
|----------|------|
| `AiProviders/` | 多 LLM 提供者适配（OpenAI, Anthropic, Ollama 等） |
| `agents/` | Agent 核心逻辑和技能管理 |
| `agentFlows/` | Agent 工作流引擎 |
| `vectorDbProviders/` | 向量数据库适配器 |
| `EmbeddingEngines/` | 嵌入引擎适配 |
| `EmbeddingRerankers/` | 嵌入结果重排序 |
| `EmbeddingWorkerManager.js` | 嵌入工作管理器 |
| `TextSplitter/` | 文本分割器 |
| `TextToSpeech/` | 文本转语音 |
| `DocumentManager/` | 文档管理器 |
| `MCP/` | MCP 协议支持 |
| `memories/` | 记忆管理工具 |
| `middleware/` | 认证、权限等中间件 |
| `EncryptionManager/` | 加密管理 |
| `PasswordRecovery/` | 密码恢复 |
| `PushNotifications/` | 推送通知 |
| `BackgroundWorkers/` | 后台工作线程 |
| `telegramBot/` | Telegram Bot 工具 |
| `router/` | 模型路由工具 |
| `boot/` | 服务启动工具（HTTP/SSL） |
| `collectorApi/` | Collector 服务通信 |
| `database/` | 数据库工具 |
| `files/` | 文件操作工具 |
| `helpers/` | 通用辅助函数 |
| `http/` | HTTP 工具 |
| `logger/` | 日志工具 |
| `comKey/` | 通信密钥 |
| `telemetry/` | 遥测数据收集 |

## 服务启动流程

1. 加载环境变量（开发模式读取 `.env.development`）
2. 初始化日志系统
3. 配置 Express 中间件（CORS、Body Parser）
4. 根据 HTTPS 配置启动 SSL 或普通 HTTP
5. 注册所有 API 路由到 `/api` 前缀
6. 生产模式下提供前端静态文件服务
7. 开发模式下提供 VectorDB 调试路由
