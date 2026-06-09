# Frontend 前端模块

## 模块概述

Frontend 是项目的用户界面层，基于 React 18 + Vite 构建的单页应用（SPA），运行在端口 `3000`。它提供了工作空间管理、聊天交互、Agent 配置、系统管理、SKILL Store 等完整的可视化界面。

## 目录结构

```
frontend/
├── index.html            # HTML 入口
├── package.json          # 依赖配置
├── vite.config.js        # Vite 构建配置
├── tailwind.config.js    # Tailwind CSS 配置
├── postcss.config.js     # PostCSS 配置
├── .env.example          # 环境变量模板
├── public/               # 静态资源
│   ├── favicon.ico
│   ├── manifest.json     # PWA 清单
│   ├── embed/            # 嵌入组件资源
│   ├── fonts/            # 字体文件
│   └── service-workers/  # Service Worker
├── scripts/
│   └── postbuild.js      # 构建后处理脚本
└── src/
    ├── App.jsx           # 根组件
    ├── main.jsx          # 应用入口
    ├── index.css         # 全局样式
    ├── i18n.js           # 国际化配置
    ├── AuthContext.jsx   # 认证上下文
    ├── ThemeContext.jsx  # 主题上下文
    ├── LogoContext.jsx   # Logo 上下文
    ├── PfpContext.jsx    # 头像上下文
    ├── PWAContext.jsx    # PWA 模式上下文
    ├── EmbeddingProgressContext.jsx  # 嵌入进度上下文
    ├── components/       # 通用组件库
    ├── hooks/            # 自定义 Hooks
    ├── locales/          # 国际化翻译文件
    ├── media/            # 媒体资源
    ├── models/           # API 数据模型层
    ├── pages/            # 页面组件
    └── utils/            # 工具函数
```

## 应用架构

### 根组件 (App.jsx)

应用通过多层 Context Provider 包裹实现全局状态管理：

```
ErrorBoundary          → 错误边界
  └─ ThemeProvider     → 主题管理（暗色/亮色）
    └─ PWAModeProvider → PWA 模式检测
      └─ Suspense      → 懒加载兜底
        └─ AuthProvider → 用户认证
          └─ LogoProvider → 自定义 Logo
            └─ PfpProvider → 用户头像
              └─ I18nextProvider → 国际化
                └─ Outlet + 全局组件
```

### 全局组件

- `ToastContainer`: 全局提示信息
- `KeyboardShortcutsHelp`: 快捷键帮助
- `ImageLightbox`: 图片灯箱预览

## 页面路由结构

### 主要页面模块

| 模块 | 路径 | 说明 |
|------|------|------|
| `Main` | `/` | 主页面/工作空间列表 |
| `WorkspaceChat` | `/workspace/:slug` | 工作空间聊天界面 |
| `WorkspaceSettings` | `/workspace/:slug/settings` | 工作空间设置 |
| `Login` | `/login` | 登录页面 |
| `Invite` | `/invite/:code` | 邀请注册页面 |
| `OnboardingFlow` | `/onboarding` | 首次设置引导流程 |
| `404` | `*` | 404 页面 |

### 管理员页面 (Admin)

| 页面 | 说明 |
|------|------|
| `Admin/Agents` | Agent 配置和技能管理 |
| `Admin/AgentBuilder` | Agent 工作流可视化构建器 |
| `Admin/Users` | 用户管理 |
| `Admin/Workspaces` | 工作空间管理 |
| `Admin/Invitations` | 邀请码管理 |
| `Admin/Logging` | 事件日志查看 |
| `Admin/DefaultSystemPrompt` | 默认系统提示词 |
| `Admin/SystemPromptVariables` | 系统提示词变量 |
| `Admin/ExperimentalFeatures` | 实验性功能开关 |

### 通用设置页面 (GeneralSettings)

| 页面 | 说明 |
|------|------|
| `LLMPreference` | LLM 提供者配置 |
| `EmbeddingPreference` | 嵌入模型配置 |
| `VectorDatabase` | 向量数据库配置 |
| `EmbeddingTextSplitterPreference` | 文本分割偏好 |
| `TranscriptionPreference` | 转录偏好 |
| `AudioPreference` | 语音偏好（STT/TTS） |
| `ApiKeys` | API 密钥管理 |
| `Security` | 安全设置 |
| `Settings` | 外观/品牌/界面设置 |
| `PrivacyAndData` | 隐私和数据设置 |
| `Chats` | 聊天记录管理 |
| `ChatEmbedWidgets` | 嵌入式聊天组件 |
| `BrowserExtensionApiKey` | 浏览器扩展密钥 |
| `MobileConnections` | 移动设备连接 |
| `ModelRouters` | 模型路由管理 |
| `ScheduledJobs` | 定时任务管理 |
| `CommunityHub` | 社区中心/SKILL Store |
| `Connections/TelegramBot` | Telegram Bot 连接 |

### 工作空间设置页面 (WorkspaceSettings)

| 页面 | 说明 |
|------|------|
| `GeneralAppearance` | 外观、名称、建议消息 |
| `ChatSettings` | 聊天设置（模式、温度、历史等） |
| `VectorDatabase` | 向量数据库设置 |
| `Members` | 成员管理 |
| `AgentConfig` | Agent 配置 |

## SKILL Store 前端实现

### Store 列表页面

**路由**: `/settings/community-hub/skills`  
**文件**: `src/pages/GeneralSettings/CommunityHub/SkillStore/index.jsx`

**功能**:
- 拖拽或点击上传 `.zip` 格式的 skill 包
- 搜索已有 skill（按标题、名称、描述、标签过滤）
- 以卡片形式展示所有 skill，显示：
  - 封面图片
  - 标题、版本、描述
  - 作者和更新时间
  - 标签
  - 文件数量和验证状态
  - 来源类型和安装状态
- 支持直接安装包含 `plugin.json` 和 `handler.js` 的 skill
- 上传成功后自动跳转到详情页

### Skill 详情页面

**路由**: `/settings/community-hub/skills/:slug`  
**文件**: `src/pages/GeneralSettings/CommunityHub/SkillDetail/index.jsx`

**功能**:
- 渲染 `SKILL.md` 的 Markdown 内容
- 显示封面图片
- 展示验证信息区块（错误和警告）
- 展示元数据（slug、名称、版本、作者、更新时间、来源、Agent Bridge 状态）
- 文件列表（文件名 + 大小）
- 安装按钮（直接安装到 Agent 插件系统）
- Agent 移交按钮（调用后端存根端点）
- 安装状态和时间显示

## API 数据模型层

**文件**: `src/models/skillStore.js`

封装了与 SKILL Store 后端 API 的通信：

| 方法 | HTTP 请求 | 说明 |
|------|-----------|------|
| `SkillStore.list()` | GET `/api/skills/store` | 获取所有 skill 列表 |
| `SkillStore.get(slug)` | GET `/api/skills/store/:slug` | 获取 skill 详情 |
| `SkillStore.install(slug)` | POST `/api/skills/store/install` | 安装 skill |
| `SkillStore.upload(file)` | POST `/api/skills/store/upload` | 上传 zip 包 |
| `SkillStore.handoffToAgentImporter(slug)` | POST `/api/skills/store/agent-handoff` | Agent 移交 |

## 技术栈详情

### UI 框架和库

- **React 18**: 核心 UI 框架
- **React Router DOM v6**: 客户端路由
- **Tailwind CSS**: 原子化 CSS 样式
- **@phosphor-icons/react**: 图标库
- **@tremor/react**: 数据可视化组件
- **react-toastify**: 提示消息
- **react-dropzone**: 文件拖放上传
- **react-beautiful-dnd**: 拖放排序
- **react-tooltip**: 工具提示

### Markdown 渲染

- **markdown-it**: Markdown 解析
- **highlight.js**: 代码高亮
- **katex**: 数学公式渲染
- **dompurify**: HTML 净化（防 XSS）

### 国际化

- **i18next**: 国际化框架
- **react-i18next**: React 绑定
- **i18next-browser-languagedetector**: 浏览器语言检测

### 其他

- **recharts**: 图表组件
- **uuid**: UUID 生成
- **moment**: 时间处理
- **file-saver**: 文件下载
- **qrcode.react**: 二维码生成

## 构建配置

### Vite 配置

- 插件: `@vitejs/plugin-react`
- 开发服务器: 端口 3000，支持 0.0.0.0 访问
- 构建输出: 通过 `postbuild.js` 脚本进行后处理

### Tailwind CSS

- 使用自定义主题色变量系统
- 支持暗色/亮色主题切换

### PWA 支持

- 提供 `manifest.json` 和 Service Worker
- 支持 PWA 模式安装
