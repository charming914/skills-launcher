# SkillImporter — Skill 导入 Agent 模块

本模块实现了将 skill zip 包导入到 Agent 插件系统的完整流水线。

## 文件说明

| 文件 | 职责 |
|------|------|
| `index.js` | 编排器 `SkillImporter.run(slug, opts)` — 串联所有阶段，统一错误/回滚 |
| `schema.js` | 所有数据契约的形状定义与构造辅助函数 |
| `recognizer.js` | 解析各清单文件 → 标准化 manifest；类型判别；MCP 依赖判定 |
| `envDetector.js` | 三态环境检测（Node/Python/env vars/pip/npm） |
| `permissions.js` | 权限推导（声明 + 静态扫描 + 可选 LLM）；顶部注释写明"无运行时沙箱" |
| `conversationWriter.js` | 建工作空间线程 + 写导入报告消息，含降级 |
| `runLog.js` | skill_imports 表的读写（createRecord/updateStage/finalize/getLatestBySlug） |
| `llmEnrich.js` | 可选 LLM 识别/摘要钩子；默认关闭，失败必须降级到确定性结果 |

## 本期范围

- **支持**：仅 zip；确定性解析为主；三态环境检测；审批闸门权限模型；注册到 agent-skills（active=false）；写入对话线程；运行日志持久化
- **不支持（本期）**：自动安装缺失依赖；运行时沙箱/进程隔离；MCP 依赖型 skill；WebSocket 实时进度流

## 扩展点（TODO）

- **WebSocket 进度流**：`index.js` 各阶段调用前后可插入 `emit('stage', {stage, status})` 事件，供前端实时展示进度
- **运行时沙箱**：目前 handler.js 在主进程中以完整权限被 `require()`，未来可在 `register` 阶段引入 Worker 线程或子进程沙箱
- **自动依赖安装**：`envDetector.js` 检测到 unsatisfied pip/npm 包后可触发安装流水线（需独立审批步骤）

## 数据流

```
SkillImporter.run(slug, {workspaceId?})
  1. recognize     → SkillManifest
  2. detectEnv     → EnvResult            (failure: compatible===false → abort)
  3. resolvePerms  → PermissionRequest
  4. register      → 复用 SkillStore.install(slug)
  5. writeThread   → conversationRef | null (可降级)
  6. persistLog    → skill_imports row
  7. 返回 ImportResult
```
