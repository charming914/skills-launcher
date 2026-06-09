/**
 * LLM client for SkillCompleter.
 * Wraps the project's existing AiProviders/helpers/getLLMProvider.
 * Returns null if no provider is configured — callers must handle gracefully.
 */

/**
 * Try to instantiate the currently configured LLM provider.
 * Returns null (not throws) when unconfigured.
 * @returns {Promise<LLMClient|null>}
 */
async function getProvider() {
  try {
    const { getLLMProvider } = require("../../helpers");
    const provider = getLLMProvider();
    // Quick sanity check: provider must have getChatCompletion
    if (typeof provider?.getChatCompletion !== "function") return null;
    return new LLMClient(provider);
  } catch {
    return null;
  }
}

/**
 * Thin wrapper around a BaseLLMProvider that exposes a simple `generate` API.
 */
class LLMClient {
  constructor(provider) {
    this._provider = provider;
  }

  /**
   * Run a single chat completion.
   *
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {{ json?: boolean, temperature?: number }} opts
   * @returns {Promise<string|object>}  raw string, or parsed object if json=true
   */
  async generate(
    systemPrompt,
    userPrompt,
    { json = false, temperature = 0.5 } = {}
  ) {
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const result = await this._provider.getChatCompletion(messages, {
      temperature,
    });
    const text = result?.textResponse ?? result?.response ?? "";
    if (!text) throw new Error("LLM returned empty response");

    if (!json) return text;

    // Strip markdown code fences if present
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    return JSON.parse(cleaned);
  }
}

module.exports = { getProvider };
