const fs = require("fs");
const path = require("path");
const slugify = require("slugify");
const { v4: uuidv4 } = require("uuid");
const AdmZip = require("adm-zip");
const ImportedPlugin = require("../utils/agents/imported");
const { isWithin, normalizePath } = require("../utils/files");

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

  handoffToAgentImporter: function (slug = "") {
    const skill = this.get(slug);
    if (!skill) return { success: false, error: "Skill not found." };

    const payload = {
      slug: skill.slug,
      title: skill.title,
      sourceType: skill.sourceType,
      sourcePath: skill.sourcePath,
      entryFile: skill.entryFile,
      files: skill.files,
      validation: skill.validation,
      detailRoute: `${SKILL_DETAIL_ROUTE}/${skill.slug}`,
    };

    return {
      success: true,
      stub: true,
      message:
        "Agent importer bridge is still a stub. Replace SkillStore.handoffToAgentImporter() with the final Agent integration.",
      payload,
    };
  },
};

module.exports = { SkillStore };
