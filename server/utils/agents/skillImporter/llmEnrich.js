/**
 * Optional LLM enrichment hook.
 *
 * By default this module is DISABLED (returns null immediately).
 * When enabled (set SKILL_IMPORTER_LLM_ENRICH=true in environment),
 * it attempts to call the configured LLM to augment manifest description/summary
 * or suggest permission items.
 *
 * CRITICAL: Any failure in this module MUST be caught and silently ignored by
 * callers. The import pipeline must never fail because of LLM enrichment.
 */

const ENABLED = process.env.SKILL_IMPORTER_LLM_ENRICH === "true";

/**
 * Attempt to enrich the manifest via LLM.
 * Returns enriched fields or null — callers should merge, not replace.
 *
 * @param {string} skillDir
 * @param {object} manifest  SkillManifest
 * @returns {Promise<{description?: string, summary?: string}|null>}
 */
async function enrichManifest(skillDir, manifest) {
  if (!ENABLED) return null;
  // Future implementation: call LLM with SKILL.md content and return enriched fields.
  // Example integration point:
  //   const provider = LLMProvider.get();
  //   const response = await provider.complete(prompt);
  //   return { description: response.description };
  return null;
}

/**
 * Attempt to suggest additional permission items via LLM review.
 * Returns PermissionItem[] or [] — callers should merge with static results.
 *
 * @param {string} skillDir
 * @param {object} manifest  SkillManifest
 * @returns {Promise<object[]>}
 */
async function suggestPermissions(skillDir, manifest) {
  if (!ENABLED) return [];
  // Future implementation: LLM reviews handler.js and proposes permissions.
  return [];
}

module.exports = { enrichManifest, suggestPermissions };
