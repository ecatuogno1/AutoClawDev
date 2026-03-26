import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const configPaths = [
    {
      label: "Project Configs",
      path: "~/.local/lib/autoclawdev/projects/",
      desc: "JSON files defining each project's config",
    },
    {
      label: "Experiment Logs",
      path: "~/.openclaw/workspace/autoresearch/",
      desc: "JSONL experiment history per project",
    },
    {
      label: "Runner Script",
      path: "~/.openclaw/workspace/autoresearch/runner.sh",
      desc: "Shell script that executes the AutoClawDev pipeline",
    },
    {
      label: "Run Log",
      path: "~/.openclaw/workspace/autoresearch/run.log",
      desc: "Live log output from active runs",
    },
  ];

  const agents = [
    {
      emoji: "🔎",
      name: "Olivia",
      model: "Gemini 3.1 Pro",
      role: "Research & Analysis",
      color: "#4285f4",
    },
    {
      emoji: "🧭",
      name: "Jessica",
      model: "Claude Opus",
      role: "Planning & Strategy",
      color: "#bc8cff",
    },
    {
      emoji: "🛠️",
      name: "Terry",
      model: "Codex 5.4",
      role: "Implementation",
      color: "#3fb950",
    },
    {
      emoji: "🎨",
      name: "Jerry",
      model: "Codex 5.4",
      role: "Refinement & Style",
      color: "#d29922",
    },
    {
      emoji: "🐰",
      name: "CodeRabbit",
      model: "CodeRabbit",
      role: "Code Review",
      color: "#f85149",
    },
    {
      emoji: "🧐",
      name: "Penny",
      model: "Claude Sonnet",
      role: "Validation & QA",
      color: "#58a6ff",
    },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#e6edf3]">Settings</h1>
        <p className="text-sm text-[#8b949e] mt-1">
          Configuration and system information
        </p>
      </div>

      {/* Data Paths */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <h2 className="text-base font-semibold text-[#e6edf3] mb-4">
          Data Paths
        </h2>
        <div className="space-y-4">
          {configPaths.map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-4 pb-4 border-b border-[#30363d] last:border-0 last:pb-0"
            >
              <div className="flex-1">
                <span className="text-sm text-[#e6edf3] font-medium block">
                  {item.label}
                </span>
                <span className="text-xs text-[#8b949e] block mt-0.5">
                  {item.desc}
                </span>
              </div>
              <code className="mono text-xs text-[#d29922] bg-[#0d1117] px-2 py-1 rounded">
                {item.path}
              </code>
            </div>
          ))}
        </div>
      </div>

      {/* Agents */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <h2 className="text-base font-semibold text-[#e6edf3] mb-4">
          Agent Pipeline
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className="flex items-center gap-3 p-3 rounded-lg border border-[#30363d] bg-[#0d1117]"
            >
              <span className="text-2xl">{agent.emoji}</span>
              <div className="flex-1">
                <span className="text-sm text-[#e6edf3] font-medium block">
                  {agent.name}
                </span>
                <span className="text-xs text-[#8b949e]">{agent.role}</span>
              </div>
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: agent.color + "20",
                  color: agent.color,
                  border: `1px solid ${agent.color}40`,
                }}
              >
                {agent.model}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* API */}
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <h2 className="text-base font-semibold text-[#e6edf3] mb-4">
          API Server
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-[#8b949e]">Backend:</span>
            <code className="mono text-xs text-[#58a6ff]">
              http://localhost:4100
            </code>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#8b949e]">Frontend:</span>
            <code className="mono text-xs text-[#58a6ff]">
              http://localhost:5173
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
