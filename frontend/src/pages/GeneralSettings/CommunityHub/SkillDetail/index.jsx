import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isMobile } from "react-device-detect";
import DOMPurify from "dompurify";
import Sidebar from "@/components/SettingsSidebar";
import SkillStore from "@/models/skillStore";
import paths from "@/utils/paths";
import renderMarkdown from "@/utils/chat/markdown";
import { setEventDelegatorForCodeSnippets } from "@/components/WorkspaceChat";
import { ArrowLeft, FileText } from "@phosphor-icons/react";

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

export default function LocalSkillDetail() {
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [skill, setSkill] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
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

    load();
  }, [slug]);

  useEffect(() => {
    if (!skill?.content) return;
    setEventDelegatorForCodeSnippets();
  }, [skill]);

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
                    label="Source Path"
                    value={skill.sourcePath || "local seeded content"}
                  />
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
                          <span className="text-theme-text-primary">
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
