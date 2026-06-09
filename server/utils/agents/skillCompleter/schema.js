/**
 * Data contracts for the SkillCompleter pipeline.
 * Shared between backend modules and serialised to frontend.
 */

/**
 * One file completeness entry.
 * @param {object} fields
 * @returns {object} CompletenessItem
 */
function makeCompletenessItem({
  file,
  label,
  status,
  severity,
  reason,
  canGenerate,
  generatedByAi = false,
}) {
  return { file, label, status, severity, reason, canGenerate, generatedByAi };
}

/**
 * Build a CompletenessReport from a list of items.
 * downloadable = no 'blocks-download' missing item
 * runnable     = plugin.json AND handler.js are present
 * complete     = no missing item at all
 * @param {Array} items
 * @returns {object} CompletenessReport
 */
function makeCompletenessReport(items = []) {
  const missing = items.filter((i) => i.status === "missing");
  const downloadable = !missing.some((i) => i.severity === "blocks-download");
  const runnable = items
    .filter((i) => i.file === "plugin.json" || i.file === "handler.js")
    .every((i) => i.status === "present");
  const complete = missing.length === 0;
  return { complete, downloadable, runnable, items };
}

/**
 * Build a GenerationResult for one generated file.
 * @param {object} fields
 * @returns {object} GenerationResult
 */
function makeGenerationResult({ file, status, method, bytes = 0, note = "" }) {
  return { file, status, method, bytes, note };
}

/**
 * Build a CompleteResult returned to the frontend.
 * @param {object} fields
 * @returns {object} CompleteResult
 */
function makeCompleteResult({
  success,
  slug,
  llmUsed,
  generated = [],
  report,
  permissionRequest = null,
}) {
  return {
    success: !!success,
    slug,
    llmUsed: !!llmUsed,
    generated,
    report: report || makeCompletenessReport([]),
    permissionRequest: permissionRequest || null,
  };
}

module.exports = {
  makeCompletenessItem,
  makeCompletenessReport,
  makeGenerationResult,
  makeCompleteResult,
};
