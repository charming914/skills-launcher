const prisma = require("../../../utils/prisma");
const { WorkspaceThread } = require("../../../models/workspaceThread");
const { WorkspaceChats } = require("../../../models/workspaceChats");

/**
 * Find a target workspace: use workspaceId/workspaceSlug if provided,
 * otherwise fall back to the first available workspace.
 * @param {string|number|null} workspaceId
 * @returns {Promise<object|null>}
 */
async function resolveWorkspace(workspaceId) {
  if (workspaceId) {
    const byId = await prisma.workspaces.findFirst({
      where: { id: Number(workspaceId) },
    });
    if (byId) return byId;
  }
  // fallback: first workspace in DB
  return await prisma.workspaces.findFirst({ orderBy: { id: "asc" } });
}

/**
 * Build the import report message content.
 * @param {object} opts
 * @returns {string}
 */
function buildReportContent({
  manifest,
  envResult,
  permissionRequest,
  detailRoute,
}) {
  const envSummary = envResult
    ? `兼容性：${envResult.compatible ? "✅ 通过" : "❌ 未通过"}${envResult.hasWarnings ? "（含需人工确认项）" : ""}`
    : "环境检测：未运行";

  const compatibleChecks = (envResult?.checks || [])
    .filter((c) => c.status !== "skipped")
    .map((c) => {
      const icon =
        c.status === "satisfied"
          ? "✅"
          : c.status === "unsatisfied"
            ? "❌"
            : "⚠️";
      return `  - ${icon} ${c.label}: ${c.detail}`;
    })
    .join("\n");

  const permSummary = permissionRequest
    ? `权限申请数：${permissionRequest.items.length} 项，审批状态：${permissionRequest.decision}`
    : "权限申请：未生成";

  const permItems = (permissionRequest?.items || [])
    .map(
      (p) =>
        `  - [${p.risk.toUpperCase()}] ${p.capability} (${p.source}): ${p.evidence}`
    )
    .join("\n");

  const examples = manifest?.hasPluginJson
    ? "（已包含 plugin.json，可在 Agent 中配置使用）"
    : "（无 plugin.json，仅文档预览）";

  return `## Skill 导入报告：${manifest?.title || manifest?.slug}

**版本**: ${manifest?.version || "draft"}
**类型**: ${manifest?.skillType || "unknown"}
**入口文件**: ${manifest?.entryFile || "SKILL.md"}

---

### 环境检测
${envSummary}

${compatibleChecks || "无检测项"}

---

### 权限申请
${permSummary}

${permItems || "无权限项"}

---

### 安装状态
- 已注册到 agent-skills：${manifest?.hasPluginJson && manifest?.hasHandlerJs ? "是（active=false，待批准启用）" : "否（缺少 plugin.json 或 handler.js）"}
- ${examples}

---

### 操作指引
前往详情页查看完整报告并批准启用：
${detailRoute || ""}

> 本消息由 Skill 导入 Agent 自动生成。`;
}

/**
 * Create a workspace thread and write an import report message.
 *
 * Degrades gracefully: if no workspace is available or thread creation fails,
 * returns null and logs the reason — import overall still succeeds.
 *
 * @param {object} opts
 * @param {object} opts.manifest  SkillManifest
 * @param {object} opts.envResult  EnvResult
 * @param {object} opts.permissionRequest  PermissionRequest
 * @param {string} opts.detailRoute  frontend detail route URL fragment
 * @param {string|number|null} opts.workspaceId  optional target workspace
 * @returns {Promise<{workspaceSlug: string, threadSlug: string, threadId: number}|null>}
 */
async function writeImportThread({
  manifest,
  envResult,
  permissionRequest,
  detailRoute,
  workspaceId,
}) {
  let workspace = null;
  try {
    workspace = await resolveWorkspace(workspaceId);
  } catch (err) {
    console.warn(
      "[SkillImporter] conversationWriter: failed to resolve workspace:",
      err.message
    );
    return null;
  }

  if (!workspace) {
    console.warn(
      "[SkillImporter] conversationWriter: no workspace available, skipping thread write"
    );
    return null;
  }

  let thread = null;
  try {
    const threadName = `Skill 导入：${manifest?.title || manifest?.slug || "unknown"}`;
    const result = await WorkspaceThread.new(workspace, null, {
      name: threadName,
    });
    thread = result.thread;
    if (!thread) {
      console.warn(
        "[SkillImporter] conversationWriter: thread creation returned null:",
        result.message
      );
      return null;
    }
  } catch (err) {
    console.warn(
      "[SkillImporter] conversationWriter: failed to create thread:",
      err.message
    );
    return null;
  }

  try {
    const reportContent = buildReportContent({
      manifest,
      envResult,
      permissionRequest,
      detailRoute,
    });
    await WorkspaceChats.new({
      workspaceId: workspace.id,
      prompt: `[系统] Skill 导入报告 — ${manifest?.title || manifest?.slug}`,
      response: { text: reportContent, type: "skill-import-report" },
      user: null,
      threadId: thread.id,
      include: true,
    });
  } catch (err) {
    console.warn(
      "[SkillImporter] conversationWriter: failed to write chat message:",
      err.message
    );
    // Thread was created but message write failed — still return the thread ref
  }

  return {
    workspaceSlug: workspace.slug,
    threadSlug: thread.slug,
    threadId: thread.id,
  };
}

module.exports = { writeImportThread };
