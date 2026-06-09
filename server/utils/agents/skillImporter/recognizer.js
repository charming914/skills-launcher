const fs = require("fs");
const path = require("path");
const { makeManifest } = require("./schema");

const COVER_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".svg"];

/**
 * Recursively list all files in a directory, returning relative paths.
 * @param {string} dirpath
 * @param {string} rootDir
 * @returns {{ path: string, size: number }[]}
 */
function listFiles(dirpath, rootDir = dirpath) {
  if (!fs.existsSync(dirpath)) return [];
  return fs.readdirSync(dirpath).flatMap((entry) => {
    const abs = path.resolve(dirpath, entry);
    const rel = path.relative(rootDir, abs).replace(/\\/g, "/");
    const stat = fs.lstatSync(abs);
    if (stat.isDirectory()) return listFiles(abs, rootDir);
    return [{ path: rel, size: stat.size }];
  });
}

/**
 * Determine if the skill depends on MCP.
 * Mirrors buildValidation logic in skillStore.js to avoid two standards.
 * @param {string[]} fileNames  lowercase file names
 * @param {object} rawJson  parsed skill.json
 * @returns {boolean}
 */
function detectMcpDependency(fileNames, rawJson = {}) {
  const hasMcpFile = fileNames.some(
    (name) =>
      name.includes("mcp") ||
      name.endsWith(".mcp.json") ||
      name.endsWith("/mcp.json")
  );
  if (hasMcpFile) return true;
  // Check skill.json declarations
  const src = JSON.stringify(rawJson).toLowerCase();
  return (
    src.includes("mcp") && (src.includes("protocol") || src.includes("server"))
  );
}

/**
 * Infer requirements from package.json / requirements.txt when skill.json
 * does not provide an explicit requirements block.
 * @param {string} skillDir
 * @param {object} rawJson  parsed skill.json
 * @returns {object} requirements
 */
function inferRequirements(skillDir, rawJson = {}) {
  const reqs = {
    node: null,
    python: null,
    env: [],
    pip: [],
    npm: [],
  };

  // Prefer explicit skill.json.requirements
  if (rawJson.requirements && typeof rawJson.requirements === "object") {
    return {
      node: rawJson.requirements.node || null,
      python: rawJson.requirements.python || null,
      env: Array.isArray(rawJson.requirements.env)
        ? rawJson.requirements.env
        : [],
      pip: Array.isArray(rawJson.requirements.pip)
        ? rawJson.requirements.pip
        : [],
      npm: Array.isArray(rawJson.requirements.npm)
        ? rawJson.requirements.npm
        : [],
    };
  }

  // Fallback: read package.json for node engine range
  const pkgPath = path.resolve(skillDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.engines?.node) reqs.node = pkg.engines.node;
      if (pkg.dependencies) {
        reqs.npm = Object.keys(pkg.dependencies);
      }
    } catch {
      // ignore
    }
  }

  // Fallback: requirements.txt implies Python runtime
  const reqTxtPath = path.resolve(skillDir, "requirements.txt");
  if (fs.existsSync(reqTxtPath)) {
    reqs.python = reqs.python || ">=3.8"; // conservative default
    try {
      const lines = fs
        .readFileSync(reqTxtPath, "utf8")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
      reqs.pip = lines;
    } catch {
      // ignore
    }
  }

  return reqs;
}

/**
 * Resolve skill type from manifest flags.
 * @param {boolean} hasPluginJson
 * @param {boolean} hasHandlerJs
 * @returns {'non-mcp-plugin'|'doc-only'|'unknown'}
 */
function resolveSkillType(hasPluginJson, hasHandlerJs) {
  if (hasPluginJson && hasHandlerJs) return "non-mcp-plugin";
  return "doc-only";
}

/**
 * Recognize a skill directory and produce a normalized SkillManifest.
 *
 * @param {string} skillDir  absolute path to the skill-store/<slug>/ directory
 * @param {object} baseMeta  already-normalized skill.json content
 * @returns {object} SkillManifest
 */
function recognize(skillDir, baseMeta = {}) {
  const files = listFiles(skillDir);
  const fileNames = files.map((f) => f.path.toLowerCase());

  const hasPluginJson = fileNames.includes("plugin.json");
  const hasHandlerJs = fileNames.includes("handler.js");
  const hasCoverImage = files.some((f) => {
    const ext = path.extname(f.path).toLowerCase();
    return (
      COVER_EXTENSIONS.includes(ext) &&
      path.basename(f.path, ext).toLowerCase().startsWith("cover")
    );
  });

  // Read raw skill.json from disk to access unparsed fields (requirements, permissions)
  let rawJson = {};
  const skillJsonPath = path.resolve(skillDir, "skill.json");
  if (fs.existsSync(skillJsonPath)) {
    try {
      rawJson = JSON.parse(fs.readFileSync(skillJsonPath, "utf8"));
    } catch {
      // ignore parse errors — use baseMeta
    }
  }

  const dependsOnMcp = detectMcpDependency(fileNames, rawJson);
  const requirements = inferRequirements(skillDir, rawJson);
  const skillType = resolveSkillType(hasPluginJson, hasHandlerJs);

  return makeManifest({
    slug: baseMeta.slug || "",
    name: baseMeta.name || baseMeta.slug || "",
    title: baseMeta.title || baseMeta.name || baseMeta.slug || "",
    version: baseMeta.version || "draft",
    description: baseMeta.description || "",
    entryFile: baseMeta.entryFile || "SKILL.md",
    skillType,
    files,
    hasPluginJson,
    hasHandlerJs,
    hasCoverImage,
    dependsOnMcp,
    requirements,
    declaredPermissions: Array.isArray(rawJson.permissions)
      ? rawJson.permissions
      : null,
  });
}

module.exports = { recognize };
