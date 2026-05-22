import { useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ActiveRun,
  DeepReviewDetail,
  DeepReviewSession,
  EventRecord,
  PreflightReport,
  ProjectDetail,
  ProjectExecutionSummary,
  ProjectHealth,
  ProjectReadiness,
  ProjectMemory,
  ProjectWithStats,
  RunRecord,
  SystemHealthReport,
  WorkspaceDirectoryListing,
  WorkspaceFileContent,
  WorkspaceGitCommitResponse,
  WorkspaceGitDiffResponse,
  WorkspaceGitStageResponse,
  WorkspaceGitStatus,
  WebAuditEvent,
  WebAuditRunDetail,
  WebAuditRunSummary,
} from "@autoclawdev/types";
import type { GithubData } from "@/types";

const BASE = "/api";

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

function buildQueryString(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

// Projects
export function useProjects() {
  return useQuery<ProjectWithStats[]>({
    queryKey: ["projects"],
    queryFn: () => fetchJSON("/projects"),
    refetchInterval: 30000,
  });
}

export function useProject(key: string, enabled = true) {
  return useQuery<ProjectDetail>({
    queryKey: ["project", key],
    queryFn: () => fetchJSON(`/projects/${key}`),
    enabled: enabled && Boolean(key),
    refetchInterval: 15000,
  });
}

export function useProjectHistory(key: string, enabled = true) {
  return useQuery<{ runs: RunRecord[] }>({
    queryKey: ["history", key],
    queryFn: () => fetchJSON(`/projects/${key}/history`),
    enabled: enabled && Boolean(key),
    refetchInterval: 15000,
  });
}

export function useProjectExecutions(key: string, enabled = true) {
  return useQuery<ProjectExecutionSummary>({
    queryKey: ["project-executions", key],
    queryFn: () => fetchJSON(`/projects/${key}/executions`),
    enabled: enabled && Boolean(key),
    refetchInterval: 5000,
  });
}

// GitHub
export function useGithub(key: string, enabled = true) {
  return useQuery<GithubData>({
    queryKey: ["github", key],
    queryFn: () => fetchJSON(`/github/${key}`),
    enabled,
    staleTime: 60000,
  });
}

export function useAllHistory() {
  return useQuery<{ active: ActiveRun[]; runs: RunRecord[] }>({
    queryKey: ["allHistory"],
    queryFn: () => fetchJSON("/runs"),
    refetchInterval: 15000,
  });
}

// Active runs
export function useActiveRuns() {
  return useQuery<Record<string, ActiveRun>>({
    queryKey: ["activeRuns"],
    queryFn: async () => {
      const payload: { active: ActiveRun[] } = await fetchJSON("/runs");
      const runs = payload.active;
      const map: Record<string, ActiveRun> = {};
      for (const run of runs) map[run.project] = run;
      return map;
    },
    refetchInterval: 5000,
  });
}

// Run mutations
export function useStartRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      project: string;
      cycles?: number;
      mode?: "run" | "review" | "build" | "audit";
      target?: string;
      auditMode?: "triage" | "deep";
      ownedTarget?: boolean;
      authorizationNote?: string;
    }) =>
      postJSON("/runs", params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activeRuns"] });
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["web-audits"] });
      qc.invalidateQueries({ queryKey: ["project-executions"] });
    },
  });
}

export function useStopRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { project: string }) => postJSON("/stop", params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activeRuns"] });
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["project-executions"] });
    },
  });
}

export function useResumeRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { runId: string; approveGates?: string[] }) =>
      postJSON<{ ok: boolean; record?: RunRecord; reason?: string }>(
        `/runs/${params.runId}/resume`,
        { approveGates: params.approveGates ?? [] },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activeRuns"] });
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["web-audits"] });
      qc.invalidateQueries({ queryKey: ["project-executions"] });
    },
  });
}

export function useApproveRunGate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { runId: string; gate: string; approver?: string; note?: string }) =>
      postJSON<{ run: RunRecord }>(`/runs/${params.runId}/approve`, {
        gate: params.gate,
        approver: params.approver,
        note: params.note,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activeRuns"] });
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["web-audits"] });
      qc.invalidateQueries({ queryKey: ["project-executions"] });
    },
  });
}

export function useRuns() {
  return useQuery<{ active: ActiveRun[]; runs: RunRecord[] }>({
    queryKey: ["runs"],
    queryFn: () => fetchJSON("/runs"),
    refetchInterval: 5000,
  });
}

export function useRunRecoveryAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { runId: string; action: "resolve" | "abandon"; note?: string }) =>
      postJSON<{ run: RunRecord }>(`/runs/${params.runId}/recovery`, {
        action: params.action,
        note: params.note,
      }),
    onSuccess: async (_payload, variables) => {
      await qc.invalidateQueries({ queryKey: ["runs"] });
      await qc.invalidateQueries({ queryKey: ["allHistory"] });
      await qc.invalidateQueries({ queryKey: ["history"] });
      await qc.invalidateQueries({ queryKey: ["history", variables.runId] });
      await qc.invalidateQueries({ queryKey: ["projects-readiness"] });
      await qc.invalidateQueries({ queryKey: ["healthMatrix"] });
      await qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useRunEvents(runId?: string | null, enabled = true) {
  return useQuery<{ events: EventRecord[] }>({
    queryKey: ["run-events", runId ?? null],
    queryFn: () => fetchJSON(`/runs/${runId}/events`),
    enabled: enabled && Boolean(runId),
    refetchInterval: 3000,
  });
}

// Health matrix
export function useHealthMatrix() {
  return useQuery<{ projects: ProjectHealth[] }>({
    queryKey: ["healthMatrix"],
    queryFn: () => fetchJSON("/health-matrix"),
    refetchInterval: 30000,
  });
}

export function useSystemHealth() {
  return useQuery<SystemHealthReport>({
    queryKey: ["system-health"],
    queryFn: () => fetchJSON("/system/health"),
    refetchInterval: 30000,
  });
}

export function useProjectsReadiness() {
  return useQuery<{ generatedAt: string; projects: ProjectReadiness[] }>({
    queryKey: ["projects-readiness"],
    queryFn: () => fetchJSON("/system/projects-readiness"),
    refetchInterval: 30000,
  });
}

export function useProjectPreflight(key: string, enabled = true) {
  return useQuery<PreflightReport>({
    queryKey: ["project-preflight", key],
    queryFn: () => fetchJSON(`/projects/${key}/preflight`),
    enabled: enabled && Boolean(key),
    staleTime: 10000,
  });
}

// Deep reviews
export function useReviews(key: string, enabled = true) {
  return useQuery<{ reviews: DeepReviewSession[] }>({
    queryKey: ["reviews", key],
    queryFn: () => fetchJSON(`/reviews/${key}/reviews`),
    enabled: enabled && Boolean(key),
    refetchInterval: 30000,
  });
}

export function useLatestReview(key: string, enabled = true) {
  return useQuery<DeepReviewDetail>({
    queryKey: ["reviews", key, "latest"],
    queryFn: () => fetchJSON(`/reviews/${key}/reviews/latest`),
    enabled: enabled && Boolean(key),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.managedRun?.status;
      return status === "running" || status === "queued" ? 5000 : 30000;
    },
  });
}

export function useWebAuditRuns(key: string, enabled = true) {
  return useQuery<{ runs: WebAuditRunSummary[] }>({
    queryKey: ["web-audits", key],
    queryFn: () => fetchJSON(`/web-audits/${key}/runs`),
    enabled: enabled && Boolean(key),
    refetchInterval: 10000,
  });
}

export function useLatestWebAudit(key: string, enabled = true) {
  return useQuery<WebAuditRunDetail>({
    queryKey: ["web-audits", key, "latest"],
    queryFn: () => fetchJSON(`/web-audits/${key}/runs/latest`),
    enabled: enabled && Boolean(key),
    retry: false,
    refetchInterval: 10000,
  });
}

export function useWebAuditRun(key: string, runId?: string | null, enabled = true) {
  return useQuery<WebAuditRunDetail>({
    queryKey: ["web-audits", key, runId ?? null],
    queryFn: () => fetchJSON(`/web-audits/${key}/runs/${runId}`),
    enabled: enabled && Boolean(key) && Boolean(runId),
    refetchInterval: 10000,
  });
}

export function useWebAuditEvents(key: string, runId?: string | null, enabled = true) {
  return useQuery<{ events: WebAuditEvent[] }>({
    queryKey: ["web-audits", key, runId ?? null, "events"],
    queryFn: () => fetchJSON(`/web-audits/${key}/runs/${runId}/events`),
    enabled: enabled && Boolean(key) && Boolean(runId),
    refetchInterval: 5000,
  });
}

// Memory
export function useProjectMemory(key: string, enabled = true) {
  return useQuery<ProjectMemory>({
    queryKey: ["memory", key],
    queryFn: () => fetchJSON(`/memory/${key}/memory`),
    enabled: enabled && Boolean(key),
    refetchInterval: 60000,
  });
}

export function useWorkspaceFiles(
  projectKey: string,
  path?: string,
  enabled = true,
) {
  return useQuery<WorkspaceDirectoryListing>({
    queryKey: ["workspace", "files", projectKey, path ?? "."],
    queryFn: () =>
      fetchJSON(
        `/workspace/files${buildQueryString({
          project: projectKey,
          path,
        })}`,
      ),
    enabled,
    staleTime: 30000,
  });
}

export function useWorkspaceFileContent(
  projectKey: string,
  path?: string | null,
  enabled = true,
) {
  return useQuery<WorkspaceFileContent>({
    queryKey: ["workspace", "file", projectKey, path ?? null],
    queryFn: () =>
      fetchJSON(
        `/workspace/file${buildQueryString({
          project: projectKey,
          path: path ?? undefined,
        })}`,
      ),
    enabled: enabled && Boolean(path),
    staleTime: 10000,
  });
}

export const useFileTree = useWorkspaceFiles;
export const useFileContent = useWorkspaceFileContent;

export function useWorkspaceGitStatus(projectKey: string, enabled = true) {
  return useQuery<WorkspaceGitStatus>({
    queryKey: ["workspace", "git", "status", projectKey],
    queryFn: () =>
      fetchJSON(
        `/workspace/git/status${buildQueryString({
          project: projectKey,
        })}`,
      ),
    enabled,
    staleTime: 15000,
    refetchInterval: 15000,
  });
}

export function useWorkspaceGitDiff(
  projectKey: string,
  filePath?: string | null,
  enabled = true,
) {
  return useQuery<WorkspaceGitDiffResponse>({
    queryKey: ["workspace", "git", "diff", projectKey, filePath ?? null],
    queryFn: () =>
      fetchJSON(
        `/workspace/git/diff${buildQueryString({
          project: projectKey,
          file: filePath ?? undefined,
        })}`,
      ),
    enabled: enabled && Boolean(filePath),
    staleTime: 10000,
  });
}

export function useWorkspaceGitStage(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      paths?: string[];
      all?: boolean;
      mode?: "stage" | "unstage";
    }) =>
      postJSON<WorkspaceGitStageResponse>("/workspace/git/stage", {
        project: projectKey,
        ...params,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["workspace", "git", "status", projectKey],
      });
      await qc.invalidateQueries({
        queryKey: ["workspace", "git", "diff", projectKey],
      });
    },
  });
}

export function useWorkspaceGitCommit(projectKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { message: string; all?: boolean }) =>
      postJSON<WorkspaceGitCommitResponse>("/workspace/git/commit", {
        project: projectKey,
        ...params,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["workspace", "git", "status", projectKey],
      });
      await qc.invalidateQueries({
        queryKey: ["workspace", "git", "diff", projectKey],
      });
    },
  });
}

// SSE hook
export function useSSE(onEvent: (event: { type: string; data: unknown }) => void) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (eventSourceRef.current) return;
    const es = new EventSource(`${BASE}/events`);
    eventSourceRef.current = es;

    const eventTypes = ["output", "start", "stop", "done", "connected"];
    for (const type of eventTypes) {
      es.addEventListener(type, (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          onEventRef.current({ type, data });
        } catch {
          // ignore parse errors
        }
      });
    }

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setTimeout(() => connect(), 3000);
    };
  }, []);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  return { connect, disconnect };
}
