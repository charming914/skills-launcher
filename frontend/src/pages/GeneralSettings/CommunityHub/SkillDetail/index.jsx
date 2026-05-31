import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isMobile } from "react-device-detect";
import DOMPurify from "dompurify";
import Sidebar from "@/components/SettingsSidebar";
import SkillStore from "@/models/skillStore";
import paths from "@/utils/paths";
import renderMarkdown from "@/utils/chat/markdown";
import { setEventDelegatorForCodeSnippets } from "@/components/WorkspaceChat";
import showToast from "@/utils/toast";
import {
  ArrowLeft,
  ArrowsClockwise,
  CircleNotch,
  DownloadSimple,
  FileText,
  WarningCircle,
} from "@phosphor-icons/react";

function MetadataRow({ label, value }) {
  return (
    <div className="flex flex-col gap-y-1 rounded-xl bg-black/20 light:bg-slate-100 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-theme-text-secondary">
        {label}
      </p>
      <p className="text-sm text-theme-text-primary break-all">{value}</p>
    </div>
  );
}

function ValidationBlock({ validation }) {
  const warnings = validation?.warnings || [];
  const errors = validation?.errors || [];
  return (
    <div className="rounded-2xl bg-black/20 light:bg-slate-100 border border-white/5 p-5">
      <p className="text-base font-semibold text-theme-text-primary">
        Validation
      </p>
      <div className="mt-3 flex flex-col gap-y-2 text-sm">
        <p className={validation?.valid ? "text-emerald-500" : "text-red-500"}>
          {validation?.valid ? "Validated" : "Validation failed"}
        </p>
        {warnings.length > 0 ? (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-amber-500">
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
        {errors.length > 0 ? (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-red-500">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function LocalSkillDetail() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [skill, setSkill] = useState(null);
  const [error, setError] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [bridging, setBridging] = useState(false);

  async function load() {
    setLoading(true);
    const result = await SkillStore.get(slug);
    if (result.success) {
      setSkill(result.skill);
      setError(null);
    } else {
      setSkill(null);
      setError(result.error || "Failed to load skill.");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [slug]);

  useEffect(() => {
    if (!skill?.content) return;
    setEventDelegatorForCodeSnippets();
  }, [skill]);

  async function installSkill() {
    setInstalling(true);
    const result = await SkillStore.install(slug);
    if (result.success) {
      showToast("Skill installed successfully.", "success");
      setSkill(result.skill);
    } else {
      showToast(`Failed to install skill. ${result.error}`, "error");
    }
    setInstalling(false);
  }

  async function handoffToAgentImporter() {
    setBridging(true);
    const result = await SkillStore.handoffToAgentImporter(slug);
    if (result.success) {
      showToast(
        result.stub
          ? "Agent importer stub reached. Your teammate can wire the final bridge here."
          : "Agent importer handoff completed.",
        "success"
      );
    } else {
      showToast(`Agent handoff failed. ${result.error}`, "error");
    }
    setBridging(false);
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[86px] md:py-6 py-16">
          <Link
            to={paths.communityHub.skills()}
            className="inline-flex items-center gap-x-2 text-sm text-theme-text-secondary hover:text-theme-text-primary mb-5"
          >
            <ArrowLeft size={16} />
            Back to SKILL Store
          </Link>

          {loading ? (
            <p className="text-theme-text-secondary text-sm">
              Loading skill detail...
            </p>
          ) : error ? (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-500">
              {error}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-y-2 pb-6 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10">
                <p className="text-lg leading-6 font-bold text-theme-text-primary">
                  {skill.title}
                </p>
                <p className="text-sm leading-6 text-theme-text-secondary max-w-3xl">
                  {skill.description}
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    disabled={
                      installing || skill.installState?.status !== "available"
                    }
                    onClick={installSkill}
                    className={`inline-flex items-center gap-x-2 text-sm font-medium rounded-lg px-4 py-2 ${
                      skill.installState?.status !== "available"
                        ? "bg-emerald-500/15 text-emerald-500 cursor-default"
                        : "bg-primary-button text-white hover:opacity-90"
                    }`}
                  >
                    {installing ? (
                      <CircleNotch size={16} className="animate-spin" />
                    ) : (
                      <DownloadSimple size={16} />
                    )}
                    {skill.installState?.status === "installed-active"
                      ? "Installed & Active"
                      : skill.installState?.status === "installed"
                        ? "Installed"
                        : "Install skill"}
                  </button>
                  <button
                    type="button"
                    disabled={bridging}
                    onClick={handoffToAgentImporter}
                    className="inline-flex items-center gap-x-2 text-sm font-medium rounded-lg px-4 py-2 bg-black/30 light:bg-slate-100 text-theme-text-primary hover:bg-black/50 light:hover:bg-slate-200"
                  >
                    {bridging ? (
                      <CircleNotch size={16} className="animate-spin" />
                    ) : (
                      <ArrowsClockwise size={16} />
                    )}
                    Hand off to Agent importer
                  </button>
                  {skill.uploadedAt ? (
                    <span className="text-xs text-theme-text-secondary font-mono">
                      Uploaded {new Date(skill.uploadedAt).toLocaleString()}
                    </span>
                  ) : null}
                  {skill.installState?.installedAt ? (
                    <span className="text-xs text-theme-text-secondary font-mono">
                      Installed{" "}
                      {new Date(
                        skill.installState.installedAt
                      ).toLocaleString()}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {(skill.tags || []).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs rounded-full bg-white/10 light:bg-slate-200 text-theme-text-secondary px-2 py-1"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
                <div className="lg:col-span-2 flex flex-col gap-y-4">
                  {skill.coverImagePath ? (
                    <div className="rounded-2xl overflow-hidden border border-white/5 bg-black/20 light:bg-slate-100">
                      <img
                        src={skill.coverImagePath}
                        alt={skill.title}
                        className="w-full max-h-[280px] object-cover"
                      />
                    </div>
                  ) : null}
                  <ValidationBlock validation={skill.validation} />
                  <div className="rounded-2xl bg-black/20 light:bg-slate-100 border border-white/5 p-5">
                    <div className="flex items-center gap-x-2 mb-4">
                      <FileText
                        size={18}
                        className="text-theme-text-secondary"
                      />
                      <p className="text-base font-semibold text-theme-text-primary">
                        {skill.entryFile}
                      </p>
                    </div>
                    <div
                      className="hljs text-sm leading-7 text-theme-text-primary overflow-x-auto"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(
                          renderMarkdown(skill.content || "")
                        ),
                      }}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-y-4">
                  <MetadataRow label="Slug" value={skill.slug} />
                  <MetadataRow label="Name" value={skill.name} />
                  <MetadataRow
                    label="Version"
                    value={skill.version || "unversioned"}
                  />
                  <MetadataRow
                    label="Author"
                    value={
                      skill.authorUrl
                        ? `${skill.author} (${skill.authorUrl})`
                        : skill.author || "Unknown"
                    }
                  />
                  <MetadataRow
                    label="Updated"
                    value={
                      skill.updatedAt
                        ? new Date(skill.updatedAt).toLocaleString()
                        : "Unknown"
                    }
                  />
                  <MetadataRow
                    label="Source"
                    value={`${skill.sourceType || "seeded"} · ${skill.sourcePath || "local content"}`}
                  />
                  <MetadataRow
                    label="Agent Bridge"
                    value={skill.agentBridge?.message || "Not available"}
                  />
                  {!skill.validation?.capabilities?.hasAgentFiles ? (
                    <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 text-amber-500 text-sm leading-6">
                      <div className="flex items-center gap-2 mb-1">
                        <WarningCircle size={16} />
                        <span>Agent files not complete</span>
                      </div>
                      <p>
                        The preview flow is working, but this package does not
                        yet include the full Agent import payload.
                      </p>
                    </div>
                  ) : null}
                  <div className="rounded-2xl bg-black/20 light:bg-slate-100 border border-white/5 p-5">
                    <p className="text-base font-semibold text-theme-text-primary">
                      Files
                    </p>
                    <div className="mt-3 flex flex-col gap-y-2">
                      {(skill.files || []).map((file) => (
                        <div
                          key={file.name}
                          className="flex items-center justify-between rounded-lg bg-black/20 light:bg-white px-3 py-2 text-sm"
                        >
                          <span className="text-theme-text-primary break-all">
                            {file.name}
                          </span>
                          <span className="text-theme-text-secondary font-mono text-xs">
                            {file.size} B
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
