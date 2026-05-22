export type ReviewSeverity = "critical" | "high" | "medium" | "low";

export interface ReviewFinding {
  severity: ReviewSeverity;
  file: string;
  description: string;
  fix: string;
  section: string;
}

export interface ReviewAuditSection {
  name: string;
  findings: ReviewFinding[];
}

export interface ParsedAuditReport {
  title: string;
  subtitle: string;
  sections: ReviewAuditSection[];
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

export interface ExecutionPlanPhase {
  phase: string;
  steps: string[];
}

export interface ProgressPhase {
  title: string;
  status: "completed" | "in-progress";
  changes: string[];
  commit?: string;
  verified: boolean;
  deployed: boolean;
}

export interface ParsedProgress {
  phases: ProgressPhase[];
  nextSteps: string[];
  deferred: string[];
  deployNotes: string[];
}

export const severityConfig: Record<
  ReviewSeverity,
  {
    bg: string;
    border: string;
    text: string;
    label: string;
    icon: string;
  }
> = {
  critical: {
    bg: "bg-[#f8514920]",
    border: "border-[#f8514940]",
    text: "text-[#ff7b72]",
    label: "Critical",
    icon: "!!",
  },
  high: {
    bg: "bg-[#d2992220]",
    border: "border-[#d2992240]",
    text: "text-[#d29922]",
    label: "High",
    icon: "!",
  },
  medium: {
    bg: "bg-[#1f6feb15]",
    border: "border-[#1f6feb30]",
    text: "text-[#58a6ff]",
    label: "Medium",
    icon: "-",
  },
  low: {
    bg: "bg-[#8b949e15]",
    border: "border-[#8b949e30]",
    text: "text-[#8b949e]",
    label: "Low",
    icon: ".",
  },
};

function parseSeverity(text: string): ReviewSeverity {
  const lower = text.toLowerCase().trim();
  if (lower.startsWith("critical")) return "critical";
  if (lower.startsWith("high")) return "high";
  if (lower.startsWith("medium")) return "medium";
  return "low";
}

export function parseAuditReport(markdown: string): ParsedAuditReport {
  const lines = markdown.split("\n");
  let title = "";
  let subtitle = "";
  const sections: ReviewAuditSection[] = [];
  let currentSection = "";
  let currentFindings: ReviewFinding[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("# ") && !title) {
      title = trimmed.slice(2);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      if (currentSection && currentFindings.length > 0) {
        sections.push({ name: currentSection, findings: [...currentFindings] });
      }
      currentSection = trimmed.slice(3);
      currentFindings = [];
      continue;
    }

    if (!trimmed.startsWith("# ") && !title) {
      subtitle = trimmed;
      continue;
    }

    if (trimmed.startsWith("- ") && currentSection) {
      const content = trimmed.slice(2);
      const parts = content.split("|").map((part) => part.trim());
      if (parts.length >= 3) {
        currentFindings.push({
          severity: parseSeverity(parts[0]),
          file: parts[1]?.replace(/`/g, "") || "",
          description: parts[2] || "",
          fix: parts[3] || "",
          section: currentSection,
        });
      } else {
        currentFindings.push({
          severity: currentSection.toLowerCase().includes("critical")
            ? "critical"
            : currentSection.toLowerCase().includes("bug")
              ? "high"
              : "medium",
          file: "",
          description: content,
          fix: "",
          section: currentSection,
        });
      }
    }
  }

  if (currentSection && currentFindings.length > 0) {
    sections.push({ name: currentSection, findings: [...currentFindings] });
  }

  const allFindings = sections.flatMap((section) => section.findings);
  return {
    title: title || "Audit Report",
    subtitle,
    sections,
    totalFindings: allFindings.length,
    criticalCount: allFindings.filter((finding) => finding.severity === "critical").length,
    highCount: allFindings.filter((finding) => finding.severity === "high").length,
    mediumCount: allFindings.filter((finding) => finding.severity === "medium").length,
    lowCount: allFindings.filter((finding) => finding.severity === "low").length,
  };
}

export function parseExecutionPlan(markdown: string): ExecutionPlanPhase[] {
  const lines = markdown.split("\n");
  const phases: ExecutionPlanPhase[] = [];
  let currentPhase = "";
  let currentSteps: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      if (currentPhase && currentSteps.length > 0) {
        phases.push({ phase: currentPhase, steps: [...currentSteps] });
      }
      currentPhase = trimmed.slice(3);
      currentSteps = [];
    } else if (/^\d+\./.test(trimmed) && currentPhase) {
      currentSteps.push(trimmed.replace(/^\d+\.\s*/, ""));
    }
  }

  if (currentPhase && currentSteps.length > 0) {
    phases.push({ phase: currentPhase, steps: [...currentSteps] });
  }

  return phases;
}

export function parseProgress(markdown: string): ParsedProgress {
  const lines = markdown.split("\n");
  const phases: ProgressPhase[] = [];
  const nextSteps: string[] = [];
  const deferred: string[] = [];
  const deployNotes: string[] = [];
  let section = "";
  let currentPhase: ProgressPhase | null = null;

  const flushPhase = () => {
    if (currentPhase && currentPhase.changes.length > 0) {
      phases.push({ ...currentPhase });
    }
    currentPhase = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("## Done")) {
      section = "done";
      continue;
    }
    if (trimmed.startsWith("## Highest-value") || trimmed.startsWith("## Next")) {
      flushPhase();
      section = "next";
      continue;
    }
    if (trimmed.startsWith("## Deferred")) {
      flushPhase();
      section = "deferred";
      continue;
    }
    if (trimmed.startsWith("## Deploy")) {
      flushPhase();
      section = "deploy";
      continue;
    }
    if (trimmed.startsWith("## Verification") || trimmed.startsWith("## Useful")) {
      flushPhase();
      section = "other";
      continue;
    }

    if (section === "next" && trimmed.startsWith("- ")) {
      nextSteps.push(trimmed.slice(2));
      continue;
    }
    if (section === "deferred" && trimmed.startsWith("- ")) {
      deferred.push(trimmed.slice(2));
      continue;
    }
    if (section === "deploy" && trimmed.startsWith("- ")) {
      deployNotes.push(trimmed.slice(2));
      continue;
    }
    if (section !== "done") {
      continue;
    }

    if (trimmed.startsWith("- ") && /implemented|committed|deployed|verified|ran mandatory|synthesized|checked run/i.test(trimmed)) {
      const text = trimmed.slice(2);
      const isPhaseStart = /implemented phase|committed phase/i.test(text);
      const isCommit = /committed/i.test(text) && !isPhaseStart;
      const isVerify = /verified/i.test(text);
      const isDeploy = /deployed/i.test(text);
      const isAudit = /audit|synthesized|ran mandatory/i.test(text);

      if (isPhaseStart || isAudit) {
        flushPhase();
        let title = "Setup";
        const phaseMatch = text.match(/phase\s*(\d+)[^:]*:?\s*(.*)/i);
        if (phaseMatch) {
          title = `Phase ${phaseMatch[1]}${phaseMatch[2] ? ": " + phaseMatch[2].replace(/[:—-]\s*$/, "").trim() : ""}`;
        } else if (isAudit) {
          title = "Audit & Analysis";
        } else if (/checked run/i.test(text)) {
          title = "Baseline Setup";
        }
        currentPhase = { title, status: "completed", changes: [], verified: false, deployed: false };
      }

      if (currentPhase) {
        if (isCommit) {
          const commitMatch = text.match(/`([a-f0-9]{7,})`/);
          if (commitMatch) {
            currentPhase.commit = commitMatch[1];
          }
        }
        if (isVerify) {
          currentPhase.verified = true;
        }
        if (isDeploy) {
          currentPhase.deployed = true;
        }
      }
      continue;
    }

    if (trimmed.startsWith("- ") && currentPhase) {
      const text = trimmed.slice(2);
      if (/^`pnpm|^`cd |^`\w{7}`\s|^`apps\/|^`scripts\/|^\.|^result:|^skip reason/i.test(text)) {
        continue;
      }
      const cleaned = text.replace(/`([^`]+)`/g, "$1");
      if (cleaned.length > 10) {
        currentPhase.changes.push(cleaned);
      }
    }
  }

  flushPhase();
  return { phases, nextSteps, deferred, deployNotes };
}
