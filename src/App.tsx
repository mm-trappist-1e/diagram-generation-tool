import { Dispatch, useEffect, useState } from "react";
import { DiagramChartSection } from "./DiagramChartSection";
import { getDefaultWorkspaceState, getInitialState } from "./lib/initial-state";
import { normalizeState } from "./lib/StateValidator";
import { createId, TrainRouteKey } from "./lib/domain";
import { ExportControls, ProjectFileSection } from "./ProjectFileSection";
import { Actions, reducer, State } from "./reducer/reducer";
import { RouteNetworkEditor } from "./RouteNetworkEditor";
import { TrainOperationSection } from "./TrainOperationSection";
import { SiteMetaFooter } from "./UsageGuide";

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

const CopyIcon = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-5 w-5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="8" y="8" width="11" height="11" rx="2" />
    <path d="M5 16H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

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
  const [editingWorkspaceId, setEditingWorkspaceId] = useState("");
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");

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

  const renameWorkspace = (workspaceId: string, name: string) => {
    setWorkspaceStore((currentStore) => ({
      ...currentStore,
      workspaces: currentStore.workspaces.map((workspace) =>
        workspace.id === workspaceId
          ? { ...workspace, name }
          : workspace
      ),
    }));
  };

  const startRenamingWorkspace = (workspace: Workspace) => {
    setActiveWorkspaceId(workspace.id);
    setEditingWorkspaceId(workspace.id);
    setWorkspaceNameDraft(workspace.name);
  };

  const commitWorkspaceRename = () => {
    if (!editingWorkspaceId) return;
    renameWorkspace(editingWorkspaceId, workspaceNameDraft);
    setEditingWorkspaceId("");
    setWorkspaceNameDraft("");
  };

  const cancelWorkspaceRename = () => {
    setEditingWorkspaceId("");
    setWorkspaceNameDraft("");
  };

  const removeWorkspace = (workspaceId: string) => {
    if (workspaceCount <= 1) return;
    if (editingWorkspaceId === workspaceId) cancelWorkspaceRename();
    setWorkspaceStore((currentStore) => {
      const currentIndex = currentStore.workspaces.findIndex(
        (workspace) => workspace.id === workspaceId
      );
      const workspaces = currentStore.workspaces.filter(
        (workspace) => workspace.id !== workspaceId
      );
      const nextActiveWorkspace =
        workspaces[Math.max(0, Math.min(currentIndex, workspaces.length - 1))];
      return {
        activeWorkspaceId:
          currentStore.activeWorkspaceId === workspaceId
            ? nextActiveWorkspace.id
            : currentStore.activeWorkspaceId,
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
    setSelectedTrainRunId(state.trainRuns[0]?.id ?? "");
    setSelectedRouteTemplateId("");
    setRouteTemplateEditKey("serviceRouteSections");
  }, [workspaceStore.activeWorkspaceId]);

  useEffect(() => {
    setSelectedTrainRunId((currentTrainRunId) =>
      state.trainRuns.some((trainRun) => trainRun.id === currentTrainRunId)
        ? currentTrainRunId
        : state.trainRuns[0]?.id ?? ""
    );
  }, [state.trainRuns]);

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
            ダイヤグラム生成ツール
          </h1>
          <div className="mt-3 flex flex-wrap justify-center gap-2 lg:absolute lg:right-4 lg:top-0 lg:mt-0 lg:justify-end">
            <button
              type="button"
              onClick={() => setIsDarkTheme((enabled) => !enabled)}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {isDarkTheme ? "ライトテーマ" : "グレーテーマ"}
            </button>
          </div>
        </header>

        <div className="min-w-0 px-3 sm:px-4">
          <main className="flex min-w-0 flex-col gap-8">
            <section className="flex min-w-0 flex-col gap-0">
            <section className="min-w-0 rounded-t-lg border border-b-0 border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-[#202124]">
              <div className="flex min-w-0 items-end gap-1 px-2 pt-2">
                {workspaceStore.workspaces.map((workspace) => {
                  const isActive = workspace.id === activeWorkspace.id;
                  const isEditing = workspace.id === editingWorkspaceId;
                  return (
                    <div
                      key={workspace.id}
                      className={`group flex h-11 min-w-0 flex-[1_1_0] max-w-[260px] items-center gap-1 rounded-t-xl border px-2 text-sm shadow-sm transition-colors ${
                        isActive
                          ? "relative z-10 translate-y-px border-transparent border-b-0 bg-white text-slate-950 shadow-none dark:bg-slate-800 dark:text-slate-100"
                          : "border-transparent bg-slate-300/80 text-slate-700 hover:bg-slate-100 dark:bg-[#111827] dark:text-slate-400 dark:hover:bg-[#172033]"
                      }`}
                      role="tab"
                      aria-selected={isActive}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          autoFocus
                          value={workspaceNameDraft}
                          onChange={(event) =>
                            setWorkspaceNameDraft(event.target.value)
                          }
                          onBlur={commitWorkspaceRename}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitWorkspaceRename();
                            }
                          }}
                          className="min-w-0 flex-1 rounded border border-blue-400 bg-white px-2 py-1 text-sm text-slate-900 outline-none dark:bg-slate-950 dark:text-slate-100"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveWorkspaceId(workspace.id)}
                          className="min-w-0 flex-1 truncate px-1 py-2 text-left"
                          title={workspace.name || "名称未設定"}
                        >
                          {workspace.name || "名称未設定"}
                        </button>
                      )}
                      {!isEditing ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            startRenamingWorkspace(workspace);
                          }}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-500 opacity-80 hover:bg-slate-200 hover:text-blue-700 group-hover:opacity-100 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-blue-200"
                          aria-label={`${workspace.name || "名称未設定"}の名称変更`}
                          title="名称変更"
                        >
                          ✎
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={workspaceCount <= 1}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeWorkspace(workspace.id);
                        }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-lg leading-none text-slate-500 hover:bg-slate-200 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-red-200"
                        aria-label={`${workspace.name || "名称未設定"}を閉じる`}
                        title="閉じる"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={addWorkspace}
                  className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-3xl leading-none text-slate-600 hover:bg-slate-100 hover:text-blue-700 dark:text-slate-300 dark:hover:bg-[#3a3b3f] dark:hover:text-blue-200"
                  aria-label="ワークスペースを追加"
                  title="新規ワークスペース"
                >
                  +
                </button>
                <div className="ml-auto flex shrink-0 items-center gap-2 pb-1 pl-2">
                  <button
                    type="button"
                    onClick={duplicateWorkspace}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700"
                    aria-label="ワークスペースを複製"
                    title="複製"
                  >
                    <CopyIcon />
                  </button>
                  <ExportControls
                    state={state}
                    fileNamePrefix={activeWorkspace.name || "workspace"}
                    className="whitespace-nowrap"
                  />
                </div>
              </div>
            </section>
            <RouteNetworkEditor
              state={state}
              dispatch={dispatch}
              workspaceName={activeWorkspace.name}
              selectedTrainRunId={selectedTrainRunId}
              selectedRouteTemplateId={selectedRouteTemplateId}
              setSelectedRouteTemplateId={setSelectedRouteTemplateId}
              routeTemplateEditKey={routeTemplateEditKey}
              setRouteTemplateEditKey={setRouteTemplateEditKey}
            />
            </section>
            <TrainOperationSection
              state={state}
              dispatch={dispatch}
              selectedTrainRunId={selectedTrainRunId}
              setSelectedTrainRunId={setSelectedTrainRunId}
            />
            <DiagramChartSection
              state={state}
              dispatch={dispatch}
              isDarkTheme={isDarkTheme}
            />
            <ProjectFileSection
              dispatch={dispatch}
              workspaceName={activeWorkspace.name}
            />
          </main>
        </div>
        <SiteMetaFooter />
      </div>
    </div>
  );
};
