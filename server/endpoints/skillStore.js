const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { SkillStore } = require("../models/skillStore");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { reqBody } = require("../utils/http");

const skillUploadStorage = multer.diskStorage({
  destination: function (_, __, cb) {
    fs.mkdirSync(SkillStore.uploadRoot, { recursive: true });
    cb(null, SkillStore.uploadRoot);
  },
  filename: function (_, file, cb) {
    cb(null, `${uuidv4()}${path.extname(file.originalname || ".zip")}`);
  },
});

function handleSkillZipUpload(request, response, next) {
  const upload = multer({ storage: skillUploadStorage }).single("file");
  upload(request, response, function (err) {
    if (err) {
      response.status(500).json({
        success: false,
        error: `Invalid skill upload. ${err.message}`,
      });
      return;
    }
    next();
  });
}

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
        // Use getWithImport to attach the latest import record to the detail response
        const skill = await SkillStore.getWithImport(
          String(request.params.slug || "")
        );
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

  app.get(
    "/skills/store/:slug/assets/:filename",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const filepath = path.resolve(
          SkillStore.root,
          String(request.params.slug || ""),
          String(request.params.filename || "")
        );

        if (!filepath.startsWith(SkillStore.root) || !fs.existsSync(filepath)) {
          response.sendStatus(404);
          return;
        }

        response.sendFile(filepath);
      } catch (error) {
        console.error(error);
        response.sendStatus(500);
      }
    }
  );

  app.post(
    "/skills/store/upload",
    [validatedRequest, flexUserRoleValid([ROLES.admin]), handleSkillZipUpload],
    async (request, response) => {
      try {
        if (!request.file) {
          response.status(400).json({
            success: false,
            error: "No skill zip uploaded.",
          });
          return;
        }

        const result = SkillStore.ingestZipUpload(request.file);
        if (!result.success) {
          response.status(400).json(result);
          return;
        }

        response.status(200).json(result);
      } catch (error) {
        console.error(error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  app.post(
    "/skills/store/agent-handoff",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { slug, workspaceId } = reqBody(request);
        const result = await SkillStore.handoffToAgentImporter(
          String(slug || ""),
          { workspaceId: workspaceId || null }
        );

        // Always return 200 so frontend can distinguish success/failure via payload.success
        response.status(200).json(result);
      } catch (error) {
        console.error(error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  app.post(
    "/skills/store/approve",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { slug } = reqBody(request);
        const result = await SkillStore.approve(String(slug || ""));
        if (!result.success) {
          response.status(400).json(result);
          return;
        }

        response.status(200).json(result);
      } catch (error) {
        console.error(error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );

  app.post(
    "/skills/store/:slug/complete",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const slug = String(request.params.slug || "");
        const { targets } = reqBody(request);
        const result = await SkillStore.completeSkill(
          slug,
          Array.isArray(targets) ? targets : null
        );
        // Always 200 — frontend checks payload.success and generated[].status
        response.status(200).json(result);
      } catch (error) {
        console.error(error);
        response.status(500).json({ success: false, error: error.message });
      }
    }
  );

  app.get(
    "/skills/store/:slug/download",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      let zipPath = null;
      try {
        const slug = String(request.params.slug || "");
        const result = SkillStore.downloadPackage(slug);
        if (!result.success) {
          response.status(result.completeness ? 409 : 404).json({
            success: false,
            error: result.error,
          });
          return;
        }

        zipPath = result.zipPath;
        response.setHeader("Content-Type", "application/zip");
        response.setHeader(
          "Content-Disposition",
          `attachment; filename="${slug}.zip"`
        );
        response.sendFile(zipPath, {}, (err) => {
          if (zipPath) {
            try {
              fs.unlinkSync(zipPath);
            } catch {
              // ignore cleanup error
            }
          }
          if (err && !response.headersSent) {
            console.error("[SkillStore] Failed to stream zip", err);
          }
        });
      } catch (error) {
        console.error(error);
        if (zipPath) {
          try {
            fs.unlinkSync(zipPath);
          } catch {
            // ignore
          }
        }
        if (!response.headersSent) {
          response.status(500).json({ success: false, error: error.message });
        }
      }
    }
  );

  app.post(
    "/skills/store/install",
    [validatedRequest, flexUserRoleValid([ROLES.admin])],
    async (request, response) => {
      try {
        const { slug } = reqBody(request);
        const result = SkillStore.install(String(slug || ""));
        if (!result.success) {
          response.status(400).json(result);
          return;
        }

        response.status(200).json(result);
      } catch (error) {
        console.error(error);
        response.status(500).json({
          success: false,
          error: error.message,
        });
      }
    }
  );
}

module.exports = { skillStoreEndpoints };
