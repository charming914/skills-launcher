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
};

export default SkillStore;
