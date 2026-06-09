# Skill 文件完整性检测 + 一键 Agent 补全（下载与对话）— 架构框架

> 本文档供 VSCode 的 Claude Code 插件按其执行编程。是「Skill 导入 Agent」之后的第二个迭代。
> **路径修正（重要）**：真正的代码仓库根是 `E:\Ai_Skill_launcher\skills-launcher`（`yarn` 等根脚本在此层执行；下文代码路径均相对此根）。文档目录在外层 `E:\Ai_Skill_launcher\Instruction`。

---

## 0. 给执行者（Claude Code）的总则 —— 先读这一段

**与上一迭代的关系。** 上一迭代（见 `Instruction/07-导入Agent功能与页面.md`）的导入流水线是**确定性**的、没用 LLM。本迭代是**第一次真正使用 LLM**：让 agent 一键编写 skill 缺失的文件。LLM **复用项目已配置的 AiProviders**（用户在哪接的对话模型就用哪个，**不需要单独配 key**）；未配置 LLM 时必须优雅降级到模板生成，不得崩溃或阻断。

**铁律 1 · 先读后写，以现有代码为准。** 本文档给目标接口/结构，**实际代码是唯一事实来源**。动手前阅读：

- `server/models/skillStore.js`（`ingestZipUpload` / `install` / `get` / `getWithImport` / `approve` / `handoffToAgentImporter`）
- `server/utils/agents/skillImporter/`（上一迭代成果：`recognizer.js` 产 manifest、`permissions.js` 静态扫描、`schema.js`、`runLog.js`）—— **本迭代大量复用，勿重造**
- `server/endpoints/skillStore.js`（现有路由）
- `server/utils/AiProviders/`（如何取得当前配置的 LLM provider 并发起一次补全请求）
- 上传/解压所用的 zip 库（`ingestZipUpload` 里用的那一个，下载打包时复用它）
- `server/utils/middleware/`（管理员鉴权）、`isWithin()`（路径防护）
- `frontend/src/models/skillStore.js`、`frontend/src/pages/GeneralSettings/CommunityHub/SkillDetail/index.jsx`

**铁律 2 · 复用优先。** 完整性检测建立在现有 `recognizer.js` 的 manifest 与 `buildValidation` 之上；生成 handler.js 后**重跑 `permissions.js` 的静态扫描**；下载打包复用现有 zip 库；安装/启用/对话复用上一迭代的 `install` + `approve`。本迭代只新增"检测缺失 / 生成补全 / 打包下载"三类能力。

**铁律 3 · 严格遵守本期范围（§2）。** 只补缺失、绝不覆盖已有文件；生成的 skill 始终保持 `active=false`，必须经管理员批准才启用；不做运行时沙箱；封面用占位 SVG，不接图像生成。

**铁律 4 · 安全是硬约束（§11）。** 本迭代会让 **AI 生成可执行的 `handler.js`，且它将在主进程以完整权限运行**。务必：写入前做语法校验、生成后重跑权限扫描、显式标注"AI 生成需复核"、保持审批闸门。把这些当作不可删减的需求。

**铁律 5 · 边做边记开发日志。** 在 `E:\Ai_Skill_launcher\Instruction\` 下新建一份以实现当日日期命名的开发日志（格式 `YYYY.M.D.md`，模板见 §14），每完成一个里程碑追加一条。

**最终验收 = 前端可完整操作（§12）：** 在 skill 详情页看到"缺什么、为什么需要" → 点「一键补全」生成缺失文件 → 完整性变绿、可下载到本地 → 经批准启用后可在 agent 对话中使用。

---

## 1. 背景与目标

当前问题：部分 skill 缺少必要文件（如缺 `SKILL.md`、`plugin.json`、`handler.js`），导致既无法作为 agent skill 运行/对话，也不适合下载导出。本迭代要：

1. **检测**每个 skill 缺哪些必要文件，并在详情页清晰指出（缺什么、为什么需要、严重级别）。
2. 提供 **「一键补全」**：让 agent（LLM，复用 AiProviders）**只生成缺失的文件**，把 skill 补成完整可用。
3. 补全后 skill 可**打包下载到本地（zip 导出）**；并经现有"批准启用"后可在 **agent 对话**中使用。

> 关于"下载"与"对话"的口径：本框架将「下载」实现为**把 skill 文件夹打包成 zip 导出到本地**；「对话」沿用上一迭代的 install → approve → 在工作空间中调用。两者都以"skill 已补全"为前提。若产品希望「下载」另指其它含义，在此处与 Claude Code 对齐后调整，其余设计不变。

---

## 2. 本期范围（已锁定）

**做：**

- 完整性检测：基于现有 manifest/validation，判定 `SKILL.md` / `plugin.json` / `handler.js` / 封面 是否齐备，输出结构化报告。
- 一键补全（生成器）：
  - `SKILL.md`：模板骨架 + LLM 内容。
  - `plugin.json`：**确定性模板结构** + LLM 填充 `description`/`entrypoint.params`/`examples`，**生成后必须 `JSON.parse` 校验**。
  - `handler.js`：**保守安全骨架** + LLM 实现，**写入前 `node --check` 语法校验**，标注"AI 生成需复核"。
  - 封面：确定性生成**占位 SVG**（不调用 LLM/图像）。
- LLM 复用 AiProviders；**无 LLM 时降级为纯模板生成**并在前端提示。
- 下载：把 skill 文件夹打包 zip 流式下载（管理员、路径安全）。
- 补全后重跑 recognizer + validation + completeness + 权限扫描，更新 store。

**不做（范围外，仅留缝）：**

- ❌ 覆盖/编辑用户已存在的文件（只补缺失）。
- ❌ 自动启用 AI 生成的 skill（始终 `active=false`，必须人工批准）。
- ❌ 运行时沙箱/隔离（沿用上一迭代，靠审批闸门 + 风险披露）。
- ❌ 封面图像生成（用占位 SVG 代替）。
- ❌ 依赖安装、MCP 支持（同上一迭代）。

---

## 3. 复用与现状

执行者读完 §0 文件后应确认可复用：

- `recognizer.js`：`recognize(skillDir, baseMeta) -> SkillManifest`，已含 `hasPluginJson/hasHandlerJs/hasCoverImage/entryFile/skillType`。**完整性检测直接基于它**。
- `permissions.js`：静态扫描 `handler.js` 产 `PermissionRequest`。**生成 handler.js 后重跑它**。
- `install(slug)` / `approve(slug)`：注册到 `server/storage/plugins/agent-skills/<slug>/`（`active=false`）与批准启用。
- `ingestZipUpload` 用的 zip 库：下载打包复用。
- `isWithin()`：所有文件路径校验复用。
- `server/utils/AiProviders/`：取当前 LLM provider 发起补全。
- skill 存储位置：`server/storage/skill-store/<slug>/`（生成的文件写到这里）。

---

## 4. 总体架构与数据流

```
详情页加载 → GET /:slug（已返回 manifest/validation/importRecord，本迭代附加 completeness）
   ▼
完整性检测 completeness.check(manifest) → CompletenessReport
   │   { complete, downloadable, runnable, items:[{file,status,severity,reason,canGenerate,generatedByAi}] }
   ▼
详情页「文件完整性」区块：列出缺失项 + 原因 + 严重级别
   ├─ 有 blocks-* 缺失 → 「下载」禁用；显示「一键补全」
   └─ 已完整        → 「下载」可用
   │
   用户点「一键补全」 → POST /:slug/complete { targets? }（默认补全所有可生成的缺失项）
   ▼
SkillCompleter.run(slug, targets)
   ├─ 收集上下文：现有 SKILL.md/skill.json/handler.js、文件列表、name/title/description/tags
   ├─ 取 LLM provider（AiProviders）；取不到 → method 全部走 'template'
   ├─ 逐缺失项调用 generator：
   │     SKILL.md    → skillMd.generate()    （模板 + LLM；产物非空）
   │     plugin.json → pluginJson.generate() （模板结构 + LLM 填充；JSON.parse 校验）
   │     handler.js  → handlerJs.generate()  （保守骨架 + LLM；node --check 语法校验）
   │     cover       → coverSvg.generate()   （占位 SVG，无 LLM）
   │   生成失败 → 重试 1 次 → 仍失败回退模板/占位；再不行该项 status='failed'
   ├─ 只写缺失文件到 skill-store/<slug>/（**绝不覆盖已有**）
   ├─ 标注来源：写 skill.json.generatedFiles=[...]；文件头加注释“AI-generated, review before use”
   ├─ 重跑 recognizer + buildValidation + completeness
   └─ 若生成了 handler.js → 重跑 permissions 静态扫描，刷新 PermissionRequest
   ▼
返回 CompleteResult（生成清单 + 更新后的 report + permissionRequest）
   ▼
详情页刷新：完整性变绿、列出“以下文件由 AI 生成，请复核”（尤其 handler.js）
   ├─ 「下载」 → GET /:slug/download → zip 打包 skill 文件夹 → 浏览器下载到本地
   └─ 「批准并启用」（复用 approve）→ active=true →「去对话」链接到工作空间
```

---

## 5. 完整性规则（什么算"必要"）

| 文件 | 缺失时 severity | 含义 / 原因 | canGenerate |
|---|---|---|---|
| `SKILL.md`（或 `entryFile`） | `blocks-download` | 技能核心文档，缺失则技能无意义、不应导出 | 是 |
| `plugin.json` | `blocks-run` | 作为 agent skill 运行/对话的清单 | 是 |
| `handler.js` | `blocks-run` | 技能执行入口（`runtime.execute`） | 是 |
| 封面（cover.png/jpg/jpeg/webp/svg 任一） | `recommended` | 仅展示用，不影响下载/运行 | 是（占位 SVG） |

派生标志：

- `downloadable` = 不存在 `blocks-download` 缺失。
- `runnable` = `plugin.json` 与 `handler.js` 均存在。
- `complete` = 无任何缺失。

> 注：现有上传验证里 `SKILL.md` 缺失已是 error（多数会在上传时被拦），但本检测仍要覆盖该项，作为详情页的统一完整性视图。

---

## 6. 后端文件清单

在 `server/utils/agents/` 下新建 `skillCompleter/`：

```
server/utils/agents/skillCompleter/
├── index.js              # SkillCompleter.run(slug, targets) 编排
├── completeness.js       # check(manifest) -> CompletenessReport（§5 规则）
├── llmClient.js          # 复用 AiProviders 取 provider；generate(prompt, opts)；取不到返回 null
├── schema.js             # §7 数据契约构造/默认值
└── generators/
    ├── skillMd.js        # generate(ctx, llm?) -> { content, method }
    ├── pluginJson.js     # generate(ctx, llm?) -> { content(JSON 字符串), method }
    ├── handlerJs.js      # generate(ctx, llm?) -> { content, method }
    └── coverSvg.js       # generate(ctx) -> { content(svg), method:'placeholder' }
```

改动现有：

- `server/models/skillStore.js`：新增 `completeSkill(slug, targets)`（调 `SkillCompleter.run`）、`downloadPackage(slug)`（打包 zip 路径/流）；扩展 `getWithImport(slug)` 附带 `completeness`。
- `server/endpoints/skillStore.js`：GET `/:slug` 响应加 `completeness`；新增 `POST /:slug/complete`、`GET /:slug/download`。
- `frontend/src/models/skillStore.js` 与详情页（§10）。
- 无需新增数据库表（完整性是实时计算；AI 生成来源记在 `skill.json.generatedFiles`）。

---

## 7. 数据契约（schema.js）

```js
CompletenessItem = {
  file,          // 'SKILL.md' | 'plugin.json' | 'handler.js' | 'cover'
  label,         // 展示名
  status,        // 'present' | 'missing'
  severity,      // 'blocks-download' | 'blocks-run' | 'recommended'
  reason,        // 为什么需要
  canGenerate,   // boolean
  generatedByAi, // boolean（取自 skill.json.generatedFiles）
}
CompletenessReport = {
  complete, downloadable, runnable,  // boolean
  items,                             // CompletenessItem[]
}

GenerationResult = {
  file,
  status,        // 'generated' | 'skipped' | 'failed'
  method,        // 'llm' | 'template' | 'placeholder'
  bytes,         // 写入字节数
  note,          // 失败/降级原因
}
CompleteResult = {
  success, slug,
  llmUsed,           // boolean（本次是否用到 LLM）
  generated,         // GenerationResult[]
  report,            // 更新后的 CompletenessReport
  permissionRequest, // 若生成 handler.js → 重跑后的；否则原值/ null
}
```

`skill.json` 新增字段（标注 AI 来源，供前端提示与防覆盖判断）：

```json
{ "generatedFiles": [ { "file": "handler.js", "method": "llm", "at": "ISO时间" } ] }
```

---

## 8. 生成器规范（逐个）

通用约定：每个 generator 接收上下文 `ctx`（含 `skillDir`、`meta`(skill.json)、现有 `skillMd` 文本、现有 `pluginJson` 对象、文件列表）和可选 `llm`（来自 `llmClient`，为 `null` 时走模板/占位）。返回 `{ content, method }`。**任何 LLM 异常都 try/catch 后降级**，不得抛出中断整体。

### 8.1 `llmClient.js`
- `getProvider()`：复用 `AiProviders` 拿到当前系统/默认工作空间配置的 LLM；拿不到（未配置）返回 `null`。
- `generate(systemPrompt, userPrompt, { json=false })`：发起一次补全；`json=true` 时要求模型只返回 JSON 并安全解析（去除 ``` 包裹后 `JSON.parse`，失败抛出由调用方降级）。

### 8.2 `skillMd.js`
- 上下文给模型：name/title/description/summary/tags、现有 plugin.json 的 params/examples、文件列表。
- 提示模型按推荐结构写 `SKILL.md`：标题、功能描述、工作流程、决策规则、示例提示词、打包注意。
- 产物校验：非空且含标题。
- 模板降级：用 meta 填充的骨架 + 占位小节。

### 8.3 `pluginJson.js`（必须产出合法 JSON）
- **结构确定性生成**：`hubId`/`name` 取自 slug；`active:false`；`setup_args:{}`；`entrypoint`/`examples` 由 LLM 填充建议值。
- LLM 仅填：`description`、`entrypoint.params`（从 SKILL.md/意图推断字段名与说明）、`examples`（prompt + call）。
- **组装后 `JSON.parse` 校验**；失败重试一次仍失败 → 回退模板（单一 `input:string` 参数 + 一个 example，对齐 `skill-template/standard-non-mcp-skill/plugin.json`）。

### 8.4 `handlerJs.js`（最高风险，重点）
- 必须导出 `module.exports.runtime = { execute: async function ({...}) { ... return { success, output }; } }`。
- 参数从 plugin.json 的 `entrypoint.params` 解构。
- **默认生成保守骨架**：实现 SKILL.md 描述的最小逻辑；除非文档明确要求，**不主动生成 shell/网络/文件写**等高风险操作，宁可用 TODO 注释占位并返回安全默认。
- 文件头注释：`// AI-generated by Skill Completer — review before enabling. Runs in main process with full privileges.`
- **写入前 `node --check <tmpfile>`（子进程，不执行代码）做语法校验**；不通过 → 重试一次 → 仍不过回退模板（`skill-template` 的 echo handler）。
- 模板降级：返回输入回显的最小 handler。

### 8.5 `coverSvg.js`
- 确定性生成占位 SVG（如以标题首字/slug 着色的简洁卡片），`method:'placeholder'`，不调用 LLM。

---

## 9. 后端 API

所有端点**复用现有管理员鉴权**；所有路径**复用 `isWithin()`**。

### 9.1 `GET /api/skills/store/:slug`（扩展）
- 响应在原有基础上附加 `completeness: CompletenessReport`。

### 9.2 `POST /api/skills/store/:slug/complete`（新增）
- 请求体：`{ targets?: string[] }`（缺省 = 所有 `canGenerate && status==='missing'` 的项）。
- 行为：`SkillStore.completeSkill(slug, targets)` → `SkillCompleter.run`。
- 响应：`{ success, payload: CompleteResult }`。
- 失败（如某项生成失败）：整体仍可返回 200，`payload.generated` 中标 `failed`，前端据此提示。

### 9.3 `GET /api/skills/store/:slug/download`（新增）
- 行为：把 `server/storage/skill-store/<slug>/` 打包为 zip（复用现有 zip 库），流式返回。
- 头：`Content-Type: application/zip`、`Content-Disposition: attachment; filename="<slug>.zip"`。
- 安全：仅打包该 slug 目录内文件（`isWithin` 校验），管理员鉴权。
- 前置：若 `completeness.downloadable === false`，返回 409 + 说明（前端按钮本就禁用，此为双保险）。

---

## 10. 前端规范

目标：详情页可直接完成"看缺失 → 一键补全 → 下载 / 去对话"。

### 10.1 模型层 `frontend/src/models/skillStore.js`
- `get(slug)` 解析后含 `completeness`。
- 新增 `complete(slug, targets?)`：POST `/:slug/complete` → `CompleteResult`。
- 新增 `download(slug)`：GET `/:slug/download`，以 blob 触发浏览器下载（复用项目已用的 `file-saver` 或 `a[download]`）。

### 10.2 详情页 `SkillDetail/index.jsx` 新增区块
- **文件完整性 CompletenessBlock**：按 `items` 列出每个文件的 present/missing、severity（用颜色/图标区分 阻断下载 / 阻断运行 / 建议）、reason。顶部给 `complete/downloadable/runnable` 总结。
- **操作区**：
  - 「一键补全」按钮：仅当存在可生成的缺失项时显示；点击调 `complete(slug)`，期间显示阶段态（"生成 SKILL.md / plugin.json / handler.js …"，本期可用带文案的 loading，不要求逐项实时流）；完成后刷新 `get(slug)`，区块转绿。
  - 「下载」按钮：`downloadable` 为真时可用，调 `download(slug)`。
  - 「批准并启用」沿用上一迭代；启用后出现「去对话」链接（跳转到一个工作空间会话）。
- **AI 生成提示**：补全后，对 `generatedByAi` 的文件显著标注"由 AI 生成，启用前请复核"，**对 `handler.js` 用更醒目的告警**（它会以完整权限运行）。
- 若 `llmUsed === false`（无 LLM，走了模板）：提示"未检测到可用的大模型，已用模板生成基础文件，建议配置 LLM 后重试以获得更完整内容"。

样式遵循现有 Tailwind 主题与暗/亮色，复用页面既有卡片/区块风格。

---

## 11. 安全要求（重点）

- **AI 生成的 `handler.js` 会在主进程以完整权限运行**（本期无沙箱）。因此必须：
  1. 写入前 `node --check` 语法校验（不执行代码）；
  2. 生成后**重跑 `permissions.js` 静态扫描**，把它使用的能力（shell/network/fs/api）暴露到详情页权限区；
  3. 详情页**醒目标注"AI 生成需复核"**；
  4. **保持审批闸门**：补全不改变 `active` 状态，仍为 `false`，必须管理员 `approve` 才启用；
  5. 默认生成保守逻辑，不主动引入高风险操作。
- **只补缺失、绝不覆盖**：写入前确认目标文件不存在；已存在则跳过并标 `skipped`。
- **生成内容校验**：`plugin.json` 必须 `JSON.parse` 通过；`handler.js` 必须 `node --check` 通过；`SKILL.md` 必须非空。不通过则重试/降级，绝不写入坏文件。
- **下载端点**：仅打包 slug 目录内文件，`isWithin` 校验，管理员鉴权；不泄露 store 目录外内容。
- **环境变量/密钥**：生成与日志中不得出现任何密钥明文。

---

## 12. 验收标准（逐条勾验）

- [ ] 详情页对**不完整**的 skill 展示"缺什么 + 为什么 + 严重级别"，且「下载」按钮禁用。
- [ ] 点「一键补全」：缺失的 `SKILL.md`/`plugin.json`/`handler.js`/封面被生成；展示生成清单与方式（llm/template/placeholder）。
- [ ] 生成的 `plugin.json` 是**合法 JSON**且含必需字段；`handler.js` **导出 `runtime.execute` 且 `node --check` 通过**；`SKILL.md` 非空。
- [ ] **已存在的文件不被覆盖**（用一个只缺 handler.js 的 skill 验证，其 SKILL.md/plugin.json 内容不变）。
- [ ] 生成 handler.js 后，详情页权限区出现重跑后的能力清单；skill 仍 `active=false`。
- [ ] 补全后 `completeness` 变为可下载；点「下载」得到一个合法的 `<slug>.zip`（管理员）。
- [ ] AI 生成的文件在详情页有"需复核"标注，`handler.js` 有醒目告警；`skill.json.generatedFiles` 已记录。
- [ ] **无 LLM 配置时**：补全降级为模板/占位生成，前端有提示，流程不崩。
- [ ] 经「批准并启用」后，skill 可在 agent 对话中被调用（「去对话」链路可用）。
- [ ] 新端点复用管理员鉴权与 `isWithin()`；非法路径/越界被拒。
- [ ] 开发日志已记录全部改动。

---

## 13. 实施里程碑（每完成一项写一条开发日志）

1. **N1 · 完整性检测 + 详情页展示**：`completeness.js` + `getWithImport` 扩展 + 详情页 CompletenessBlock；「下载」按钮按规则启停（此时尚无补全/下载实现，先把"缺什么"显示出来）。
2. **N2 · 下载端点**：`downloadPackage` + `GET /:slug/download` + 前端 `download()`；先让**已完整**的 skill 能打包下载。
3. **N3 · 生成器骨架 + 模板回退（不接 LLM）**：四个 generator 的模板/占位实现 + `index.js` 编排 + `POST /:slug/complete` + 前端「一键补全」；保证**无 LLM 也能补出合法文件**并通过校验。
4. **N4 · 接 LLM 增强**：`llmClient.js` 复用 AiProviders；各 generator 接 LLM 内容生成 + JSON/语法校验 + 重试 + 降级。
5. **N5 · 收口与安全**：AI 来源标注、生成 handler.js 后重跑权限扫描、详情页"需复核"告警与无 LLM 提示、保持审批闸门。
6. **N6 · 端到端联调**：按 §12 逐条验收，接通「批准启用 → 去对话」，跑 `yarn lint`（在 `skills-launcher` 层），补写开发日志收尾。

> 建议用 `skill-template` 打几个**故意缺文件**的测试包（删掉 handler.js / plugin.json / SKILL.md）来验证检测与补全。

---

## 14. 开发日志要求

在 `E:\Ai_Skill_launcher\Instruction\<实现当日日期>.md`（如 `2026.6.8.md`）新建并持续追加，条目模板：

```markdown
## [HH:MM] N? · <里程碑/改动标题>
- 改动文件：server/utils/agents/skillCompleter/...；server/endpoints/skillStore.js；frontend/...
- 接口：新增 completeness 字段 / POST :slug/complete / GET :slug/download ……
- LLM：是否用到 AiProviders、无 LLM 降级如何处理
- 安全：handler.js 校验/权限重跑/AI 标注/审批闸门落实情况
- 与现有代码不一致 / 调整决定：……
- 遇到的问题与解决：……
- 自测结果：……（已过哪些验收项）
- 待办 TODO：……
```

文件开头加总览：本次目标、本期范围（只补缺失 / 不覆盖 / 不自动启用 / 无沙箱 / 封面占位 / 复用 AiProviders 且无 LLM 降级）、最终验收口径。

---

## 附录 · 关键约束速查

| 约束 | 取值 |
|---|---|
| 仓库根 | `E:\Ai_Skill_launcher\skills-launcher`（yarn 在此层） |
| 文档/日志目录 | `E:\Ai_Skill_launcher\Instruction\` |
| LLM 来源 | 复用 AiProviders（无需单独 key）；无 LLM 降级为模板 |
| 生成原则 | 只补缺失，绝不覆盖已有文件 |
| plugin.json | 模板结构 + LLM 填充，写入前 `JSON.parse` 校验 |
| handler.js | 保守骨架 + LLM，写入前 `node --check`，标注需复核 |
| 封面 | 占位 SVG，不接图像生成 |
| 启用 | 补全不改 active；仍 `active=false`，须人工 approve |
| 沙箱 | 无（沿用审批闸门 + 权限披露） |
| 新增端点 | `POST /:slug/complete`、`GET /:slug/download`；GET `/:slug` 加 `completeness` |
| 数据库 | 无新表（AI 来源记 skill.json.generatedFiles） |
| 最终验收 | 详情页看缺失 → 一键补全 → 下载 → 批准启用 → 去对话 |
