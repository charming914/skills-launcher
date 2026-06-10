import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isMobile } from "react-device-detect";
import DOMPurify from "dompurify";
import Sidebar from "@/components/SettingsSidebar";
import SkillStore from "@/models/skillStore";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import renderMarkdown from "@/utils/chat/markdown";
import { v4 } from "uuid";
import {
  ArrowLeft,
  ChatCircleText,
  CheckCircle,
  CircleNotch,
  PaperPlaneTilt,
  ShieldCheck,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";

function statusLabel(skill) {
  const importRecord = skill?.importRecord || null;
  const permission = importRecord?.permissionRequest || null;
  const env = importRecord?.envResult || null;
  const completeness = skill?.completeness || null;
  const isActive = skill?.installState?.status === "installed-active";

  if (!importRecord) return "需要先导入 Skill，生成权限和环境检测记录。";
  if (importRecord.status !== "success")
    return `导入未成功：${importRecord.failureReason || importRecord.status}`;
  if (!isActive) return "需要在详情页批准并启用后才能单独对话。";
  if (permission?.decision !== "approved") return "权限尚未批准。";
  if (env?.compatible !== true) return "运行环境检测未通过。";
  if (completeness?.runnable === false) return "Skill 文件不完整，无法运行。";
  return "";
}

function canChat(skill) {
  return statusLabel(skill).length === 0;
}

function StatusPill({ ok, children }) {
  return (
    <span
      className={`inline-flex items-center gap-x-1 rounded-full px-2.5 py-1 text-xs font-medium ${
        ok
          ? "bg-emerald-500/15 text-emerald-400"
          : "bg-amber-500/15 text-amber-400"
      }`}
    >
      {ok ? <CheckCircle size={13} /> : <WarningCircle size={13} />}
      {children}
    </span>
  );
}

function SkillReadiness({ skill }) {
  if (!skill) return null;
  const importRecord = skill.importRecord || null;
  const permission = importRecord?.permissionRequest || null;
  const env = importRecord?.envResult || null;
  const completeness = skill.completeness || null;
  const active = skill.installState?.status === "installed-active";
  const ready = canChat(skill);

  return (
    <div className="rounded-2xl bg-black/20 light:bg-slate-100 border border-white/5 p-5">
      <div className="flex items-center gap-x-2 mb-4">
        <ShieldCheck size={18} className="text-theme-text-secondary" />
        <p className="text-base font-semibold text-theme-text-primary">
          调用前检查
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusPill ok={!!importRecord && importRecord.status === "success"}>
          详情/导入记录
        </StatusPill>
        <StatusPill ok={permission?.decision === "approved"}>
          权限已批准
        </StatusPill>
        <StatusPill ok={env?.compatible === true}>环境可用</StatusPill>
        <StatusPill ok={completeness?.runnable !== false}>
          文件可运行
        </StatusPill>
        <StatusPill ok={active}>已启用</StatusPill>
      </div>
      <div
        className={`mt-4 rounded-xl px-3 py-2 text-sm ${
          ready
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-amber-500/10 text-amber-400"
        }`}
      >
        {ready
          ? "已通过预检。发送消息后后端会注入当前 Skill 的详情、权限、环境状态，并只开放这个 Skill 工具。"
          : statusLabel(skill)}
      </div>
    </div>
  );
}

function SkillScope({ skill }) {
  if (!skill) return null;
  const params = skill.files?.some((file) => file.name === "plugin.json")
    ? "见已安装 plugin.json 的 entrypoint.params"
    : "尚未检测到 plugin.json";

  return (
    <div className="rounded-2xl bg-black/20 light:bg-slate-100 border border-white/5 p-5">
      <p className="text-base font-semibold text-theme-text-primary mb-3">
        Skill 信息注入
      </p>
      <div className="flex flex-col gap-y-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-theme-text-secondary">
            描述
          </p>
          <p className="mt-1 text-theme-text-primary leading-6">
            {skill.description || "无描述"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-theme-text-secondary">
            能力范围
          </p>
          <p className="mt-1 text-theme-text-primary leading-6 line-clamp-6">
            {skill.content || skill.summary || "无 SKILL.md 内容"}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-theme-text-secondary">
            输入输出 / 调用方式
          </p>
          <p className="mt-1 text-theme-text-primary leading-6">{params}</p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const isThought = message.type === "agentThought";
  const isError = message.type === "abort";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-7 ${
          isUser
            ? "bg-primary-button text-white"
            : isError
              ? "bg-red-500/10 border border-red-500/20 text-red-400"
              : isThought
                ? "bg-amber-500/10 border border-amber-500/20 text-amber-300"
                : "bg-black/25 light:bg-slate-100 text-theme-text-primary"
        }`}
      >
        {isThought ? (
          <p className="text-xs uppercase tracking-[0.2em] mb-1 opacity-80">
            Agent Thought
          </p>
        ) : null}
        <div
          className="break-words"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(
              renderMarkdown(message.content || message.error || "")
            ),
          }}
        />
      </div>
    </div>
  );
}

function emptyAssistantMessage(uuid) {
  return {
    uuid,
    role: "assistant",
    type: "textResponseChunk",
    content: "",
    pending: true,
  };
}

export default function LocalSkillChat() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [skill, setSkill] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const chatHistoryRef = useRef([]);
  const scrollRef = useRef(null);

  function setHistory(next) {
    chatHistoryRef.current = next;
    setChatHistory(next);
  }

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
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, sending]);

  function handleChatChunk(chunk) {
    const uuid = chunk.uuid || chunk.id;
    const current = [...chatHistoryRef.current];

    if (chunk.type === "agentThought") {
      setHistory([
        ...current,
        {
          uuid: `${uuid}:thought:${current.length}`,
          role: "assistant",
          type: "agentThought",
          content: chunk.thought || chunk.textResponse || "",
        },
      ]);
      return;
    }

    if (chunk.type === "abort") {
      setSending(false);
      setHistory([
        ...current,
        {
          uuid: `${uuid}:abort`,
          role: "assistant",
          type: "abort",
          content: chunk.error || "Skill chat failed.",
          error: chunk.error,
        },
      ]);
      return;
    }

    if (chunk.type === "textResponse" || chunk.type === "textResponseChunk") {
      const idx = current.findIndex((item) => item.uuid === uuid);
      if (idx === -1) {
        current.push({
          ...emptyAssistantMessage(uuid),
          content: chunk.textResponse || "",
          pending: !chunk.close,
        });
      } else {
        current[idx] = {
          ...current[idx],
          content: `${current[idx].content || ""}${chunk.textResponse || ""}`,
          pending: !chunk.close,
        };
      }
      setHistory(current);
      return;
    }

    if (chunk.type === "finalizeResponseStream") {
      const idx = current.findIndex((item) => item.uuid === uuid);
      if (idx >= 0) {
        current[idx] = { ...current[idx], pending: false };
        setHistory(current);
      }
      setSending(false);
    }
  }

  async function submitMessage(event) {
    event?.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending || !canChat(skill)) return;

    const nextHistory = [
      ...chatHistoryRef.current,
      {
        uuid: v4(),
        role: "user",
        type: "prompt",
        content: trimmed,
      },
    ];
    setHistory(nextHistory);
    setMessage("");
    setSending(true);

    const result = await SkillStore.streamChat(slug, trimmed, handleChatChunk, {
      sessionId: `local-${slug}`,
    });
    if (!result.success && !result.aborted) {
      showToast(result.error || "Skill chat failed.", "error");
      setSending(false);
    }
  }

  const ready = skill ? canChat(skill) : false;
  const blockedReason = skill ? statusLabel(skill) : "";

  return (
    <div className="w-screen h-screen overflow-hidden bg-theme-bg-container flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-hidden p-4 md:p-0"
      >
        <div className="flex flex-col w-full h-full px-1 md:pl-6 md:pr-[86px] md:py-6 py-16">
          <div className="flex items-center gap-x-3 mb-5">
            <Link
              to={paths.communityHub.skillDetail(slug)}
              className="inline-flex items-center gap-x-2 text-sm text-theme-text-secondary hover:text-theme-text-primary"
            >
              <ArrowLeft size={16} />
              Back to Skill detail
            </Link>
          </div>

          {loading ? (
            <p className="text-theme-text-secondary text-sm">
              Loading skill chat...
            </p>
          ) : error ? (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-500">
              {error}
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 min-h-0 flex-1">
              <div className="xl:col-span-3 flex flex-col min-h-0 rounded-3xl bg-black/20 light:bg-slate-100 border border-white/5 overflow-hidden">
                <div className="p-5 border-b border-white/10 light:border-slate-200">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-x-2">
                        <ChatCircleText
                          size={22}
                          className="text-primary-button"
                        />
                        <p className="text-lg font-bold text-theme-text-primary">
                          {skill.title}
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-theme-text-secondary leading-6 max-w-3xl">
                        单 Skill 对话页：本页只会调用{" "}
                        <code className="font-mono text-xs">@{skill.slug}</code>{" "}
                        对应的已批准 Skill。
                      </p>
                    </div>
                    {ready ? (
                      <CheckCircle
                        size={22}
                        className="text-emerald-400 shrink-0"
                      />
                    ) : (
                      <XCircle size={22} className="text-amber-400 shrink-0" />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-5">
                  {chatHistory.length === 0 ? (
                    <div className="h-full min-h-[320px] flex items-center justify-center text-center">
                      <div className="max-w-md">
                        <p className="text-theme-text-primary font-semibold">
                          和这个 Skill 单独聊
                        </p>
                        <p className="text-theme-text-secondary text-sm mt-2 leading-6">
                          发送请求后，后端会读取详情页记录的描述、能力范围、
                          输入输出格式、权限和环境检测，再限制 Agent 只调用当前
                          Skill。
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-y-4">
                      {chatHistory.map((item) => (
                        <MessageBubble key={item.uuid} message={item} />
                      ))}
                      {sending ? (
                        <div className="flex justify-start">
                          <div className="inline-flex items-center gap-x-2 rounded-2xl bg-black/25 light:bg-white px-4 py-3 text-theme-text-secondary text-sm">
                            <CircleNotch size={16} className="animate-spin" />
                            Skill 正在处理...
                          </div>
                        </div>
                      ) : null}
                      <div ref={scrollRef} />
                    </div>
                  )}
                </div>

                <form
                  onSubmit={submitMessage}
                  className="p-4 border-t border-white/10 light:border-slate-200"
                >
                  {!ready ? (
                    <div className="mb-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-amber-400 text-sm">
                      {blockedReason}
                    </div>
                  ) : null}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={message}
                      disabled={!ready || sending}
                      onChange={(event) => setMessage(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          submitMessage(event);
                        }
                      }}
                      placeholder={
                        ready
                          ? "输入你想让这个 Skill 完成的任务..."
                          : "通过调用前检查后才能发送"
                      }
                      rows={3}
                      className="flex-1 resize-none rounded-2xl bg-black/30 light:bg-white border border-white/10 light:border-slate-200 px-4 py-3 text-sm text-theme-text-primary placeholder:text-theme-text-secondary outline-none focus:border-primary-button disabled:opacity-60"
                    />
                    <button
                      type="submit"
                      disabled={!ready || sending || !message.trim()}
                      className="h-[48px] w-[48px] inline-flex items-center justify-center rounded-2xl bg-primary-button text-white disabled:bg-white/10 disabled:text-theme-text-secondary disabled:cursor-not-allowed"
                    >
                      {sending ? (
                        <CircleNotch size={20} className="animate-spin" />
                      ) : (
                        <PaperPlaneTilt size={20} weight="fill" />
                      )}
                    </button>
                  </div>
                </form>
              </div>

              <div className="xl:col-span-1 min-h-0 overflow-y-auto flex flex-col gap-y-4">
                <SkillReadiness skill={skill} />
                <SkillScope skill={skill} />
                <Link
                  to={paths.settings.logs()}
                  className="rounded-2xl bg-black/20 light:bg-slate-100 border border-white/5 p-4 text-sm text-theme-text-secondary hover:text-theme-text-primary"
                >
                  运行日志已写入 Event Logs：
                  <span className="font-mono">
                    {" "}
                    skill_chat_invocation / completed / error
                  </span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
