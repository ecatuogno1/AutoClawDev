const agentConfig: Record<string, { label: string; color: string; emoji: string }> = {
  olivia: { label: "Claude Opus", color: "#bc8cff", emoji: "🔎" },
  jessica: { label: "Claude Opus", color: "#bc8cff", emoji: "🧭" },
  terry: { label: "Codex 5.4", color: "#3fb950", emoji: "🛠️" },
  jerry: { label: "Codex 5.4", color: "#d29922", emoji: "🎨" },
  coderabbit: { label: "CodeRabbit", color: "#f85149", emoji: "🐰" },
  penny: { label: "Claude Opus", color: "#bc8cff", emoji: "🧐" },
  gemini: { label: "Gemini 3.1 Pro", color: "#4285f4", emoji: "🔎" },
  claude: { label: "Claude Opus", color: "#bc8cff", emoji: "🧭" },
  opus: { label: "Claude Opus", color: "#bc8cff", emoji: "🧭" },
  codex: { label: "Codex 5.4", color: "#3fb950", emoji: "🛠️" },
  sonnet: { label: "Claude Sonnet", color: "#58a6ff", emoji: "🧐" },
};

export function AgentBadge({ agent }: { agent: string }) {
  const key = agent.toLowerCase();
  const config = agentConfig[key] ?? {
    label: agent,
    color: "#8b949e",
    emoji: "🤖",
  };

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: config.color + "20",
        color: config.color,
        border: `1px solid ${config.color}40`,
      }}
    >
      <span>{config.emoji}</span>
      {config.label}
    </span>
  );
}
