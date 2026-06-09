const fs = require("fs");
const path = require("path");
const slugify = require("slugify");
const { v4: uuidv4 } = require("uuid");
const AdmZip = require("adm-zip");
const ImportedPlugin = require("../utils/agents/imported");
const { isWithin, normalizePath } = require("../utils/files");
const { SkillImporter } = require("../utils/agents/skillImporter/index");
const { RunLog } = require("../utils/agents/skillImporter/runLog");
const {
  check: checkCompleteness,
} = require("../utils/agents/skillCompleter/completeness");
const { recognize } = require("../utils/agents/skillImporter/recognizer");
const { SkillCompleter } = require("../utils/agents/skillCompleter/index");

const STORE_ROOT = path.resolve(__dirname, "../storage/skill-store");
const UPLOAD_ROOT = path.resolve(__dirname, "../storage/skill-store-uploads");
const STAGING_ROOT = path.resolve(__dirname, "../storage/skill-store-staging");
const SKILL_DETAIL_ROUTE = "/settings/community-hub/skills";
const COVER_CANDIDATES = [
  "cover.png",
  "cover.jpg",
  "cover.jpeg",
  "cover.webp",
  "cover.svg",
];

function ensureDir(dirpath) {
  fs.mkdirSync(dirpath, { recursive: true });
}

function safeReadJson(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf8"));
  } catch (error) {
    console.error(`[SkillStore] Failed to read JSON ${filepath}`, error);
    return null;
  }
}

function listSkillDirectories() {
  ensureDir(STORE_ROOT);

  return fs
    .readdirSync(STORE_ROOT)
    .map((name) => path.resolve(STORE_ROOT, name))
    .filter((filepath) => {
      try {
        return fs.lstatSync(filepath).isDirectory();
      } catch {
        return false;
      }
    });
}

function listFilesRecursive(dirpath, rootDir = dirpath) {
  if (!fs.existsSync(dirpath)) return [];

  return fs.readdirSync(dirpath).flatMap((entry) => {
    const absolutePath = path.resolve(dirpath, entry);
    const relativePath = path
      .relative(rootDir, absolutePath)
      .replace(/\\/g, "/");
    const stat = fs.lstatSync(absolutePath);

    if (stat.isDirectory()) return listFilesRecursive(absolutePath, rootDir);
    return [{ name: relativePath, size: stat.size }];
  });
}

function firstMarkdownHeading(content = "") {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function firstMarkdownParagraph(content = "") {
  const cleaned = content
    .replace(/^#.*$/gm, "")
    .split(/\r?\n\r?\n/)
    .map((block) => block.replace(/\r?\n/g, " ").trim())
    .find(Boolean);
  return cleaned || "";
}

function normalizeSlug(rawValue = "", fallback = "skill") {
  const normalized = slugify(String(rawValue || fallback), {
    lower: true,
    strict: true,
    trim: true,
  });
  return normalized || fallback;
}

function reserveUniqueSlug(baseSlug = "skill") {
  const normalizedBase = normalizeSlug(baseSlug);
  let candidate = normalizedBase;
  let counter = 1;

  while (fs.existsSync(path.resolve(STORE_ROOT, candidate))) {
    candidate = `${normalizedBase}-${counter}`;
    counter += 1;
  }

  return candidate;
}

function detectContentRoot(extractRoot) {
  let currentRoot = extractRoot;

  while (true) {
    const entries = fs.readdirSync(currentRoot);
    const directories = entries.filter((entry) =>
      fs.lstatSync(path.resolve(currentRoot, entry)).isDirectory()
    );
    const files = entries.filter((entry) =>
      fs.lstatSync(path.resolve(currentRoot, entry)).isFile()
    );

    if (files.length > 0 || directories.length !== 1) return currentRoot;
    currentRoot = path.resolve(currentRoot, directories[0]);
  }
}

function copyDirContents(sourceDir, targetDir) {
  ensureDir(targetDir);

  for (const entry of fs.readdirSync(sourceDir)) {
    const sourcePath = path.resolve(sourceDir, entry);
    const targetPath = path.resolve(targetDir, entry);
    const stat = fs.lstatSync(sourcePath);

    if (stat.isDirectory()) {
      copyDirContents(sourcePath, targetPath);
      continue;
    }

    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function readSkillDirectory(dirpath) {
  const metadataPath = path.resolve(dirpath, "skill.json");
  const metadata = safeReadJson(metadataPath);
  if (!metadata?.slug) return null;

  const entryFile = metadata.entryFile || "SKILL.md";
  const entryPath = path.resolve(dirpath, entryFile);
  const content = fs.existsSync(entryPath)
    ? fs.readFileSync(entryPath, "utf8")
    : "";
  const files = listFilesRecursive(dirpath);

  const coverImage = metadata.coverImage
    ? path.resolve(dirpath, metadata.coverImage)
    : null;
  const installedPlugins = ImportedPlugin.listImportedPlugins();
  const installedPlugin = installedPlugins.find(
    (plugin) => plugin.hubId === metadata.slug
  );

  return {
    ...metadata,
    content,
    files,
    coverImagePath:
      coverImage && fs.existsSync(coverImage)
        ? `/api/skills/store/${metadata.slug}/assets/${metadata.coverImage}`
        : null,
    installState: installedPlugin
      ? {
          status: installedPlugin.active ? "installed-active" : "installed",
          installedAt:
            installedPlugin.installedAt ||
            installedPlugin.lastUpdatedAt ||
            installedPlugin.createdAt ||
            null,
        }
      : { status: "available", installedAt: null },
    stats: {
      fileCount: files.length,
      contentLength: content.length,
    },
  };
}

function summarizeSkill(skill) {
  return {
    slug: skill.slug,
    name: skill.name,
    title: skill.title,
    description: skill.description,
    summary: skill.summary || "",
    author: skill.author || "",
    authorUrl: skill.authorUrl || "",
    version: skill.version || "",
    tags: Array.isArray(skill.tags) ? skill.tags : [],
    featured: !!skill.featured,
    coverImagePath: skill.coverImagePath,
    updatedAt: skill.updatedAt || "",
    uploadedAt: skill.uploadedAt || null,
    sourcePath: skill.sourcePath || "",
    sourceType: skill.sourceType || "seeded",
    fileCount: skill.stats.fileCount,
    installState: skill.installState,
    validation: skill.validation || {
      valid: true,
      errors: [],
      warnings: [],
    },
    agentBridge: skill.agentBridge || {
      status: "not-requested",
      message: "Agent importer bridge not invoked yet.",
    },
  };
}

function detailSkill(skill) {
  return {
    ...summarizeSkill(skill),
    entryFile: skill.entryFile || "SKILL.md",
    files: skill.files,
    content: skill.content,
    stats: skill.stats,
  };
}

function normalizeMetadata({
  rootDir,
  parsedMetadata = {},
  originalFilename = "",
  uploadedAt,
}) {
  const entryFile = parsedMetadata.entryFile || "SKILL.md";
  const entryPath = path.resolve(rootDir, entryFile);
  const content = fs.existsSync(entryPath)
    ? fs.readFileSync(entryPath, "utf8")
    : "";
  const heading = firstMarkdownHeading(content);
  const paragraph = firstMarkdownParagraph(content);
  const filenameBase = path.basename(
    originalFilename,
    path.extname(originalFilename)
  );
  const coverImage = COVER_CANDIDATES.find((candidate) =>
    fs.existsSync(path.resolve(rootDir, candidate))
  );

  const requestedSlug = normalizeSlug(
    parsedMetadata.slug || parsedMetadata.name || heading || filenameBase
  );
  const slug = reserveUniqueSlug(requestedSlug);
  const title = parsedMetadata.title || heading || requestedSlug;
  const description =
    parsedMetadata.description ||
    parsedMetadata.summary ||
    paragraph ||
    "Uploaded local skill package.";

  return {
    slug,
    name: parsedMetadata.name || slug,
    title,
    description,
    summary: parsedMetadata.summary || description,
    author: parsedMetadata.author || "Local upload",
    authorUrl: parsedMetadata.authorUrl || "",
    version: parsedMetadata.version || "draft",
    tags: Array.isArray(parsedMetadata.tags) ? parsedMetadata.tags : [],
    featured: Boolean(parsedMetadata.featured),
    updatedAt: parsedMetadata.updatedAt || uploadedAt,
    uploadedAt,
    coverImage: parsedMetadata.coverImage || coverImage || null,
    entryFile,
    sourcePath: parsedMetadata.sourcePath || `uploaded:${originalFilename}`,
    sourceType: "uploaded-zip",
  };
}

function buildValidation({ rootDir, entryFile, files, parsedMetadata }) {
  const errors = [];
  const warnings = [];
  const normalizedFiles = files.map((file) => file.name.toLowerCase());
  const entryPath = path.resolve(rootDir, entryFile);
  const hasPluginJson = normalizedFiles.includes("plugin.json");
  const hasHandlerJs = normalizedFiles.includes("handler.js");
  const hasCover = Boolean(parsedMetadata.coverImage);
  const mcpFile = normalizedFiles.find(
    (name) =>
      name.includes("mcp") ||
      name.endsWith(".mcp.json") ||
      name.endsWith("/mcp.json")
  );

  if (!fs.existsSync(entryPath)) {
    errors.push(`Missing required entry file "${entryFile}".`);
  }

  if (mcpFile) {
    errors.push(
      `Detected MCP-related file "${mcpFile}". This upload flow currently supports non-MCP skills only.`
    );
  }

  if (!parsedMetadata.description) {
    warnings.push(
      "No description provided in skill.json. The detail page is using text derived from SKILL.md."
    );
  }

  if (!hasCover) {
    warnings.push(
      "No cover image found. The store card will render without a cover."
    );
  }

  if (!hasPluginJson || !hasHandlerJs) {
    warnings.push(
      "Agent import files are incomplete. Preview works, but the Agent importer bridge is still pending."
    );
  }

  return {
    valid: errors.length === 0,
    schemaVersion: "local-skill-store/v2",
    mode: "preview-only",
    errors,
    warnings,
    capabilities: {
      hasEntryFile: fs.existsSync(entryPath),
      hasCoverImage: hasCover,
      hasAgentFiles: hasPluginJson && hasHandlerJs,
      containsMcp: Boolean(mcpFile),
    },
  };
}

function buildAgentBridgeStatus(skill) {
  if (skill.validation?.capabilities?.containsMcp) {
    return {
      status: "blocked",
      message:
        "This staged upload includes MCP-related files and is blocked from the current bridge.",
    };
  }

  if (!skill.validation?.capabilities?.hasAgentFiles) {
    return {
      status: "ready-for-stub",
      message:
        "Preview is ready. Agent importer handoff is still a stub and can be wired later.",
    };
  }

  return {
    status: "ready-for-stub",
    message:
      "Skill package validated. Agent importer handoff is waiting for the integration owner.",
  };
}

function extractZipSafely(zipFilePath) {
  ensureDir(STAGING_ROOT);
  const extractionId = uuidv4();
  const extractionDir = path.resolve(STAGING_ROOT, extractionId);
  ensureDir(extractionDir);

  const zip = new AdmZip(zipFilePath);
  for (const entry of zip.getEntries()) {
    const destination = path.resolve(extractionDir, entry.entryName);
    if (
      !isWithin(extractionDir, destination) &&
      extractionDir !== destination
    ) {
      throw new Error(
        `Entry "${entry.entryName}" would extract outside the staging directory.`
      );
    }
  }

  zip.extractAllTo(extractionDir, true);
  return { extractionDir, contentRoot: detectContentRoot(extractionDir) };
}

const SkillStore = {
  root: STORE_ROOT,
  uploadRoot: UPLOAD_ROOT,
  stagingRoot: STAGING_ROOT,

  list: function () {
    return listSkillDirectories()
      .map(readSkillDirectory)
      .filter(Boolean)
      .map(summarizeSkill)
      .sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          a.title.localeCompare(b.title)
      );
  },

  get: function (slug = "") {
    if (!slug) return null;
    const targetDir = path.resolve(STORE_ROOT, normalizePath(slug));
    if (!isWithin(STORE_ROOT, targetDir) || !fs.existsSync(targetDir))
      return null;

    const skill = readSkillDirectory(targetDir);
    if (!skill) return null;
    return detailSkill(skill);
  },

  /**
   * Get skill detail enriched with the latest import record.
   * Returns the full skill plus importRecord fields for the detail page.
   * @param {string} slug
   * @returns {Promise<object|null>}
   */
  getWithImport: async function (slug = "") {
    const skill = this.get(slug);
    if (!skill) return null;

    let importRecord = null;
    try {
      importRecord = await RunLog.getLatestBySlug(slug);
    } catch {
      // non-fatal
    }

    // Compute completeness report from current disk state
    let completeness = null;
    try {
      const skillDir = path.resolve(STORE_ROOT, normalizePath(slug));
      const rawJson = safeReadJson(path.resolve(skillDir, "skill.json")) || {};
      const manifest = recognize(skillDir, rawJson);
      completeness = checkCompleteness(manifest, rawJson);
    } catch {
      // non-fatal — detail page degrades gracefully
    }

    return {
      ...skill,
      completeness,
      importRecord: importRecord
        ? {
            id: importRecord.id,
            status: importRecord.status,
            stages: importRecord.stages,
            envResult: importRecord.envResult,
            permissionRequest: importRecord.permissionRequest,
            conversationRef: importRecord.conversationRef,
            installed: importRecord.installed,
            active: importRecord.active,
            failureReason: importRecord.failureReason,
            createdAt: importRecord.createdAt,
          }
        : null,
    };
  },

  install: function (slug = "") {
    if (!slug) return { success: false, error: "Skill slug is required." };
    const sourceDir = path.resolve(STORE_ROOT, normalizePath(slug));
    const skill = this.get(slug);
    if (!skill) return { success: false, error: "Skill not found." };

    const requiredFiles = ["plugin.json", "handler.js"];
    for (const file of requiredFiles) {
      const filepath = path.resolve(sourceDir, file);
      if (!isWithin(sourceDir, filepath) || !fs.existsSync(filepath)) {
        return {
          success: false,
          error: `Skill is missing required file: ${file}`,
        };
      }
    }

    ImportedPlugin.checkPluginFolderExists();
    const destinationDir = path.resolve(
      __dirname,
      "../storage/plugins/agent-skills",
      slug
    );
    if (fs.existsSync(destinationDir)) {
      fs.rmSync(destinationDir, { recursive: true, force: true });
    }

    fs.mkdirSync(destinationDir, { recursive: true });
    for (const file of requiredFiles) {
      fs.copyFileSync(
        path.resolve(sourceDir, file),
        path.resolve(destinationDir, file)
      );
    }

    const pluginJsonPath = path.resolve(destinationDir, "plugin.json");
    const pluginJson = safeReadJson(pluginJsonPath);
    if (!pluginJson) {
      return { success: false, error: "Failed to read installed plugin.json" };
    }

    pluginJson.hubId = slug;
    pluginJson.active = false;
    pluginJson.installedAt = new Date().toISOString();
    fs.writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2));

    return { success: true, error: null, skill: this.get(slug) };
  },

  ingestZipUpload: function (uploadedFile = null) {
    if (!uploadedFile?.path || !fs.existsSync(uploadedFile.path)) {
      return { success: false, error: "Uploaded zip file was not found." };
    }

    if (
      path
        .extname(uploadedFile.originalname || uploadedFile.path)
        .toLowerCase() !== ".zip"
    ) {
      return {
        success: false,
        error: "Only .zip skill packages are supported right now.",
      };
    }

    let extractionDir = null;
    try {
      const extracted = extractZipSafely(uploadedFile.path);
      extractionDir = extracted.extractionDir;
      const contentRoot = extracted.contentRoot;
      const rawMetadata =
        safeReadJson(path.resolve(contentRoot, "skill.json")) || {};
      const uploadedAt = new Date().toISOString();
      const normalizedMetadata = normalizeMetadata({
        rootDir: contentRoot,
        parsedMetadata: rawMetadata,
        originalFilename:
          uploadedFile.originalname || path.basename(uploadedFile.path),
        uploadedAt,
      });
      const files = listFilesRecursive(contentRoot);
      const validation = buildValidation({
        rootDir: contentRoot,
        entryFile: normalizedMetadata.entryFile,
        files,
        parsedMetadata: normalizedMetadata,
      });

      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(" "),
          validation,
        };
      }

      const destinationDir = path.resolve(STORE_ROOT, normalizedMetadata.slug);
      ensureDir(STORE_ROOT);
      copyDirContents(contentRoot, destinationDir);

      const finalMetadata = {
        ...normalizedMetadata,
        validation,
        agentBridge: buildAgentBridgeStatus({ validation: validation }),
      };
      fs.writeFileSync(
        path.resolve(destinationDir, "skill.json"),
        JSON.stringify(finalMetadata, null, 2)
      );

      return {
        success: true,
        slug: finalMetadata.slug,
        skill: this.get(finalMetadata.slug),
      };
    } catch (error) {
      console.error("[SkillStore] Failed to ingest skill zip", error);
      return { success: false, error: error.message };
    } finally {
      if (uploadedFile?.path && fs.existsSync(uploadedFile.path)) {
        fs.unlinkSync(uploadedFile.path);
      }
      if (extractionDir && fs.existsSync(extractionDir)) {
        fs.rmSync(extractionDir, { recursive: true, force: true });
      }
    }
  },

  /**
   * Run the Skill import pipeline (replaces the previous stub).
   * Returns { success, payload: ImportResult }.
   *
   * Backward-compat: payload always includes the original stub fields
   * (slug, title, sourceType, sourcePath, entryFile, files, validation, detailRoute)
   * plus new fields (manifest, envResult, permissionRequest, etc.).
   *
   * @param {string} slug
   * @param {object} opts
   * @param {string|null} opts.workspaceId
   * @returns {Promise<object>}
   */
  handoffToAgentImporter: async function (slug = "", opts = {}) {
    const skill = this.get(slug);
    if (!skill) return { success: false, error: "Skill not found." };

    const importResult = await SkillImporter.run(slug, {
      workspaceId: opts.workspaceId || null,
      skillStore: this,
    });

    return {
      success: importResult.success,
      payload: importResult,
    };
  },

  /**
   * Run the one-click file completion pipeline.
   * Only generates files that are missing — never overwrites existing files.
   *
   * @param {string} slug
   * @param {string[]} [targets]  optional list of specific file names to generate
   * @returns {Promise<{ success: boolean, payload: CompleteResult }>}
   */
  completeSkill: async function (slug = "", targets = null) {
    if (!slug) return { success: false, error: "Skill slug is required." };
    const skill = this.get(slug);
    if (!skill) return { success: false, error: "Skill not found." };

    const result = await SkillCompleter.run(slug, targets || null);

    // Persist rescanned permissionRequest to the latest import record
    // so the detail page shows updated permissions after handler.js generation.
    if (result.permissionRequest) {
      try {
        const importRecord = await RunLog.getLatestBySlug(slug);
        if (importRecord) {
          await RunLog.updateApproval(importRecord.id, {
            permissionRequest: result.permissionRequest,
          });
        }
      } catch {
        // non-fatal
      }
    }

    return { success: result.success, payload: result };
  },

  /**
   * Build a zip archive of the skill directory and return its absolute path.
   * Caller is responsible for deleting the temp file after streaming.
   *
   * @param {string} slug
   * @returns {{ success: boolean, zipPath?: string, error?: string, completeness?: object }}
   */
  downloadPackage: function (slug = "") {
    if (!slug) return { success: false, error: "Skill slug is required." };
    const skillDir = path.resolve(STORE_ROOT, normalizePath(slug));
    if (!isWithin(STORE_ROOT, skillDir) || !fs.existsSync(skillDir)) {
      return { success: false, error: "Skill not found." };
    }

    // Re-check completeness synchronously (guard at endpoint level too)
    let completeness = null;
    try {
      const rawJson = safeReadJson(path.resolve(skillDir, "skill.json")) || {};
      const manifest = recognize(skillDir, rawJson);
      completeness = checkCompleteness(manifest, rawJson);
    } catch {
      // non-fatal — allow download even if check fails
    }

    if (completeness && !completeness.downloadable) {
      return {
        success: false,
        error: "Skill is missing required files and cannot be downloaded.",
        completeness,
      };
    }

    // Build zip in-memory using AdmZip (already a project dependency)
    const zip = new AdmZip();
    const addDir = (dirpath) => {
      for (const entry of fs.readdirSync(dirpath)) {
        const abs = path.resolve(dirpath, entry);
        const rel = path.relative(skillDir, abs).replace(/\\/g, "/");
        // Safety: skip anything outside skillDir
        if (!isWithin(skillDir, abs)) continue;
        const stat = fs.lstatSync(abs);
        if (stat.isDirectory()) {
          addDir(abs);
        } else {
          zip.addLocalFile(
            abs,
            path.dirname(rel) === "." ? "" : path.dirname(rel)
          );
        }
      }
    };
    addDir(skillDir);

    const tmpPath = path.resolve(STAGING_ROOT, `${slug}-${Date.now()}.zip`);
    ensureDir(STAGING_ROOT);
    zip.writeZip(tmpPath);

    return { success: true, zipPath: tmpPath };
  },

  /**
   * Approve and activate an installed skill.
   * Sets plugin.json active=true and updates the latest import record.
   *
   * @param {string} slug
   * @returns {Promise<object>} { success, skill, error? }
   */
  approve: async function (slug = "") {
    if (!slug) return { success: false, error: "Skill slug is required." };

    const skill = this.get(slug);
    if (!skill) return { success: false, error: "Skill not found." };

    // Set active=true in agent-skills plugin.json
    const updated = ImportedPlugin.updateImportedPlugin(slug, { active: true });
    if (!updated) {
      return {
        success: false,
        error: "Skill is not installed. Please import it first.",
      };
    }

    // Update the latest import record's permissionRequest decision
    try {
      const importRecord = await RunLog.getLatestBySlug(slug);
      if (importRecord) {
        const updatedPerms = {
          ...importRecord.permissionRequest,
          decision: "approved",
          decidedAt: new Date().toISOString(),
        };
        await RunLog.updateApproval(importRecord.id, {
          active: true,
          installed: true,
          permissionRequest: updatedPerms,
        });
      }
    } catch (err) {
      console.warn(
        "[SkillStore.approve] Failed to update import record:",
        err.message
      );
      // Non-fatal — the plugin is activated regardless
    }

    return { success: true, skill: this.get(slug) };
  },
};

module.exports = { SkillStore };
