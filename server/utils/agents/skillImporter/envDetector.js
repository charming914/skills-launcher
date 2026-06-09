const { execSync } = require("child_process");
const { makeEnvCheck, makeEnvResult } = require("./schema");

/**
 * Parse a version string like "v18.12.0" or "Python 3.10.4" into [major, minor, patch].
 * Returns null if parsing fails.
 * @param {string} str
 * @returns {number[]|null}
 */
function parseVersionNumbers(str = "") {
  const match = str.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return [
    parseInt(match[1], 10),
    parseInt(match[2], 10),
    parseInt(match[3] || "0", 10),
  ];
}

/**
 * Evaluate a simple semver range against an installed version.
 * Supports: >=X.Y, >X.Y, <=X.Y, <X.Y, =X.Y, ^X.Y, ~X.Y (simplified).
 * Returns 'satisfied' | 'unsatisfied' | 'unknown' (if range is unparseable).
 * @param {string} range  e.g. ">=18" or ">=3.10"
 * @param {string} installed  e.g. "20.10.0"
 * @returns {'satisfied'|'unsatisfied'|'unknown'}
 */
function checkSemverRange(range, installed) {
  if (!range || !installed) return "unknown";

  const installedVer = parseVersionNumbers(installed);
  if (!installedVer) return "unknown";

  const rangeClean = range.trim();
  const opMatch = rangeClean.match(/^(>=|>|<=|<|=|\^|~)?(.+)$/);
  if (!opMatch) return "unknown";

  const op = opMatch[1] || "=";
  const reqVer = parseVersionNumbers(opMatch[2]);
  if (!reqVer) return "unknown";

  function cmp(a, b) {
    for (let i = 0; i < 3; i++) {
      if (a[i] > b[i]) return 1;
      if (a[i] < b[i]) return -1;
    }
    return 0;
  }

  const diff = cmp(installedVer, reqVer);

  switch (op) {
    case ">=":
      return diff >= 0 ? "satisfied" : "unsatisfied";
    case ">":
      return diff > 0 ? "satisfied" : "unsatisfied";
    case "<=":
      return diff <= 0 ? "satisfied" : "unsatisfied";
    case "<":
      return diff < 0 ? "satisfied" : "unsatisfied";
    case "=":
      return diff === 0 ? "satisfied" : "unsatisfied";
    case "^": // compatible: same major, >= minor
      return installedVer[0] === reqVer[0] && diff >= 0
        ? "satisfied"
        : "unsatisfied";
    case "~": // approximately: same major.minor, >= patch
      return installedVer[0] === reqVer[0] &&
        installedVer[1] === reqVer[1] &&
        diff >= 0
        ? "satisfied"
        : "unsatisfied";
    default:
      return "unknown";
  }
}

/**
 * Detect the currently running Node.js version.
 * @returns {EnvCheck}
 */
function checkNode(nodeRange) {
  const installed = process.versions.node; // e.g. "20.10.0"
  if (!nodeRange) {
    return makeEnvCheck({
      type: "node",
      label: "Node 版本",
      required: false,
      status: "satisfied",
      detail: `当前 Node ${installed}，skill 未声明 node 版本要求`,
    });
  }

  const status = checkSemverRange(nodeRange, installed);
  return makeEnvCheck({
    type: "node",
    label: "Node 版本",
    required: true,
    status,
    detail: `需要 ${nodeRange}，检测到 v${installed}`,
  });
}

/**
 * Detect the system Python version (tries python3 then python, Windows-compatible).
 * @param {string|null} pythonRange
 * @returns {EnvCheck}
 */
function checkPython(pythonRange) {
  const commands = ["python3", "python"];
  let installedVersion = null;

  for (const cmd of commands) {
    try {
      const out = execSync(`${cmd} --version 2>&1`, {
        timeout: 5000,
        encoding: "utf8",
        stdio: "pipe",
        windowsHide: true,
      });
      const ver = parseVersionNumbers(out);
      if (ver) {
        installedVersion = `${ver[0]}.${ver[1]}.${ver[2]}`;
        break;
      }
    } catch {
      // try next command
    }
  }

  if (!pythonRange) {
    // Python not required by this skill
    if (!installedVersion) {
      return makeEnvCheck({
        type: "python",
        label: "Python 运行时",
        required: false,
        status: "skipped",
        detail: "Skill 未声明 Python 需求，跳过检测",
      });
    }
    return makeEnvCheck({
      type: "python",
      label: "Python 运行时",
      required: false,
      status: "satisfied",
      detail: `检测到 Python ${installedVersion}，skill 未声明版本要求`,
    });
  }

  // Python IS required
  if (!installedVersion) {
    return makeEnvCheck({
      type: "python",
      label: "Python 运行时",
      required: true,
      status: "unsatisfied",
      detail: `需要 Python ${pythonRange}，未在系统 PATH 中找到 python/python3`,
    });
  }

  const status = checkSemverRange(pythonRange, installedVersion);
  return makeEnvCheck({
    type: "python",
    label: "Python 运行时",
    required: true,
    status,
    detail: `需要 Python ${pythonRange}，检测到 ${installedVersion}`,
  });
}

/**
 * Check whether required environment variables exist (presence only — no value read/logged).
 * @param {string[]} envKeys
 * @returns {EnvCheck[]}
 */
function checkEnvVars(envKeys = []) {
  return envKeys.map((key) => {
    const exists = key in process.env && process.env[key] !== "";
    return makeEnvCheck({
      type: "env",
      label: `环境变量 ${key}`,
      required: true,
      status: exists ? "satisfied" : "unsatisfied",
      detail: exists
        ? `${key} 已设置`
        : `${key} 未设置，请在 server/.env.development 中添加该变量`,
    });
  });
}

/**
 * Best-effort pip package detection (unreliable — always returns unknown on failure).
 * @param {string[]} packages
 * @returns {EnvCheck[]}
 */
function checkPip(packages = []) {
  if (!packages.length) return [];

  return packages.map((pkg) => {
    try {
      const cmd = `pip show ${pkg} 2>&1`;
      const out = execSync(cmd, {
        timeout: 8000,
        encoding: "utf8",
        windowsHide: true,
      });
      const found = out.toLowerCase().includes("name:");
      if (found) {
        return makeEnvCheck({
          type: "pip",
          label: `pip: ${pkg}`,
          required: false,
          status: "satisfied",
          detail: `${pkg} 已安装`,
        });
      }
    } catch {
      // fall through to unknown
    }
    return makeEnvCheck({
      type: "pip",
      label: `pip: ${pkg}`,
      required: false,
      status: "unknown",
      detail: `无法可靠检测 ${pkg} 是否已安装，请人工确认`,
    });
  });
}

/**
 * Best-effort npm package detection (unreliable — always returns unknown on failure).
 * @param {string[]} packages
 * @returns {EnvCheck[]}
 */
function checkNpm(packages = []) {
  if (!packages.length) return [];

  return packages.map((pkg) => {
    try {
      const cmd = `npm list ${pkg} --depth=0 2>&1`;
      const out = execSync(cmd, {
        timeout: 8000,
        encoding: "utf8",
        windowsHide: true,
      });
      if (out.includes(pkg)) {
        return makeEnvCheck({
          type: "npm",
          label: `npm: ${pkg}`,
          required: false,
          status: "satisfied",
          detail: `${pkg} 已找到`,
        });
      }
    } catch {
      // fall through to unknown
    }
    return makeEnvCheck({
      type: "npm",
      label: `npm: ${pkg}`,
      required: false,
      status: "unknown",
      detail: `无法可靠检测 ${pkg} 是否已安装，请人工确认`,
    });
  });
}

/**
 * MCP is out of scope for this release — always skipped.
 * @returns {EnvCheck}
 */
function checkMcp() {
  return makeEnvCheck({
    type: "mcp",
    label: "MCP 运行时",
    required: false,
    status: "skipped",
    detail: "MCP 依赖检测本期范围外",
  });
}

/**
 * Run environment detection for all requirements and return an EnvResult.
 *
 * compatible = no required item with status 'unsatisfied'
 * hasWarnings = some required item with status 'unknown'
 *
 * @param {object} requirements  from SkillManifest.requirements
 * @returns {object} EnvResult
 */
function detectEnv(requirements = {}) {
  const checks = [];

  checks.push(checkNode(requirements.node || null));
  checks.push(checkPython(requirements.python || null));
  checks.push(...checkEnvVars(requirements.env || []));
  checks.push(...checkPip(requirements.pip || []));
  checks.push(...checkNpm(requirements.npm || []));
  checks.push(checkMcp());

  return makeEnvResult(checks);
}

module.exports = { detectEnv };
