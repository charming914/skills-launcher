const path = require("path");
const { makeCompletenessItem, makeCompletenessReport } = require("./schema");

const COVER_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".svg"];

/**
 * Check whether a cover image is present in the manifest files list.
 * @param {Array} files  SkillManifest.files ({ path, size }[])
 * @returns {boolean}
 */
function hasCoverFile(files = []) {
  return files.some((f) => {
    const ext = path.extname(f.path).toLowerCase();
    return (
      COVER_EXTENSIONS.includes(ext) &&
      path.basename(f.path, ext).toLowerCase().startsWith("cover")
    );
  });
}

/**
 * Check whether a given file name exists in the manifest files list (case-insensitive).
 * @param {Array} files
 * @param {string} name
 * @returns {boolean}
 */
function hasFile(files, name) {
  return files.some((f) => f.path.toLowerCase() === name.toLowerCase());
}

/**
 * Get the list of AI-generated files from skill.json.generatedFiles.
 * @param {object} rawJson  parsed skill.json (may be null)
 * @returns {string[]} file names that were AI-generated
 */
function getAiGeneratedFiles(rawJson = {}) {
  if (!Array.isArray(rawJson?.generatedFiles)) return [];
  return rawJson.generatedFiles.map((g) => g.file);
}

/**
 * Build a CompletenessReport from a SkillManifest + raw skill.json.
 *
 * Rules (§5):
 *   SKILL.md (or entryFile)  → severity 'blocks-download', canGenerate true
 *   plugin.json              → severity 'blocks-run',      canGenerate true
 *   handler.js               → severity 'blocks-run',      canGenerate true
 *   cover.*                  → severity 'recommended',     canGenerate true
 *
 * @param {object} manifest   SkillManifest from recognizer.recognize()
 * @param {object} rawJson    raw skill.json (optional, for generatedFiles)
 * @returns {object} CompletenessReport
 */
function check(manifest, rawJson = {}) {
  const files = manifest.files || [];
  const entryFile = manifest.entryFile || "SKILL.md";
  const aiGeneratedFiles = getAiGeneratedFiles(rawJson);

  const items = [];

  // 1. Entry file (SKILL.md / entryFile)
  const hasEntry = hasFile(files, entryFile);
  items.push(
    makeCompletenessItem({
      file: entryFile,
      label: entryFile,
      status: hasEntry ? "present" : "missing",
      severity: "blocks-download",
      reason: "Skill 核心文档，缺失则 skill 无意义、不应导出",
      canGenerate: true,
      generatedByAi: aiGeneratedFiles.includes(entryFile),
    })
  );

  // 2. plugin.json
  const hasPlugin = manifest.hasPluginJson;
  items.push(
    makeCompletenessItem({
      file: "plugin.json",
      label: "plugin.json",
      status: hasPlugin ? "present" : "missing",
      severity: "blocks-run",
      reason:
        "作为 Agent Skill 运行/对话的插件清单（hubId/entrypoint/examples）",
      canGenerate: true,
      generatedByAi: aiGeneratedFiles.includes("plugin.json"),
    })
  );

  // 3. handler.js
  const hasHandler = manifest.hasHandlerJs;
  items.push(
    makeCompletenessItem({
      file: "handler.js",
      label: "handler.js",
      status: hasHandler ? "present" : "missing",
      severity: "blocks-run",
      reason:
        "Skill 执行入口（module.exports.runtime.execute），缺失则无法调用",
      canGenerate: true,
      generatedByAi: aiGeneratedFiles.includes("handler.js"),
    })
  );

  // 4. Cover image
  const hasCover = hasCoverFile(files);
  items.push(
    makeCompletenessItem({
      file: "cover",
      label: "封面图（cover.*）",
      status: hasCover ? "present" : "missing",
      severity: "recommended",
      reason: "仅展示用，不影响下载/运行",
      canGenerate: true,
      generatedByAi: aiGeneratedFiles.some((f) => f.startsWith("cover")),
    })
  );

  return makeCompletenessReport(items);
}

module.exports = { check };
