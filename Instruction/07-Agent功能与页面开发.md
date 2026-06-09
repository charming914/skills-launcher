# 导入 Agent 功能与页面 — 开发文档

> 本文档供 VSCode 的 Claude Code 插件按其执行编程，完成「Skill 导入 Agent」功能与对应前端页面。
> 仓库根目录：`E:\Ai_Skill_launcher`（下文代码路径均相对此根目录；两个文档文件用绝对路径标注）。

---

## 0. 给执行者（Claude Code）的总则 —— 先读这一段

你将在真实仓库 `E:\Ai_Skill_launcher` 中新建程序导入部分实现的文件夹，开始编程。开始前请把下面五条铁律记牢，并贯穿全程。

**铁律 1 · 先读后写。** 本文档给出的是**目标接口与结构**，但**以现有代码为唯一事实来源**。动手前必须先阅读下列现有文件，凡本文档与实际代码不一致之处，以实际代码为准并据此调整本文档给出的接口形态：

- `server/models/skillStore.js`（核心模型，含 `ingestZipUpload`、`install`、`get`、`list`、`handoffToAgentImporter` 桩函数）
- `server/endpoints/skillStore.js`（现有路由）
- `server/utils/agents/`（自定义 agent skill 的加载与调用机制：如何 `require` `handler.js`、如何读 `plugin.json` 的 `active` 标志）
- `server/utils/middleware/`（管理员鉴权中间件，复用之）
- `server/prisma/schema.prisma`（数据模型，新增表前先看现有约定）
- 工作空间线程/聊天相关模型与工具（`workspace_threads`、`workspace_chats` 的创建方式，多半在 `server/models/` 下）
- `frontend/src/models/skillStore.js`（前端 API 封装）
- `frontend/src/pages/GeneralSettings/CommunityHub/SkillStore/index.jsx`（上传/列表页）
- `frontend/src/pages/GeneralSettings/CommunityHub/SkillDetail/index.jsx`（详情页）

**铁律 2 · 把接口调整好（桩函数收口）。** `SkillStore.handoffToAgentImporter(slug)` 目前是**桩函数**，只返回占位 payload。本期要用真实的导入流水线替换它的内部实现，但：
- **保留路由不变**：`POST /api/skills/store/agent-handoff`。
- **向后兼容**：继续返回原有字段（如 `slug, title, sourceType, sourcePath, entryFile, files, validation, detailRoute`），在其基础上**新增**字段（见 §6 / §8）。
- **前后端对齐**：新增字段要同步更新 `frontend/src/models/skillStore.js` 与详情页渲染，确保桩占位被真实数据替换、能端到端跑通，不留"前端写了字段后端没返回"或反之的悬空接口。

**铁律 3 · 严格遵守本期范围（见 §2）。** 只支持 zip；不自动安装缺失依赖；权限采用"审批闸门"（不做运行时沙箱）；不支持 MCP 依赖型 skill。范围外的能力一律不实现，只留清晰的接口缝。

**铁律 4 · 边做边记开发日志。** 每完成一个里程碑（§13），在 `E:\Ai_Skill_launcher\Instruction\2026.6.7.md` **追加**一条记录（模板见 §14）。不要等全部做完才写；这是过程日志。

**铁律 5 · 最终验收 = 前端能完整操作。** 完成后，用户在前端 `/settings/community-hub/skills` 必须能够走通完整链路：**拖入 zip → 自动导入（环境检测/权限/注册/写入对话）→ 跳转详情页查看结果 → 在详情页批准并启用**。以 §12 验收标准为准。

**安全不可妥协**：复用现有 `isWithin()` 等路径防护；所有端点走管理员鉴权；任一步失败必须清理暂存、回滚，不留半成品。

---

## 1. 背景与目标

本仓库在 AnythingLLM 基础上扩展了 SKILL Store（本地技能商店）。当前上传链路（`ingestZipUpload`）已能完成 zip 的安全解压、`skill.json` 标准化、基础验证、落库到 `server/storage/skill-store/<slug>/`。但"Agent 导入"目前是**桩函数**。

本期目标：实现一个 **Skill 导入 Agent**，在用户把 skill 的 zip 拖入前端导入区后，自动完成：

1. **识别**：判别 skill 的类型与内容，产出标准化清单（manifest）。
2. **环境检测**：检测该 skill 所需的 Node / Python / API Key / 依赖等是否满足，不满足则导入失败并报错。
3. **权限申请**：根据 skill 声明与对代码的静态扫描，生成权限申请清单，交管理员审批。
4. **注册与写入对话**：把 skill 注册到 Agent 插件系统（`agent-skills`，默认未启用），并创建一个新对话线程、写入一份导入报告。
5. **运行日志**：全程结构化记录（导入过程、解析结果、环境检测结果、权限结果、失败原因）。
6. **跳转详情页**：导入完成后前端跳转到该 skill 的详情页，展示上述全部结果。

---

## 2. 本期范围（已锁定）

**做：**

- 拖入格式：**仅 zip**。
- 识别以**确定性解析为主**（解析 `skill.json` / `SKILL.md` / `plugin.json` / `handler.js` / `package.json` / `requirements.txt`）。预留一个**可选**的 LLM 识别/摘要钩子，但**默认不依赖它**：未配置或调用失败时必须优雅降级到确定性结果，绝不能阻断导入。
- 环境检测：Node 版本、Python 版本、所需环境变量（API Key 等）是否存在；依赖包尽力检测。结果用**三态**：`satisfied` / `unsatisfied` / `unknown`。
- 权限：**审批闸门**模型 —— 导入时生成权限申请并记录；skill 注册后默认 `active=false`；管理员在详情页点"批准并启用"后才置为 `active=true`。
- 写入新对话 + 注册到 `agent-skills`。
- 运行日志持久化。

**不做（本期范围外，仅留接口缝）：**

- ❌ 自动安装缺失依赖（不执行 `pip install` / `npm install`）。只检测、只报告。
- ❌ 运行时沙箱 / 进程隔离。现有自定义 skill 的 `handler.js` 是被直接 `require` 进主进程、拥有完整权限的；本期不改变这一点，仅做"审批闸门 + 风险披露"。在权限模块顶部注释中**明确写下这一限制**。
- ❌ MCP 依赖型 skill。识别阶段若发现 skill 声明依赖 MCP（或含 MCP 文件），按现有规则视为**不受支持**并使导入失败，给出明确原因。环境检测**不检查 MCP**（标记为 `skipped`/out-of-scope）。
- ❌ WebSocket 实时进度流。本期导入端点**同步**返回完整报告即可（流水线不跑 skill、不装依赖，耗时短）。WebSocket 进度作为后续增强，仅在代码里留注释说明扩展点。

---

## 3. 现状盘点：现有代码与桩函数

执行者读完 §0 列出的文件后，应能确认以下现状（若与实际不符，以实际为准）：

- **存储目录**：已发布 skill 在 `server/storage/skill-store/<slug>/`；上传临时 `server/storage/skill-store-uploads/`；解压暂存 `server/storage/skill-store-staging/`；已安装插件 `server/storage/plugins/agent-skills/<slug>/`。
- **`SkillStore.ingestZipUpload(uploadedFile)`**：已实现 zip 校验、安全解压、单层目录展平、`skill.json` 标准化、`buildValidation` 验证、落库。**复用它**，不要重写解压与校验。
- **`SkillStore.install(slug)`**：已实现把 `plugin.json` + `handler.js` 复制到 `agent-skills/<slug>/`，并写入 `hubId` / `installedAt`、设置 `active=false`。**注册步骤复用它**。
- **`SkillStore.handoffToAgentImporter(slug)`**：**桩函数**，返回占位 payload。**本期替换其内部实现为真实导入流水线**（见 §7 / §8）。
- **现有验证规则**：缺 `SKILL.md`（或 `entryFile`）→ 错误；含 MCP 文件 → 错误；无描述/无封面/缺 `plugin.json`+`handler.js` → 警告。本期沿用，导入流水线在其之上工作。

---

## 4. 总体架构与数据流

导入 Agent 是一条编排流水线（orchestrator），它在对应阶段调用各子模块/已有能力：

```
前端拖入 zip
   │  POST /api/skills/store/upload   (沿用现有，ingestZipUpload 落库到 skill-store)
   ▼
upload 成功，拿到 slug
   │  POST /api/skills/store/agent-handoff  { slug, workspaceId? }   (本期实现的导入 Agent)
   ▼
SkillImporter.run(slug, opts)  ── 编排器
   │
   ├─ 1. recognize     解析 → 标准化 manifest（含 requirements / 类型 / 文件清单）
   │        └ 若声明 MCP 依赖 → 失败（范围外）
   ├─ 2. detectEnv     三态检测 → envResult；required 项有 unsatisfied → 失败
   ├─ 3. resolvePerms  声明 + 静态扫描(+可选 LLM) → permissionRequest(decision=pending)
   ├─ 4. register      复用 SkillStore.install(slug)，注册到 agent-skills（active=false）
   ├─ 5. writeThread   建新对话线程 + 写入导入报告消息 → conversationRef
   ├─ 6. persistLog    全程写入 skill_imports（每阶段 stage 状态/耗时/错误）
   └─ 7. 返回 importResult（含 detailRoute）
   │   任一步失败 → 标记 status=failed、写失败原因、清理暂存、不注册
   ▼
前端跳转 /settings/community-hub/skills/<slug>  详情页展示全部结果
   │
   └─ 管理员点"批准并启用"  POST /api/skills/store/approve { slug }  → active=true
```

详情页（§10）展示：`SKILL.md` 渲染、环境检测结果（三态）、权限申请清单（含来源与证据）、运行日志/阶段、写入的对话链接、安装/启用状态。

---

## 5. 后端：目录结构与文件清单

在 `server/utils/agents/` 下新建子目录 `skillImporter/`（若该 agents 目录结构不同，放到最贴近的位置并在日志中说明）：

```
server/utils/agents/skillImporter/
├── index.js              # 编排器 SkillImporter.run()，串联各阶段、统一错误/回滚
├── recognizer.js         # 解析各清单 → 标准化 manifest；类型判别；MCP 依赖判定
├── envDetector.js        # 环境检测，三态结果
├── permissions.js        # 权限推导（声明 + 静态扫描 + 可选 LLM）；顶部注释写明"无运行时沙箱"
├── conversationWriter.js # 建线程 + 写导入报告消息 → conversationRef（带降级）
├── runLog.js             # 结构化运行记录的读写（落 skill_imports 表）
├── llmEnrich.js          # 可选 LLM 识别/摘要钩子；默认关闭，失败必须降级
├── schema.js             # §6 所有数据契约的形状定义与构造/校验辅助
└── README.md             # 本模块简要说明与扩展点（WebSocket 进度、运行时沙箱等留作 TODO）
```

同时改动：

- `server/models/skillStore.js`：实现 `handoffToAgentImporter(slug, opts)` 调用 `SkillImporter.run`；新增 `approve(slug)`（或复用现有启用机制）；扩展 `get(slug)` 返回最近一次导入记录与各结果。
- `server/endpoints/skillStore.js`：`agent-handoff` 接 `workspaceId?` 参数并返回新结构；新增 `POST /api/skills/store/approve`。
- `server/prisma/schema.prisma`：新增 `skill_imports` 模型并迁移（§9）。
- `frontend/src/models/skillStore.js` 与两个页面（§10）。

---

## 6. 数据结构契约（schema.js）

以下为目标形状（JS 对象，注释标类型）。执行者应在 `schema.js` 中集中定义构造函数/默认值，**前后端共享同一套字段命名**。

```js
// 标准化清单（recognizer 输出）
SkillManifest = {
  slug, name, title, version, description,
  entryFile,                 // 默认 "SKILL.md"
  skillType,                 // 'non-mcp-plugin' | 'doc-only' | 'unknown'
  files,                     // [{ path, size }]
  hasPluginJson, hasHandlerJs, hasCoverImage,  // boolean
  dependsOnMcp,              // boolean —— true 则本期判为不受支持
  requirements: {            // 来自 skill.json.requirements；缺失则按 §7 推断
    node,                    // semver range，如 ">=18"，可空
    python,                  // 如 ">=3.10"，可空
    env,                     // string[] 需要存在的环境变量名，如 ["OPENAI_API_KEY"]
    pip,                     // string[] 需要的 pip 包名（仅检测）
    npm,                     // string[] 需要的 npm 包名（仅检测）
  },
  declaredPermissions,       // string[] | null 来自 skill.json.permissions（若有）
}

// 单条环境检测结果
EnvCheck = {
  type,                      // 'node' | 'python' | 'env' | 'pip' | 'npm' | 'mcp'
  label,                     // 展示用，如 "Node 版本"
  required,                  // boolean
  status,                    // 'satisfied' | 'unsatisfied' | 'unknown' | 'skipped'
  detail,                    // 如 "需要 >=18，检测到 v20.10.0"
}
EnvResult = {
  compatible,                // boolean，见下规则
  hasWarnings,               // boolean（存在 required 项为 unknown 时为 true）
  checks,                    // EnvCheck[]
}
// compatible 规则：当且仅当不存在 (required === true && status === 'unsatisfied') 时为 true。
// required 项为 'unknown' 不阻断（compatible 仍可 true），但置 hasWarnings=true，详情页提示人工确认。
// 'pip'/'npm' 检测不可靠时一律 'unknown'，不得据此判 unsatisfied。'mcp' 本期固定 'skipped'。

// 权限申请
PermissionItem = {
  capability,                // 'fs-read' | 'fs-write' | 'network' | 'shell' | 'api'
  source,                    // 'declared' | 'static-scan' | 'inferred'
  evidence,                  // 如 "handler.js 调用了 fetch()"
  risk,                      // 'low' | 'medium' | 'high'
}
PermissionRequest = {
  items,                     // PermissionItem[]
  decision,                  // 'pending' | 'approved' | 'rejected'
  decidedAt,                 // ISO 时间，可空
}

// 运行记录（落 skill_imports）
ImportStage = {
  stage,                     // 'recognize'|'detectEnv'|'resolvePerms'|'register'|'writeThread'
  status,                    // 'success' | 'failed' | 'skipped'
  startedAt, finishedAt,     // ISO
  detail, error,             // error 可空
}
ImportRecord = {
  id, slug, startedAt, finishedAt,
  status,                    // 'success' | 'failed'
  stages,                    // ImportStage[]
  envResult,                 // EnvResult
  permissionRequest,         // PermissionRequest
  conversationRef,           // { workspaceSlug, threadSlug, threadId } | null
  installed,                 // boolean
  failureReason,             // string | null
}

// 返回给前端的导入结果（agent-handoff 响应里的 payload）
ImportResult = {
  // —— 向后兼容字段（保留）——
  slug, title, sourceType, sourcePath, entryFile, files, validation, detailRoute,
  // —— 新增字段 ——
  success,                   // boolean（导入是否成功）
  manifest,                  // SkillManifest
  envResult,                 // EnvResult
  permissionRequest,         // PermissionRequest
  conversationRef,           // 同上 | null
  installed,                 // boolean
  active,                    // boolean（注册后是否已启用，初始 false）
  importId,                  // 对应 skill_imports.id
  failureReason,             // string | null
}
```

---

## 7. 后端模块详细规范（逐文件）

### 7.1 `recognizer.js`

- 入口：`recognize(skillDir, baseMeta) -> SkillManifest`。`skillDir` 为该 skill 在 `skill-store/<slug>/` 的目录，`baseMeta` 为现有标准化 `skill.json` 内容。
- 遍历目录，产出 `files`（路径 + 大小）与 `hasPluginJson/hasHandlerJs/hasCoverImage`。
- 类型判别：含 `plugin.json` + `handler.js` → `'non-mcp-plugin'`；只有文档 → `'doc-only'`；否则 `'unknown'`。
- MCP 判定 `dependsOnMcp`：文件名含 `mcp` 或以 `.mcp.json` 结尾，或 `skill.json` 中出现 mcp 相关声明 → `true`。（沿用并对齐现有 `buildValidation` 的 MCP 判断逻辑，避免两套标准。）
- `requirements`：优先取 `skill.json.requirements`；缺失时**轻量推断**——`package.json.engines.node` → `requirements.node`；存在 `requirements.txt` → 视为需要 Python（`requirements.python` 给保守默认或留空但标记需要 python 运行时）；不做更复杂的推断。
- `declaredPermissions`：取 `skill.json.permissions`（若存在），否则 `null`。
- **可选 LLM 增强**：若 `llmEnrich` 可用且开启，可补全 `description`/`summary` 或建议权限；**任何异常都 try/catch 后忽略**，返回确定性结果。

### 7.2 `envDetector.js`

- 入口：`detectEnv(requirements) -> EnvResult`。
- Node：用 `process.versions.node` 与 `requirements.node`（semver，可用 `semver` 库，仓库若已有则复用）比较 → satisfied/unsatisfied。
- Python：用 `cross-spawn`（仓库若已有依赖优先复用，否则用 `child_process` 并兼容 Windows）依次尝试 `python --version`、`python3 --version`，解析版本与 `requirements.python` 比较。两者都找不到：若 python 为必需则 `unsatisfied`，否则该项 `skipped`。
- env（API Key 等）：对 `requirements.env` 每项检查 `process.env[KEY]` 是否存在（**只判存在，不读值、不打印值**）→ satisfied/unsatisfied，标 `required:true`。
- pip / npm：尽力检测，**不可靠就置 `unknown`** 并在 `detail` 注明"无法可靠检测，请人工确认"；**不得据此判 unsatisfied**，`required` 置 false。
- mcp：固定 `status:'skipped'`，`detail` 注明本期范围外。
- 汇总 `compatible` / `hasWarnings` 按 §6 规则计算。

### 7.3 `permissions.js`

- 文件顶部用注释明确写下：**本期不提供运行时隔离；handler.js 在主进程中以完整权限执行；下列权限申请仅用于人工审批与风险披露。**
- 入口：`resolvePermissions(skillDir, manifest) -> PermissionRequest`。
- 来源合并：
  1. `manifest.declaredPermissions`（若有）→ `source:'declared'`。
  2. **静态扫描**：读取 `handler.js` 及其它 `.js` 文件文本，按关键字匹配映射能力（`source:'static-scan'`，`evidence` 写命中的关键字/片段）：
     - `child_process` / `exec(` / `spawn(` → `shell`（risk: high）
     - `require('fs')` / `fs.` / `writeFile` / `unlink` → `fs-write`（medium）；`readFile` / `createReadStream` → `fs-read`（low）
     - `fetch(` / `axios` / `node-fetch` / `require('http')` / `https` / `require('net')` → `network`（medium）
     - `process.env` 或出现外部 API base url → `api`（low）
  3. 可选 LLM 复核（`llmEnrich`）：可补充 `inferred` 项；失败忽略。
- 去重合并同一 `capability`（保留信息更全的来源），`decision` 初始 `'pending'`。

### 7.4 `conversationWriter.js`

- 入口：`writeImportThread({ manifest, envResult, permissionRequest, workspaceId }) -> conversationRef | null`。
- 选择目标工作空间：优先用传入的 `workspaceId`/`workspaceSlug`；缺省时取一个默认工作空间（如第一个可用的）。**对齐现有工作空间查询方式**。
- 创建新线程（`workspace_threads`），命名如 `Skill 导入：<title>`。
- 写入一条结构化导入报告消息（`workspace_chats`，assistant/system 角色），内容含：导入的 skill 标题/版本、环境检测摘要、权限申请摘要、调用示例（取 `plugin.json.examples`）、详情页与启用提示。**使用现有线程/消息创建工具，对齐其字段。**
- **降级**：若无任何工作空间或线程创建失败，**不要让整个导入失败**——返回 `null`，并在 `ImportStage` 里把该阶段标 `skipped` + `detail` 说明原因，导入整体仍可成功。

### 7.5 `runLog.js`

- 提供 `createRecord`/`updateStage`/`finalize`/`getLatestBySlug` 等，读写 `skill_imports` 表（§9）。
- 每阶段开始/结束都更新 `stages`，记录耗时与错误，便于详情页展示与排错。

### 7.6 `index.js`（编排器）

- 入口：`SkillImporter.run(slug, { workspaceId } = {}) -> ImportResult`。
- 流程严格按 §4 的 1→7；用 try/catch 包裹整体：
  - `recognize` 后若 `dependsOnMcp === true` → 失败，原因"本期不支持依赖 MCP 的 skill"。
  - `detectEnv` 后若 `envResult.compatible === false` → 失败，原因列出未满足项；**不执行 register/writeThread**。
  - 成功路径：`register`（复用 `SkillStore.install(slug)`，确保 `active=false`）→ `writeThread`（可降级）→ `finalize(status:'success')`。
  - 失败路径：`finalize(status:'failed', failureReason)`；清理本次产生的临时/暂存文件（复用现有 finally 清理约定）；**已上传到 skill-store 的包保留**（用户仍可在商店看到并查看失败报告）。
- 返回 `ImportResult`（含向后兼容字段 + 新增字段 + `detailRoute = /settings/community-hub/skills/<slug>`）。

---

## 8. 后端 API 规范（端点的调整与新增）

所有端点**沿用现有管理员鉴权中间件**。

### 8.1 改造：`POST /api/skills/store/agent-handoff`

- **路由保持不变**。
- 请求体：`{ slug: string, workspaceId?: string }`。
- 行为：调用 `SkillStore.handoffToAgentImporter(slug, { workspaceId })`（其内部跑 `SkillImporter.run`）。
- 响应：`{ success: boolean, payload: ImportResult }`。
  - **向后兼容**：`payload` 必须仍包含原桩函数返回的字段集（§6 标注的兼容字段）；新增字段并存。
  - 失败（如环境不兼容）时：HTTP 仍可返回 200，但 `payload.success=false` 且 `payload.failureReason` 有值，前端据此在详情页展示失败原因（也可用非 2xx + 同结构 body，二选一，前端统一处理）。

### 8.2 新增：`POST /api/skills/store/approve`

- 请求体：`{ slug: string }`。
- 行为：把已注册 skill 的 `plugin.json.active` 置为 `true`，并把对应 `skill_imports` 记录的 `permissionRequest.decision` 置为 `'approved'`、`decidedAt` 填当前时间。
- **对齐现有启用机制**：若 agent 是否启用某 skill 还受 `agentSkillWhitelist` / `system_settings` 控制，则一并更新，确保启用真实生效。
- 响应：`{ success: true, skill }`（含最新 `active` 状态）。

### 8.3 调整：`GET /api/skills/store/:slug`

- 在原详情基础上**附带**该 slug 最近一次导入记录与各结果：`importId, status, envResult, permissionRequest, conversationRef, installed, active`（供详情页一次性渲染）。

---

## 9. 数据库变更（Prisma）

在 `server/prisma/schema.prisma` 新增模型（字段名/类型对齐现有命名风格；JSON 列若 SQLite 不便存对象则存字符串并在模型层 `JSON.parse`）：

```prisma
model skill_imports {
  id                 Int      @id @default(autoincrement())
  slug               String
  status             String   // 'success' | 'failed'
  stages             String   // JSON: ImportStage[]
  envResult          String   // JSON: EnvResult
  permissionRequest  String   // JSON: PermissionRequest
  conversationRef    String?  // JSON: { workspaceSlug, threadSlug, threadId } | null
  installed          Boolean  @default(false)
  active             Boolean  @default(false)
  failureReason      String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```

迁移命令（在仓库根目录）：`yarn prisma:generate` 后 `yarn prisma:migrate`（具体脚本以根 `package.json` 为准，见 `Instruction/06-开发脚本与配置.md`）。迁移文件需提交。

---

## 10. 前端规范

目标：用户在 `/settings/community-hub/skills` 能**直接**完成导入与后续操作。

### 10.1 模型层 `frontend/src/models/skillStore.js`

- 调整 `handoffToAgentImporter(slug, workspaceId?)`：POST `agent-handoff`，返回 `ImportResult`。
- 新增 `approve(slug)`：POST `approve`。
- 确认 `get(slug)` 解析后能拿到 §8.3 的新增字段。

### 10.2 上传/列表页 `SkillStore/index.jsx`

- 拖入区**仅接受 `.zip`**（dropzone `accept` 限定）。
- 流程改为两段、有可见状态：
  1. 调 `upload(file)` → 成功拿到 `slug`（阶段提示："上传与校验中…"）。
  2. 紧接着调 `handoffToAgentImporter(slug)` → 拿到 `ImportResult`（阶段提示："导入中：识别 / 环境检测 / 权限 / 注册…"，本期可用一个带阶段文案的 loading 态，不要求逐阶段实时流）。
  3. 无论成功或失败，都**跳转到详情页** `/settings/community-hub/skills/<slug>`（失败也跳，由详情页展示失败原因）。
- 用 `react-toastify` 给出成功/失败提示。

### 10.3 详情页 `SkillDetail/index.jsx`

在现有 `SKILL.md` 渲染、封面、元数据、文件列表之外，**新增展示区块**：

- **环境检测结果**：列出 `envResult.checks`，三态用不同颜色/图标（满足 / 不满足 / 未知 / 跳过），顶部给 `compatible` 总结论；`hasWarnings` 时提示"存在需人工确认的项"。
- **权限申请**：列出 `permissionRequest.items`（能力 + 来源 + 证据 + 风险），并显示 `decision` 状态。提供 **「批准并启用」按钮**：调 `approve(slug)`，成功后刷新为已启用、`decision=approved`。导入失败或未注册时禁用该按钮。
- **运行日志/阶段**：按 `stages` 展示每阶段状态与耗时，失败时高亮 `failureReason`。
- **写入的对话**：若 `conversationRef` 非空，给一个跳转该工作空间线程的链接；为空则提示"未写入对话（无可用工作空间或已跳过）"。
- **安装/启用状态**：显示 `installed` / `active`。

样式遵循现有 Tailwind 主题变量与暗/亮色；复用页面已有的卡片/区块组件风格，不引入新设计语言。

---

## 11. 安全要求

- 路径：所有文件访问复用现有 `isWithin()` 校验，禁止越出预期目录；静态扫描只读文本、不执行。
- 鉴权：新增/改造端点全部走管理员鉴权中间件。
- 环境变量：检测 API Key 只判存在，**严禁读取或回显其值**，日志与响应中都不得出现密钥明文。
- 原子性：导入失败必须清理本次暂存/临时文件并回滚未完成的注册，不留半成品；已发布到 store 的包按 §7.6 保留。
- 范围：MCP / 自动装依赖 / 运行时执行一律不实现。

---

## 12. 验收标准（端到端，逐条勾验）

- [ ] 填好 `server/.env.development` 后，`yarn dev:all`（或 `start-dev.bat`）三服务（3000/3001/8888）正常启动。
- [ ] 在 `/settings/community-hub/skills` 拖入**有效非 MCP** skill 的 `.zip`：上传成功 → 自动触发导入 → 出现导入中状态 → 跳转到该 skill 详情页。
- [ ] 详情页正确展示：`SKILL.md` 渲染、环境检测结果（三态）、权限申请清单（含来源/证据/风险）、运行日志/阶段、写入对话链接（或"未写入"说明）、安装/启用状态。
- [ ] 准备一个 `skill.json.requirements.node` 声明为不可能满足版本（如 `">=999"`）的 skill：导入**失败**，详情页给出明确"Node 版本不满足"的原因，且**未**注册到 `agent-skills`。
- [ ] 点详情页「批准并启用」：该 skill 的 `plugin.json.active` 变为 `true`（并与 agent 实际启用机制一致），`decision` 变 `approved`。
- [ ] `POST /api/skills/store/agent-handoff` 路由未变，响应 `payload` 同时包含原有兼容字段与新增字段。
- [ ] `skill_imports` 表中能查到每次导入记录（含阶段、环境、权限、失败原因）。
- [ ] 导入失败时暂存/临时文件被清理，无半成品残留。
- [ ] 拖入非 `.zip` 文件被前端/后端拒绝并提示。
- [ ] `yarn lint`（或 `yarn lint:ci`）通过。
- [ ] `E:\Ai_Skill_launcher\Instruction\2026.6.7.md` 已记录全部改动（见 §14）。

---

## 13. 实施顺序（里程碑，每完成一项写一条开发日志）

1. **M1 · 骨架与契约**：建 `skillImporter/` 各文件骨架 + `schema.js`（§6）；加 `skill_imports` 模型并迁移（§9）。
2. **M2 · 识别**：`recognizer.js` 跑通，能对样例包产出正确 manifest（类型 / requirements / MCP 判定）。
3. **M3 · 环境检测**：`envDetector.js` 三态与 `compatible` 规则正确（含 Windows 下 python/python3 兼容）。
4. **M4 · 权限**：`permissions.js` 声明 + 静态扫描合并，顶部限制注释到位。
5. **M5 · 注册与写对话**：复用 `install` 注册（active=false）；`conversationWriter.js` 建线程写报告，含降级。
6. **M6 · 编排与端点**：`index.js` 串联；改造 `agent-handoff`（保持兼容）；新增 `approve`；扩展 `get(:slug)`。
7. **M7 · 前端**：模型层 + 上传两段流程 + 详情页四个新区块 + 批准启用。
8. **M8 · 端到端联调**：按 §12 逐条验收，修问题，跑 lint，补写开发日志收尾。

> 建议每个里程碑后做一次最小自测（可先用 `Instruction/05` 提到的 `build-skill-zip.ps1` 打一个模板包来跑流程）。

---

## 14. 开发记录要求（`E:\Ai_Skill_launcher\Instruction\2026.6.7.md`）

执行者需创建并**持续追加**该文件。每完成一个里程碑或一处关键改动追加一条，**条目模板**如下：

```markdown
## [HH:MM] M? · <里程碑/改动标题>

- 改动文件：
  - server/utils/agents/skillImporter/xxx.js（新增/修改：……）
  - server/endpoints/skillStore.js（……）
  - frontend/...（……）
- 接口调整（桩函数收口）：
  - handoffToAgentImporter：从桩返回 → 调用 SkillImporter.run；新增字段 …；保留兼容字段 …
  - 新增 approve 端点：……
- 与现有代码不一致 / 调整决定：……（说明为何这样改）
- 遇到的问题与解决：……
- 自测结果：……（哪些验收项已过）
- 待办 TODO：……（如 WebSocket 进度、运行时沙箱等本期未做项）
```

文件开头加一段总览：本次目标、本期范围（zip-only / 不自动装依赖 / 审批闸门 / 不支持 MCP 依赖型）、最终验收口径（前端可完整完成导入相关操作）。

---

## 附录 · 关键约束速查

| 约束 | 取值 |
|---|---|
| 拖入格式 | 仅 `.zip` |
| 自动装依赖 | 不支持（只检测报告） |
| 权限模型 | 审批闸门（无运行时沙箱） |
| MCP 依赖型 skill | 本期不支持，识别到即失败 |
| 导入端点交互 | 同步返回完整报告（无 WebSocket 进度） |
| 注册目录 | `server/storage/plugins/agent-skills/<slug>/`（复用 `install`，初始 `active=false`） |
| handoff 路由 | `POST /api/skills/store/agent-handoff`（**不变**，扩展响应） |
| 新增端点 | `POST /api/skills/store/approve` |
| 新增数据表 | `skill_imports` |
| 开发日志 | `E:\Ai_Skill_launcher\Instruction\2026.6.7.md`（持续追加） |
| 最终验收 | 前端走通 拖入 → 导入 → 详情页 → 批准启用 |
