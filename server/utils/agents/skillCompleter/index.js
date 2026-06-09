/**
 * SkillCompleter — orchestrates one-click file completion for a skill.
 *
 * Flow:
 *   1. Load skill context (skill.json, SKILL.md, plugin.json)
 *   2. Build completeness report
 *   3. Get LLM provider (or null if unconfigured)
 *   4. For each missing, generatable file: call generator
 *   5. Write only files that don't already exist (never overwrite)
 *   6. Update skill.json.generatedFiles
 *   7. Re-run recognizer + completeness
 *   8. If handler.js was generated: re-run permissions scan
 *   9. Return CompleteResult
 */

const fs = require("fs");
const path = require("path");
const { recognize } = require("../skillImporter/recognizer");
const { resolvePermissions } = require("../skillImporter/permissions");
const { check: checkCompleteness } = require("./completeness");
const { makeGenerationResult, makeCompleteResult } = require("./schema");
const { getProvider } = require("./llmClient");
const skillMdGen = require("./generators/skillMd");
const pluginJsonGen = require("./generators/pluginJson");
const handlerJsGen = require("./generators/handlerJs");
const coverSvgGen = require("./generators/coverSvg");

const STORE_ROOT = path.resolve(__dirname, "../../../storage/skill-store");

function safeReadJson(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf8"));
  } catch {
    return null;
  }
}

function safeReadText(filepath) {
  try {
    return fs.readFileSync(filepath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Run the completion pipeline for a skill.
 *
 * @param {string} slug
 * @param {string[]} [targets]  optional list of specific file names to generate;
 *                              defaults to all missing+generatable items
 * @returns {Promise<import('./schema').CompleteResult>}
 */
async function run(slug, targets = null) {
  const skillDir = path.resolve(STORE_ROOT, slug);
  // Path safety: ensure skillDir stays within STORE_ROOT
  if (!skillDir.startsWith(STORE_ROOT + path.sep) || !fs.existsSync(skillDir)) {
    return makeCompleteResult({
      success: false,
      slug,
      llmUsed: false,
      generated: [],
      report: null,
      permissionRequest: null,
    });
  }

  // Load current state
  const rawJson = safeReadJson(path.resolve(skillDir, "skill.json")) || {};
  const manifest = recognize(skillDir, rawJson);
  const report = checkCompleteness(manifest, rawJson);

  // Determine what to generate
  const toGenerate = report.items.filter((item) => {
    if (item.status !== "missing" || !item.canGenerate) return false;
    if (targets && !targets.includes(item.file)) return false;
    return true;
  });

  if (toGenerate.length === 0) {
    return makeCompleteResult({
      success: true,
      slug,
      llmUsed: false,
      generated: [],
      report,
      permissionRequest: null,
    });
  }

  // Get LLM provider (null = no LLM configured → template fallback)
  let llm = null;
  try {
    llm = await getProvider();
  } catch {
    // unconfigured — template mode
  }

  // Build shared context
  const entryFile = manifest.entryFile || "SKILL.md";
  const existingSkillMd = safeReadText(path.resolve(skillDir, entryFile));
  const existingPluginJson = safeReadJson(
    path.resolve(skillDir, "plugin.json")
  );
  const ctx = {
    skillDir,
    meta: rawJson,
    existingSkillMd,
    existingPluginJson,
    existingFiles: manifest.files,
  };

  const generated = [];
  let handlerJsGenerated = false;

  for (const item of toGenerate) {
    const result = await _generateFile(
      item.file,
      ctx,
      llm,
      skillDir,
      entryFile
    );
    generated.push(result);
    if (item.file === "handler.js" && result.status === "generated") {
      handlerJsGenerated = true;
    }
    // Update ctx so subsequent generators see the file just created
    if (result.status === "generated") {
      if (item.file === entryFile) {
        ctx.existingSkillMd = safeReadText(path.resolve(skillDir, entryFile));
      } else if (item.file === "plugin.json") {
        ctx.existingPluginJson = safeReadJson(
          path.resolve(skillDir, "plugin.json")
        );
      }
    }
  }

  // Record generated files in skill.json.generatedFiles
  const successfullyGenerated = generated.filter(
    (g) => g.status === "generated"
  );
  if (successfullyGenerated.length > 0) {
    _updateGeneratedFiles(skillDir, rawJson, successfullyGenerated);
  }

  // Re-run recognizer + completeness with updated disk state
  const updatedRawJson =
    safeReadJson(path.resolve(skillDir, "skill.json")) || {};
  const updatedManifest = recognize(skillDir, updatedRawJson);
  const updatedReport = checkCompleteness(updatedManifest, updatedRawJson);

  // Re-run permissions scan if handler.js was generated (§N5 requirement)
  let permissionRequest = null;
  if (handlerJsGenerated) {
    try {
      permissionRequest = await resolvePermissions(skillDir, updatedManifest);
    } catch {
      // non-fatal
    }
  }

  const anyFailed = generated.some((g) => g.status === "failed");
  return makeCompleteResult({
    success: !anyFailed || generated.some((g) => g.status === "generated"),
    slug,
    llmUsed: !!llm,
    generated,
    report: updatedReport,
    permissionRequest,
  });
}

/**
 * Generate a single file and write it to disk (only if not already present).
 * @param {string} file  'SKILL.md' | 'plugin.json' | 'handler.js' | 'cover'
 * @param {object} ctx
 * @param {object|null} llm
 * @param {string} skillDir
 * @param {string} entryFile  actual entry file name (usually 'SKILL.md')
 * @returns {Promise<GenerationResult>}
 */
async function _generateFile(file, ctx, llm, skillDir, entryFile) {
  // Determine target filename on disk
  const targetFilename =
    file === "cover" ? "cover.svg" : file === entryFile ? entryFile : file;
  const targetPath = path.resolve(skillDir, targetFilename);

  // Never overwrite existing files
  if (fs.existsSync(targetPath)) {
    return makeGenerationResult({
      file,
      status: "skipped",
      method: "template",
      bytes: 0,
      note: "文件已存在，跳过生成",
    });
  }

  try {
    let result;
    if (file === entryFile || file === "SKILL.md") {
      result = await skillMdGen.generate(ctx, llm);
    } else if (file === "plugin.json") {
      result = await pluginJsonGen.generate(ctx, llm);
      // Validate JSON before writing
      JSON.parse(result.content);
    } else if (file === "handler.js") {
      result = await handlerJsGen.generate(ctx, llm);
      // Syntax check
      const ok = await handlerJsGen._syntaxCheck(result.content);
      if (!ok) {
        throw new Error("handler.js syntax check failed after generation");
      }
    } else if (file === "cover") {
      result = coverSvgGen.generate(ctx);
    } else {
      return makeGenerationResult({
        file,
        status: "failed",
        method: "template",
        bytes: 0,
        note: `未知文件类型: ${file}`,
      });
    }

    fs.writeFileSync(targetPath, result.content, "utf8");
    return makeGenerationResult({
      file,
      status: "generated",
      method: result.method,
      bytes: Buffer.byteLength(result.content, "utf8"),
      note: "",
    });
  } catch (err) {
    return makeGenerationResult({
      file,
      status: "failed",
      method: llm ? "llm" : "template",
      bytes: 0,
      note: err.message || "生成失败",
    });
  }
}

/**
 * Append generated file records to skill.json.generatedFiles.
 * @param {string} skillDir
 * @param {object} rawJson
 * @param {Array} results
 */
function _updateGeneratedFiles(skillDir, rawJson, results) {
  try {
    const skillJsonPath = path.resolve(skillDir, "skill.json");
    const current = safeReadJson(skillJsonPath) || rawJson;
    const existing = Array.isArray(current.generatedFiles)
      ? current.generatedFiles
      : [];
    const now = new Date().toISOString();
    for (const r of results) {
      existing.push({ file: r.file, method: r.method, at: now });
    }
    current.generatedFiles = existing;
    fs.writeFileSync(skillJsonPath, JSON.stringify(current, null, 2), "utf8");
  } catch {
    // non-fatal — skill.json update failure doesn't break the pipeline
  }
}

module.exports = { SkillCompleter: { run } };
