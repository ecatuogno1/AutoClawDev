import {
  useMemo,
  useSyncExternalStore,
} from "react";
import type {
  ComposerPane,
  ComposerTaskRecord,
  ComposerTaskStatus,
  ComposerWorkspaceState,
} from "@autoclawdev/types";
import { composerPaneIds } from "@autoclawdev/types";

const SHELL_STORAGE_PREFIX = "autoclaw:workspace-shell:";
const TASK_STORAGE_PREFIX = "autoclaw:workspace-tasks:";

interface WorkspaceProjectStore {
  state: ComposerWorkspaceState;
  tasks: ComposerTaskRecord[];
  listeners: Set<() => void>;
  snapshot: WorkspaceShellSnapshot;
}

interface CreateTaskDraft {
  title: string;
  description?: string;
  sourceMessageId?: string | null;
}

interface UpdateTaskPatch {
  title?: string;
  description?: string;
  status?: ComposerTaskStatus;
}

interface WorkspaceShellSnapshot {
  state: ComposerWorkspaceState;
  tasks: ComposerTaskRecord[];
}

const projectStores = new Map<string, WorkspaceProjectStore>();

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function createComposerPane(projectKey: string): ComposerPane {
  return {
    id: composerPaneIds.composer(projectKey),
    kind: "composer",
    title: "Composer",
    projectKey,
    tier: "workspace",
  };
}

function createHomePane(projectKey: string): ComposerPane {
  return {
    id: composerPaneIds.home(projectKey),
    kind: "home",
    title: "Home",
    projectKey,
    tier: "workspace",
  };
}

function createReviewsPane(projectKey: string): ComposerPane {
  return {
    id: composerPaneIds.reviews(projectKey),
    kind: "reviews",
    title: "Code Review",
    projectKey,
    tier: "workspace",
  };
}

function createMemoryPane(projectKey: string): ComposerPane {
  return {
    id: composerPaneIds.memory(projectKey),
    kind: "memory",
    title: "Knowledge Base",
    projectKey,
    tier: "workspace",
  };
}

function createGitPane(projectKey: string): ComposerPane {
  return {
    id: composerPaneIds.git(projectKey),
    kind: "git",
    title: "Source Control",
    projectKey,
    tier: "workspace",
  };
}

function createFilePane(projectKey: string, path: string, line?: number | null): ComposerPane {
  return {
    id: composerPaneIds.file(projectKey, path),
    kind: "file",
    title: basenameOf(path),
    projectKey,
    tier: "workspace",
    filePath: path,
    line: line ?? null,
  };
}

function createTaskPane(projectKey: string, task: ComposerTaskRecord): ComposerPane {
  return {
    id: composerPaneIds.task(projectKey, task.id),
    kind: "task",
    title: task.title,
    projectKey,
    tier: "workspace",
    taskId: task.id,
  };
}

function createTerminalPane(
  projectKey: string,
  sessionId: string,
  title: string,
): ComposerPane {
  return {
    id: composerPaneIds.terminal(sessionId),
    kind: "terminal",
    title,
    projectKey,
    tier: "ephemeral",
    sessionId,
  };
}

function createInitialState(projectKey: string): ComposerWorkspaceState {
  const homePane = createHomePane(projectKey);
  const reviewsPane = createReviewsPane(projectKey);
  const memoryPane = createMemoryPane(projectKey);
  const composerPane = createComposerPane(projectKey);
  return {
    projectKey,
    paneOrder: [homePane.id, reviewsPane.id, memoryPane.id, composerPane.id],
    activePaneId: composerPane.id,
    lastFocusedPaneId: composerPane.id,
    panes: [homePane, reviewsPane, memoryPane, composerPane],
  };
}

function createInitialStore(projectKey: string): WorkspaceProjectStore {
  const state = createInitialState(projectKey);
  const tasks: ComposerTaskRecord[] = [];
  return {
    state,
    tasks,
    listeners: new Set(),
    snapshot: {
      state,
      tasks,
    },
  };
}

function getShellStorageKey(projectKey: string) {
  return `${SHELL_STORAGE_PREFIX}${projectKey}`;
}

function getTaskStorageKey(projectKey: string) {
  return `${TASK_STORAGE_PREFIX}${projectKey}`;
}

function ensureProjectStore(projectKey: string) {
  const existing = projectStores.get(projectKey);
  if (existing) {
    return existing;
  }

  const hydrated = hydrateProjectStore(projectKey);
  projectStores.set(projectKey, hydrated);
  return hydrated;
}

function hydrateProjectStore(projectKey: string): WorkspaceProjectStore {
  const store = createInitialStore(projectKey);
  if (!canUseStorage()) {
    return store;
  }

  const tasks = readStoredTasks(projectKey);
  const state = readStoredState(projectKey, tasks);
  return {
    ...store,
    state,
    tasks,
    snapshot: {
      state,
      tasks,
    },
  };
}

function readStoredTasks(projectKey: string): ComposerTaskRecord[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(getTaskStorageKey(projectKey));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((value) => normalizeTaskRecord(projectKey, value))
      .filter((value): value is ComposerTaskRecord => value !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function readStoredState(
  projectKey: string,
  tasks: ComposerTaskRecord[],
): ComposerWorkspaceState {
  const fallback = createInitialState(projectKey);

  if (!canUseStorage()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(getShellStorageKey(projectKey));
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<ComposerWorkspaceState>;
    return normalizeWorkspaceState(projectKey, parsed, tasks);
  } catch {
    return fallback;
  }
}

function normalizeTaskRecord(projectKey: string, value: unknown): ComposerTaskRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const task = value as Partial<ComposerTaskRecord>;
  if (
    typeof task.id !== "string" ||
    typeof task.title !== "string" ||
    typeof task.description !== "string" ||
    !isTaskStatus(task.status) ||
    typeof task.createdAt !== "string" ||
    typeof task.updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id: task.id,
    projectKey,
    title: task.title.trim() || "Untitled task",
    description: task.description,
    status: task.status,
    sourceMessageId:
      typeof task.sourceMessageId === "string" && task.sourceMessageId.length > 0
        ? task.sourceMessageId
        : null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function normalizeWorkspaceState(
  projectKey: string,
  value: Partial<ComposerWorkspaceState> | undefined,
  tasks: ComposerTaskRecord[],
): ComposerWorkspaceState {
  const taskIds = new Set(tasks.map((task) => task.id));
  const panes = Array.isArray(value?.panes)
    ? value.panes
        .map((pane) => normalizePane(projectKey, pane, taskIds))
        .filter((pane): pane is ComposerPane => pane !== null)
    : [];

  const dedupedPanes = dedupePanes(panes);
  const requiredPanes = [
    createHomePane(projectKey),
    createReviewsPane(projectKey),
    createMemoryPane(projectKey),
    createComposerPane(projectKey),
  ];
  const composerPaneId = composerPaneIds.composer(projectKey);
  const withRequired = [
    ...requiredPanes,
    ...dedupedPanes.filter(
      (pane) => !requiredPanes.some((requiredPane) => requiredPane.id === pane.id),
    ),
  ];

  const paneMap = new Map(withRequired.map((pane) => [pane.id, pane]));
  const normalizedPanes = [
    ...requiredPanes.map((pane) => paneMap.get(pane.id) ?? pane),
    ...withRequired.filter(
      (pane) => !requiredPanes.some((requiredPane) => requiredPane.id === pane.id),
    ),
  ];

  const paneOrder = Array.isArray(value?.paneOrder)
    ? dedupeStrings(value.paneOrder).filter((paneId) => paneMap.has(paneId))
    : [];

  const finalPaneOrder = dedupeStrings([
    ...requiredPanes.map((pane) => pane.id),
    ...paneOrder,
    ...normalizedPanes.map((pane) => pane.id),
  ]);

  const activePaneId = pickExistingPaneId(value?.activePaneId, paneMap, composerPaneId);
  const lastFocusedPaneId = pickExistingPaneId(
    value?.lastFocusedPaneId,
    paneMap,
    activePaneId ?? composerPaneId,
  );

  return {
    projectKey,
    paneOrder: finalPaneOrder,
    activePaneId,
    lastFocusedPaneId,
    panes: normalizedPanes,
  };
}

function normalizePane(
  projectKey: string,
  value: unknown,
  taskIds: Set<string>,
): ComposerPane | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const pane = value as Partial<ComposerPane>;
  if (
    typeof pane.id !== "string" ||
    typeof pane.kind !== "string" ||
    typeof pane.title !== "string" ||
    pane.projectKey !== projectKey ||
    !isPaneKind(pane.kind) ||
    !isPaneTier(pane.tier)
  ) {
    return null;
  }

  if (pane.tier === "ephemeral") {
    return null;
  }

  if (pane.kind === "task") {
    if (typeof pane.taskId !== "string" || !taskIds.has(pane.taskId)) {
      return null;
    }
  }

  if (pane.kind === "file" && typeof pane.filePath !== "string") {
    return null;
  }

  if (pane.kind === "terminal") {
    return null;
  }

  return {
    id: pane.id,
    kind: pane.kind,
    title: pane.title,
    projectKey,
    tier: pane.tier,
    taskId: typeof pane.taskId === "string" ? pane.taskId : null,
    filePath: typeof pane.filePath === "string" ? pane.filePath : null,
    line: typeof pane.line === "number" ? pane.line : null,
    sessionId: typeof pane.sessionId === "string" ? pane.sessionId : null,
  };
}

function dedupePanes(panes: ComposerPane[]) {
  const seen = new Map<string, ComposerPane>();
  for (const pane of panes) {
    seen.set(pane.id, pane);
  }
  return [...seen.values()];
}

function dedupeStrings(values: readonly string[]) {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))];
}

function pickExistingPaneId(
  paneId: unknown,
  panes: Map<string, ComposerPane>,
  fallback: string,
) {
  return typeof paneId === "string" && panes.has(paneId) ? paneId : fallback;
}

function isPaneKind(value: unknown): value is ComposerPane["kind"] {
  return (
    value === "home" ||
    value === "reviews" ||
    value === "memory" ||
    value === "composer" ||
    value === "task" ||
    value === "file" ||
    value === "git" ||
    value === "terminal"
  );
}

function isPaneTier(value: unknown): value is ComposerPane["tier"] {
  return value === "workspace" || value === "ephemeral";
}

function isTaskStatus(value: unknown): value is ComposerTaskStatus {
  return value === "open" || value === "in_progress" || value === "done";
}

function basenameOf(path: string) {
  const segments = path.split("/");
  return segments[segments.length - 1] || path;
}

function emit(store: WorkspaceProjectStore) {
  for (const listener of store.listeners) {
    listener();
  }
}

function persistStore(projectKey: string, store: WorkspaceProjectStore) {
  if (!canUseStorage()) {
    return;
  }

  const durablePanes = store.state.panes.filter((pane) => pane.tier !== "ephemeral");
  const durablePaneIds = new Set(durablePanes.map((pane) => pane.id));

  const persistedState = normalizeWorkspaceState(
    projectKey,
    {
      ...store.state,
      panes: durablePanes,
      paneOrder: store.state.paneOrder.filter((paneId) => durablePaneIds.has(paneId)),
    },
    store.tasks,
  );

  window.localStorage.setItem(getShellStorageKey(projectKey), JSON.stringify(persistedState));
  window.localStorage.setItem(getTaskStorageKey(projectKey), JSON.stringify(store.tasks));
}

function updateStore(
  projectKey: string,
  updater: (store: WorkspaceProjectStore) => void,
) {
  const store = ensureProjectStore(projectKey);
  updater(store);
  store.state = normalizeWorkspaceState(projectKey, store.state, store.tasks);
  store.snapshot = {
    state: store.state,
    tasks: store.tasks,
  };
  persistStore(projectKey, store);
  emit(store);
}

function activatePaneInternal(store: WorkspaceProjectStore, paneId: string) {
  const pane = store.state.panes.find((candidate) => candidate.id === paneId);
  if (!pane) {
    return;
  }

  store.state.activePaneId = paneId;
  store.state.lastFocusedPaneId = paneId;
}

function openPaneInternal(store: WorkspaceProjectStore, pane: ComposerPane) {
  const existingIndex = store.state.panes.findIndex((entry) => entry.id === pane.id);
  if (existingIndex === -1) {
    store.state.panes = [...store.state.panes, pane];
  } else {
    store.state.panes = store.state.panes.map((entry, index) =>
      index === existingIndex ? { ...entry, ...pane } : entry,
    );
  }

  store.state.paneOrder = dedupeStrings([...store.state.paneOrder, pane.id]);
  activatePaneInternal(store, pane.id);
}

function closePaneInternal(store: WorkspaceProjectStore, paneId: string) {
  const composerPaneId = composerPaneIds.composer(store.state.projectKey);
  const reservedPaneIds = new Set([
    composerPaneIds.home(store.state.projectKey),
    composerPaneIds.reviews(store.state.projectKey),
    composerPaneIds.memory(store.state.projectKey),
    composerPaneId,
  ]);
  if (reservedPaneIds.has(paneId)) {
    activatePaneInternal(store, composerPaneId);
    return;
  }

  const currentOrder = store.state.paneOrder;
  const index = currentOrder.indexOf(paneId);
  store.state.paneOrder = currentOrder.filter((entry) => entry !== paneId);
  store.state.panes = store.state.panes.filter((pane) => pane.id !== paneId);

  if (store.state.activePaneId === paneId) {
    const nextPaneId =
      store.state.paneOrder[index] ??
      store.state.paneOrder[index - 1] ??
      composerPaneId;
    activatePaneInternal(store, nextPaneId);
    return;
  }

  if (store.state.lastFocusedPaneId === paneId) {
    store.state.lastFocusedPaneId =
      store.state.activePaneId ?? store.state.paneOrder[0] ?? composerPaneId;
  }
}

function generateTaskId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateTerminalSessionId(projectKey: string) {
  const seed =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${projectKey}-${seed}`;
}

export function useComposerWorkspace(projectKey: string) {
  const subscribe = useMemo(
    () => (listener: () => void) => {
      const store = ensureProjectStore(projectKey);
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [projectKey],
  );

  const getSnapshot = useMemo(
    () => (): WorkspaceShellSnapshot => {
      return ensureProjectStore(projectKey).snapshot;
    },
    [projectKey],
  );

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return useMemo(
    () => ({
      ...snapshot,
      ensureComposerPane() {
        ensureComposerPane(projectKey);
      },
      openFilePane(path: string, line?: number | null) {
        openFilePane(projectKey, path, line);
      },
      openTaskPane(taskId: string) {
        openTaskPane(projectKey, taskId);
      },
      openGitPane() {
        openGitPane(projectKey);
      },
      openTerminalPane() {
        return openTerminalPane(projectKey);
      },
      closePane(paneId: string) {
        closePane(projectKey, paneId);
      },
      activatePane(paneId: string) {
        activatePane(projectKey, paneId);
      },
      createTask(draft: CreateTaskDraft) {
        return createTask(projectKey, draft);
      },
      updateTask(taskId: string, patch: UpdateTaskPatch) {
        updateTask(projectKey, taskId, patch);
      },
      deleteTask(taskId: string) {
        deleteTask(projectKey, taskId);
      },
    }),
    [projectKey, snapshot],
  );
}

export function ensureComposerPane(projectKey: string) {
  updateStore(projectKey, (store) => {
    const composerPaneId = composerPaneIds.composer(projectKey);
    const existingComposerPane = store.state.panes.find((pane) => pane.id === composerPaneId);

    if (existingComposerPane) {
      return;
    }

    const composerPane = createComposerPane(projectKey);
    store.state.panes = [...store.state.panes, composerPane];
    store.state.paneOrder = dedupeStrings([...store.state.paneOrder, composerPane.id]);

    if (!store.state.activePaneId) {
      store.state.activePaneId = composerPane.id;
    }

    if (!store.state.lastFocusedPaneId) {
      store.state.lastFocusedPaneId = composerPane.id;
    }
  });
}

export function openFilePane(projectKey: string, path: string, line?: number | null) {
  updateStore(projectKey, (store) => {
    openPaneInternal(store, createFilePane(projectKey, path, line));
  });
}

export function openTaskPane(projectKey: string, taskId: string) {
  updateStore(projectKey, (store) => {
    const task = store.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }
    openPaneInternal(store, createTaskPane(projectKey, task));
  });
}

export function openGitPane(projectKey: string) {
  updateStore(projectKey, (store) => {
    openPaneInternal(store, createGitPane(projectKey));
  });
}

export function openTerminalPane(projectKey: string) {
  const store = ensureProjectStore(projectKey);
  const terminalCount = store.state.panes.filter((pane) => pane.kind === "terminal").length;
  const sessionId = generateTerminalSessionId(projectKey);
  const title = `Terminal ${terminalCount + 1}`;

  updateStore(projectKey, (nextStore) => {
    openPaneInternal(nextStore, createTerminalPane(projectKey, sessionId, title));
  });

  return sessionId;
}

export function closePane(projectKey: string, paneId: string) {
  updateStore(projectKey, (store) => {
    closePaneInternal(store, paneId);
  });
}

export function activatePane(projectKey: string, paneId: string) {
  updateStore(projectKey, (store) => {
    activatePaneInternal(store, paneId);
  });
}

export function createTask(projectKey: string, draft: CreateTaskDraft) {
  const timestamp = new Date().toISOString();
  const task: ComposerTaskRecord = {
    id: generateTaskId(),
    projectKey,
    title: draft.title.trim() || "Untitled task",
    description: draft.description?.trim() ?? "",
    status: "open",
    sourceMessageId: draft.sourceMessageId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  updateStore(projectKey, (store) => {
    store.tasks = [task, ...store.tasks];
    openPaneInternal(store, createTaskPane(projectKey, task));
  });

  return task;
}

export function updateTask(projectKey: string, taskId: string, patch: UpdateTaskPatch) {
  updateStore(projectKey, (store) => {
    const timestamp = new Date().toISOString();
    store.tasks = store.tasks.map((task) => {
      if (task.id !== taskId) {
        return task;
      }

      return {
        ...task,
        title: patch.title !== undefined ? patch.title.trim() || "Untitled task" : task.title,
        description: patch.description !== undefined ? patch.description : task.description,
        status: patch.status ?? task.status,
        updatedAt: timestamp,
      };
    });

    const task = store.tasks.find((entry) => entry.id === taskId);
    if (!task) {
      return;
    }

    store.state.panes = store.state.panes.map((pane) =>
      pane.kind === "task" && pane.taskId === taskId
        ? {
            ...pane,
            title: task.title,
          }
        : pane,
    );
  });
}

export function deleteTask(projectKey: string, taskId: string) {
  updateStore(projectKey, (store) => {
    const paneIdsToClose = store.state.panes
      .filter((pane) => pane.kind === "task" && pane.taskId === taskId)
      .map((pane) => pane.id);

    store.tasks = store.tasks.filter((task) => task.id !== taskId);
    for (const paneId of paneIdsToClose) {
      closePaneInternal(store, paneId);
    }
  });
}

export function getPaneById(
  state: ComposerWorkspaceState,
  paneId: string | null,
) {
  if (!paneId) {
    return null;
  }
  return state.panes.find((pane) => pane.id === paneId) ?? null;
}

export function getTaskById(tasks: ComposerTaskRecord[], taskId: string | null | undefined) {
  if (!taskId) {
    return null;
  }
  return tasks.find((task) => task.id === taskId) ?? null;
}

export function getComposerReferenceFile(state: ComposerWorkspaceState) {
  const activePane = getPaneById(state, state.activePaneId);
  if (activePane?.kind === "file" && activePane.filePath) {
    return activePane.filePath;
  }

  const lastFocusedPane = getPaneById(state, state.lastFocusedPaneId);
  if (lastFocusedPane?.kind === "file" && lastFocusedPane.filePath) {
    return lastFocusedPane.filePath;
  }

  for (let index = state.paneOrder.length - 1; index >= 0; index -= 1) {
    const pane = getPaneById(state, state.paneOrder[index] ?? null);
    if (pane?.kind === "file" && pane.filePath) {
      return pane.filePath;
    }
  }

  return null;
}
