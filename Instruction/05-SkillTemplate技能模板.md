# Skill Template 技能模板

## 模块概述

`skill-template/` 目录提供了一个标准的非 MCP 技能包模板，供团队成员快速创建新的 skill 包。该模板与 SKILL Store 的本地上传流程完全兼容，复制并修改后即可打包上传。

## 目录结构

```
skill-template/
└── standard-non-mcp-skill/
    ├── SKILL.md        # 技能描述文档（必须）
    ├── skill.json      # 元数据配置
    ├── plugin.json     # Agent 插件清单
    ├── handler.js      # 执行逻辑入口
    └── cover.svg       # 封面图片
```

## 各文件详解

### SKILL.md

技能的核心描述文档，也是 SKILL Store 详情页中渲染的主要内容。使用标准 Markdown 格式编写。

**建议内容结构**:
1. 标题 — 说明技能要做什么
2. 功能描述 — 描述技能解决的任务
3. 工作流程 — 说明 Agent 的预期执行步骤
4. 决策规则 — 描述执行中的判断逻辑
5. 示例提示词 — 列出可触发此技能的提示词模式
6. 打包注意事项 — 文件命名等提醒

**注意**: 如果重命名此文件，需要同步更新 `skill.json` 中的 `entryFile` 字段。

### skill.json

技能的元数据配置文件，定义了在 SKILL Store 中展示的基本信息。

```json
{
  "slug": "example-local-skill",
  "name": "example-local-skill",
  "title": "Example Local Skill",
  "description": "A starter template for the local non-MCP SKILL Store upload flow.",
  "summary": "Copy this folder, replace placeholders, then zip it for upload.",
  "author": "Your Team",
  "authorUrl": "",
  "version": "0.1.0",
  "tags": ["template", "local", "non-mcp"],
  "featured": false,
  "updatedAt": "2026-05-31T00:00:00.000Z",
  "coverImage": "cover.svg",
  "entryFile": "SKILL.md",
  "sourcePath": "local-template://standard-non-mcp-skill"
}
```

**字段说明**:
- `slug` / `name`: 唯一标识符，上传时会自动去重
- `title`: 在 Store 卡片和详情页显示的标题
- `description`: 详细描述，显示在 Store 卡片中
- `summary`: 简短摘要
- `author` / `authorUrl`: 作者信息
- `version`: 版本号（语义化版本）
- `tags`: 标签数组，用于分类和搜索
- `featured`: 是否标记为推荐
- `coverImage`: 封面图片文件名
- `entryFile`: 入口文档文件名
- `sourcePath`: 来源标识

### plugin.json

Agent 插件清单文件，定义了技能被安装到 Agent 系统后的行为。

```json
{
  "hubId": "example-local-skill",
  "name": "example-local-skill",
  "active": false,
  "description": "Starter plugin manifest for a local non-MCP skill package.",
  "setup_args": {},
  "entrypoint": {
    "params": {
      "input": {
        "type": "string",
        "description": "Primary input for this skill."
      }
    }
  },
  "examples": [
    {
      "prompt": "Run the example local skill",
      "call": "{\"input\":\"example\"}"
    }
  ]
}
```

**字段说明**:
- `hubId`: 关联的 SKILL Store slug
- `name`: 插件名称
- `active`: 安装后默认不激活
- `description`: 插件描述
- `setup_args`: 安装时所需的配置参数（当前为空）
- `entrypoint.params`: 技能的输入参数定义
- `examples`: 示例调用，帮助 Agent 理解何时调用此技能

### handler.js

技能的执行逻辑入口，导出一个 `runtime` 对象，包含 `execute` 异步函数。

```javascript
module.exports.runtime = {
  execute: async function ({ input = "" }) {
    return {
      success: true,
      output: `Example local skill received: ${input}`,
    };
  },
};
```

**接口规范**:
- 必须导出 `module.exports.runtime.execute`
- `execute` 函数接收一个参数对象，键名对应 `plugin.json` 中的 `entrypoint.params`
- 返回值必须包含 `success` (boolean) 和 `output` (string)

### cover.svg

封面图片，支持格式: `png`, `jpg`, `jpeg`, `webp`, `svg`。在 SKILL Store 卡片和详情页中显示。

## 使用工作流

### 步骤 1: 复制模板

```bash
cp -r skill-template/standard-non-mcp-skill my-new-skill
```

### 步骤 2: 替换占位符

修改以下文件中的内容：
- `SKILL.md` — 编写技能的实际描述
- `skill.json` — 更新元数据（slug、title、description 等）
- `plugin.json` — 定义实际的参数和示例
- `handler.js` — 实现实际的执行逻辑

### 步骤 3: 打包为 zip

**使用提供的 PowerShell 脚本**:

```powershell
# 默认打包模板目录
powershell -ExecutionPolicy Bypass -File .\build-skill-zip.ps1

# 自定义输入输出路径
powershell -ExecutionPolicy Bypass -File .\build-skill-zip.ps1 -Source .\my-new-skill -Output .\skill-template\dist\my-new-skill.zip
```

**手动打包**:

将文件夹内容压缩为 `.zip` 文件即可。

### 步骤 4: 上传到 SKILL Store

1. 启动开发环境（`start-dev.bat`）
2. 在浏览器中打开 `/settings/community-hub/skills`
3. 将 zip 文件拖入上传区域或点击选择文件
4. 系统自动验证并生成详情页面

## build-skill-zip.ps1 脚本说明

打包脚本的功能：
1. 接收 `-Source`（源文件夹路径）和 `-Output`（输出 zip 路径）参数
2. 自动创建输出目录（如果不存在）
3. 如果目标 zip 已存在则先删除
4. 使用 `Compress-Archive` 命令打包
5. 输出生成的 zip 文件路径

默认值：
- Source: `.\skill-template\standard-non-mcp-skill`
- Output: `.\skill-template\dist\standard-non-mcp-skill.zip`

## 当前限制

- 上传器目前仅支持非 MCP skills
- `SKILL.md` 是必填项
- `cover.svg` 可选但建议提供
- `plugin.json` 和 `handler.js` 在预览时可选，但安装时必需
- 不支持直接拖拽文件夹上传，必须先打包为 zip
