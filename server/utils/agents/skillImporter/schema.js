/**
 * Data contracts for the SkillImporter pipeline.
 * All shapes defined here are shared between backend modules.
 * Frontend mirrors the same field names in src/models/skillStore.js.
 */

/**
 * Build an empty SkillManifest with safe defaults.
 * @returns {object}
 */
function makeManifest(overrides = {}) {
  return {
    slug: "",
    name: "",
    title: "",
    version: "draft",
    description: "",
    entryFile: "SKILL.md",
    skillType: "unknown", // 'non-mcp-plugin' | 'doc-only' | 'unknown'
    files: [],
    hasPluginJson: false,
    hasHandlerJs: false,
    hasCoverImage: false,
    dependsOnMcp: false,
    requirements: {
      node: null,
      python: null,
      env: [],
      pip: [],
      npm: [],
    },
    declaredPermissions: null,
    ...overrides,
  };
}

/**
 * Build a single EnvCheck entry.
 * @param {object} fields
 * @returns {object}
 */
function makeEnvCheck({ type, label, required, status, detail = "" }) {
  return { type, label, required, status, detail };
}

/**
 * Build an EnvResult from a checks array.
 * compatible = no (required === true && status === 'unsatisfied')
 * hasWarnings = some (required === true && status === 'unknown')
 * @param {Array} checks
 * @returns {object}
 */
function makeEnvResult(checks = []) {
  const compatible = !checks.some(
    (c) => c.required === true && c.status === "unsatisfied"
  );
  const hasWarnings = checks.some(
    (c) => c.required === true && c.status === "unknown"
  );
  return { compatible, hasWarnings, checks };
}

/**
 * Build a single PermissionItem.
 * @param {object} fields
 * @returns {object}
 */
function makePermissionItem({ capability, source, evidence, risk }) {
  return { capability, source, evidence, risk };
}

/**
 * Build a PermissionRequest with pending decision.
 * @param {Array} items
 * @returns {object}
 */
function makePermissionRequest(items = []) {
  return {
    items,
    decision: "pending",
    decidedAt: null,
  };
}

/**
 * Build an ImportStage entry.
 * @param {object} fields
 * @returns {object}
 */
function makeStage({
  stage,
  status,
  startedAt,
  finishedAt,
  detail = "",
  error = null,
}) {
  return { stage, status, startedAt, finishedAt, detail, error };
}

/**
 * Build an ImportRecord (stored in skill_imports table as JSON columns).
 * @param {object} fields
 * @returns {object}
 */
function makeImportRecord({
  id,
  slug,
  startedAt,
  finishedAt,
  status,
  stages,
  envResult,
  permissionRequest,
  conversationRef,
  installed,
  failureReason,
}) {
  return {
    id,
    slug,
    startedAt,
    finishedAt,
    status,
    stages: stages || [],
    envResult: envResult || makeEnvResult([]),
    permissionRequest: permissionRequest || makePermissionRequest([]),
    conversationRef: conversationRef || null,
    installed: !!installed,
    failureReason: failureReason || null,
  };
}

/**
 * Build an ImportResult — the payload returned to the frontend.
 * Includes backward-compatible fields from the original stub plus new fields.
 * @param {object} fields
 * @returns {object}
 */
function makeImportResult({
  // backward-compat fields
  slug,
  title,
  sourceType,
  sourcePath,
  entryFile,
  files,
  validation,
  detailRoute,
  // new fields
  success,
  manifest,
  envResult,
  permissionRequest,
  conversationRef,
  installed,
  active,
  importId,
  failureReason,
}) {
  return {
    // backward-compat
    slug,
    title,
    sourceType,
    sourcePath,
    entryFile,
    files,
    validation,
    detailRoute,
    // new
    success: !!success,
    manifest: manifest || null,
    envResult: envResult || null,
    permissionRequest: permissionRequest || null,
    conversationRef: conversationRef || null,
    installed: !!installed,
    active: !!active,
    importId: importId || null,
    failureReason: failureReason || null,
  };
}

module.exports = {
  makeManifest,
  makeEnvCheck,
  makeEnvResult,
  makePermissionItem,
  makePermissionRequest,
  makeStage,
  makeImportRecord,
  makeImportResult,
};
