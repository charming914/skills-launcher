import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

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

  handoffToAgentImporter: async (slug) => {
    return await fetch(`${API_BASE}/skills/store/agent-handoff`, {
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
};

export default SkillStore;
