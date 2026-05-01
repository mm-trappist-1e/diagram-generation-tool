import { State } from "../reducer/reducer";

export const getInitialState = (): State => ({
  version: 8,
  stations: [],
  routeNodes: [],
  routeEdges: [],
  routeTimeSections: [],
  routeTemplates: [],
  trainRuns: [],
  routeReadDirection: "topToBottom",
});
