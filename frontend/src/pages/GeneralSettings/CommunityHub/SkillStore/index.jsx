import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isMobile } from "react-device-detect";
import Sidebar from "@/components/SettingsSidebar";
import SkillStore from "@/models/skillStore";
import paths from "@/utils/paths";
import { MagnifyingGlass, Sparkle } from "@phosphor-icons/react";

function SkillCard({ skill }) {
  return (
    <Link
      to={paths.communityHub.skillDetail(skill.slug)}
      className="bg-black/70 light:bg-slate-100 rounded-lg p-4 hover:bg-black/60 light:hover:bg-slate-200 transition-all duration-200 border border-transparent hover:border-slate-400 flex flex-col gap-y-3"
    >
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

      <div className="flex items-center justify-between text-xs text-theme-text-secondary font-mono">
        <span>{skill.fileCount} files</span>
        <span>Open detail →</span>
      </div>
    </Link>
  );
}

export default function LocalSkillStore() {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await SkillStore.list();
      if (result.success) setSkills(result.skills || []);
      setLoading(false);
    }

    load();
  }, []);

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
              This is a local-first SKILL storefront skeleton. Right now it
              reads seeded skills from the repo path
              <code className="mx-1 px-1.5 py-0.5 rounded bg-black/20 light:bg-slate-200 font-mono text-xs">
                server/storage/skill-store
              </code>
              so we can verify listing and detail rendering end-to-end.
            </p>
          </div>

          <div className="mt-6 mb-5 flex items-center gap-x-3 bg-black/20 light:bg-slate-100 rounded-xl px-4 py-3 border border-white/5">
            <MagnifyingGlass size={18} className="text-theme-text-secondary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search local skills"
              className="bg-transparent w-full outline-none text-theme-text-primary placeholder:text-theme-text-secondary text-sm"
            />
          </div>

          {loading ? (
            <p className="text-theme-text-secondary text-sm">Loading skills...</p>
          ) : filteredSkills.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/10 light:border-slate-300 p-8 text-center bg-black/10 light:bg-slate-100">
              <div className="flex justify-center mb-3">
                <Sparkle size={28} className="text-theme-text-secondary" />
              </div>
              <p className="text-theme-text-primary font-medium">
                No local skills found
              </p>
              <p className="text-theme-text-secondary text-sm mt-2">
                Drop skill folders into
                <code className="mx-1 font-mono">server/storage/skill-store</code>
                to populate this page.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-6">
              {filteredSkills.map((skill) => (
                <SkillCard key={skill.slug} skill={skill} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
