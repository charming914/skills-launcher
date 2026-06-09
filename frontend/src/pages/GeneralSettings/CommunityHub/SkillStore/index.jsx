import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { isMobile } from "react-device-detect";
import Sidebar from "@/components/SettingsSidebar";
import SkillStore from "@/models/skillStore";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import {
  CircleNotch,
  DownloadSimple,
  MagnifyingGlass,
  Sparkle,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";

/** Import phase labels shown during the two-step process */
const IMPORT_PHASES = [
  "上传与校验中…",
  "识别 Skill 清单…",
  "检测运行环境…",
  "解析权限申请…",
  "注册到 Agent…",
  "写入对话报告…",
];

function installLabel(status) {
  switch (status) {
    case "installed-active":
      return "Installed & Active";
    case "installed":
      return "Installed";
    default:
      return "Install";
  }
}

function validationTone(skill) {
  if (!skill.validation?.valid) return "text-red-400";
  if ((skill.validation?.warnings || []).length > 0) return "text-amber-400";
  return "text-emerald-400";
}

function validationLabel(skill) {
  if (!skill.validation?.valid) return "Validation failed";
  if ((skill.validation?.warnings || []).length > 0)
    return "Validated with warnings";
  return "Validated";
}

function SkillUploadPanel({ uploadPhase, onDrop }) {
  const uploading = uploadPhase !== null;
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => onDrop(acceptedFiles),
    accept: {
      "application/zip": [".zip"],
      "application/x-zip-compressed": [".zip"],
    },
    multiple: false,
    disabled: uploading,
  });

  return (
    <div
      {...getRootProps()}
      className={`mt-6 rounded-3xl border border-dashed px-5 py-6 transition-all ${
        uploading
          ? "cursor-not-allowed opacity-70"
          : "cursor-pointer"
      } ${
        isDragActive
          ? "border-primary-button bg-primary-button/10"
          : "border-white/10 light:border-slate-300 bg-black/20 light:bg-slate-100"
      }`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-2xl bg-primary-button/15 text-primary-button p-3">
            {uploading ? (
              <CircleNotch size={22} className="animate-spin" />
            ) : (
              <UploadSimple size={22} />
            )}
          </div>
          <div>
            <p className="text-theme-text-primary font-semibold">
              Drop a skill zip here
            </p>
            <p className="text-sm text-theme-text-secondary leading-6 mt-1 max-w-2xl">
              上传非 MCP skill 包（.zip），系统将自动识别、检测环境、
              解析权限并注册到 Agent 插件系统。至少包含{" "}
              <code className="font-mono text-xs">SKILL.md</code>。
            </p>
          </div>
        </div>
        <div className="text-sm text-theme-text-secondary text-right min-w-[140px]">
          {uploading ? (
            <span className="text-primary-button font-medium">
              {uploadPhase}
            </span>
          ) : (
            "Click or drag a zip"
          )}
        </div>
      </div>
    </div>
  );
}

function SkillCard({ skill, onInstall, installing }) {
  const installed = skill.installState?.status !== "available";
  return (
    <div className="bg-black/70 light:bg-slate-100 rounded-lg p-4 hover:bg-black/60 light:hover:bg-slate-200 transition-all duration-200 border border-transparent hover:border-slate-400 flex flex-col gap-y-3">
      {skill.coverImagePath ? (
        <img
          src={skill.coverImagePath}
          alt={skill.title}
          className="w-full h-[160px] object-cover rounded-xl border border-white/5"
        />
      ) : null}
      <div className="flex items-start justify-between gap-x-3">
        <div>
          <p className="text-theme-text-primary text-base font-semibold">
            {skill.title}
          </p>
          <p className="text-theme-text-secondary text-xs font-mono mt-1">
            {skill.name} · {skill.version || "unversioned"}
          </p>
        </div>
        {skill.featured ? (
          <span className="text-[11px] rounded-full bg-primary-button/15 text-primary-button px-2 py-1 font-medium">
            Featured
          </span>
        ) : null}
      </div>

      <p className="text-theme-text-secondary text-sm leading-6">
        {skill.description}
      </p>

      <div className="flex items-center justify-between text-xs text-theme-text-secondary">
        <span>{skill.author || "Unknown author"}</span>
        <span>
          {skill.updatedAt
            ? new Date(skill.updatedAt).toLocaleDateString()
            : ""}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {(skill.tags || []).map((tag) => (
          <span
            key={tag}
            className="text-xs rounded-full bg-white/10 light:bg-slate-200 text-theme-text-secondary px-2 py-1"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-theme-text-secondary">
          {skill.fileCount} files
        </span>
        <span className={validationTone(skill)}>{validationLabel(skill)}</span>
      </div>

      <div className="flex items-center justify-between text-xs text-theme-text-secondary">
        <span>
          {skill.sourceType === "uploaded-zip" ? "Uploaded" : "Seeded"}
        </span>
        <span>{installLabel(skill.installState?.status)}</span>
      </div>

      <div className="flex items-center gap-2 mt-1">
        <Link
          to={paths.communityHub.skillDetail(skill.slug)}
          className="flex-1 text-center text-sm font-medium rounded-lg px-3 py-2 bg-black/30 light:bg-slate-200 hover:bg-black/50 light:hover:bg-slate-300 text-theme-text-primary"
        >
          Open detail
        </Link>
        <button
          type="button"
          disabled={installing || installed}
          onClick={() => onInstall(skill.slug)}
          className={`inline-flex items-center justify-center gap-x-2 text-sm font-medium rounded-lg px-3 py-2 min-w-[120px] ${
            installed
              ? "bg-emerald-500/15 text-emerald-500 cursor-default"
              : "bg-primary-button text-white hover:opacity-90"
          } ${installing ? "opacity-70" : ""}`}
        >
          {installing ? (
            <CircleNotch size={16} className="animate-spin" />
          ) : (
            <DownloadSimple size={16} />
          )}
          {installLabel(skill.installState?.status)}
        </button>
      </div>
    </div>
  );
}

export default function LocalSkillStore() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [uploadPhase, setUploadPhase] = useState(null); // null = idle, string = current phase label
  const [installingSlug, setInstallingSlug] = useState(null);
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState([]);

  async function load() {
    setLoading(true);
    const result = await SkillStore.list();
    if (result.success) setSkills(result.skills || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleInstall(slug) {
    setInstallingSlug(slug);
    const result = await SkillStore.install(slug);
    if (result.success) {
      showToast("Skill installed successfully.", "success");
      await load();
    } else {
      showToast(`Failed to install skill. ${result.error}`, "error");
    }
    setInstallingSlug(null);
  }

  /**
   * Two-phase upload:
   *   Phase 1: upload(file) → get slug
   *   Phase 2: handoffToAgentImporter(slug) → ImportResult
   *   Always navigate to detail page regardless of import success/failure.
   */
  async function handleUpload(files = []) {
    const file = files[0];
    if (!file) return;

    // Phase 1 — upload & validate
    setUploadPhase(IMPORT_PHASES[0]);
    const uploadResult = await SkillStore.upload(file);
    if (!uploadResult.success) {
      showToast(`Skill upload failed. ${uploadResult.error}`, "error");
      setUploadPhase(null);
      return;
    }

    const slug = uploadResult.slug;
    showToast("上传成功，开始导入…", "info");

    // Phase 2 — import pipeline (cycle through phase labels for UX)
    let phaseIdx = 1;
    const phaseTimer = setInterval(() => {
      phaseIdx = Math.min(phaseIdx + 1, IMPORT_PHASES.length - 1);
      setUploadPhase(IMPORT_PHASES[phaseIdx]);
    }, 600);

    const importResult = await SkillStore.handoffToAgentImporter(slug);
    clearInterval(phaseTimer);
    setUploadPhase(null);

    if (importResult.success && importResult.payload?.success) {
      showToast("Skill 导入成功！正在跳转到详情页…", "success");
    } else {
      const reason =
        importResult.payload?.failureReason ||
        importResult.error ||
        "导入过程中发生错误";
      showToast(`导入未完全成功：${reason}`, "warning");
    }

    await load();
    // Always navigate to detail page — it shows full import results
    navigate(paths.communityHub.skillDetail(slug));
  }

  const filteredSkills = skills.filter((skill) => {
    const haystack = [
      skill.title,
      skill.name,
      skill.description,
      ...(skill.tags || []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[86px] md:py-6 py-16">
          <div className="w-full flex flex-col gap-y-2 pb-6 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10">
            <p className="text-lg leading-6 font-bold text-theme-text-primary">
              Local SKILL Store
            </p>
            <p className="text-sm text-theme-text-secondary max-w-3xl leading-6">
              拖入非 MCP skill zip 包，系统自动识别、检测运行环境、
              分析权限申请并注册到 Agent 插件系统（默认未激活，需在详情页批准）。
            </p>
          </div>

          <SkillUploadPanel uploadPhase={uploadPhase} onDrop={handleUpload} />

          <div className="mt-6 mb-5 flex items-center gap-x-3 bg-black/20 light:bg-slate-100 rounded-xl px-4 py-3 border border-white/5">
            <MagnifyingGlass size={18} className="text-theme-text-secondary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search local skills"
              className="bg-transparent w-full outline-none text-theme-text-primary placeholder:text-theme-text-secondary text-sm"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-theme-text-secondary">
            <WarningCircle size={14} />
            <span>
              上传 zip 后会自动运行导入流水线（识别 / 环境检测 / 权限 / 注册）。
              导入完成后前往详情页查看结果并批准启用。
            </span>
          </div>

          {loading ? (
            <p className="text-theme-text-secondary text-sm mt-6">
              Loading skills...
            </p>
          ) : filteredSkills.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 light:border-slate-300 p-8 text-center bg-black/10 light:bg-slate-100">
              <div className="flex justify-center mb-3">
                <Sparkle size={28} className="text-theme-text-secondary" />
              </div>
              <p className="text-theme-text-primary font-medium">
                No local skills found
              </p>
              <p className="text-theme-text-secondary text-sm mt-2">
                Upload a <code className="mx-1 font-mono">.zip</code> skill
                package above or seed folders into
                <code className="mx-1 font-mono">
                  server/storage/skill-store
                </code>
                .
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-6">
              {filteredSkills.map((skill) => (
                <SkillCard
                  key={skill.slug}
                  skill={skill}
                  installing={installingSlug === skill.slug}
                  onInstall={handleInstall}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
