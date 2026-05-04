import { ChangeEvent, Dispatch, useEffect, useState } from "react";
import { DiagramChartSection } from "./DiagramChartSection";
import { getDefaultWorkspaceState, getInitialState } from "./lib/initial-state";
import { normalizeState } from "./lib/StateValidator";
import { createId, TrainRouteKey } from "./lib/domain";
import { ExportControls, ProjectFileSection } from "./ProjectFileSection";
import { Actions, reducer, State } from "./reducer/reducer";
import { RouteNetworkEditor } from "./RouteNetworkEditor";
import { StationMasterPanel } from "./StationMasterPanel";
import { TrainOperationSection } from "./TrainOperationSection";
import { SiteMetaFooter, UsageGuide } from "./UsageGuide";

const legacyLocalStorageKey = "diagram-generation-tool:a-train-state-v3";
const legacyLocalStorageBackupKey = `${legacyLocalStorageKey}:last-good`;
const localStorageKey = "diagram-generation-tool:workspaces-v1";
const localStorageBackupKey = `${localStorageKey}:last-good`;
const localStorageFailedRestoreKey = `${localStorageKey}:failed-restore`;
const themeStorageKey = "diagram-generation-tool:theme";
const maxHistorySize = 100;

type HistoryState = {
  past: State[];
  present: State;
  future: State[];
  lastHistoryGroup?: string;
};

type HistoryAction =
  | Actions
  | {
      type: "undo";
    }
  | {
      type: "redo";
    };

type Workspace = {
  id: string;
  name: string;
  history: HistoryState;
};

type WorkspaceStore = {
  activeWorkspaceId: string;
  workspaces: Workspace[];
};

type StoredWorkspace = {
  id: string;
  name: string;
  state: State;
};

type StoredWorkspaceStore = {
  version: 1;
  activeWorkspaceId: string;
  workspaces: StoredWorkspace[];
};

const handleBeforeUnloadEvent = (event: BeforeUnloadEvent) => {
  event.preventDefault();
  event.returnValue = "";
};

const isEmptyState = (state: State) =>
  state.stations.length === 0 &&
  state.routeNodes.length === 0 &&
  state.routeEdges.length === 0 &&
  state.routeTimeSections.length === 0 &&
  state.routeTemplates.length === 0 &&
  state.trainRuns.length === 0;

const recalculateState = (state: State) =>
  reducer(state, { type: "changeFullState", payload: { state } });

const createWorkspace = (name: string, state: State): Workspace => ({
  id: createId("ws"),
  name,
  history: {
    past: [],
    present: recalculateState(state),
    future: [],
    lastHistoryGroup: undefined,
  },
});

const loadInitialState = (): State => {
  if (typeof window === "undefined") return getDefaultWorkspaceState();

  const loadFromStorage = (key: string) => {
    const saved = window.localStorage.getItem(key);
    if (!saved) return null;

    try {
      const state = normalizeState(JSON.parse(saved));
      return state ? recalculateState(state) : null;
    } catch {
      if (key === legacyLocalStorageKey) {
        window.localStorage.setItem(localStorageFailedRestoreKey, saved);
      }
      return null;
    }
  };

  const savedState = loadFromStorage(legacyLocalStorageKey);
  const backupState = loadFromStorage(legacyLocalStorageBackupKey);
  if (
    backupState &&
    !isEmptyState(backupState) &&
    (!savedState || isEmptyState(savedState))
  ) {
    return backupState;
  }
  if (savedState && !isEmptyState(savedState)) return savedState;
  return recalculateState(getDefaultWorkspaceState());
};

const normalizeStoredWorkspaceStore = (
  serialized: string
): WorkspaceStore | null => {
  try {
    const parsed = JSON.parse(serialized) as Partial<StoredWorkspaceStore>;
    if (!Array.isArray(parsed.workspaces)) return null;
    const workspaces = parsed.workspaces.flatMap((workspace, index) => {
      const state = normalizeState(workspace.state);
      if (!state) return [];
      return [
        {
          id: typeof workspace.id === "string" ? workspace.id : createId("ws"),
          name:
            typeof workspace.name === "string" && workspace.name.trim()
              ? workspace.name
              : `ワークスペース ${index + 1}`,
          history: {
            past: [],
            present: recalculateState(state),
            future: [],
            lastHistoryGroup: undefined,
          },
        } satisfies Workspace,
      ];
    });
    if (workspaces.length === 0) return null;
    const activeWorkspaceId = workspaces.some(
      (workspace) => workspace.id === parsed.activeWorkspaceId
    )
      ? String(parsed.activeWorkspaceId)
      : workspaces[0].id;
    return { activeWorkspaceId, workspaces };
  } catch {
    return null;
  }
};

const loadInitialWorkspaceStore = (): WorkspaceStore => {
  if (typeof window === "undefined") {
    const workspace = createWorkspace(
      "ワークスペース 1",
      getDefaultWorkspaceState()
    );
    return { activeWorkspaceId: workspace.id, workspaces: [workspace] };
  }

  const loadFromStorage = (key: string) => {
    const saved = window.localStorage.getItem(key);
    if (!saved) return null;
    const store = normalizeStoredWorkspaceStore(saved);
    if (!store && key === localStorageKey) {
      window.localStorage.setItem(localStorageFailedRestoreKey, saved);
    }
    return store;
  };

  const savedStore = loadFromStorage(localStorageKey);
  const backupStore = loadFromStorage(localStorageBackupKey);
  if (
    backupStore &&
    backupStore.workspaces.some((workspace) => !isEmptyState(workspace.history.present)) &&
    (!savedStore ||
      savedStore.workspaces.every((workspace) =>
        isEmptyState(workspace.history.present)
      ))
  ) {
    return backupStore;
  }
  if (
    savedStore &&
    savedStore.workspaces.some(
      (workspace) => !isEmptyState(workspace.history.present)
    )
  ) {
    return savedStore;
  }

  const legacyState = loadInitialState();
  const workspace = createWorkspace("ワークスペース 1", legacyState);
  return { activeWorkspaceId: workspace.id, workspaces: [workspace] };
};

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
};

const loadInitialDarkTheme = () => {
  if (typeof window === "undefined") return false;
  const saved = window.localStorage.getItem(themeStorageKey);
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return true;
};

const historyReducer = (
  historyState: HistoryState,
  action: HistoryAction
): HistoryState => {
  if (action.type === "undo") {
    const previous = historyState.past[historyState.past.length - 1];
    if (!previous) return historyState;
    return {
      past: historyState.past.slice(0, -1),
      present: previous,
      future: [historyState.present, ...historyState.future],
      lastHistoryGroup: undefined,
    };
  }

  if (action.type === "redo") {
    const next = historyState.future[0];
    if (!next) return historyState;
    return {
      past: [...historyState.past, historyState.present].slice(-maxHistorySize),
      present: next,
      future: historyState.future.slice(1),
      lastHistoryGroup: undefined,
    };
  }

  const nextState = reducer(historyState.present, action);
  if (nextState === historyState.present) return historyState;
  if (
    action.historyGroup &&
    action.historyGroup === historyState.lastHistoryGroup
  ) {
    return {
      ...historyState,
      present: nextState,
      future: [],
    };
  }
  return {
    past: [...historyState.past, historyState.present].slice(-maxHistorySize),
    present: nextState,
    future: [],
    lastHistoryGroup: action.historyGroup,
  };
};

export const App = () => {
  const [workspaceStore, setWorkspaceStore] = useState(
    loadInitialWorkspaceStore
  );
  const activeWorkspace =
    workspaceStore.workspaces.find(
      (workspace) => workspace.id === workspaceStore.activeWorkspaceId
    ) ?? workspaceStore.workspaces[0];
  const state = activeWorkspace.history.present;
  const workspaceCount = workspaceStore.workspaces.length;
  const setActiveWorkspaceId = (workspaceId: string) => {
    setWorkspaceStore((currentStore) => ({
      ...currentStore,
      activeWorkspaceId: workspaceId,
    }));
  };
  const dispatchHistoryAction = (action: HistoryAction) => {
    setWorkspaceStore((currentStore) => ({
      ...currentStore,
      workspaces: currentStore.workspaces.map((workspace) =>
        workspace.id === currentStore.activeWorkspaceId
          ? {
              ...workspace,
              history: historyReducer(workspace.history, action),
            }
          : workspace
      ),
    }));
  };
  const dispatch: Dispatch<Actions> = (action) => dispatchHistoryAction(action);
  const [selectedTrainRunId, setSelectedTrainRunId] = useState("");
  const [selectedRouteTemplateId, setSelectedRouteTemplateId] = useState("");
  const [routeTemplateEditKey, setRouteTemplateEditKey] =
    useState<TrainRouteKey>("serviceRouteSections");
  const [isDarkTheme, setIsDarkTheme] = useState(loadInitialDarkTheme);

  const createWorkspaceName = () => {
    let index = workspaceCount + 1;
    const names = new Set(
      workspaceStore.workspaces.map((workspace) => workspace.name)
    );
    while (names.has(`ワークスペース ${index}`)) index += 1;
    return `ワークスペース ${index}`;
  };

  const addWorkspace = () => {
    const workspace = createWorkspace(createWorkspaceName(), getInitialState());
    setWorkspaceStore((currentStore) => ({
      activeWorkspaceId: workspace.id,
      workspaces: [...currentStore.workspaces, workspace],
    }));
  };

  const duplicateWorkspace = () => {
    const workspace = createWorkspace(
      `${activeWorkspace.name} コピー`,
      activeWorkspace.history.present
    );
    setWorkspaceStore((currentStore) => ({
      activeWorkspaceId: workspace.id,
      workspaces: [...currentStore.workspaces, workspace],
    }));
  };

  const renameActiveWorkspace = (name: string) => {
    setWorkspaceStore((currentStore) => ({
      ...currentStore,
      workspaces: currentStore.workspaces.map((workspace) =>
        workspace.id === currentStore.activeWorkspaceId
          ? { ...workspace, name }
          : workspace
      ),
    }));
  };

  const removeActiveWorkspace = () => {
    if (workspaceCount <= 1) return;
    setWorkspaceStore((currentStore) => {
      const currentIndex = currentStore.workspaces.findIndex(
        (workspace) => workspace.id === currentStore.activeWorkspaceId
      );
      const workspaces = currentStore.workspaces.filter(
        (workspace) => workspace.id !== currentStore.activeWorkspaceId
      );
      const nextActiveWorkspace =
        workspaces[Math.max(0, Math.min(currentIndex, workspaces.length - 1))];
      return {
        activeWorkspaceId: nextActiveWorkspace.id,
        workspaces,
      };
    });
  };

  const serializeWorkspaceStore = (): StoredWorkspaceStore => ({
    version: 1,
    activeWorkspaceId: workspaceStore.activeWorkspaceId,
    workspaces: workspaceStore.workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      state: workspace.history.present,
    })),
  });

  useEffect(() => {
    window.addEventListener("beforeunload", handleBeforeUnloadEvent, true);
    return () =>
      window.removeEventListener("beforeunload", handleBeforeUnloadEvent, true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkTheme);
    window.localStorage.setItem(
      themeStorageKey,
      isDarkTheme ? "dark" : "light"
    );
  }, [isDarkTheme]);

  useEffect(() => {
    const storedWorkspaceStore = serializeWorkspaceStore();
    const serialized = JSON.stringify(storedWorkspaceStore);
    const current = window.localStorage.getItem(localStorageKey);

    if (
      storedWorkspaceStore.workspaces.every((workspace) =>
        isEmptyState(workspace.state)
      ) &&
      current
    ) {
      const currentStore = normalizeStoredWorkspaceStore(current);
      if (
        currentStore &&
        currentStore.workspaces.some(
          (workspace) => !isEmptyState(workspace.history.present)
        )
      ) {
        return;
      }
    }

    window.localStorage.setItem(localStorageKey, serialized);
    if (
      storedWorkspaceStore.workspaces.some(
        (workspace) => !isEmptyState(workspace.state)
      )
    ) {
      window.localStorage.setItem(localStorageBackupKey, serialized);
    }
  }, [workspaceStore]);

  useEffect(() => {
    setSelectedTrainRunId("");
    setSelectedRouteTemplateId("");
    setRouteTemplateEditKey("serviceRouteSections");
  }, [workspaceStore.activeWorkspaceId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (!isModifierPressed) return;

      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        dispatchHistoryAction({ type: "undo" });
        return;
      }

      if (
        event.key.toLowerCase() === "y" ||
        (event.key.toLowerCase() === "z" && event.shiftKey)
      ) {
        event.preventDefault();
        dispatchHistoryAction({ type: "redo" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#ffffff] text-slate-900 dark:bg-[#020617] dark:text-slate-100">
      <div className="m-0 flex flex-col gap-3 rounded-none bg-slate-100 py-3 dark:bg-slate-900 sm:m-4 sm:gap-4 sm:rounded-lg sm:py-4">
        <header className="relative px-3 sm:px-4">
          <h1 className="text-center text-2xl font-semibold text-gray-900 dark:text-slate-100 sm:text-4xl">
            A列車向けダイヤグラム生成
          </h1>
          <div className="mt-3 flex flex-wrap justify-center gap-2 lg:absolute lg:right-4 lg:top-0 lg:mt-0 lg:justify-end">
            <button
              type="button"
              onClick={() => setIsDarkTheme((enabled) => !enabled)}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {isDarkTheme ? "ライト" : "ダーク"}
            </button>
          </div>
        </header>

        <section className="mx-3 flex min-w-0 flex-col gap-3 rounded-lg bg-white p-3 dark:bg-slate-800 sm:mx-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-100">
              ワークスペース
            </span>
            <div className="hidden min-w-0 flex-1 flex-wrap gap-2 sm:flex">
              {workspaceStore.workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => setActiveWorkspaceId(workspace.id)}
                  className={`max-w-[220px] truncate rounded border px-3 py-2 text-sm ${
                    workspace.id === activeWorkspace.id
                      ? "border-blue-700 bg-blue-50 font-bold text-blue-950 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-50"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700"
                  }`}
                >
                  {workspace.name || "名称未設定"}
                </button>
              ))}
            </div>
            <div className="w-full sm:hidden">
              <label htmlFor="workspace-select" className="sr-only">
                ワークスペース
              </label>
              <select
                id="workspace-select"
                value={activeWorkspace.id}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setActiveWorkspaceId(event.target.value)
                }
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                {workspaceStore.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name || "名称未設定"}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <button
                type="button"
                onClick={addWorkspace}
                className="flex-1 rounded border border-blue-200 bg-white px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 dark:border-blue-500 dark:bg-slate-900 dark:text-blue-200 dark:hover:bg-blue-950 sm:flex-none"
              >
                新規
              </button>
              <button
                type="button"
                onClick={duplicateWorkspace}
                className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700 sm:flex-none"
              >
                複製
              </button>
              <button
                type="button"
                disabled={workspaceCount <= 1}
                onClick={removeActiveWorkspace}
                className="flex-1 rounded border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 dark:border-red-500 dark:bg-slate-900 dark:text-red-200 dark:hover:bg-red-950 dark:disabled:border-slate-700 dark:disabled:text-slate-500 sm:flex-none"
              >
                削除
              </button>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,360px)_minmax(0,1fr)_auto] lg:items-end">
            <label className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-100">
              ワークスペース名
              <input
                type="text"
                value={activeWorkspace.name}
                onChange={(event) => renameActiveWorkspace(event.target.value)}
                className="rounded border border-slate-300 bg-white p-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <p className="text-sm text-slate-500 dark:text-slate-300">
              新規を押すと、現在のデータを残したまま空のワークスペースを開始できます。
            </p>
            <ExportControls
              state={state}
              fileNamePrefix={activeWorkspace.name || "workspace"}
            />
          </div>
        </section>

        <div className="grid min-w-0 gap-4 px-3 sm:px-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <StationMasterPanel state={state} dispatch={dispatch} />
          <main className="flex min-w-0 flex-col gap-8">
            <RouteNetworkEditor
              state={state}
              dispatch={dispatch}
              selectedTrainRunId={selectedTrainRunId}
              selectedRouteTemplateId={selectedRouteTemplateId}
              setSelectedRouteTemplateId={setSelectedRouteTemplateId}
              routeTemplateEditKey={routeTemplateEditKey}
              setRouteTemplateEditKey={setRouteTemplateEditKey}
            />
            <TrainOperationSection
              state={state}
              dispatch={dispatch}
              selectedTrainRunId={selectedTrainRunId}
              setSelectedTrainRunId={setSelectedTrainRunId}
              selectedRouteTemplateId={selectedRouteTemplateId}
              setSelectedRouteTemplateId={setSelectedRouteTemplateId}
              isDarkTheme={isDarkTheme}
            />
            <DiagramChartSection state={state} isDarkTheme={isDarkTheme} />
            <ProjectFileSection
              dispatch={dispatch}
              workspaceName={activeWorkspace.name}
            />
            <UsageGuide />
          </main>
        </div>
        <SiteMetaFooter />
      </div>
    </div>
  );
};
