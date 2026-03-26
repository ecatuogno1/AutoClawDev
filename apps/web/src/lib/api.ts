import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ProjectWithStats,
  ProjectDetail,
  Experiment,
  GithubData,
  ActiveRun,
  ProjectHealth,
  DeepReviewSession,
  DeepReviewDetail,
  ProjectMemory,
} from "@/types";

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

// Projects
export function useProjects() {
  return useQuery<ProjectWithStats[]>({
    queryKey: ["projects"],
    queryFn: () => fetchJSON("/projects"),
    refetchInterval: 30000,
  });
}

export function useProject(key: string) {
  return useQuery<ProjectDetail>({
    queryKey: ["project", key],
    queryFn: () => fetchJSON(`/projects/${key}`),
    refetchInterval: 15000,
  });
}

export function useProjectExperiments(key: string) {
  return useQuery<Experiment[]>({
    queryKey: ["experiments", key],
    queryFn: () => fetchJSON(`/projects/${key}/experiments`),
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
export function useReviews(key: string) {
  return useQuery<{ reviews: DeepReviewSession[] }>({
    queryKey: ["reviews", key],
    queryFn: () => fetchJSON(`/reviews/${key}/reviews`),
    refetchInterval: 30000,
  });
}

export function useLatestReview(key: string) {
  return useQuery<DeepReviewDetail>({
    queryKey: ["reviews", key, "latest"],
    queryFn: () => fetchJSON(`/reviews/${key}/reviews/latest`),
    retry: false,
  });
}

// Memory
export function useProjectMemory(key: string) {
  return useQuery<ProjectMemory>({
    queryKey: ["memory", key],
    queryFn: () => fetchJSON(`/memory/${key}/memory`),
    refetchInterval: 60000,
  });
}

// SSE hook
export function useSSE(onEvent: (event: { type: string; data: unknown }) => void) {
  const eventSourceRef = { current: null as EventSource | null };

  const connect = () => {
    if (eventSourceRef.current) return;
    const es = new EventSource(`${BASE}/events`);
    eventSourceRef.current = es;

    const eventTypes = ["output", "start", "stop", "done", "connected"];
    for (const type of eventTypes) {
      es.addEventListener(type, (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          onEvent({ type, data });
        } catch {
          // ignore parse errors
        }
      });
    }

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      // Reconnect after 3 seconds
      setTimeout(connect, 3000);
    };
  };

  const disconnect = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  };

  return { connect, disconnect };
}
