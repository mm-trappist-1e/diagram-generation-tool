import { State } from "../reducer/reducer";

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
