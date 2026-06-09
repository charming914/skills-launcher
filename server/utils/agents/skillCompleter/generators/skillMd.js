/**
 * Generator: SKILL.md
 * Template fallback (no LLM). LLM path added in N4.
 */

/**
 * Build a template SKILL.md skeleton using skill metadata.
 * @param {object} ctx  { meta, skillDir, existingFiles }
 * @param {object|null} llm   LLMClient instance (null = no LLM, use template)
 * @returns {Promise<{ content: string, method: 'llm'|'template' }>}
 */
async function generate(ctx, llm = null) {
  if (llm) {
    try {
      return await _generateWithLLM(ctx, llm);
    } catch {
      // fall through to template
    }
  }
  return { content: _template(ctx), method: "template" };
}

function _template({ meta = {} }) {
  const name = meta.title || meta.name || meta.slug || "Untitled Skill";
  const description =
    meta.description || meta.summary || "（请在此填写 skill 功能说明）";
  const tags =
    Array.isArray(meta.tags) && meta.tags.length
      ? meta.tags.join(", ")
      : "general";

  return `# ${name}

> 标签：${tags}

## 功能说明

${description}

## 工作流程

1. 接收用户输入参数
2. 处理核心逻辑
3. 返回结构化结果

## 决策规则

- 当…时，执行…
- 否则返回默认值

## 示例提示词

- "请帮我使用 ${name} 完成…"
- "运行 ${name}，参数为…"

## 打包注意

- 本 skill 由 Skill Completer 自动生成基础文档，建议人工补全细节
- 修改后可重新上传 zip 或直接编辑 skill-store 中的文件
`;
}

async function _generateWithLLM({ meta = {}, existingPluginJson = null }, llm) {
  const name = meta.title || meta.name || meta.slug || "Skill";
  const description = meta.description || meta.summary || "";
  const paramsStr = existingPluginJson?.entrypoint?.params
    ? JSON.stringify(existingPluginJson.entrypoint.params, null, 2)
    : "（无 plugin.json 参数信息）";

  const systemPrompt = `你是一名技术文档撰写助手。请为以下 AnythingLLM Agent Skill 编写 SKILL.md 文档。
用中文撰写，结构清晰，包含：标题、功能说明、工作流程（用列表）、决策规则、示例提示词、打包注意事项。
不要输出任何 \`\`\` 代码块包裹，直接输出 Markdown 原文。`;

  const userPrompt = `Skill 名称：${name}
描述：${description}
入参：${paramsStr}`;

  const result = await llm.generate(systemPrompt, userPrompt, { json: false });
  if (!result || typeof result !== "string" || result.trim().length < 20) {
    throw new Error("LLM returned empty or too-short SKILL.md");
  }
  // Must contain a heading
  if (!result.match(/^#\s/m)) {
    throw new Error("LLM output missing markdown heading");
  }
  return { content: result.trim(), method: "llm" };
}

module.exports = { generate };
