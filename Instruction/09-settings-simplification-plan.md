# 设置页精简与后续拆除计划

日期：2026-06-10

## 当前目标

先把设置页精简成 Skill 开发骨架，降低界面干扰。

本次只执行第一档：隐藏侧边栏入口，不删除页面、路由、后端接口或依赖。

## 第一档：已执行

修改文件：

- `frontend/src/components/SettingsSidebar/index.jsx`

实现方式：

- 新增 `SKILL_DEV_SIDEBAR_MODE = true`
- 使用现有 `MenuOption.hidden` 能力隐藏非核心菜单项
- 没有删除路由、页面、模型、接口、数据库或依赖

当前侧边栏保留入口：

- AI Providers
  - LLM
- Admin
  - Workspaces
  - Workspace Chats
  - Default System Prompt
- Agent Skills
- Community Hub
  - SKILL Store
- Customization
  - Chat
- Tools
  - Event Logs

当前侧边栏隐藏入口：

- AI Providers
  - Vector Database
  - Embedder
  - Text Splitting
  - Voice & Speech
  - Transcription
  - Model Router
- Admin
  - Users
  - Invites
- Community Hub
  - Trending
  - Your Account
  - Import Item
- Customization
  - Interface
  - Branding
- Channels
  - Telegram
- Tools
  - Embed Chat Widgets
  - Scheduled Jobs
  - API Keys
  - System Prompt Variables
  - Browser Extension
  - Mobile App
- Security
- Experimental Features
- Sidebar footer links
  - Contact Support
  - Privacy
  - Version link

## 第二档：隐藏入口 + 禁用路由

目标：用户即使知道 URL，也不能直接访问被移除的设置页面。

建议单独开分支执行，例如：

```text
feature/settings-route-pruning
```

主要修改点：

- `frontend/src/main.jsx`
  - 删除或重定向被隐藏设置页的 route
  - 推荐先重定向到 `/settings/community-hub/skills` 或返回 404
- `frontend/src/utils/paths.js`
  - 第二档可以先保留 path helper
  - 只有确认没有内部引用后再删除 helper
- `frontend/src/components/SettingsSidebar/index.jsx`
  - 继续保留第一档的隐藏入口

第二档建议禁用的路由：

- `/settings/vector-database`
- `/settings/embedding-preference`
- `/settings/text-splitter-preference`
- `/settings/audio-preference`
- `/settings/transcription-preference`
- `/settings/model-routers`
- `/settings/model-routers/:id`
- `/settings/users`
- `/settings/invites`
- `/settings/community-hub/trending`
- `/settings/community-hub/authentication`
- `/settings/community-hub/import-item`
- `/settings/interface`
- `/settings/branding`
- `/settings/external-connections/telegram`
- `/settings/embed-chat-widgets`
- `/settings/scheduled-jobs`
- `/settings/scheduled-jobs/:id/runs`
- `/settings/scheduled-jobs/:id/runs/:runId`
- `/settings/api-keys`
- `/settings/system-prompt-variables`
- `/settings/browser-extension`
- `/settings/mobile-connections`
- `/settings/security`
- `/settings/privacy`
- `/settings/beta-features`
- `/settings/beta-features/live-document-sync/manage`

第二档保留路由：

- `/settings/llm-preference`
- `/settings/agents`
- `/settings/community-hub/skills`
- `/settings/community-hub/skills/:slug`
- `/settings/community-hub/skills/:slug/chat`
- `/settings/event-logs`
- `/settings/workspaces`
- `/settings/workspace-chats`
- `/settings/default-system-prompt`
- `/settings/chat`

第二档执行前检查：

```text
rg "paths.settings.vectorDatabase|paths.settings.embeddingPreference|paths.settings.modelRouters" frontend/src
rg "/settings/vector-database|/settings/model-routers|/settings/api-keys" frontend/src
```

第二档验收：

- 侧边栏只显示第一档保留入口
- 被禁用 URL 不能直接打开
- LLM 设置可以保存
- SKILL Store 可以打开
- Skill 详情页可以打开
- Skill 可以批准并启用
- 单 Skill 对话页可以打开
- Event Logs 可以查看 skill 日志
- 主对话仍能正常打开工作区

## 第三档：删除页面、接口、模型和依赖

目标：真正把不需要的功能代码从项目中移除。

建议不要一次性全删。按功能域拆成多个小 PR，每个 PR 都能独立启动和验证。

### 3.1 前端页面删除候选

可删除页面目录或文件：

- `frontend/src/pages/GeneralSettings/VectorDatabase`
- `frontend/src/pages/GeneralSettings/EmbeddingPreference`
- `frontend/src/pages/GeneralSettings/EmbeddingTextSplitterPreference`
- `frontend/src/pages/GeneralSettings/AudioPreference`
- `frontend/src/pages/GeneralSettings/TranscriptionPreference`
- `frontend/src/pages/GeneralSettings/ModelRouters`
- `frontend/src/pages/GeneralSettings/CommunityHub/Trending`
- `frontend/src/pages/GeneralSettings/CommunityHub/Authentication`
- `frontend/src/pages/GeneralSettings/CommunityHub/ImportItem`
- `frontend/src/pages/GeneralSettings/Settings/Interface`
- `frontend/src/pages/GeneralSettings/Settings/Branding`
- `frontend/src/pages/GeneralSettings/Connections/TelegramBot`
- `frontend/src/pages/GeneralSettings/ChatEmbedWidgets`
- `frontend/src/pages/GeneralSettings/ScheduledJobs`
- `frontend/src/pages/GeneralSettings/ApiKeys`
- `frontend/src/pages/Admin/SystemPromptVariables`
- `frontend/src/pages/GeneralSettings/BrowserExtensionApiKey`
- `frontend/src/pages/GeneralSettings/MobileConnections`
- `frontend/src/pages/GeneralSettings/Security`
- `frontend/src/pages/GeneralSettings/PrivacyAndData`
- `frontend/src/pages/Admin/ExperimentalFeatures`
- `frontend/src/pages/Admin/Users`
- `frontend/src/pages/Admin/Invitations`

建议保留页面：

- `frontend/src/pages/GeneralSettings/LLMPreference`
- `frontend/src/pages/Admin/Agents`
- `frontend/src/pages/GeneralSettings/CommunityHub/SkillStore`
- `frontend/src/pages/GeneralSettings/CommunityHub/SkillDetail`
- `frontend/src/pages/GeneralSettings/CommunityHub/SkillChat`
- `frontend/src/pages/Admin/Logging`
- `frontend/src/pages/Admin/Workspaces`
- `frontend/src/pages/GeneralSettings/Chats`
- `frontend/src/pages/Admin/DefaultSystemPrompt`
- `frontend/src/pages/GeneralSettings/Settings/Chat`

### 3.2 前端模型、组件和 hooks 清理候选

删除页面后再用 `rg` 查引用，确认是否能删：

- `frontend/src/models/communityHub.js`
- `frontend/src/hooks/useCommunityHubAuth.js`
- `frontend/src/components/CommunityHub`
- `frontend/src/models/agentFlows.js`
- `frontend/src/models/telegram.js`
- `frontend/src/models/mobile.js`
- `frontend/src/models/systemPromptVariables.js`
- `frontend/src/models/utils/dmrUtils.js`
- `frontend/src/models/utils/lemonadeUtils.js`

注意：

- `SkillStore` 使用的是 `frontend/src/models/skillStore.js`，不要删。
- 如果仍保留原 Community Hub 的导入/发布功能，就不能删 `communityHub.js` 和 `components/CommunityHub`。
- 如果只保留本地 SKILL Store，可以考虑后续移除通用 Community Hub 相关代码。

### 3.3 后端接口删除候选

删除前必须确认前端和主流程无引用：

- `server/endpoints/communityHub.js`
  - 仅当不再需要原官方 Community Hub 导入/发布功能时删除
  - 不要删除 `server/endpoints/skillStore.js`
- `server/endpoints/telegram.js`
- `server/endpoints/scheduledJobs.js`
- `server/endpoints/experimental`
- `server/endpoints/api/admin` 中与用户、邀请、API key 强相关的部分
- `server/endpoints/agentFlows.js`
  - 仅当不再需要 Agent Builder / Agent Flows 时删除

注意：

- `server/index.js` 中有 endpoints 注册，删除 endpoint 文件后要同步移除注册。
- `event_logs` 仍用于 Skill 运行日志，不要删除日志相关模型和接口。
- Agent Skills、Skill Store、Skill Chat 相关后端不要删。

### 3.4 数据库和 Prisma

第三档不建议优先删数据库表。

原因：

- 迁移回滚风险高
- 老用户本地 SQLite 可能已有表和数据
- 一些模型之间存在隐性引用

推荐策略：

- 先删 UI 和路由
- 再删后端 endpoint
- 最后确认稳定后，再考虑 Prisma schema 精简

### 3.5 package 依赖清理

删除页面和后端模块后，再检查依赖。

建议流程：

```text
rg "<package-name>" frontend server collector
yarn why <package-name>
```

不要直接靠直觉删依赖，尤其是：

- vector db provider
- embedding provider
- speech/transcription provider
- scheduled jobs
- mobile/telegram connector

这些依赖可能被后端动态加载。

## 第三档验收清单

每删一个功能域，都跑一遍：

- 项目能启动
- 登录/初始化流程可用
- LLM 设置可用
- Workspace Chat 可用
- Agent Skills 页面可用
- SKILL Store 列表可用
- Skill zip 可导入
- Skill 详情页可显示完整性、权限、环境信息
- Skill 可批准并启用
- 单 Skill Chat 可调用
- 主对话 `@agent` 可调用 Skill
- Event Logs 能看到 skill 日志
- 被删除功能的 URL 不会白屏

## 推荐推进顺序

1. 第一档：隐藏入口，本次已完成。
2. 第二档：禁用路由，做一个单独 PR。
3. 第三档第一批：删除原 Community Hub 非 Skill 页面。
4. 第三档第二批：删除外部渠道、移动端、浏览器扩展、定时任务。
5. 第三档第三批：删除多用户管理、邀请、安全、隐私页面。
6. 第三档第四批：清理未引用模型、组件、locale 和依赖。
