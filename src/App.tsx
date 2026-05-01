import { Dispatch, useEffect, useReducer, useState } from "react";
import { DiagramChartSection } from "./DiagramChartSection";
import { getInitialState } from "./lib/initial-state";
import { normalizeState } from "./lib/StateValidator";
import { TrainRouteKey } from "./lib/domain";
import { ExportControls, ProjectFileSection } from "./ProjectFileSection";
import { Actions, reducer, State } from "./reducer/reducer";
import { RouteNetworkEditor } from "./RouteNetworkEditor";
import { StationMasterPanel } from "./StationMasterPanel";
import { TrainOperationSection } from "./TrainOperationSection";
import { SiteMetaFooter, UsageGuide } from "./UsageGuide";

const localStorageKey = "diagram-generation-tool:a-train-state-v3";
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

const normalizeStoredState = (serialized: string): State | null => {
  try {
    return normalizeState(JSON.parse(serialized));
  } catch {
    return null;
  }
};

const loadInitialState = (): State => {
  const recalculateState = (state: State) =>
    reducer(state, { type: "changeFullState", payload: { state } });

  if (typeof window === "undefined") return getInitialState();

  const loadFromStorage = (key: string) => {
    const saved = window.localStorage.getItem(key);
    if (!saved) return null;

    try {
      const state = normalizeState(JSON.parse(saved));
      return state ? recalculateState(state) : null;
    } catch {
      if (key === localStorageKey) {
        window.localStorage.setItem(localStorageFailedRestoreKey, saved);
      }
      return null;
    }
  };

  const savedState = loadFromStorage(localStorageKey);
  const backupState = loadFromStorage(localStorageBackupKey);
  if (
    backupState &&
    !isEmptyState(backupState) &&
    (!savedState || isEmptyState(savedState))
  ) {
    return backupState;
  }
  if (savedState) return savedState;
  return recalculateState(getInitialState());
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

const loadInitialHistoryState = (): HistoryState => ({
  past: [],
  present: loadInitialState(),
  future: [],
  lastHistoryGroup: undefined,
});

const loadInitialDarkTheme = () => {
  if (typeof window === "undefined") return false;
  const saved = window.localStorage.getItem(themeStorageKey);
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
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
  const [historyState, historyDispatch] = useReducer(
    historyReducer,
    undefined,
    loadInitialHistoryState
  );
  const state = historyState.present;
  const dispatch: Dispatch<Actions> = (action) => historyDispatch(action);
  const [selectedTrainRunId, setSelectedTrainRunId] = useState("");
  const [selectedRouteTemplateId, setSelectedRouteTemplateId] = useState("");
  const [routeTemplateEditKey, setRouteTemplateEditKey] =
    useState<TrainRouteKey>("serviceRouteSections");
  const [isDarkTheme, setIsDarkTheme] = useState(loadInitialDarkTheme);

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
    const serialized = JSON.stringify(state);
    const current = window.localStorage.getItem(localStorageKey);

    if (isEmptyState(state) && current) {
      const currentState = normalizeStoredState(current);
      if (!currentState || !isEmptyState(currentState)) return;
    }

    window.localStorage.setItem(localStorageKey, serialized);
    if (!isEmptyState(state)) {
      window.localStorage.setItem(localStorageBackupKey, serialized);
    }
  }, [state]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (!isModifierPressed) return;

      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        historyDispatch({ type: "undo" });
        return;
      }

      if (
        event.key.toLowerCase() === "y" ||
        (event.key.toLowerCase() === "z" && event.shiftKey)
      ) {
        event.preventDefault();
        historyDispatch({ type: "redo" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[#ffffff] text-slate-900 dark:bg-[#020617] dark:text-slate-100">
      <div className="m-4 flex flex-col gap-4 rounded-lg bg-slate-100 py-4 dark:bg-slate-900">
        <header className="relative px-4">
          <h1 className="text-center text-4xl text-gray-900 dark:text-slate-100">
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
            <ExportControls state={state} />
          </div>
        </header>

        <div className="grid gap-4 px-4 lg:grid-cols-[360px_minmax(0,1fr)]">
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
            <ProjectFileSection dispatch={dispatch} />
            <UsageGuide />
          </main>
        </div>
        <SiteMetaFooter />
      </div>
    </div>
  );
};
