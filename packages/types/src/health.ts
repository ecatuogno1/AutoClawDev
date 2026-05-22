export interface ProjectHealth {
  key: string;
  name: string;
  passRate: number;
  totalRuns: number;
  cleanPassed?: number;
  degradedPassed?: number;
  recoveryRequired?: number;
  recentTrend: "improving" | "declining" | "stable" | "unknown";
  lastRun?: string;
  lastDeepReview?: string;
  hasMemory: boolean;
  profiles: Record<string, "pass" | "fail" | "unknown">;
  activeRun: boolean;
}
