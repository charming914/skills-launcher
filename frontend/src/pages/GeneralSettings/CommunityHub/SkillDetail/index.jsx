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
  CheckCircle,
  CircleNotch,
  Download,
  FileText,
  LinkSimple,
  ListChecks,
  ShieldWarning,
  Sparkle,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";

// ─── Shared UI helpers ────────────────────────────────────────────────────────

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

// ─── New blocks ───────────────────────────────────────────────────────────────

function EnvStatusIcon({ status }) {
  switch (status) {
    case "satisfied":
      return <CheckCircle size={14} className="text-emerald-400 shrink-0" />;
    case "unsatisfied":
      return <XCircle size={14} className="text-red-400 shrink-0" />;
    case "skipped":
      return <span className="w-[14px] h-[14px] shrink-0 inline-block rounded-full bg-white/20" />;
    default: // unknown
      return <WarningCircle size={14} className="text-amber-400 shrink-0" />;
  }
}

function EnvResultBlock({ envResult }) {
  if (!envResult) return null;
  const checks = envResult.checks || [];
  const visible = checks.filter((c) => c.status !== "skipped");

  return (
    <div className="rounded-2xl bg-black/20 light:bg-slate-100 border border-white/5 p-5">
      <div className="flex items-center gap-x-2 mb-3">
        <ListChecks size={18} className="text-theme-text-secondary" />
        <p className="text-base font-semibold text-theme-text-primary">
          环境检测
        </p>
        <span
          className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
            envResult.compatible
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-red-500/15 text-red-400"
          }`}
        >
          {envResult.compatible ? "兼容" : "不兼容"}
        </span>
      </div>

      {envResult.hasWarnings ? (
        <div className="mb-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-amber-400 text-xs">
          存在需人工确认的项，请在启用前检查详情。
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-theme-text-secondary text-sm">无检测项</p>
      ) : (
        <div className="flex flex-col gap-y-2">
          {visible.map((c, i) => (
            <div
              key={i}
              className="flex items-start gap-x-2 rounded-lg bg-black/20 light:bg-white px-3 py-2 text-sm"
            >
              <EnvStatusIcon status={c.status} />
              <div className="flex-1 min-w-0">
                <span className="text-theme-text-primary font-medium">
                  {c.label}
                </span>
                {c.detail ? (
                  <p className="text-theme-text-secondary text-xs mt-0.5 break-all">
                    {c.detail}
                  </p>
                ) : null}
              </div>
              {c.required ? (
                <span className="text-[10px] text-theme-text-secondary bg-white/10 rounded px-1">
                  必需
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const RISK_STYLE = {
  high: "text-red-400 bg-red-500/10",
  medium: "text-amber-400 bg-amber-500/10",
  low: "text-emerald-400 bg-emerald-500/10",
};

const SOURCE_LABEL = {
  declared: "声明",
  "static-scan": "静态扫描",
  inferred: "推断",
};

function PermissionBlock({ permissionRequest, onApprove, approving, canApprove }) {
  if (!permissionRequest) return null;
  const items = permissionRequest.items || [];
  const decision = permissionRequest.decision;

  return (
    <div className="rounded-2xl bg-black/20 light:bg-slate-100 border border-white/5 p-5">
      <div className="flex items-center gap-x-2 mb-3">
        <ShieldWarning size={18} className="text-theme-text-secondary" />
        <p className="text-base font-semibold text-theme-text-primary">
          权限申请
        </p>
        <span
          className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
            decision === "approved"
              ? "bg-emerald-500/15 text-emerald-400"
              : decision === "rejected"
                ? "bg-red-500/15 text-red-400"
                : "bg-amber-500/15 text-amber-400"
          }`}
        >
          {decision === "approved"
            ? "已批准"
            : decision === "rejected"
              ? "已拒绝"
              : "待审批"}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-theme-text-secondary text-sm">无权限申请</p>
      ) : (
        <div className="flex flex-col gap-y-2 mb-4">
          {items.map((item, i) => (
            <div
              key={i}
              className="rounded-lg bg-black/20 light:bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-x-2 mb-1">
                <span className="font-mono font-semibold text-theme-text-primary">
                  {item.capability}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    RISK_STYLE[item.risk] || "text-theme-text-secondary bg-white/10"
                  }`}
                >
                  {item.risk?.toUpperCase()}
                </span>
                <span className="text-[10px] text-theme-text-secondary bg-white/10 rounded px-1">
                  {SOURCE_LABEL[item.source] || item.source}
                </span>
              </div>
              <p className="text-theme-text-secondary text-xs break-all">
                {item.evidence}
              </p>
            </div>
          ))}
        </div>
      )}

      {decision !== "approved" ? (
        <button
          type="button"
          disabled={!canApprove || approving}
          onClick={onApprove}
          title={!canApprove ? "Skill 尚未注册，无法批准" : ""}
          className={`inline-flex items-center gap-x-2 text-sm font-medium rounded-lg px-4 py-2 w-full justify-center ${
            !canApprove
              ? "bg-white/5 text-theme-text-secondary cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-500 text-white"
          } ${approving ? "opacity-70" : ""}`}
        >
          {approving ? (
            <CircleNotch size={15} className="animate-spin" />
          ) : null}
          批准并启用
        </button>
      ) : (
        <div className="text-sm text-emerald-400 text-center">
          ✅ 已批准并启用
          {permissionRequest.decidedAt
            ? ` · ${new Date(permissionRequest.decidedAt).toLocaleString()}`
            : ""}
        </div>
      )}
    </div>
  );
}

function ActivationFallbackBlock({ onApprove, approving }) {
  return (
    <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-5">
      <div className="flex items-center gap-x-2 mb-2">
        <ShieldWarning size={18} className="text-emerald-400" />
        <p className="text-base font-semibold text-theme-text-primary">
          待批准启用
        </p>
      </div>
      <p className="text-sm leading-6 text-theme-text-secondary mb-4">
        这个 Skill 已经安装到本地，但还没有启用。确认来源和文件内容可信后，可以批准并启用它。
      </p>
      <button
        type="button"
        disabled={approving}
        onClick={onApprove}
        className={`inline-flex items-center gap-x-2 text-sm font-medium rounded-lg px-4 py-2 w-full justify-center bg-emerald-600 hover:bg-emerald-500 text-white ${
          approving ? "opacity-70" : ""
        }`}
      >
        {approving ? <CircleNotch size={15} className="animate-spin" /> : null}
        批准并启用
      </button>
    </div>
  );
}

function StageStatusDot({ status }) {
  if (status === "success")
    return <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />;
  if (status === "failed")
    return <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />;
  return <span className="w-2 h-2 rounded-full bg-white/30 inline-block" />;
}

function ImportLogBlock({ importRecord }) {
  if (!importRecord) return null;
  const stages = importRecord.stages || [];
  const failed = importRecord.status === "failed";

  return (
    <div className="rounded-2xl bg-black/20 light:bg-slate-100 border border-white/5 p-5">
      <div className="flex items-center gap-x-2 mb-3">
        <ListChecks size={18} className="text-theme-text-secondary" />
        <p className="text-base font-semibold text-theme-text-primary">
          导入日志
        </p>
        <span
          className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
            failed
              ? "bg-red-500/15 text-red-400"
              : "bg-emerald-500/15 text-emerald-400"
          }`}
        >
          {failed ? "失败" : "成功"}
        </span>
      </div>

      {failed && importRecord.failureReason ? (
        <div className="mb-3 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-red-400 text-sm">
          {importRecord.failureReason}
        </div>
      ) : null}

      {stages.length === 0 ? (
        <p className="text-theme-text-secondary text-sm">无阶段记录</p>
      ) : (
        <div className="flex flex-col gap-y-2">
          {stages.map((s, i) => {
            const duration =
              s.startedAt && s.finishedAt
                ? `${Math.round(
                    (new Date(s.finishedAt) - new Date(s.startedAt)) / 10
                  ) / 100}s`
                : null;
            return (
              <div
                key={i}
                className="flex items-start gap-x-2 rounded-lg bg-black/20 light:bg-white px-3 py-2 text-sm"
              >
                <StageStatusDot status={s.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-x-2">
                    <span className="text-theme-text-primary font-mono text-xs">
                      {s.stage}
                    </span>
                    {duration ? (
                      <span className="text-theme-text-secondary text-[10px]">
                        {duration}
                      </span>
                    ) : null}
                  </div>
                  {s.detail ? (
                    <p className="text-theme-text-secondary text-xs mt-0.5">
                      {s.detail}
                    </p>
                  ) : null}
                  {s.error ? (
                    <p className="text-red-400 text-xs mt-0.5 break-all">
                      {s.error}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConversationRefBlock({ conversationRef }) {
  return (
    <div className="rounded-2xl bg-black/20 light:bg-slate-100 border border-white/5 p-5">
      <div className="flex items-center gap-x-2 mb-2">
        <LinkSimple size={18} className="text-theme-text-secondary" />
        <p className="text-base font-semibold text-theme-text-primary">
          导入对话
        </p>
      </div>
      {conversationRef ? (
        <Link
          to={`/workspace/${conversationRef.workspaceSlug}/t/${conversationRef.threadSlug}`}
          className="inline-flex items-center gap-x-1 text-sm text-primary-button hover:underline"
        >
          <LinkSimple size={14} />
          打开导入报告对话（工作空间：{conversationRef.workspaceSlug}）
        </Link>
      ) : (
        <p className="text-theme-text-secondary text-sm">
          未写入对话（无可用工作空间或已跳过）
        </p>
      )}
    </div>
  );
}

// ─── AI-generated file warning block ─────────────────────────────────────────

function AiGeneratedWarningBlock({ completeness }) {
  if (!completeness) return null;
  const aiFiles = (completeness.items || []).filter((i) => i.generatedByAi);
  if (aiFiles.length === 0) return null;
  const hasHandler = aiFiles.some((i) => i.file === "handler.js");

  return (
    <div className="flex flex-col gap-y-2">
      {hasHandler && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-red-400 text-sm">
          <div className="flex items-start gap-x-2">
            <ShieldWarning size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">⚠️ handler.js 由 AI 生成 — 启用前请人工复核</p>
              <p className="text-xs mt-1 opacity-80">
                handler.js 将在主进程以完整系统权限（文件系统、网络、Shell）运行，无沙箱隔离。
                请仔细阅读代码，确认无恶意或高风险逻辑后再点击"批准并启用"。
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-3 text-violet-300 text-xs">
        <p className="font-medium mb-1">以下文件由 AI 生成，启用前请复核：</p>
        <ul className="list-disc list-inside space-y-0.5">
          {aiFiles.map((f) => (
            <li key={f.file}>
              <span className="font-mono">{f.label}</span>
              {f.file === "handler.js" ? " — 执行代码，高风险" : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Completeness block ───────────────────────────────────────────────────────

const SEVERITY_STYLE = {
  "blocks-download": {
    badge: "bg-red-500/15 text-red-400",
    label: "阻断下载",
    icon: <XCircle size={14} className="text-red-400 shrink-0" />,
  },
  "blocks-run": {
    badge: "bg-amber-500/15 text-amber-400",
    label: "阻断运行",
    icon: <WarningCircle size={14} className="text-amber-400 shrink-0" />,
  },
  recommended: {
    badge: "bg-white/10 text-theme-text-secondary",
    label: "建议",
    icon: <WarningCircle size={14} className="text-white/30 shrink-0" />,
  },
};

function CompletenessBlock({ completeness, onComplete, completing, slug }) {
  if (!completeness) return null;
  const { complete, downloadable, runnable, items } = completeness;
  const canGenerateAny = items.some(
    (i) => i.status === "missing" && i.canGenerate
  );

  return (
    <div className="rounded-2xl bg-black/20 light:bg-slate-100 border border-white/5 p-5">
      <div className="flex items-center gap-x-2 mb-3">
        <ListChecks size={18} className="text-theme-text-secondary" />
        <p className="text-base font-semibold text-theme-text-primary">
          文件完整性
        </p>
        <span
          className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
            complete
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-red-500/15 text-red-400"
          }`}
        >
          {complete ? "完整" : "不完整"}
        </span>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2 mb-3 text-xs">
        <span
          className={`px-2 py-0.5 rounded-full font-medium ${downloadable ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}
        >
          {downloadable ? "可下载" : "不可下载"}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full font-medium ${runnable ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}
        >
          {runnable ? "可运行" : "不可运行"}
        </span>
      </div>

      {/* Items list */}
      <div className="flex flex-col gap-y-2 mb-4">
        {items.map((item) => {
          const sev = SEVERITY_STYLE[item.severity] || SEVERITY_STYLE.recommended;
          const isPresent = item.status === "present";
          return (
            <div
              key={item.file}
              className="flex items-start gap-x-2 rounded-lg bg-black/20 light:bg-white px-3 py-2 text-sm"
            >
              {isPresent ? (
                <CheckCircle size={14} className="text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <span className="shrink-0 mt-0.5">{sev.icon}</span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-x-2 flex-wrap">
                  <span className="font-mono text-theme-text-primary text-xs">
                    {item.label}
                  </span>
                  {!isPresent && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sev.badge}`}
                    >
                      {sev.label}
                    </span>
                  )}
                  {item.generatedByAi && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-violet-500/15 text-violet-400">
                      AI 生成
                    </span>
                  )}
                </div>
                {!isPresent && (
                  <p className="text-theme-text-secondary text-xs mt-0.5">
                    {item.reason}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* One-click complete button */}
      {canGenerateAny && (
        <button
          type="button"
          disabled={completing}
          onClick={() => onComplete(slug)}
          className={`inline-flex items-center gap-x-2 text-sm font-medium rounded-lg px-4 py-2 w-full justify-center bg-violet-600 hover:bg-violet-500 text-white ${completing ? "opacity-70" : ""}`}
        >
          {completing ? (
            <CircleNotch size={15} className="animate-spin" />
          ) : (
            <Sparkle size={15} />
          )}
          {completing ? "正在补全…" : "一键补全缺失文件"}
        </button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LocalSkillDetail() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [skill, setSkill] = useState(null);
  const [error, setError] = useState(null);
  const [approving, setApproving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [noLlmNotice, setNoLlmNotice] = useState(false);

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

  async function handleApprove() {
    setApproving(true);
    const result = await SkillStore.approve(slug);
    if (result.success) {
      showToast("Skill 已批准并启用！", "success");
      await load();
    } else {
      showToast(`批准失败：${result.error}`, "error");
    }
    setApproving(false);
  }

  async function handleComplete(slugArg) {
    setCompleting(true);
    const result = await SkillStore.complete(slugArg);
    if (result?.success) {
      const llmUsed = result.payload?.llmUsed ?? true;
      if (!llmUsed) setNoLlmNotice(true);
      showToast("补全完成", "success");
      await load();
    } else {
      showToast(
        `补全失败：${result?.error || result?.payload?.generated?.find((g) => g.status === "failed")?.note || "未知原因"}`,
        "error"
      );
    }
    setCompleting(false);
  }

  async function handleDownload(slugArg) {
    setDownloading(true);
    await SkillStore.download(slugArg);
    setDownloading(false);
  }

  const importRecord = skill?.importRecord || null;
  const completeness = skill?.completeness || null;
  const envResult = importRecord?.envResult || null;
  const permissionRequest = importRecord?.permissionRequest || null;
  const conversationRef = importRecord?.conversationRef || null;
  const isInstalled = skill?.installState?.status !== "available";
  const isActive = skill?.installState?.status === "installed-active";

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
              {/* Header */}
              <div className="flex flex-col gap-y-2 pb-6 border-white light:border-theme-sidebar-border border-b-2 border-opacity-10">
                <p className="text-lg leading-6 font-bold text-theme-text-primary">
                  {skill.title}
                </p>
                <p className="text-sm leading-6 text-theme-text-secondary max-w-3xl">
                  {skill.description}
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  {/* Install status */}
                  <span
                    className={`text-sm font-medium px-3 py-1.5 rounded-lg ${
                      isActive
                        ? "bg-emerald-500/15 text-emerald-400"
                        : isInstalled
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-white/10 text-theme-text-secondary"
                    }`}
                  >
                    {isActive
                      ? "已安装并启用"
                      : isInstalled
                        ? "已安装（待批准启用）"
                        : "未安装"}
                  </span>
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

              {/* Body: 2/3 main + 1/3 sidebar */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
                {/* Left column: cover + validation + SKILL.md + env + permissions + log */}
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

                  {/* Completeness block */}
                  <CompletenessBlock
                    completeness={completeness}
                    onComplete={handleComplete}
                    completing={completing}
                    slug={slug}
                  />

                  {/* AI-generated files warning */}
                  <AiGeneratedWarningBlock completeness={completeness} />

                  {/* No-LLM notice */}
                  {noLlmNotice && (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-amber-400 text-xs">
                      未检测到可用的大模型，已用模板生成基础文件。建议在系统设置中配置 LLM 后重新补全，以获得更完整的内容。
                    </div>
                  )}

                  {/* Download button — shown when completeness data available */}
                  {completeness && (
                    <div className="flex gap-x-2">
                      <button
                        type="button"
                        disabled={!completeness.downloadable || downloading}
                        onClick={() => handleDownload(slug)}
                        title={
                          !completeness.downloadable
                            ? "Skill 缺少必要文件，无法下载"
                            : ""
                        }
                        className={`inline-flex items-center gap-x-2 text-sm font-medium rounded-lg px-4 py-2 flex-1 justify-center ${
                          completeness.downloadable
                            ? "bg-blue-600 hover:bg-blue-500 text-white"
                            : "bg-white/5 text-theme-text-secondary cursor-not-allowed"
                        } ${downloading ? "opacity-70" : ""}`}
                      >
                        {downloading ? (
                          <CircleNotch size={15} className="animate-spin" />
                        ) : (
                          <Download size={15} />
                        )}
                        下载 ZIP
                      </button>
                    </div>
                  )}

                  {/* Import pipeline results */}
                  {importRecord ? (
                    <>
                      <EnvResultBlock envResult={envResult} />
                      <PermissionBlock
                        permissionRequest={permissionRequest}
                        onApprove={handleApprove}
                        approving={approving}
                        canApprove={isInstalled}
                      />
                      <ImportLogBlock importRecord={importRecord} />
                      <ConversationRefBlock conversationRef={conversationRef} />
                    </>
                  ) : null}

                  {/* SKILL.md content */}
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

                {/* Right column: metadata + files */}
                <div className="flex flex-col gap-y-4">
                  {isInstalled && !isActive && !permissionRequest ? (
                    <ActivationFallbackBlock
                      onApprove={handleApprove}
                      approving={approving}
                    />
                  ) : null}

                  {/* Go-to-chat link when skill is active */}
                  {isActive && (
                    <Link
                      to={paths.communityHub.skillChat(skill.slug)}
                      className="inline-flex items-center gap-x-2 text-sm font-medium rounded-lg px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white justify-center"
                    >
                      <LinkSimple size={15} />
                      单独对话
                    </Link>
                  )}

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
                    label="Import Status"
                    value={
                      importRecord
                        ? importRecord.status === "success"
                          ? "导入成功"
                          : `导入失败: ${importRecord.failureReason || "未知原因"}`
                        : "尚未运行导入"
                    }
                  />

                  {!skill.validation?.capabilities?.hasAgentFiles ? (
                    <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 text-amber-500 text-sm leading-6">
                      <div className="flex items-center gap-2 mb-1">
                        <WarningCircle size={16} />
                        <span>Agent files not complete</span>
                      </div>
                      <p>
                        缺少 plugin.json 或 handler.js，无法注册到 Agent 插件系统。
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
