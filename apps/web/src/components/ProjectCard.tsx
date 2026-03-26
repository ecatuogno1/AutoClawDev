import { Link } from "@tanstack/react-router";
import type { ProjectWithStats } from "@/types";
import { StatsBar } from "./StatsBar";
import { RunButton } from "./RunButton";

interface ProjectCardProps {
  project: ProjectWithStats;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      to="/projects/$projectKey"
      params={{ projectKey: project.key }}
      className="block bg-[#161b22] border border-[#30363d] rounded-lg p-5 hover:border-[#58a6ff] transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold text-[#e6edf3]">
            {project.name}
          </h3>
          <span className="mono text-xs text-[#d29922]">{project.key}</span>
        </div>
        <div onClick={(e) => e.preventDefault()}>
          <RunButton projectKey={project.key} />
        </div>
      </div>

      <p className="text-sm text-[#8b949e] mb-4 line-clamp-2">
        {project.description}
      </p>

      <StatsBar
        passed={project.stats.passed}
        failed={project.stats.failed}
        total={project.stats.total}
        passRate={project.stats.passRate}
      />

      {project.focus.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {project.focus.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full text-xs bg-[#388bfd20] text-[#58a6ff] border border-[#388bfd40]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {project.stats.lastExperiment && (
        <div className="mt-3 pt-3 border-t border-[#30363d]">
          <div className="flex items-center gap-2 text-xs text-[#8b949e]">
            <span
              className={
                project.stats.lastExperiment.result === "pass"
                  ? "text-[#3fb950]"
                  : "text-[#f85149]"
              }
            >
              {project.stats.lastExperiment.result === "pass" ? "PASS" : "FAIL"}
            </span>
            <span className="truncate">
              {project.stats.lastExperiment.description}
            </span>
          </div>
        </div>
      )}
    </Link>
  );
}
