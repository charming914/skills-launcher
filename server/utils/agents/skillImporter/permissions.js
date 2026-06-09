/**
 * ⚠️  SECURITY NOTICE — 本期无运行时隔离
 *
 * handler.js 在主进程中通过 require() 直接加载，拥有与 Node.js 主进程
 * 完全相同的系统权限（文件系统、网络、子进程等）。
 * 本模块仅提供"审批闸门"：解析声明权限 + 静态扫描代码关键字，
 * 生成权限申请清单并要求管理员批准。
 *
 * 本期不实现任何运行时沙箱或进程隔离机制。
 * 批准操作只是解除 active=false 的限制，并不提供额外的权限边界。
 *
 * 未来扩展点（TODO）：
 *   - 使用 worker_threads 或 child_process 隔离 handler.js 的执行
 *   - 通过 Proxy 或 vm.Script 限制可访问的 Node 内置模块
 */

const fs = require("fs");
const path = require("path");
const { makePermissionItem, makePermissionRequest } = require("./schema");

/**
 * Keyword patterns mapping to capability + risk.
 * Each rule: { patterns, capability, risk }
 */
const STATIC_SCAN_RULES = [
  {
    patterns: [
      "child_process",
      "exec(",
      "execSync(",
      "spawn(",
      "spawnSync(",
      "execFile(",
    ],
    capability: "shell",
    risk: "high",
  },
  {
    patterns: [
      "require('fs')",
      'require("fs")',
      "fs.writeFile",
      "fs.writeFileSync",
      "fs.unlink",
      "fs.unlinkSync",
      "fs.rmdir",
      "fs.rm(",
      "fs.mkdir",
      "createWriteStream",
    ],
    capability: "fs-write",
    risk: "medium",
  },
  {
    patterns: [
      "fs.readFile",
      "fs.readFileSync",
      "fs.existsSync",
      "createReadStream",
      "fs.readdirSync",
      "fs.stat",
    ],
    capability: "fs-read",
    risk: "low",
  },
  {
    patterns: [
      "fetch(",
      "axios",
      "node-fetch",
      "require('http')",
      'require("http")',
      "require('https')",
      'require("https")',
      "require('net')",
      'require("net")',
      "http.request",
      "https.request",
      "got(",
      "superagent",
    ],
    capability: "network",
    risk: "medium",
  },
  {
    patterns: [
      "process.env",
      "API_KEY",
      "SECRET",
      "TOKEN",
      "openai.com",
      "api.anthropic",
      "googleapis",
      "OPENAI_",
      "ANTHROPIC_",
    ],
    capability: "api",
    risk: "low",
  },
];

/**
 * Map a declared permission string to a PermissionItem.
 * @param {string} perm
 * @returns {object|null}
 */
function mapDeclaredPermission(perm = "") {
  const lower = perm.toLowerCase();
  let capability = "api";
  let risk = "low";

  if (
    lower.includes("shell") ||
    lower.includes("exec") ||
    lower.includes("process")
  ) {
    capability = "shell";
    risk = "high";
  } else if (
    lower.includes("fs") ||
    lower.includes("file") ||
    lower.includes("write")
  ) {
    capability = lower.includes("read") ? "fs-read" : "fs-write";
    risk = capability === "fs-write" ? "medium" : "low";
  } else if (
    lower.includes("network") ||
    lower.includes("http") ||
    lower.includes("fetch")
  ) {
    capability = "network";
    risk = "medium";
  }

  return makePermissionItem({
    capability,
    source: "declared",
    evidence: `skill.json.permissions: "${perm}"`,
    risk,
  });
}

/**
 * Scan a single JS file's text for permission-triggering patterns.
 * @param {string} filePath  relative path (for evidence label)
 * @param {string} content
 * @returns {object[]} PermissionItem[]
 */
function scanFileContent(filePath, content) {
  const items = [];

  for (const rule of STATIC_SCAN_RULES) {
    const matched = rule.patterns.filter((pat) => content.includes(pat));
    if (matched.length === 0) continue;
    items.push(
      makePermissionItem({
        capability: rule.capability,
        source: "static-scan",
        evidence: `${filePath} 包含: ${matched.slice(0, 3).join(", ")}`,
        risk: rule.risk,
      })
    );
  }

  return items;
}

/**
 * Merge permission items: deduplicate by capability,
 * keeping the highest-risk item and combining evidence.
 * @param {object[]} items
 * @returns {object[]}
 */
function mergeItems(items) {
  const riskOrder = { high: 3, medium: 2, low: 1 };
  const byCapability = new Map();

  for (const item of items) {
    const existing = byCapability.get(item.capability);
    if (!existing) {
      byCapability.set(item.capability, { ...item });
      continue;
    }

    // Keep higher risk
    if ((riskOrder[item.risk] || 0) > (riskOrder[existing.risk] || 0)) {
      existing.risk = item.risk;
    }

    // Prefer declared source over scan
    if (item.source === "declared" && existing.source !== "declared") {
      existing.source = "declared";
    }

    // Combine evidence (truncate if too long)
    if (!existing.evidence.includes(item.evidence)) {
      existing.evidence = [existing.evidence, item.evidence]
        .join("; ")
        .slice(0, 300);
    }
  }

  return Array.from(byCapability.values());
}

/**
 * Resolve all permissions for a skill directory.
 *
 * Sources:
 *   1. skill.json.permissions (declared)
 *   2. Static scan of handler.js and other .js files
 *   3. Optional LLM enrichment via llmEnrich (if provided)
 *
 * @param {string} skillDir  absolute path to skill-store/<slug>/
 * @param {object} manifest  SkillManifest from recognizer
 * @param {Function|null} llmEnrich  optional async (skillDir, manifest) => PermissionItem[]
 * @returns {object} PermissionRequest
 */
async function resolvePermissions(skillDir, manifest, llmEnrich = null) {
  const allItems = [];

  // 1. Declared permissions
  if (Array.isArray(manifest.declaredPermissions)) {
    for (const perm of manifest.declaredPermissions) {
      const item = mapDeclaredPermission(perm);
      if (item) allItems.push(item);
    }
  }

  // 2. Static scan of JS files
  let jsFiles = [];
  try {
    jsFiles = manifest.files.filter((f) => f.path.endsWith(".js")).slice(0, 20); // cap to prevent scanning very large skill packages
  } catch {
    // ignore
  }

  for (const fileEntry of jsFiles) {
    const absPath = path.resolve(skillDir, fileEntry.path);
    try {
      const content = fs.readFileSync(absPath, "utf8");
      const scanned = scanFileContent(fileEntry.path, content);
      allItems.push(...scanned);
    } catch {
      // ignore unreadable files
    }
  }

  // 3. Optional LLM enrichment — must never throw or block
  if (typeof llmEnrich === "function") {
    try {
      const llmItems = await llmEnrich(skillDir, manifest);
      if (Array.isArray(llmItems)) {
        allItems.push(...llmItems);
      }
    } catch {
      // silently ignore LLM failures
    }
  }

  return makePermissionRequest(mergeItems(allItems));
}

module.exports = { resolvePermissions };
