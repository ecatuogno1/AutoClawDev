export interface ProjectHealth {
  key: string;
  name: string;
  passRate: number;
  totalExperiments: number;
  recentTrend: "improving" | "declining" | "stable" | "unknown";
  lastRun?: string;
  lastDeepReview?: string;
  hasMemory: boolean;
  profiles: Record<string, "pass" | "fail" | "unknown">;
  activeRun: boolean;
}
