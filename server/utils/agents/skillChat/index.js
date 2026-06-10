const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const ImportedPlugin = require("../imported");
const {
  EphemeralAgentHandler,
  EphemeralEventListener,
} = require("../ephemeral");
const { SkillStore } = require("../../../models/skillStore");
const { Workspace } = require("../../../models/workspace");
const { WorkspaceChats } = require("../../../models/workspaceChats");
const { EventLogs } = require("../../../models/eventLogs");
const { safeJsonParse } = require("../../http");
const { isWithin, normalizePath } = require("../../files");
const { writeResponseChunk } = require("../../helpers/chat/responses");

const PLUGINS_ROOT =
  process.env.NODE_ENV === "development"
    ? path.resolve(__dirname, "../../../storage/plugins/agent-skills")
    : path.resolve(process.env.STORAGE_DIR, "plugins", "agent-skills");

function preview(value = "", limit = 240) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value ?? "", null, 2);
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function readInstalledPluginConfig(slug = "") {
  const configPath = path.resolve(
    PLUGINS_ROOT,
    normalizePath(slug),
    "plugin.json"
  );
  if (!isWithin(PLUGINS_ROOT, configPath) || !fs.existsSync(configPath)) {
    return null;
  }

  return safeJsonParse(fs.readFileSync(configPath, "utf8"), null);
}

function summarizeParams(params = {}) {
  if (!params || typeof params !== "object") return [];
  return Object.entries(params).map(([name, definition]) => ({
    name,
    type: definition?.type || "string",
    description: definition?.description || "",
    enum: definition?.enum || null,
  }));
}

function summarizePermissions(permissionRequest = null) {
  const items = permissionRequest?.items || [];
  if (!items.length) return "No permission items were requested.";
  return items
    .map((item) => {
      const risk = item.risk ? `, risk=${item.risk}` : "";
      const source = item.source ? `, source=${item.source}` : "";
      return `- ${item.capability}${risk}${source}: ${item.evidence || "no evidence"}`;
    })
    .join("\n");
}

function buildPrompt({ skill, pluginConfig, message }) {
  const params = summarizeParams(pluginConfig?.entrypoint?.params);
  const examples = Array.isArray(pluginConfig?.examples)
    ? pluginConfig.examples.slice(0, 5)
    : [];
  const permissionSummary = summarizePermissions(
    skill.importRecord?.permissionRequest
  );

  return `@agent
You are in a dedicated single-Skill chat. Only the imported Skill tool named "${pluginConfig.name || skill.slug}" is available for this answer.

Before answering, use the Skill details below as the source of truth for what this Skill can and cannot do.

<skill_detail>
Title: ${skill.title}
Slug: ${skill.slug}
Description: ${skill.description || ""}
Capability scope:
${preview(skill.content || skill.summary || skill.description || "", 1600)}

Input format:
${params.length ? JSON.stringify(params, null, 2) : "No explicit input params declared."}

Output format:
Return a concise natural-language answer to the user. If the tool returns structured data, summarize it clearly and preserve important fields.

Calling method:
Call the single available tool "${pluginConfig.name || skill.slug}" with JSON arguments matching the input format above.

Examples:
${examples.length ? JSON.stringify(examples, null, 2) : "No examples declared."}

Approved permissions:
${permissionSummary}
</skill_detail>

Rules:
- If the user request is inside this Skill's capability scope, call the Skill tool and answer from its result.
- If the request is outside scope, say it is outside this Skill's scope and explain what this Skill can handle.
- Do not claim extra permissions, environment access, or MCP support.
- Do not call or refer to other tools.

User request:
${message}`;
}

async function resolveWorkspace({ workspaceSlug, workspaceId, skill }) {
  if (workspaceSlug) {
    const workspace = await Workspace.get({ slug: String(workspaceSlug) });
    if (workspace) return workspace;
  }

  if (workspaceId) {
    const workspace = await Workspace.get({ id: Number(workspaceId) });
    if (workspace) return workspace;
  }

  const conversationWorkspace =
    skill.importRecord?.conversationRef?.workspaceSlug || null;
  if (conversationWorkspace) {
    const workspace = await Workspace.get({ slug: conversationWorkspace });
    if (workspace) return workspace;
  }

  const workspaces = await Workspace.where({}, 1, { id: "asc" });
  return workspaces?.[0] || null;
}

function buildPreflightState({ skill, pluginConfig, importRecord }) {
  return {
    matchedSlug: skill?.slug || null,
    installedStatus: skill?.installState?.status || "unknown",
    active: pluginConfig?.active === true,
    importStatus: importRecord?.status || null,
    permissionDecision: importRecord?.permissionRequest?.decision || null,
    envCompatible: importRecord?.envResult?.compatible ?? null,
    runnable: skill?.completeness?.runnable ?? null,
    handlerAvailable: ImportedPlugin.validateImportedPluginHandler(skill.slug),
  };
}

function preflightError(message, state) {
  const error = new Error(message);
  error.preflightState = state;
  return error;
}

async function preflight({ slug, workspaceSlug, workspaceId, user }) {
  const skill = await SkillStore.getWithImport(slug);
  if (!skill) throw new Error("Skill not found.");

  const importRecord = skill.importRecord || null;
  const pluginConfig = readInstalledPluginConfig(slug);
  const state = buildPreflightState({ skill, pluginConfig, importRecord });

  if (!importRecord) {
    throw preflightError(
      "Skill has no import record. Import it from the Skill Store before chatting.",
      state
    );
  }

  if (importRecord.status !== "success") {
    throw preflightError(
      `Skill import is not successful yet: ${importRecord.failureReason || importRecord.status}.`,
      state
    );
  }

  if (!pluginConfig) {
    throw preflightError(
      "Skill is not installed into the Agent skill directory.",
      state
    );
  }

  if (
    pluginConfig.active !== true ||
    skill.installState?.status !== "installed-active"
  ) {
    throw preflightError("Skill is not approved and active yet.", state);
  }

  if (importRecord.permissionRequest?.decision !== "approved") {
    throw preflightError(
      "Skill permissions are not approved for this session.",
      state
    );
  }

  if (importRecord.envResult?.compatible !== true) {
    throw preflightError("Skill environment check is not compatible.", state);
  }

  if (skill.completeness && skill.completeness.runnable === false) {
    throw preflightError("Skill files are incomplete and cannot run.", state);
  }

  if (!ImportedPlugin.validateImportedPluginHandler(slug)) {
    throw preflightError(
      "Skill handler.js is not available in Agent skills.",
      state
    );
  }

  const workspace = await resolveWorkspace({
    workspaceSlug,
    workspaceId,
    skill,
  });
  if (!workspace) {
    throw new Error("No workspace is available for running the Agent model.");
  }

  return {
    skill,
    pluginConfig,
    workspace,
    preflightState: state,
    toolOverrides: [`@@${slug}`],
    sessionId: `skill-chat:${slug}:${user?.id || "single-user"}`,
  };
}

async function logSkillEvent(event, metadata = {}, userId = null) {
  try {
    await EventLogs.logEvent(event, metadata, userId);
  } catch {
    // Event logging should never block the chat flow.
  }
}

function writeAbort(response, uuid, error) {
  writeResponseChunk(response, {
    uuid,
    id: uuid,
    type: "abort",
    textResponse: null,
    sources: [],
    close: true,
    error,
  });
}

const SkillChat = {
  preflight,

  stream: async function ({
    response,
    slug,
    message,
    workspaceSlug = null,
    workspaceId = null,
    sessionId = null,
    user = null,
  }) {
    const uuid = uuidv4();
    const requestPreview = preview(message, 300);
    let context = null;
    let toolCalls = [];

    try {
      context = await preflight({ slug, workspaceSlug, workspaceId, user });
      if (sessionId) {
        context.sessionId = `skill-chat:${slug}:${sessionId}`;
      }

      const prompt = buildPrompt({
        skill: context.skill,
        pluginConfig: context.pluginConfig,
        message,
      });

      await logSkillEvent(
        "skill_chat_invocation",
        {
          slug,
          skillTitle: context.skill.title,
          workspaceSlug: context.workspace.slug,
          requestPreview,
          matchResult: context.preflightState,
          promptInjected: true,
          promptSections: [
            "skill_detail",
            "capability_scope",
            "input_format",
            "output_format",
            "calling_method",
            "permissions",
          ],
          toolOverrides: context.toolOverrides,
          status: "started",
        },
        user?.id
      );

      const eventListener = new EphemeralEventListener();
      const agentHandler = new EphemeralAgentHandler({
        uuid,
        workspace: context.workspace,
        prompt,
        userId: user?.id || null,
        threadId: null,
        sessionId: context.sessionId,
        attachments: [],
      });

      await agentHandler.init();
      await agentHandler.createAIbitat({
        handler: eventListener,
        toolOverrides: context.toolOverrides,
      });

      agentHandler.aibitat?.onToolCallResult?.((toolCall) => {
        toolCalls.push({
          toolName: toolCall.toolName,
          argumentsPreview: preview(toolCall.arguments, 400),
          resultPreview: preview(toolCall.result, 400),
        });
      });

      agentHandler.startAgentCluster().catch((error) => {
        eventListener.send(
          JSON.stringify({
            type: "wssFailure",
            content: error.message,
          })
        );
        eventListener.close();
      });

      const { thoughts, textResponse, outputs, metrics } =
        await eventListener.streamAgentEvents(response, uuid);
      const allOutputs = [...outputs, ...agentHandler.getPendingOutputs()];

      const { chat } = await WorkspaceChats.new({
        workspaceId: context.workspace.id,
        prompt: String(message),
        response: {
          text: textResponse || "",
          sources: [],
          attachments: [],
          type: "skill-chat",
          thoughts,
          outputs: allOutputs,
          metrics,
          skill: {
            slug: context.skill.slug,
            title: context.skill.title,
          },
        },
        include: true,
        apiSessionId: context.sessionId,
        user,
      });

      writeResponseChunk(response, {
        uuid,
        type: "finalizeResponseStream",
        textResponse,
        thoughts,
        outputs: allOutputs,
        close: true,
        error: false,
        chatId: chat?.id || null,
        metrics,
      });

      await logSkillEvent(
        "skill_chat_completed",
        {
          slug,
          skillTitle: context.skill.title,
          workspaceSlug: context.workspace.slug,
          requestPreview,
          responsePreview: preview(textResponse, 300),
          matchResult: context.preflightState,
          promptInjected: true,
          toolOverrides: context.toolOverrides,
          toolCalls,
          status: "completed",
        },
        user?.id
      );
    } catch (error) {
      const messageText = error?.message || "Skill chat failed.";
      writeAbort(response, uuid, messageText);
      const matchResult =
        context?.preflightState || error?.preflightState || null;
      await logSkillEvent(
        "skill_chat_error",
        {
          slug,
          requestPreview,
          matchResult,
          promptInjected: !!context,
          toolOverrides: context?.toolOverrides || [`@@${slug}`],
          toolCalls,
          status: "failed",
          error: messageText,
        },
        user?.id
      );
    }
  },
};

module.exports = { SkillChat };
