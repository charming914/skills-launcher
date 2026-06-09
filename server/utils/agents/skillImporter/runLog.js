const prisma = require("../../../utils/prisma");
const { makeStage } = require("./schema");

/**
 * Safe JSON serialise — never throws.
 * @param {any} val
 * @returns {string}
 */
function toJson(val) {
  try {
    return JSON.stringify(val ?? null);
  } catch {
    return "null";
  }
}

/**
 * Safe JSON parse — returns fallback on error.
 * @param {string} str
 * @param {any} fallback
 * @returns {any}
 */
function fromJson(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Deserialise a raw skill_imports row from the DB into a JS object.
 * @param {object} row  Prisma skill_imports row
 * @returns {object}
 */
function deserializeRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    stages: fromJson(row.stages, []),
    envResult: fromJson(row.envResult, null),
    permissionRequest: fromJson(row.permissionRequest, null),
    conversationRef: fromJson(row.conversationRef, null),
    installed: row.installed,
    active: row.active,
    failureReason: row.failureReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const RunLog = {
  /**
   * Create a new import record in pending/running state.
   * @param {string} slug
   * @returns {Promise<number>} id of the created record
   */
  createRecord: async function (slug) {
    const row = await prisma.skill_imports.create({
      data: {
        slug,
        status: "running",
        stages: toJson([]),
        envResult: toJson(null),
        permissionRequest: toJson(null),
        conversationRef: null,
        installed: false,
        active: false,
        failureReason: null,
      },
    });
    return row.id;
  },

  /**
   * Append or update a stage entry on an existing record.
   * @param {number} id
   * @param {object} stageData  fields for makeStage()
   */
  updateStage: async function (id, stageData) {
    const row = await prisma.skill_imports.findUnique({ where: { id } });
    if (!row) return;

    const stages = fromJson(row.stages, []);
    const idx = stages.findIndex((s) => s.stage === stageData.stage);
    const entry = makeStage(stageData);

    if (idx >= 0) {
      stages[idx] = entry;
    } else {
      stages.push(entry);
    }

    await prisma.skill_imports.update({
      where: { id },
      data: { stages: toJson(stages) },
    });
  },

  /**
   * Finalise an import record with all results.
   * @param {number} id
   * @param {object} fields  { status, envResult, permissionRequest, conversationRef, installed, active, failureReason }
   */
  finalize: async function (id, fields = {}) {
    await prisma.skill_imports.update({
      where: { id },
      data: {
        status: fields.status || "failed",
        envResult: toJson(fields.envResult ?? null),
        permissionRequest: toJson(fields.permissionRequest ?? null),
        conversationRef: fields.conversationRef
          ? toJson(fields.conversationRef)
          : null,
        installed: !!fields.installed,
        active: !!fields.active,
        failureReason: fields.failureReason || null,
      },
    });
  },

  /**
   * Retrieve the most recent import record for a slug.
   * @param {string} slug
   * @returns {Promise<object|null>}
   */
  getLatestBySlug: async function (slug) {
    const row = await prisma.skill_imports.findFirst({
      where: { slug },
      orderBy: { id: "desc" },
    });
    return deserializeRow(row);
  },

  /**
   * Retrieve an import record by id.
   * @param {number} id
   * @returns {Promise<object|null>}
   */
  getById: async function (id) {
    const row = await prisma.skill_imports.findUnique({ where: { id } });
    return deserializeRow(row);
  },

  /**
   * Update installed/active flags (used by approve endpoint).
   * @param {number} id
   * @param {object} fields  { installed?, active?, permissionRequest? }
   */
  updateApproval: async function (id, fields = {}) {
    const data = {};
    if (fields.installed !== undefined) data.installed = !!fields.installed;
    if (fields.active !== undefined) data.active = !!fields.active;
    if (fields.permissionRequest !== undefined) {
      data.permissionRequest = toJson(fields.permissionRequest);
    }
    if (Object.keys(data).length === 0) return;
    await prisma.skill_imports.update({ where: { id }, data });
  },
};

module.exports = { RunLog };
