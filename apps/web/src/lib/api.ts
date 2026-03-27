import { useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ActiveRun,
  DeepReviewDetail,
  DeepReviewSession,
  Experiment,
  ProjectDetail,
  ProjectHealth,
  ProjectMemory,
  ProjectWithStats,
  WorkspaceDirectoryListing,
  WorkspaceFileContent,
  WorkspaceGitCommitResponse,
  WorkspaceGitDiffResponse,
  WorkspaceGitStageResponse,
  WorkspaceGitStatus,
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

export function useProjectExperiments(key: string, enabled = true) {
  return useQuery<Experiment[]>({
    queryKey: ["experiments", key],
    queryFn: () => fetchJSON(`/projects/${key}/experiments`),
    enabled: enabled && Boolean(key),
    refetchInterval: 15000,
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

// All experiments
export function useAllExperiments() {
  return useQuery<Experiment[]>({
    queryKey: ["allExperiments"],
    queryFn: () => fetchJSON("/experiments"),
    refetchInterval: 15000,
  });
}

// Active runs
export function useActiveRuns() {
  return useQuery<Record<string, ActiveRun>>({
    queryKey: ["activeRuns"],
    queryFn: async () => {
      const runs: ActiveRun[] = await fetchJSON("/active");
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
    mutationFn: (params: { project: string; cycles: number }) =>
      postJSON("/run", params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activeRuns"] });
    },
  });
}

export function useStopRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { project: string }) => postJSON("/stop", params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activeRuns"] });
    },
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
