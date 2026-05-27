const { SkillStore } = require("../models/skillStore");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");

function skillStoreEndpoints(app) {
  if (!app) return;

  app.get(
    "/skills/store",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (_, response) => {
      try {
        response.status(200).json({
          success: true,
          skills: SkillStore.list(),
        });
      } catch (error) {
        console.error(error);
        response.status(500).json({
          success: false,
          skills: [],
          error: error.message,
        });
      }
    }
  );

  app.get(
    "/skills/store/:slug",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const skill = SkillStore.get(String(request.params.slug || ""));
        if (!skill) {
          response.status(404).json({
            success: false,
            skill: null,
            error: "Skill not found.",
          });
          return;
        }

        response.status(200).json({
          success: true,
          skill,
        });
      } catch (error) {
        console.error(error);
        response.status(500).json({
          success: false,
          skill: null,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { skillStoreEndpoints };
