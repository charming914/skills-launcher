import { API_BASE } from "@/utils/constants";
import { baseHeaders, safeJsonParse } from "@/utils/request";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { v4 } from "uuid";

const SkillStore = {
  list: async () => {
    return await fetch(`${API_BASE}/skills/store`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((error) => {
        console.error(error);
        return { success: false, skills: [], error: error.message };
      });
  },

  get: async (slug) => {
    return await fetch(`${API_BASE}/skills/store/${slug}`, {
      method: "GET",
      headers: baseHeaders(),
    })
      .then((res) => res.json())
      .catch((error) => {
        console.error(error);
        return { success: false, skill: null, error: error.message };
      });
  },

  install: async (slug) => {
    return await fetch(`${API_BASE}/skills/store/install`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ slug }),
    })
      .then((res) => res.json())
      .catch((error) => {
        console.error(error);
        return { success: false, error: error.message, skill: null };
      });
  },

  upload: async (file) => {
    const formData = new FormData();
    formData.append("file", file, file.name);

    return await fetch(`${API_BASE}/skills/store/upload`, {
      method: "POST",
      headers: baseHeaders(),
      body: formData,
    })
      .then((res) => res.json())
      .catch((error) => {
        console.error(error);
        return { success: false, error: error.message, skill: null };
      });
  },

  /**
   * Trigger the Skill import pipeline for an uploaded skill.
   * Returns { success, payload: ImportResult }.
   * payload contains backward-compat fields + new fields (envResult, permissionRequest, etc.)
   * @param {string} slug
   * @param {string|null} workspaceId  optional target workspace for the import thread
   */
  handoffToAgentImporter: async (slug, workspaceId = null) => {
    return await fetch(`${API_BASE}/skills/store/agent-handoff`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ slug, workspaceId }),
    })
      .then((res) => res.json())
      .catch((error) => {
        console.error(error);
        return { success: false, error: error.message };
      });
  },

  /**
   * Approve and activate an installed skill (sets active=true + decision=approved).
   * @param {string} slug
   */
  approve: async (slug) => {
    return await fetch(`${API_BASE}/skills/store/approve`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ slug }),
    })
      .then((res) => res.json())
      .catch((error) => {
        console.error(error);
        return { success: false, error: error.message };
      });
  },

  /**
   * Trigger one-click completion for missing skill files.
   * @param {string} slug
   * @param {string[]} [targets]  optional list of specific files to generate
   */
  complete: async (slug, targets = undefined) => {
    return await fetch(`${API_BASE}/skills/store/${slug}/complete`, {
      method: "POST",
      headers: baseHeaders(),
      body: JSON.stringify({ targets }),
    })
      .then((res) => res.json())
      .catch((error) => {
        console.error(error);
        return { success: false, error: error.message };
      });
  },

  /**
   * Download a skill as a ZIP file to the browser.
   * @param {string} slug
   */
  download: async (slug) => {
    try {
      const res = await fetch(`${API_BASE}/skills/store/${slug}/download`, {
        method: "GET",
        headers: baseHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return { success: true };
    } catch (error) {
      console.error(error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Stream a dedicated single-Skill chat response.
   * The backend preflights permissions/environment and restricts tools to this skill.
   * @param {string} slug
   * @param {string} message
   * @param {Function} handleChat
   * @param {{workspaceSlug?: string|null, workspaceId?: string|number|null, sessionId?: string|null}} options
   */
  streamChat: async (slug, message, handleChat, options = {}) => {
    const ctrl = new AbortController();

    try {
      await fetchEventSource(`${API_BASE}/skills/store/${slug}/stream-chat`, {
        method: "POST",
        body: JSON.stringify({
          message,
          workspaceSlug: options.workspaceSlug || null,
          workspaceId: options.workspaceId || null,
          sessionId: options.sessionId || null,
        }),
        headers: baseHeaders(),
        signal: ctrl.signal,
        openWhenHidden: true,
        async onopen(response) {
          if (response.ok) return;

          handleChat({
            id: v4(),
            type: "abort",
            textResponse: null,
            sources: [],
            close: true,
            error: `Skill chat stream failed. Code ${response.status}`,
          });
          ctrl.abort();
          throw new Error("Invalid status code response.");
        },
        async onmessage(msg) {
          const chatResult = safeJsonParse(msg.data, null);
          if (chatResult) handleChat(chatResult);
        },
        onerror(error) {
          handleChat({
            id: v4(),
            type: "abort",
            textResponse: null,
            sources: [],
            close: true,
            error: `Skill chat stream failed. ${error.message}`,
          });
          ctrl.abort();
          throw new Error(error.message);
        },
      });

      return { success: true };
    } catch (error) {
      if (error.name === "AbortError") return { success: false, aborted: true };
      console.error(error);
      return { success: false, error: error.message };
    }
  },
};

export default SkillStore;
