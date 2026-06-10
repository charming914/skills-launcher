# SKILL Store 协作说明

## 本周目标

发布一个适合开发的本地化流程，团队成员可以在本流程中实现以下操作：

- 将非 MCP skill 的 zip 压缩包拖入 SKILL Store
- 自动验证包文件
- 持久化保存至本地存储
- 立即打开生成的详细页面

目前刻意暂未完成实际的 Agent（代理）导入的实现部分。该部分现在被隔离在一个后端存根（stub）之中，以便其他团队成员可以在不重写上传/预览流程的情况下进行整合。

## 当前已实现内容

### 前端

- Store 路由：
  - `/settings/community-hub/skills`
- 详细页面路由：
  - `/settings/community-hub/skills/:slug`
- Store 页面支持：
  - 拖拽或点击上传单个 `.zip` 文件
  - 搜索功能
  - 卡片上的验证状态展示
  - 对已包含 `plugin.json` 和 `handler.js` 的预置 skills 提供安装按钮
- 详细页面支持：
  - 渲染 `SKILL.md`
  - 封面显示
  - 验证信息区块
  - 来源元数据展示
  - 文件列表
  - 一个当前指向后端存根（stub）端点的 Agent 移交（handoff）按钮

### 后端

新增或扩展的 API：

- `GET /api/skills/store`
- `GET /api/skills/store/:slug`
- `GET /api/skills/store/:slug/assets/:filename`
- `POST /api/skills/store/upload`
- `POST /api/skills/store/agent-handoff`
- `POST /api/skills/store/install`

当前的上传流程：

1. 接收一个 `.zip` 文件
2. 存入 `server/storage/skill-store-uploads`
3. 解压到 `server/storage/skill-store-staging`
4. 自动展平单层顶层文件夹
5. 验证包内容
6. 将元数据标准化格式化到本地的 `skill.json`
7. 将包复制到 `server/storage/skill-store/<slug>`
8. 返回生成的详情 payload

## 目前支持的包结构

最低支持的包内容：

- `SKILL.md`

可选文件：

- `skill.json`
- `cover.png|jpg|jpeg|webp|svg`
- `plugin.json`
- `handler.js`

### 验证规则

必填项：

- 必须存在 `SKILL.md`，或者存在已配置的 `entryFile`

当前阻止：

- 与 MCP 相关的包
- 暂存文件列表中有明显 MCP 文件标记的任何包

当前警告：

- `skill.json` 中没有描述信息
- 无封面图片
- 缺少 Agent 导入相关文件

## 标准化后的本地元数据

持久化的 `skill.json` 现在支持以下字段：

- `slug`
- `name`
- `title`
- `description`
- `summary`
- `author`
- `authorUrl`
- `version`
- `tags`
- `featured`
- `updatedAt`
- `uploadedAt`
- `coverImage`
- `entryFile`
- `sourcePath`
- `sourceType`
- `validation`
- `agentBridge`

### 关于标准化的说明

- 如果缺少 `skill.json`，title/description 将从 `SKILL.md` 中提取生成
- slug 会依据规则自动生成并去重
- 上传的 skills 会被标记为 `sourceType: "uploaded-zip"`

## Agent 导入器的移交存根 (Handoff stub)

### 存根位置

- `server/models/skillStore.js`
- 函数：`SkillStore.handoffToAgentImporter(slug)`

### 当前行为

该函数目前不会导入任何内容。

它返回一个稳定的 payload，包含：

- `slug`
- `title`
- `sourceType`
- `sourcePath`
- `entryFile`
- `files`
- `validation`
- `detailRoute`

### 推荐的团队整合路径

负责构建 Agent 导入功能的团队成员应仅替换存根内部逻辑，而不改变路由规约。

建议的整合点：

- 保持 `POST /api/skills/store/agent-handoff` 不变
- 保持返回的格式广泛兼容
- 在 `SkillStore.handoffToAgentImporter(slug)` 内部，调用最终的 Agent 导入服务

这样可以在后端桥接不断演进的同时，保持前端不受影响。

## 现有的预置测试 skills

当前的示例文件夹：

- `server/storage/skill-store/imagegen`
- `server/storage/skill-store/openai-docs`
- `server/storage/skill-store/skill-installer`

它们仍有助于：

- store 卡片验证
- 详细页面验证
- 通过具备 Agent 导入就绪特性的预置用例进行安装按钮验证

## 标准 zip 模板

团队的模板文件现在位于：

- `skill-template/standard-non-mcp-skill`

支持文件：

- `build-skill-zip.ps1`
- `SKILL_ZIP_TEMPLATE.md`

推荐的工作流：

1. 拷贝该模板文件夹
2. 替换相应的占位符
3. 运行打包脚本
4. 在 SKILL Store 页面中上传生成的 zip 包

## 手动验证清单

1. 运行 `start-dev.bat` 开启开发环境
2. 打开 `/settings/community-hub/skills`
3. 拖入一个包含 `SKILL.md` 的非 MCP skill 的 zip 包
4. 确认出现成功提示信息 (toast)
5. 确认应用跳转到 `/settings/community-hub/skills/<generated-slug>`
6. 确认 markdown 正确渲染
7. 确认验证信息区块被正确填充
8. 点击 `Hand off to Agent importer`
9. 确认弹出了存根的提示信息 (toast)

## 重要限制

- 上传流程目前基于 zip，不支持直接从文件系统中拖拽文件夹放入
- 库 (store) 目前依然是优先采用本地及文件支持的模式
- Agent 导入桥接模块被刻意设定为未完成状态
- 当前作用域只针对非 MCP 的 skills

## 建议的下一步计划

1. 使用真正的导入器替换掉 Agent 的移交存根 (handoff stub)
2. 为上传的 `skill.json` 增加更严格的 schema 校验
3. 确定是否允许上传的 skills 覆盖已有 slug 
4. 为错误的 zip 包、缺失 `SKILL.md`，及 MCP 拒绝等情况增加测试用例
