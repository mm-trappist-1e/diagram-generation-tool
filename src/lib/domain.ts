import { RGBColor } from "react-color";

export type RouteNodeType =
  | "station"
  | "garage"
  | "yard"
  | "connection"
  | "turnback"
  | "crossing";
export type DiagramPointType = RouteNodeType;
export type RouteEdgeType = "main" | "single" | "double" | "service" | "yard";
export type RoutePortSide = "top" | "right" | "bottom" | "left";
export type ConnectionType =
  | "turnout"
  | "passing12"
  | "passing21"
  | "singleCrossoverZ"
  | "singleCrossoverReverseZ"
  | "doubleCrossover";
export type RouteReadDirection =
  | "topToBottom"
  | "bottomToTop"
  | "leftToRight"
  | "rightToLeft";
export type TrainRunType = "passenger" | "deadhead" | "freight" | "test";
export type StopStatus = "stop" | "pass" | "unset";
export type LineStyle =
  | "auto"
  | "solid"
  | "dashed"
  | "dotted"
  | "dashDot"
  | "longDash";

export type Station = {
  id: string;
  name: string;
};

export type RouteNode = {
  id: string;
  stationId: string;
  label: string;
  type: RouteNodeType;
  x: number;
  y: number;
  rotation: number;
  isFlipped: boolean;
  isTerminal: boolean;
  isHorizontalTerminal: boolean;
  isVerticalTerminal: boolean;
  platformNumber: string;
  platformCount: number;
  platformLabels: string[];
  verticalPlatformCount: number;
  verticalPlatformLabels: string[];
  durationMinutes: number;
  connectionType: ConnectionType;
};

export type DiagramPoint = RouteNode;

export type RouteEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromPortSide: RoutePortSide;
  fromPortIndex: number;
  toPortSide: RoutePortSide;
  toPortIndex: number;
  type: RouteEdgeType;
  travelMinutes: number;
  bidirectional: boolean;
};

export type RouteTimeSectionPort = {
  nodeId: string;
  side: RoutePortSide;
  index: number;
};

export type RouteTimeSectionInternalDirection =
  | "forward"
  | "reverse"
  | "bidirectional";

export type RouteTimeSpeedProfile = {
  travelMinutes: number;
  segmentMinutes: number[];
};

export type RouteTimeSpeedClass = {
  baseIndex: number;
  multiplier: number;
};

export type RouteTimeSection = {
  id: string;
  startNodeId: string;
  startPortSide: RoutePortSide;
  startPortIndex: number;
  endNodeId: string;
  endPortSide: RoutePortSide;
  endPortIndex: number;
  routeEdgeIds: string[];
  routePorts: RouteTimeSectionPort[];
  travelMinutes: number;
  segmentMinutes: number[];
  speedProfiles: RouteTimeSpeedProfile[];
  internalDirection: RouteTimeSectionInternalDirection;
};

export type Stop = {
  id: string;
  routeNodeId: string;
  routePortIndex?: number;
  arrivalTime: string;
  departureTime: string;
  status: StopStatus;
  isDeadhead: boolean;
};

export type TrainRunStopSetting = {
  routeNodeId: string;
  status: StopStatus;
  dwellMinutes: number;
};

export type TrainRunRouteSection = {
  routeTimeSectionId: string;
  reversed: boolean;
};

export type TrainRouteKey = "serviceRouteSections" | "deadheadRouteSections";

export type RouteTemplate = {
  id: string;
  name: string;
  serviceRouteSections: TrainRunRouteSection[];
  deadheadEnabled: boolean;
  deadheadRouteSections: TrainRunRouteSection[];
};

export type TrainRun = {
  id: string;
  name: string;
  runType: TrainRunType;
  lineStyle: LineStyle;
  color: RGBColor;
  operationGroup: string;
  repeat: number;
  serviceStartTime: string;
  serviceEndTime: string;
  deadheadStartTime: string;
  deadheadEndTime: string;
  defaultStopMinutes: number;
  routeTemplateId: string;
  speedClassIndex: number;
  serviceRouteNodeIds: string[];
  deadheadRouteNodeIds: string[];
  serviceRouteSections: TrainRunRouteSection[];
  deadheadRouteSections: TrainRunRouteSection[];
  repeatRangeStartIndex: number | null;
  repeatRangeEndIndex: number | null;
  repeatRangeCount: number;
  stopSettings: TrainRunStopSetting[];
  deadheadStopSettings: TrainRunStopSetting[];
  stops: Stop[];
};

export const routeNodeTypeLabels: Record<RouteNodeType, string> = {
  station: "駅",
  garage: "車庫",
  yard: "留置線",
  connection: "分岐",
  turnback: "折返し",
  crossing: "立体交差駅",
};

export const connectionTypeLabels: Record<ConnectionType, string> = {
  turnout: "Y字分岐",
  passing12: "待避型 1→2",
  passing21: "待避型 2→1",
  singleCrossoverZ: "片渡り Z",
  singleCrossoverReverseZ: "片渡り 逆Z",
  doubleCrossover: "両渡り",
};

export const diagramPointTypeLabels = routeNodeTypeLabels;

export const routeEdgeTypeLabels: Record<RouteEdgeType, string> = {
  main: "本線",
  single: "単線",
  double: "複線",
  service: "営業用",
  yard: "車庫/回送用",
};

export const routeReadDirectionLabels: Record<RouteReadDirection, string> = {
  topToBottom: "上→下",
  bottomToTop: "下→上",
  leftToRight: "左→右",
  rightToLeft: "右→左",
};

export const routeTimeSectionInternalDirectionLabels: Record<
  RouteTimeSectionInternalDirection,
  string
> = {
  forward: "順",
  reverse: "逆",
  bidirectional: "双方向",
};

export const trainRunTypeLabels: Record<TrainRunType, string> = {
  passenger: "営業",
  deadhead: "回送",
  freight: "貨物",
  test: "試運転",
};

export const stopStatusLabels: Record<StopStatus, string> = {
  stop: "停車",
  pass: "通過",
  unset: "未設定",
};

export const lineStyleLabels: Record<LineStyle, string> = {
  auto: "種別に合わせる",
  solid: "実線",
  dashed: "破線",
  dotted: "点線",
  dashDot: "一点鎖線",
  longDash: "長破線",
};

export const createId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

export const isValidTimeString = (value: string) =>
  value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export const timeStringToDate = (value: string, dayOffset = 0) => {
  const [hours, minutes] = value.split(":").map(Number);
  return new Date(2000, 0, 1 + dayOffset, hours, minutes, 0, 0);
};

export const dateToTimeString = (value: unknown) => {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
};

export const getStationName = (stations: Station[], stationId: string) =>
  stations.find((station) => station.id === stationId)?.name ?? "未登録駅";

export const getRouteNodeLabel = (stations: Station[], routeNode: RouteNode) =>
  routeNode.label ||
  (routeNode.type === "connection"
    ? routeNodeTypeLabels.connection
    : getStationName(stations, routeNode.stationId));

export const getDiagramPointLabel = getRouteNodeLabel;

export const getOrderedRouteNodes = (
  routeNodes: RouteNode[],
  routeReadDirection: RouteReadDirection
) =>
  routeNodes
    .filter((routeNode) => routeNode.type !== "connection")
    .sort((a, b) => {
      switch (routeReadDirection) {
        case "bottomToTop":
          return b.y - a.y || a.x - b.x;
        case "leftToRight":
          return a.x - b.x || a.y - b.y;
        case "rightToLeft":
          return b.x - a.x || a.y - b.y;
        case "topToBottom":
        default:
          return a.y - b.y || a.x - b.x;
      }
    });

export const colorToHex = (color: RGBColor) =>
  `#${[color.r, color.g, color.b]
    .map((value) =>
      Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")
    )
    .join("")}`;

export const hexToColor = (hex: string): RGBColor => {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return { r, g, b, a: 1 };
};

export const getStopPrimaryTime = (stop: Stop) =>
  stop.arrivalTime || stop.departureTime;
