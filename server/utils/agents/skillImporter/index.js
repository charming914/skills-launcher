const path = require("path");
const { recognize } = require("./recognizer");
const { detectEnv } = require("./envDetector");
const { resolvePermissions } = require("./permissions");
const { writeImportThread } = require("./conversationWriter");
const { RunLog } = require("./runLog");
const { makeImportResult, makeStage } = require("./schema");

// Extended at call-time to avoid circular dep; SkillStore is passed in via run()
const SKILL_DETAIL_ROUTE = "/settings/community-hub/skills";

/**
 * Build a stage entry with timing.
 * @param {string} stage
 * @param {'success'|'failed'|'skipped'} status
 * @param {Date} startedAt
 * @param {string} detail
 * @param {string|null} error
 * @returns {object}
 */
function stageEntry(stage, status, startedAt, detail = "", error = null) {
  return makeStage({
    stage,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    detail,
    error,
  });
}

/**
 * SkillImporter — orchestrator for the full skill import pipeline.
 *
 * WebSocket extension point (TODO): each stage can emit a progress event
 *   e.g. `opts.onStage?.({ stage, status })` before/after each step,
 *   allowing a future WebSocket endpoint to stream real-time progress.
 */
const SkillImporter = {
  /**
   * Run the full import pipeline for a skill that has already been uploaded
   * and stored in skill-store/<slug>/.
   *
   * @param {string} slug  skill slug (must exist in skill-store/)
   * @param {object} opts
   * @param {string|null} opts.workspaceId  optional target workspace for thread creation
   * @param {object} opts.skillStore  SkillStore instance (injected to avoid circular deps)
   * @returns {Promise<object>} ImportResult
   */
  run: async function (slug, { workspaceId = null, skillStore } = {}) {
    if (!skillStore)
      throw new Error("SkillImporter.run: skillStore instance is required");

    const skill = skillStore.get(slug);
    if (!skill) {
      return makeImportResult({
        slug,
        title: slug,
        sourceType: "uploaded-zip",
        sourcePath: "",
        entryFile: "SKILL.md",
        files: [],
        validation: null,
        detailRoute: `${SKILL_DETAIL_ROUTE}/${slug}`,
        success: false,
        manifest: null,
        envResult: null,
        permissionRequest: null,
        conversationRef: null,
        installed: false,
        active: false,
        importId: null,
        failureReason: "Skill not found in store",
      });
    }

    const skillDir = path.resolve(skillStore.root, slug);
    const detailRoute = `${SKILL_DETAIL_ROUTE}/${slug}`;
    const startedAt = new Date();
    let importId = null;

    try {
      importId = await RunLog.createRecord(slug);
    } catch (err) {
      console.error(
        "[SkillImporter] Failed to create RunLog record:",
        err.message
      );
      // Continue without persistent logging
    }

    let manifest = null;
    let envResult = null;
    let permissionRequest = null;
    let conversationRef = null;
    let installed = false;
    let failureReason = null;

    // ── Stage 1: recognize ──────────────────────────────────────
    const t1 = new Date();
    try {
      manifest = recognize(skillDir, skill);
    } catch (err) {
      failureReason = `识别阶段失败: ${err.message}`;
      if (importId) {
        await RunLog.updateStage(
          importId,
          stageEntry("recognize", "failed", t1, failureReason, err.message)
        );
        await RunLog.finalize(importId, { status: "failed", failureReason });
      }
      return _buildResult({
        slug,
        skill,
        detailRoute,
        success: false,
        manifest,
        envResult,
        permissionRequest,
        conversationRef,
        installed,
        importId,
        failureReason,
      });
    }

    if (importId)
      await RunLog.updateStage(
        importId,
        stageEntry(
          "recognize",
          "success",
          t1,
          `skillType=${manifest.skillType}`
        )
      );

    // Check MCP dependency — out of scope
    if (manifest.dependsOnMcp) {
      failureReason =
        "本期不支持依赖 MCP 的 skill（检测到 MCP 相关文件或声明）";
      if (importId) {
        await RunLog.updateStage(
          importId,
          stageEntry("recognize", "failed", t1, failureReason)
        );
        await RunLog.finalize(importId, { status: "failed", failureReason });
      }
      return _buildResult({
        slug,
        skill,
        detailRoute,
        success: false,
        manifest,
        envResult,
        permissionRequest,
        conversationRef,
        installed,
        importId,
        failureReason,
      });
    }

    // ── Stage 2: detectEnv ───────────────────────────────────────
    const t2 = new Date();
    try {
      envResult = detectEnv(manifest.requirements);
    } catch (err) {
      failureReason = `环境检测阶段失败: ${err.message}`;
      if (importId) {
        await RunLog.updateStage(
          importId,
          stageEntry("detectEnv", "failed", t2, failureReason, err.message)
        );
        await RunLog.finalize(importId, {
          status: "failed",
          envResult,
          failureReason,
        });
      }
      return _buildResult({
        slug,
        skill,
        detailRoute,
        success: false,
        manifest,
        envResult,
        permissionRequest,
        conversationRef,
        installed,
        importId,
        failureReason,
      });
    }

    const unsatisfied = (envResult.checks || [])
      .filter((c) => c.required && c.status === "unsatisfied")
      .map((c) => c.detail);

    if (!envResult.compatible) {
      failureReason = `环境要求未满足: ${unsatisfied.join("; ")}`;
      if (importId) {
        await RunLog.updateStage(
          importId,
          stageEntry("detectEnv", "failed", t2, failureReason)
        );
        await RunLog.finalize(importId, {
          status: "failed",
          envResult,
          failureReason,
        });
      }
      return _buildResult({
        slug,
        skill,
        detailRoute,
        success: false,
        manifest,
        envResult,
        permissionRequest,
        conversationRef,
        installed,
        importId,
        failureReason,
      });
    }

    if (importId)
      await RunLog.updateStage(
        importId,
        stageEntry(
          "detectEnv",
          "success",
          t2,
          `compatible=true, warnings=${envResult.hasWarnings}`
        )
      );

    // ── Stage 3: resolvePerms ────────────────────────────────────
    const t3 = new Date();
    try {
      permissionRequest = await resolvePermissions(skillDir, manifest);
    } catch (err) {
      // Non-fatal: continue with empty permissions
      permissionRequest = { items: [], decision: "pending", decidedAt: null };
      console.warn(
        "[SkillImporter] resolvePermissions error (continuing):",
        err.message
      );
    }
    if (importId)
      await RunLog.updateStage(
        importId,
        stageEntry(
          "resolvePerms",
          "success",
          t3,
          `items=${permissionRequest.items.length}`
        )
      );

    // ── Stage 4: register ────────────────────────────────────────
    const t4 = new Date();
    const installResult = skillStore.install(slug);
    if (!installResult.success) {
      const detail = installResult.error || "install returned failure";
      if (importId)
        await RunLog.updateStage(
          importId,
          stageEntry("register", "skipped", t4, detail)
        );
      // Not fatal — skill may lack plugin.json/handler.js (doc-only)
      console.warn("[SkillImporter] register skipped:", detail);
    } else {
      installed = true;
      if (importId)
        await RunLog.updateStage(
          importId,
          stageEntry("register", "success", t4, "active=false")
        );
    }

    // ── Stage 5: writeThread ─────────────────────────────────────
    const t5 = new Date();
    try {
      conversationRef = await writeImportThread({
        manifest,
        envResult,
        permissionRequest,
        detailRoute,
        workspaceId,
      });
      if (importId) {
        const detail = conversationRef
          ? `workspace=${conversationRef.workspaceSlug} thread=${conversationRef.threadSlug}`
          : "skipped (no workspace available)";
        await RunLog.updateStage(
          importId,
          stageEntry(
            "writeThread",
            conversationRef ? "success" : "skipped",
            t5,
            detail
          )
        );
      }
    } catch (err) {
      console.warn(
        "[SkillImporter] writeThread error (non-fatal):",
        err.message
      );
      if (importId)
        await RunLog.updateStage(
          importId,
          stageEntry("writeThread", "skipped", t5, "", err.message)
        );
      conversationRef = null;
    }

    // ── Stage 6: finalize ────────────────────────────────────────
    if (importId) {
      await RunLog.finalize(importId, {
        status: "success",
        envResult,
        permissionRequest,
        conversationRef,
        installed,
        active: false,
        failureReason: null,
      });
    }

    return _buildResult({
      slug,
      skill,
      detailRoute,
      success: true,
      manifest,
      envResult,
      permissionRequest,
      conversationRef,
      installed,
      importId,
      failureReason: null,
    });
  },
};

/**
 * Assemble the final ImportResult from intermediate state.
 * Always includes backward-compat fields from the original stub.
 */
function _buildResult({
  slug,
  skill,
  detailRoute,
  success,
  manifest,
  envResult,
  permissionRequest,
  conversationRef,
  installed,
  importId,
  failureReason,
}) {
  return makeImportResult({
    // backward-compat
    slug,
    title: skill?.title || slug,
    sourceType: skill?.sourceType || "uploaded-zip",
    sourcePath: skill?.sourcePath || "",
    entryFile: skill?.entryFile || "SKILL.md",
    files: skill?.files || [],
    validation: skill?.validation || null,
    detailRoute,
    // new
    success,
    manifest,
    envResult,
    permissionRequest,
    conversationRef,
    installed,
    active: false,
    importId,
    failureReason,
  });
}

module.exports = { SkillImporter };
