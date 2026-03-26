const pipelineSteps = [
  { emoji: "🔎", name: "Olivia", model: "Opus", role: "Research" },
  { emoji: "🧭", name: "Jessica", model: "Opus", role: "Plan" },
  { emoji: "🛠️", name: "Terry / Jerry", model: "Codex 5.4", role: "Implement" },
  { emoji: "🐰", name: "CodeRabbit", model: "", role: "Review" },
  { emoji: "🧐", name: "Penny", model: "Opus", role: "Deep Review" },
  { emoji: "👁️", name: "Olivia", model: "Opus", role: "Visual (frontend)" },
  { emoji: "🧪", name: "Tests", model: "", role: "Test" },
  { emoji: "🛡️", name: "Lint", model: "", role: "Lint" },
  { emoji: "🚀", name: "Commit", model: "", role: "Ship" },
];

interface CycleTimelineProps {
  activeStep?: number;
  compact?: boolean;
}

export function CycleTimeline({ activeStep, compact = false }: CycleTimelineProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {pipelineSteps.map((step, i) => (
          <div key={i} className="flex items-center">
            <span
              className={`text-sm ${
                activeStep !== undefined && i === activeStep
                  ? "animate-pulse"
                  : activeStep !== undefined && i < activeStep
                    ? "opacity-100"
                    : "opacity-40"
              }`}
              title={`${step.name}${step.model ? ` [${step.model}]` : ""}`}
            >
              {step.emoji}
            </span>
            {i < pipelineSteps.length - 1 && (
              <span className="text-[#30363d] text-xs mx-0.5">&#8594;</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
      <h3 className="text-sm font-medium text-[#e6edf3] mb-3">
        Agent Pipeline
      </h3>
      <div className="flex items-start gap-1 overflow-x-auto pb-2">
        {pipelineSteps.map((step, i) => (
          <div key={i} className="flex items-center">
            <div
              className={`flex flex-col items-center px-2 py-2 rounded-md min-w-[72px] ${
                activeStep !== undefined && i === activeStep
                  ? "bg-[#58a6ff15] border border-[#58a6ff40]"
                  : activeStep !== undefined && i < activeStep
                    ? "bg-[#3fb95010] border border-[#3fb95030]"
                    : "border border-transparent"
              }`}
            >
              <span className="text-xl mb-1">{step.emoji}</span>
              <span className="text-xs text-[#e6edf3] font-medium">
                {step.name}
              </span>
              {step.model && (
                <span className="text-[10px] text-[#6e7681]">
                  [{step.model}]
                </span>
              )}
              <span className="text-[10px] text-[#8b949e] mt-0.5">
                {step.role}
              </span>
            </div>
            {i < pipelineSteps.length - 1 && (
              <svg
                className="w-4 h-4 text-[#30363d] shrink-0 mx-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
