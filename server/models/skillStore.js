const fs = require("fs");
const path = require("path");

const STORE_ROOT = path.resolve(__dirname, "../storage/skill-store");

function safeReadJson(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf8"));
  } catch (error) {
    console.error(`[SkillStore] Failed to read JSON ${filepath}`, error);
    return null;
  }
}

function listSkillDirectories() {
  if (!fs.existsSync(STORE_ROOT)) return [];

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

function readSkillDirectory(dirpath) {
  const metadataPath = path.resolve(dirpath, "skill.json");
  const metadata = safeReadJson(metadataPath);
  if (!metadata?.slug) return null;

  const entryFile = metadata.entryFile || "SKILL.md";
  const entryPath = path.resolve(dirpath, entryFile);
  const content = fs.existsSync(entryPath)
    ? fs.readFileSync(entryPath, "utf8")
    : "";

  const files = fs
    .readdirSync(dirpath)
    .filter((name) => fs.lstatSync(path.resolve(dirpath, name)).isFile())
    .map((name) => ({
      name,
      size: fs.statSync(path.resolve(dirpath, name)).size,
    }));

  return {
    ...metadata,
    content,
    files,
    stats: {
      fileCount: files.length,
      contentLength: content.length,
    },
  };
}

const SkillStore = {
  root: STORE_ROOT,

  list: function () {
    return listSkillDirectories()
      .map(readSkillDirectory)
      .filter(Boolean)
      .map((skill) => ({
        slug: skill.slug,
        name: skill.name,
        title: skill.title,
        description: skill.description,
        summary: skill.summary || "",
        author: skill.author || "",
        version: skill.version || "",
        tags: Array.isArray(skill.tags) ? skill.tags : [],
        featured: !!skill.featured,
        sourcePath: skill.sourcePath || "",
        fileCount: skill.stats.fileCount,
      }))
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.title.localeCompare(b.title));
  },

  get: function (slug = "") {
    if (!slug) return null;
    const targetDir = path.resolve(STORE_ROOT, slug);
    if (!targetDir.startsWith(STORE_ROOT) || !fs.existsSync(targetDir)) return null;

    const skill = readSkillDirectory(targetDir);
    if (!skill) return null;

    return {
      slug: skill.slug,
      name: skill.name,
      title: skill.title,
      description: skill.description,
      summary: skill.summary || "",
      author: skill.author || "",
      version: skill.version || "",
      tags: Array.isArray(skill.tags) ? skill.tags : [],
      featured: !!skill.featured,
      sourcePath: skill.sourcePath || "",
      entryFile: skill.entryFile || "SKILL.md",
      files: skill.files,
      content: skill.content,
      stats: skill.stats,
    };
  },
};

module.exports = { SkillStore };
