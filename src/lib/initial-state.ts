import { State } from "../reducer/reducer";
import { normalizeState } from "./StateValidator";
import defaultWorkspaceTemplateJson from "../data/default-workspace.json?raw";

export const getInitialState = (): State => ({
  version: 8,
  stations: [],
  routeNodes: [],
  routeEdges: [],
  routeTimeSections: [],
  routeTimeSpeedClassCount: 1,
  routeTemplates: [],
  trainRuns: [],
  routeReadDirection: "topToBottom",
});

export const getDefaultWorkspaceState = (): State => {
  try {
    const state = normalizeState(JSON.parse(defaultWorkspaceTemplateJson));
    return state ?? getInitialState();
  } catch {
    return getInitialState();
  }
};
