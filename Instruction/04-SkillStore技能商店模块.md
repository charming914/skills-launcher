# SKILL Store 技能商店模块

## 模块概述

SKILL Store 是本项目的核心扩展功能，提供一个本地化的技能包管理系统。团队成员可以通过上传 zip 压缩包将非 MCP 技能包添加到本地商店中，系统会自动验证包结构、生成详情页面，并支持将技能安装到 Agent 插件系统中。

## 当前设计目标

- 支持非 MCP skill 的 zip 包拖入上传
- 自动验证包文件结构
- 持久化保存至本地存储
- 立即生成并打开详细页面
- Agent 导入功能故意留为存根，供其他团队成员后续集成

## 完整流程

### 上传流程

```
用户上传 .zip 文件
    │
    ▼
前端 SkillStore.upload(file)
    │ POST /api/skills/store/upload (FormData)
    ▼
后端 multer 接收文件
    │ 存入 server/storage/skill-store-uploads/
    ▼
SkillStore.ingestZipUpload()
    │
    ├─ 1. 验证文件为 .zip 格式
    ├─ 2. 安全解压到 skill-store-staging/<uuid>/
    ├─ 3. 自动展平单层顶层文件夹（detectContentRoot）
    ├─ 4. 读取 skill.json（若存在）
    ├─ 5. 标准化元数据（normalizeMetadata）
    ├─ 6. 执行验证（buildValidation）
    ├─ 7. 若验证失败 → 返回错误
    ├─ 8. 复制到 skill-store/<slug>/
    ├─ 9. 写入标准化 skill.json
    └─ 10. 清理临时文件
    │
    ▼
返回 { success, slug, skill }
    │
    ▼
前端自动跳转到详情页 /settings/community-hub/skills/<slug>
```

### 安装流程

```
用户点击「Install」按钮
    │
    ▼
前端 SkillStore.install(slug)
    │ POST /api/skills/store/install
    ▼
后端 SkillStore.install(slug)
    │
    ├─ 1. 验证 skill 存在
    ├─ 2. 检查 plugin.json 和 handler.js 文件存在
    ├─ 3. 复制文件到 server/storage/plugins/agent-skills/<slug>/
    ├─ 4. 更新 plugin.json（添加 hubId、installedAt、设置 active=false）
    └─ 5. 返回更新后的 skill 信息
```

### Agent 移交流程（存根）

```
用户点击「Hand off to Agent importer」按钮
    │
    ▼
前端 SkillStore.handoffToAgentImporter(slug)
    │ POST /api/skills/store/agent-handoff
    ▼
后端 SkillStore.handoffToAgentImporter(slug)
    │
    └─ 返回存根 payload（不执行实际导入）
       包含: slug, title, sourceType, sourcePath,
             entryFile, files, validation, detailRoute
```

## API 端点详情

### GET `/api/skills/store`
- **权限**: 需要管理员身份
- **功能**: 获取所有已发布 skill 的摘要列表
- **响应**: `{ success: true, skills: [...] }`

### GET `/api/skills/store/:slug`
- **权限**: 需要管理员身份
- **功能**: 获取指定 skill 的完整详情
- **响应**: `{ success: true, skill: {...} }`

### GET `/api/skills/store/:slug/assets/:filename`
- **权限**: 需要管理员身份
- **功能**: 获取 skill 包内的静态资源文件（如封面图片）
- **响应**: 文件内容
- **安全**: 验证路径不超出 store 根目录

### POST `/api/skills/store/upload`
- **权限**: 需要管理员身份
- **功能**: 上传 skill zip 包
- **请求体**: `multipart/form-data`，字段名 `file`
- **响应**: `{ success: true, slug, skill }`

### POST `/api/skills/store/install`
- **权限**: 需要管理员身份
- **功能**: 安装指定 skill 到 Agent 插件系统
- **请求体**: `{ slug }`
- **响应**: `{ success: true, skill }`

### POST `/api/skills/store/agent-handoff`
- **权限**: 需要管理员身份
- **功能**: 调用 Agent 导入移交存根
- **请求体**: `{ slug }`
- **响应**: `{ success: true, stub: true, message, payload }`

## 包结构规范

### 最低要求

```
my-skill/
└── SKILL.md          # 必须，技能描述文档
```

### 推荐完整结构

```
my-skill/
├── SKILL.md          # 必须 - 技能描述文档
├── skill.json        # 可选 - 元数据配置
├── plugin.json       # 可选 - Agent 插件清单（安装时必需）
├── handler.js        # 可选 - 执行逻辑入口（安装时必需）
└── cover.png/jpg/svg # 可选 - 封面图片
```

### skill.json 元数据字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `slug` | string | 唯一标识符（自动生成/去重） |
| `name` | string | 技能名称 |
| `title` | string | 显示标题 |
| `description` | string | 详细描述 |
| `summary` | string | 简短摘要 |
| `author` | string | 作者 |
| `authorUrl` | string | 作者链接 |
| `version` | string | 版本号 |
| `tags` | string[] | 标签数组 |
| `featured` | boolean | 是否推荐 |
| `updatedAt` | string | 更新时间 |
| `uploadedAt` | string | 上传时间 |
| `coverImage` | string | 封面图片文件名 |
| `entryFile` | string | 入口文件名（默认 `SKILL.md`） |
| `sourcePath` | string | 来源路径 |
| `sourceType` | string | 来源类型（`uploaded-zip` / `seeded`） |
| `validation` | object | 验证结果 |
| `agentBridge` | object | Agent 桥接状态 |

### plugin.json 插件清单

```json
{
  "hubId": "skill-slug",
  "name": "skill-name",
  "active": false,
  "description": "技能描述",
  "setup_args": {},
  "entrypoint": {
    "params": {
      "input": {
        "type": "string",
        "description": "参数描述"
      }
    }
  },
  "examples": [
    {
      "prompt": "使用示例提示",
      "call": "{\"input\":\"example\"}"
    }
  ]
}
```

### handler.js 执行入口

```javascript
module.exports.runtime = {
  execute: async function ({ input = "" }) {
    return {
      success: true,
      output: `处理结果: ${input}`,
    };
  },
};
```

## 验证规则

### 错误（阻止上传）

1. 缺少必需的入口文件（`SKILL.md` 或配置的 `entryFile`）
2. 检测到 MCP 相关文件（文件名包含 `mcp` 或以 `.mcp.json` 结尾）

### 警告（允许上传但提示）

1. `skill.json` 中没有 `description` 字段
2. 没有找到封面图片（`cover.png/jpg/jpeg/webp/svg`）
3. Agent 导入文件不完整（缺少 `plugin.json` 或 `handler.js`）

### 验证结果结构

```json
{
  "valid": true,
  "schemaVersion": "local-skill-store/v2",
  "mode": "preview-only",
  "errors": [],
  "warnings": [],
  "capabilities": {
    "hasEntryFile": true,
    "hasCoverImage": true,
    "hasAgentFiles": true,
    "containsMcp": false
  }
}
```

## 存储目录说明

| 目录 | 说明 |
|------|------|
| `server/storage/skill-store/` | 已发布的 skill 包（每个 skill 一个子文件夹） |
| `server/storage/skill-store-uploads/` | 上传的 zip 临时存放（处理后删除） |
| `server/storage/skill-store-staging/` | zip 解压暂存区（处理后删除） |
| `server/storage/plugins/agent-skills/` | 已安装的 Agent 技能插件 |

## 安全措施

1. **路径遍历防护**: 使用 `isWithin()` 验证所有文件路径不超出预期目录
2. **Zip 炸弹防护**: 解压前逐条验证 zip entry 的目标路径
3. **文件类型限制**: 仅接受 `.zip` 格式上传
4. **权限控制**: 所有端点需要管理员身份验证
5. **临时文件清理**: 在 finally 块中确保清理上传和暂存文件

## 预置测试 Skills

当前已有的示例 skill 包（位于 `server/storage/skill-store/`）：

- `imagegen` — 图片生成
- `openai-docs` — OpenAI 文档
- `skill-installer` — 技能安装器

## 团队协作建议

### 对接 Agent 导入功能

负责 Agent 导入的团队成员应：

1. **保持路由不变**: `POST /api/skills/store/agent-handoff`
2. **保持返回格式兼容**: 继续返回类似结构的 payload
3. **仅替换存根内部逻辑**: 在 `SkillStore.handoffToAgentImporter(slug)` 内部调用最终的 Agent 导入服务

这样可以保证前端不受后端桥接变更的影响。
