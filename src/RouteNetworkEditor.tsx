import {
  ChangeEvent,
  Dispatch,
  MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  connectionTypeLabels,
  ConnectionType,
  createId,
  getRouteNodeLabel,
  routeReadDirectionLabels,
  getStopPrimaryTime,
  getStationName,
  RouteEdge,
  RouteNode,
  routeNodeTypeLabels,
  RouteNodeType,
  RoutePortSide,
  routeTimeSectionInternalDirectionLabels,
  RouteTimeSectionPort,
  TrainRun,
  TrainRouteKey,
  TrainRunRouteSection,
} from "./lib/domain";
import {
  getRouteTimeSectionBreakpoints,
  getRouteTimeSectionsForSpeedClass,
  getRouteTimeSpeedClassCount,
  resolveRouteTimeSectionSegments,
} from "./lib/route-time";
import { Actions, State } from "./reducer/reducer";

type Props = {
  state: State;
  dispatch: Dispatch<Actions>;
  selectedTrainRunId: string;
  selectedRouteTemplateId: string;
  setSelectedRouteTemplateId: (routeTemplateId: string) => void;
  routeTemplateEditKey: TrainRouteKey;
  setRouteTemplateEditKey: (key: TrainRouteKey) => void;
};

type DragState = {
  historyGroup: string;
  nodes: Array<{ nodeId: string; offsetX: number; offsetY: number }>;
};
type CanvasPanState = {
  clientX: number;
  clientY: number;
  scrollLeft: number;
  scrollTop: number;
};
type SelectionState = { start: Point; current: Point };
type PortRef = {
  nodeId: string;
  side: RoutePortSide;
  index: number;
};
type RoutePlatformRef = { nodeId: string; index: number };
type ConnectState = PortRef & { x: number; y: number };
type Point = { x: number; y: number };
type RouteMapClipboard = {
  routeNodes: RouteNode[];
  routeEdges: RouteEdge[];
};
type RouteTimeDraft = {
  ports: RouteTimeSectionPort[];
  routeEdgeIds: string[];
};
type BranchInsertDragState = {
  routeEdgeId: string;
  placementPoint: Point;
  currentPoint: Point;
};
type ConnectionInsertPlan = {
  x: number;
  y: number;
  rotation: number;
  connectionType: ConnectionType;
  splits: Array<{
    routeEdgeId: string;
    entryPortSide: RoutePortSide;
    entryPortIndex: number;
    exitPortSide: RoutePortSide;
    exitPortIndex: number;
    splitRatio: number;
  }>;
};
type ObstacleRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type RouteEdgeGeometry = {
  routeEdgeId: string;
  fromNodeId: string;
  toNodeId: string;
  bidirectional: boolean;
  travelMinutes: number;
  routePoints: Point[];
  labelPoint: Point;
};
type RoutePathSegment = {
  from: Point;
  to: Point;
  length: number;
  sectionId?: string;
};
type RouteTimeLabelPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LayoutInfo = {
  labelX: number;
  labelY: number;
  subLabelY: number;
  labelOutside: boolean;
  labelBoxX: number;
  labelBoxY: number;
  labelBoxWidth: number;
  labelBoxHeight: number;
};

const nodeTypes: RouteNodeType[] = [
  "station",
  "terminal",
  "garage",
  "yard",
  "turnback",
  "crossing",
];
const connectionTypes: ConnectionType[] = [
  "passing12",
  "passing21",
  "singleCrossoverZ",
  "singleCrossoverReverseZ",
  "doubleCrossover",
];
const singleEdgeInsertConnectionTypes: ConnectionType[] = connectionTypes;
const doubleEdgeInsertConnectionTypes: ConnectionType[] = [
  "singleCrossoverZ",
  "singleCrossoverReverseZ",
  "doubleCrossover",
];

const layoutGridSize = 12;
const nodeWidth = layoutGridSize * 10;
const minNodeHeight = layoutGridSize * 4;
const connectionNodeLongSize = layoutGridSize * 3;
const connectionNodeWideLongSize = layoutGridSize * 4;
const connectionNodeShortSize = layoutGridSize * 2;
const connectionBranchGap = layoutGridSize * 2;
const portGap = layoutGridSize * 2;
const portRadius = 7;
const routeStubLength = layoutGridSize * 2;
const routeClearance = layoutGridSize * 2;
const rotateButtonRadius = 12;
const baseCanvasSide = 3600;
const canvasSizeMultiplier = 10;
const canvasWidth = baseCanvasSide * canvasSizeMultiplier;
const canvasHeight = canvasWidth;
const minCanvasZoom = 0.4;
const maxCanvasZoom = 2.4;

const nodeColors: Record<RouteNodeType, string> = {
  station: "#ffffff",
  terminal: "#f8fafc",
  garage: "#e0f2fe",
  yard: "#ecfccb",
  connection: "#dbeafe",
  turnback: "#fce7f3",
  crossing: "#ede9fe",
};

const routeTimeSectionPalette = [
  "#16a34a",
  "#2563eb",
  "#f97316",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
  "#db2777",
  "#4f46e5",
  "#0f766e",
];

const normalizeRotation = (rotation = 0, allowFourDirections = false) => {
  const normalized = (((Math.round(rotation / 90) * 90) % 360) + 360) % 360;
  return allowFourDirections ? normalized : normalized % 180;
};

const getNodeRotation = (routeNode: RouteNode) =>
  normalizeRotation(routeNode.rotation, true);

const getEdgeStrokeColor = (routeEdgeId: string, selectedEdgeId: string) =>
  routeEdgeId === selectedEdgeId ? "#dc2626" : "#64748b";

const trainRunHasDeadheadTime = (trainRun: TrainRun) =>
  Boolean(trainRun.deadheadStartTime || trainRun.deadheadEndTime);

const getSelectedTrainRouteSections = (
  state: State,
  trainRun: TrainRun
): TrainRunRouteSection[] => {
  const routeTemplate = state.routeTemplates.find(
    (template) => template.id === trainRun.routeTemplateId
  );
  const serviceRouteSections =
    routeTemplate?.serviceRouteSections ?? trainRun.serviceRouteSections;
  const deadheadRouteSections = routeTemplate
    ? routeTemplate.deadheadEnabled && trainRunHasDeadheadTime(trainRun)
      ? routeTemplate.deadheadRouteSections
      : []
    : trainRun.deadheadRouteSections;
  return [...deadheadRouteSections, ...serviceRouteSections];
};

const getRouteTimeSectionEndpointLabel = (
  state: State,
  nodeId: string,
  portIndex: number
) => {
  const routeNode = state.routeNodes.find((node) => node.id === nodeId);
  if (!routeNode) return "未登録ノード";
  const platformLabel =
    routeNode.platformLabels?.[portIndex] ?? `${portIndex + 1}`;
  return `${getRouteNodeLabel(state.stations, routeNode)} ${platformLabel}番`;
};

const shouldDisplayRouteTimeSectionReversed = (
  section: State["routeTimeSections"][number]
) => (section.internalDirection ?? "forward") === "reverse";

const getRouteTimeSectionDisplayEndpoints = (
  section: State["routeTimeSections"][number]
) =>
  shouldDisplayRouteTimeSectionReversed(section)
    ? {
        startNodeId: section.endNodeId,
        startPortIndex: section.endPortIndex,
        endNodeId: section.startNodeId,
        endPortIndex: section.startPortIndex,
      }
    : {
        startNodeId: section.startNodeId,
        startPortIndex: section.startPortIndex,
        endNodeId: section.endNodeId,
        endPortIndex: section.endPortIndex,
      };

const getRouteTimeSectionDisplaySegmentMinutes = (
  section: State["routeTimeSections"][number],
  segmentMinutes: number[]
) =>
  shouldDisplayRouteTimeSectionReversed(section)
    ? [...segmentMinutes].reverse()
    : segmentMinutes;

const getRouteTimeSectionStoredSegmentMinutes = (
  section: State["routeTimeSections"][number],
  displaySegmentMinutes: number[]
) =>
  shouldDisplayRouteTimeSectionReversed(section)
    ? [...displaySegmentMinutes].reverse()
    : displaySegmentMinutes;

const getRouteTimeSectionLabel = (
  state: State,
  section: State["routeTimeSections"][number]
) => {
  const endpoints = getRouteTimeSectionDisplayEndpoints(section);
  return `${getRouteTimeSectionEndpointLabel(
    state,
    endpoints.startNodeId,
    endpoints.startPortIndex
  )} → ${getRouteTimeSectionEndpointLabel(
    state,
    endpoints.endNodeId,
    endpoints.endPortIndex
  )} / ${section.travelMinutes}分`;
};

const hashString = (value: string) =>
  [...value].reduce(
    (hash, character) =>
      (hash * 31 + character.charCodeAt(0)) % routeTimeSectionPalette.length,
    0
  );

const getRouteTimeSectionNodePairKey = (
  section: State["routeTimeSections"][number]
) => [section.startNodeId, section.endNodeId].sort().join(":");

const getRouteTimeSectionColor = (
  section: State["routeTimeSections"][number]
) =>
  routeTimeSectionPalette[hashString(getRouteTimeSectionNodePairKey(section))];

const getNextRouteTimeSectionInternalDirection = (
  direction: State["routeTimeSections"][number]["internalDirection"]
) => {
  switch (direction) {
    case "forward":
      return "reverse";
    case "reverse":
      return "bidirectional";
    case "bidirectional":
    default:
      return "forward";
  }
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

const getPortKey = (nodeId: string, side: RoutePortSide, index: number) =>
  `${nodeId}:${side}:${index}`;

const getPortRefKey = (portRef: PortRef) =>
  getPortKey(portRef.nodeId, portRef.side, portRef.index);

const portRefsEqual = (a: PortRef, b: PortRef) =>
  a.nodeId === b.nodeId && a.side === b.side && a.index === b.index;

const getPortSideAxis = (side: RoutePortSide) =>
  side === "left" || side === "right" ? "horizontal" : "vertical";

const getPlatformKey = (platform: RoutePlatformRef) =>
  `${platform.nodeId}:${platform.index}`;

const getRouteSectionById = (state: State, routeTimeSectionId: string) =>
  state.routeTimeSections.find((section) => section.id === routeTimeSectionId);

const getRouteSectionStartPort = (
  state: State,
  routeSection: TrainRunRouteSection
): PortRef | null => {
  const section = getRouteSectionById(state, routeSection.routeTimeSectionId);
  if (!section) return null;
  return routeSection.reversed
    ? {
        nodeId: section.endNodeId,
        side: section.endPortSide,
        index: section.endPortIndex,
      }
    : {
        nodeId: section.startNodeId,
        side: section.startPortSide,
        index: section.startPortIndex,
      };
};

const getRouteSectionEndPort = (
  state: State,
  routeSection: TrainRunRouteSection
): PortRef | null => {
  const section = getRouteSectionById(state, routeSection.routeTimeSectionId);
  if (!section) return null;
  return routeSection.reversed
    ? {
        nodeId: section.startNodeId,
        side: section.startPortSide,
        index: section.startPortIndex,
      }
    : {
        nodeId: section.endNodeId,
        side: section.endPortSide,
        index: section.endPortIndex,
      };
};

const canContinueRouteSectionFromPort = (
  state: State,
  from: PortRef,
  to: PortRef
) => {
  if (portRefsEqual(from, to)) return true;
  if (from.nodeId !== to.nodeId) return false;
  const routeNode = state.routeNodes.find((node) => node.id === from.nodeId);
  if (!routeNode || routeNode.type === "connection") return false;
  if (from.index !== to.index) return false;
  return (
    routeNode.type !== "crossing" ||
    getPortSideAxis(from.side) === getPortSideAxis(to.side)
  );
};

const getRouteEndPort = (
  state: State,
  routeSections: TrainRunRouteSection[]
) => {
  const lastRouteSection = routeSections[routeSections.length - 1];
  return lastRouteSection
    ? getRouteSectionEndPort(state, lastRouteSection)
    : null;
};

const getRouteSectionOptions = (
  state: State,
  routeSections: TrainRunRouteSection[]
) => {
  const currentEndPort = getRouteEndPort(state, routeSections);
  return state.routeTimeSections.flatMap((section) => {
    const options: TrainRunRouteSection[] = [
      { routeTimeSectionId: section.id, reversed: false },
      { routeTimeSectionId: section.id, reversed: true },
    ];
    if (!currentEndPort) return options;
    return options.filter((option) => {
      const startPort = getRouteSectionStartPort(state, option);
      return (
        startPort &&
        canContinueRouteSectionFromPort(state, currentEndPort, startPort)
      );
    });
  });
};

const getRouteSectionOptionsFromPlatform = (
  state: State,
  platform: RoutePlatformRef
) =>
  state.routeTimeSections.flatMap((section) => {
    const options: TrainRunRouteSection[] = [
      { routeTimeSectionId: section.id, reversed: false },
      { routeTimeSectionId: section.id, reversed: true },
    ];
    return options.filter((option) => {
      const startPort = getRouteSectionStartPort(state, option);
      return (
        startPort?.nodeId === platform.nodeId &&
        startPort.index === platform.index
      );
    });
  });

const routeSectionEndsAtPlatform = (
  state: State,
  routeSection: TrainRunRouteSection,
  platform: RoutePlatformRef
) => {
  const endPort = getRouteSectionEndPort(state, routeSection);
  return (
    endPort?.nodeId === platform.nodeId && endPort.index === platform.index
  );
};

const getReachablePlatformKeys = (
  state: State,
  routeSections: TrainRunRouteSection[],
  pendingStart: RoutePlatformRef | null
) => {
  const options =
    routeSections.length === 0 && pendingStart
      ? getRouteSectionOptionsFromPlatform(state, pendingStart)
      : routeSections.length > 0
      ? getRouteSectionOptions(state, routeSections)
      : [];

  return new Set(
    options.flatMap((option) => {
      const endPort = getRouteSectionEndPort(state, option);
      return endPort
        ? [getPlatformKey({ nodeId: endPort.nodeId, index: endPort.index })]
        : [];
    })
  );
};

const getRouteEdgeSetKey = (routeEdgeIds: string[]) =>
  [...new Set(routeEdgeIds)].sort().join("|");

const rotatePortSideByDegrees = (
  side: RoutePortSide,
  degrees: number
): RoutePortSide => {
  const sides: RoutePortSide[] = ["top", "right", "bottom", "left"];
  const index = sides.indexOf(side);
  const steps = Math.round(degrees / 90);
  return sides[(index + steps + sides.length * 4) % sides.length];
};

const getPortIndexAxis = (side: RoutePortSide): Point =>
  side === "top" || side === "bottom" ? { x: 1, y: 0 } : { x: 0, y: 1 };

const rotateAxisByDegrees = (axis: Point, degrees: number): Point => {
  const steps = ((Math.round(degrees / 90) % 4) + 4) % 4;
  if (steps === 1) return { x: -axis.y, y: axis.x };
  if (steps === 2) return { x: -axis.x, y: -axis.y };
  if (steps === 3) return { x: axis.y, y: -axis.x };
  return axis;
};

const shouldReverseRotatedPortIndex = (
  routeNode: RouteNode,
  side: RoutePortSide
) => {
  if (routeNode.type === "connection" || routeNode.type === "crossing") {
    return false;
  }
  const rotation = getNodeRotation(routeNode);
  if (rotation === 0) return false;
  const canonicalSide = rotatePortSideByDegrees(side, -rotation);
  const rotatedAxis = rotateAxisByDegrees(
    getPortIndexAxis(canonicalSide),
    rotation
  );
  const currentAxis = getPortIndexAxis(side);
  return rotatedAxis.x * currentAxis.x + rotatedAxis.y * currentAxis.y < 0;
};

const getVisualPortIndex = (
  routeNode: RouteNode,
  side: RoutePortSide,
  index: number
) => {
  const count = getPortCountForSide(routeNode, side);
  const clampedIndex = Math.max(0, Math.min(count - 1, index));
  return shouldReverseRotatedPortIndex(routeNode, side)
    ? count - 1 - clampedIndex
    : clampedIndex;
};

const getActualConnectionSide = (
  canonicalSide: RoutePortSide,
  rotation: number
) => rotatePortSideByDegrees(canonicalSide, rotation);

const getNextConnectionType = (
  currentType: ConnectionType,
  selectedEdgeCount: number
) => {
  const types =
    selectedEdgeCount >= 2
      ? doubleEdgeInsertConnectionTypes
      : singleEdgeInsertConnectionTypes;
  const currentIndex = types.indexOf(currentType);
  return types[(currentIndex + 1) % types.length] ?? types[0];
};

const getFlippedConnectionUpdate = (routeNode: RouteNode) => {
  switch (routeNode.connectionType) {
    case "turnout":
      return {
        rotation: normalizeRotation(routeNode.rotation + 180, true),
      };
    case "passing12":
      return { connectionType: "passing21" as ConnectionType };
    case "passing21":
      return { connectionType: "passing12" as ConnectionType };
    case "singleCrossoverZ":
      return { connectionType: "singleCrossoverReverseZ" as ConnectionType };
    case "singleCrossoverReverseZ":
      return { connectionType: "singleCrossoverZ" as ConnectionType };
    case "doubleCrossover":
      return {};
  }
};

const getCanonicalConnectionSide = (
  routeNode: RouteNode,
  side: RoutePortSide
) => rotatePortSideByDegrees(side, -getNodeRotation(routeNode));

const getConnectionRoutePairs = (connectionType: ConnectionType) => {
  switch (connectionType) {
    case "turnout":
      return [
        [0, 0],
        [0, 1],
      ] as const;
    case "passing12":
      return [
        [0, 0],
        [0, 1],
      ] as const;
    case "passing21":
      return [
        [1, 1],
        [1, 0],
      ] as const;
    case "singleCrossoverZ":
      return [
        [0, 0],
        [1, 1],
        [0, 1],
      ] as const;
    case "singleCrossoverReverseZ":
      return [
        [0, 0],
        [1, 1],
        [1, 0],
      ] as const;
    case "doubleCrossover":
      return [
        [0, 0],
        [1, 1],
        [0, 1],
        [1, 0],
      ] as const;
  }
};

const canTraverseConnection = (
  routeNode: RouteNode,
  entrySide: RoutePortSide,
  entryIndex: number,
  exitSide: RoutePortSide,
  exitIndex: number
) => {
  const entryCanonicalSide = getCanonicalConnectionSide(routeNode, entrySide);
  const exitCanonicalSide = getCanonicalConnectionSide(routeNode, exitSide);
  if (entryCanonicalSide === exitCanonicalSide) return false;
  const [leftIndex, rightIndex] =
    entryCanonicalSide === "left"
      ? [entryIndex, exitIndex]
      : [exitIndex, entryIndex];

  return getConnectionRoutePairs(routeNode.connectionType).some(
    ([fromIndex, toIndex]) => fromIndex === leftIndex && toIndex === rightIndex
  );
};

const getRouteEdgeFromPortRef = (routeEdge: State["routeEdges"][number]) => ({
  nodeId: routeEdge.fromNodeId,
  side: routeEdge.fromPortSide,
  index: routeEdge.fromPortIndex,
});

const getRouteEdgeToPortRef = (routeEdge: State["routeEdges"][number]) => ({
  nodeId: routeEdge.toNodeId,
  side: routeEdge.toPortSide,
  index: routeEdge.toPortIndex,
});

const findRouteTimePath = (
  start: PortRef,
  target: PortRef,
  routeEdges: State["routeEdges"],
  routeNodeById: Map<string, RouteNode>
) => {
  type QueueItem = {
    port: PortRef;
    ports: PortRef[];
    routeEdgeIds: string[];
  };
  const queue: QueueItem[] = [
    { port: start, ports: [start], routeEdgeIds: [] },
  ];
  const visited = new Set<string>([getPortRefKey(start)]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const targetNode = routeNodeById.get(target.nodeId);
    if (
      portRefsEqual(current.port, target) &&
      (current.routeEdgeIds.length > 0 ||
        (targetNode?.type === "connection" && !portRefsEqual(start, target)))
    ) {
      return {
        ports: current.ports,
        routeEdgeIds: current.routeEdgeIds,
      };
    }

    const currentNode = routeNodeById.get(current.port.nodeId);
    if (!currentNode) continue;
    if (
      currentNode.type !== "connection" &&
      !portRefsEqual(current.port, start)
    ) {
      continue;
    }

    const nextSteps: Array<{ port: PortRef; routeEdgeId?: string }> = [];
    routeEdges.forEach((routeEdge) => {
      const from = getRouteEdgeFromPortRef(routeEdge);
      const to = getRouteEdgeToPortRef(routeEdge);
      if (portRefsEqual(current.port, from)) {
        nextSteps.push({ port: to, routeEdgeId: routeEdge.id });
      }
      if (routeEdge.bidirectional && portRefsEqual(current.port, to)) {
        nextSteps.push({ port: from, routeEdgeId: routeEdge.id });
      }
    });

    if (currentNode.type === "connection") {
      getRouteNodePortRefs(currentNode).forEach((portRef) => {
        if (portRefsEqual(current.port, portRef)) return;
        if (
          canTraverseConnection(
            currentNode,
            current.port.side,
            current.port.index,
            portRef.side,
            portRef.index
          )
        ) {
          nextSteps.push({ port: portRef });
        }
      });
    }

    nextSteps.forEach((nextStep) => {
      const nextNode = routeNodeById.get(nextStep.port.nodeId);
      if (!nextNode) return;
      if (
        nextNode.type !== "connection" &&
        !portRefsEqual(nextStep.port, target)
      ) {
        return;
      }
      if (
        nextStep.routeEdgeId &&
        current.routeEdgeIds.includes(nextStep.routeEdgeId)
      ) {
        return;
      }
      const nextRouteEdgeIds = nextStep.routeEdgeId
        ? [...current.routeEdgeIds, nextStep.routeEdgeId]
        : current.routeEdgeIds;

      const visitedKey = `${getPortRefKey(nextStep.port)}:${getRouteEdgeSetKey(
        nextRouteEdgeIds
      )}`;
      if (visited.has(visitedKey)) return;
      visited.add(visitedKey);
      queue.push({
        port: nextStep.port,
        ports: [...current.ports, nextStep.port],
        routeEdgeIds: nextRouteEdgeIds,
      });
    });
  }

  return null;
};

const getRouteEdgeEndpoint = (
  routeEdge: State["routeEdges"][number],
  nodeId: string
) => {
  if (routeEdge.fromNodeId === nodeId) {
    return {
      nodeId: routeEdge.fromNodeId,
      side: routeEdge.fromPortSide,
      index: routeEdge.fromPortIndex,
      otherNodeId: routeEdge.toNodeId,
      otherSide: routeEdge.toPortSide,
      otherIndex: routeEdge.toPortIndex,
    };
  }
  if (routeEdge.toNodeId === nodeId && routeEdge.bidirectional) {
    return {
      nodeId: routeEdge.toNodeId,
      side: routeEdge.toPortSide,
      index: routeEdge.toPortIndex,
      otherNodeId: routeEdge.fromNodeId,
      otherSide: routeEdge.fromPortSide,
      otherIndex: routeEdge.fromPortIndex,
    };
  }
  return null;
};

const isVerticalNode = (routeNode: RouteNode) =>
  getNodeRotation(routeNode) === 90 || getNodeRotation(routeNode) === 270;

const getPlatformCount = (routeNode: RouteNode) =>
  Math.max(1, Math.floor(routeNode.platformCount || 1));

const getVerticalPlatformCount = (routeNode: RouteNode) =>
  Math.max(
    1,
    Math.floor(routeNode.verticalPlatformCount || routeNode.platformCount || 1)
  );

const getPlatformLabel = (routeNode: RouteNode, index: number) =>
  routeNode.platformLabels?.[index] || `${index + 1}`;

const getVerticalPlatformLabel = (routeNode: RouteNode, index: number) =>
  routeNode.verticalPlatformLabels?.[index] || `${index + 1}`;

const normalizePlatformLabels = (labels: string[] | undefined, count: number) =>
  Array.from({ length: Math.max(1, count) }).map(
    (_, index) => labels?.[index] ?? `${index + 1}`
  );

const isSingleEndedNode = (routeNode: RouteNode) =>
  routeNode.type === "terminal" || routeNode.type === "turnback";

const getSingleEndedPortSide = (routeNode: RouteNode): RoutePortSide => {
  const rotation = getNodeRotation(routeNode);
  if (rotation === 90) return "bottom";
  if (rotation === 180) return "left";
  if (rotation === 270) return "top";
  return "right";
};

const getConnectionNodeLongSize = (connectionType: ConnectionType) =>
  connectionType === "turnout"
    ? connectionNodeLongSize
    : connectionNodeWideLongSize;

const getPortCountForSide = (routeNode: RouteNode, side: RoutePortSide) => {
  if (routeNode.type === "connection") {
    const canonicalSide = getCanonicalConnectionSide(routeNode, side);
    if (routeNode.connectionType === "turnout") {
      return canonicalSide === "left" ? 1 : canonicalSide === "right" ? 2 : 0;
    }
    return canonicalSide === "left" || canonicalSide === "right" ? 2 : 0;
  }
  if (isSingleEndedNode(routeNode)) {
    return side === getSingleEndedPortSide(routeNode)
      ? getPlatformCount(routeNode)
      : 0;
  }
  if (routeNode.type === "crossing") {
    return side === "top" || side === "bottom"
      ? getVerticalPlatformCount(routeNode)
      : getPlatformCount(routeNode);
  }
  return getPlatformCount(routeNode);
};

const getPortBandSize = (count: number) =>
  Math.max(minNodeHeight, (Math.max(1, count) + 1) * portGap);

const getNodeWidth = (routeNode: RouteNode) => {
  if (routeNode.type === "connection") {
    const longSize = getConnectionNodeLongSize(routeNode.connectionType);
    return getNodeRotation(routeNode) === 90 ||
      getNodeRotation(routeNode) === 270
      ? connectionNodeShortSize
      : longSize;
  }
  if (routeNode.type === "crossing") {
    return Math.max(
      nodeWidth,
      getPortBandSize(getPlatformCount(routeNode)),
      getPortBandSize(getVerticalPlatformCount(routeNode))
    );
  }
  return isVerticalNode(routeNode)
    ? getPortBandSize(getPlatformCount(routeNode))
    : nodeWidth;
};

const getNodeHeight = (routeNode: RouteNode) => {
  if (routeNode.type === "connection") {
    const longSize = getConnectionNodeLongSize(routeNode.connectionType);
    return getNodeRotation(routeNode) === 90 ||
      getNodeRotation(routeNode) === 270
      ? longSize
      : connectionNodeShortSize;
  }
  if (routeNode.type === "crossing") return getNodeWidth(routeNode);
  return isVerticalNode(routeNode)
    ? nodeWidth
    : getPortBandSize(getPlatformCount(routeNode));
};

const snapValue = (value: number, gridSize = layoutGridSize) =>
  Math.round(value / gridSize) * gridSize;

const snapPointToGrid = (point: Point) => ({
  x: Math.max(0, snapValue(point.x)),
  y: Math.max(0, snapValue(point.y)),
});

const clampNodePosition = (routeNode: RouteNode, point: Point) => ({
  x: Math.max(0, Math.min(canvasWidth - getNodeWidth(routeNode), point.x)),
  y: Math.max(0, Math.min(canvasHeight - getNodeHeight(routeNode), point.y)),
});

const snapNodePosition = (routeNode: RouteNode, point: Point) =>
  clampNodePosition(routeNode, snapPointToGrid(point));

const getNodeCenter = (routeNode: RouteNode) => ({
  x: routeNode.x + getNodeWidth(routeNode) / 2,
  y: routeNode.y + getNodeHeight(routeNode) / 2,
});

const getNodeRect = (routeNode: RouteNode, padding = 0): ObstacleRect => ({
  id: routeNode.id,
  x: routeNode.x - padding,
  y: routeNode.y - padding,
  width: getNodeWidth(routeNode) + padding * 2,
  height: getNodeHeight(routeNode) + padding * 2,
});

const getRouteTemplatePlatformRegions = (routeNode: RouteNode) => {
  if (routeNode.type === "connection") return [];
  const count = getPlatformCount(routeNode);
  const width = getNodeWidth(routeNode);
  const height = getNodeHeight(routeNode);
  const isColumnSplit = isVerticalNode(routeNode);
  const reverseOrder =
    routeNode.type !== "crossing" &&
    (getNodeRotation(routeNode) === 90 || getNodeRotation(routeNode) === 180);
  return Array.from({ length: count }).map((_, index) => {
    const displayIndex = reverseOrder ? count - 1 - index : index;
    const x = isColumnSplit ? (width / count) * displayIndex : 0;
    const y = isColumnSplit ? 0 : (height / count) * displayIndex;
    return {
      platform: { nodeId: routeNode.id, index },
      label: getPlatformLabel(routeNode, index),
      rect: {
        x,
        y,
        width: isColumnSplit ? width / count : width,
        height: isColumnSplit ? height : height / count,
      },
    };
  });
};

const getStopTimeGroupPosition = (
  routeNode: RouteNode,
  groupIndex: number,
  groupCount: number,
  rotateButtonPosition: Point
): { x: number; y: number; textAnchor: "start" | "middle" | "end" } => {
  const width = getNodeWidth(routeNode);
  const height = getNodeHeight(routeNode);
  if (isVerticalNode(routeNode)) {
    const placeLeft = rotateButtonPosition.x > width;
    return {
      x: placeLeft ? -28 - groupIndex * 58 : width + 28 + groupIndex * 58,
      y: 20,
      textAnchor: placeLeft ? "end" : "start",
    };
  }
  const placeAbove = rotateButtonPosition.y > height;
  return {
    x: (width / (groupCount + 1)) * (groupIndex + 1),
    y: placeAbove ? -34 : height + 34,
    textAnchor: "middle",
  };
};

const getNodeLayoutInfo = (routeNode: RouteNode): LayoutInfo => {
  const width = getNodeWidth(routeNode);
  const height = getNodeHeight(routeNode);
  if (routeNode.type === "connection") {
    return {
      labelX: 0,
      labelY: 0,
      subLabelY: 0,
      labelOutside: false,
      labelBoxX: 0,
      labelBoxY: 0,
      labelBoxWidth: width,
      labelBoxHeight: height,
    };
  }
  const narrow = width < 70;
  return {
    labelX: narrow ? width + 18 : 14,
    labelY: narrow ? 18 : 19,
    subLabelY: narrow ? 33 : 36,
    labelOutside: narrow,
    labelBoxX: narrow ? width + 8 : 0,
    labelBoxY: narrow ? 0 : 0,
    labelBoxWidth: narrow ? 136 : width,
    labelBoxHeight: narrow ? 42 : height,
  };
};

const getNodeObstacleRects = (routeNode: RouteNode): ObstacleRect[] => {
  if (routeNode.type === "connection") return [];
  const nodeRect = getNodeRect(routeNode);
  const layout = getNodeLayoutInfo(routeNode);
  const rects = [nodeRect];
  if (layout.labelOutside) {
    rects.push({
      id: `${routeNode.id}:label`,
      x: routeNode.x + layout.labelBoxX,
      y: routeNode.y + layout.labelBoxY,
      width: layout.labelBoxWidth,
      height: layout.labelBoxHeight,
    });
  }
  return rects;
};

const rectsIntersect = (a: ObstacleRect, b: ObstacleRect) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const getRectFromPoints = (a: Point, b: Point): ObstacleRect => ({
  id: "selection",
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(a.x - b.x),
  height: Math.abs(a.y - b.y),
});

const getRotateButtonCandidates = (routeNode: RouteNode) => {
  if (routeNode.type === "connection") return [{ x: 0, y: 0 }];
  const width = getNodeWidth(routeNode);
  const height = getNodeHeight(routeNode);
  const offset = rotateButtonRadius + 12;
  return [
    { x: width / 2, y: -offset },
    { x: width / 2, y: height + offset },
    { x: -offset, y: height / 2 },
    { x: width + offset, y: height / 2 },
    { x: -offset, y: -offset / 2 },
    { x: width + offset, y: -offset / 2 },
    { x: -offset, y: height + offset / 2 },
    { x: width + offset, y: height + offset / 2 },
  ];
};

const getRotateButtonRect = (
  routeNode: RouteNode,
  center: Point,
  padding = 4
): ObstacleRect => ({
  id: `${routeNode.id}:rotate`,
  x: routeNode.x + center.x - rotateButtonRadius - padding,
  y: routeNode.y + center.y - rotateButtonRadius - padding,
  width: rotateButtonRadius * 2 + padding * 2,
  height: rotateButtonRadius * 2 + padding * 2,
});

const getNodePortGateKeepoutRects = (
  routeNode: RouteNode,
  allowedSide: RoutePortSide,
  allowedIndex: number,
  padding = routeStubLength + routeClearance
) => {
  if (routeNode.type === "connection") return [];
  const rect = getNodeRect(routeNode);
  const outer = {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
  const outerRight = outer.x + outer.width;
  const outerBottom = outer.y + outer.height;
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  const port = getPortPosition(routeNode, allowedSide, allowedIndex);
  const gateHalf = Math.max(portRadius + 8, portGap / 2 + 2);
  const rects: ObstacleRect[] = [
    {
      id: `${routeNode.id}:keepout:right`,
      x: rectRight,
      y: outer.y,
      width: padding,
      height: outer.height,
    },
    {
      id: `${routeNode.id}:keepout:left`,
      x: outer.x,
      y: outer.y,
      width: padding,
      height: outer.height,
    },
    {
      id: `${routeNode.id}:keepout:top`,
      x: outer.x,
      y: outer.y,
      width: outer.width,
      height: padding,
    },
    {
      id: `${routeNode.id}:keepout:bottom`,
      x: outer.x,
      y: rectBottom,
      width: outer.width,
      height: padding,
    },
  ];

  const gateRects: ObstacleRect[] =
    allowedSide === "left"
      ? [
          {
            id: `${routeNode.id}:keepout:left:upper`,
            x: outer.x,
            y: outer.y,
            width: padding,
            height: port.y - gateHalf - outer.y,
          },
          {
            id: `${routeNode.id}:keepout:left:lower`,
            x: outer.x,
            y: port.y + gateHalf,
            width: padding,
            height: outerBottom - (port.y + gateHalf),
          },
        ]
      : allowedSide === "right"
      ? [
          {
            id: `${routeNode.id}:keepout:right:upper`,
            x: rectRight,
            y: outer.y,
            width: padding,
            height: port.y - gateHalf - outer.y,
          },
          {
            id: `${routeNode.id}:keepout:right:lower`,
            x: rectRight,
            y: port.y + gateHalf,
            width: padding,
            height: outerBottom - (port.y + gateHalf),
          },
        ]
      : allowedSide === "top"
      ? [
          {
            id: `${routeNode.id}:keepout:top:left`,
            x: outer.x,
            y: outer.y,
            width: port.x - gateHalf - outer.x,
            height: padding,
          },
          {
            id: `${routeNode.id}:keepout:top:right`,
            x: port.x + gateHalf,
            y: outer.y,
            width: outerRight - (port.x + gateHalf),
            height: padding,
          },
        ]
      : [
          {
            id: `${routeNode.id}:keepout:bottom:left`,
            x: outer.x,
            y: rectBottom,
            width: port.x - gateHalf - outer.x,
            height: padding,
          },
          {
            id: `${routeNode.id}:keepout:bottom:right`,
            x: port.x + gateHalf,
            y: rectBottom,
            width: outerRight - (port.x + gateHalf),
            height: padding,
          },
        ];

  const filteredBase = rects.filter(
    (candidate) => candidate.id !== `${routeNode.id}:keepout:${allowedSide}`
  );
  return [...filteredBase, ...gateRects].filter(
    (candidate) => candidate.width > 0 && candidate.height > 0
  );
};

const getRouteNodePortRefs = (routeNode: RouteNode): PortRef[] => {
  const sides: RoutePortSide[] =
    routeNode.type === "connection"
      ? ["top", "right", "bottom", "left"]
      : isSingleEndedNode(routeNode)
      ? [getSingleEndedPortSide(routeNode)]
      : routeNode.type === "crossing"
      ? ["top", "right", "bottom", "left"]
      : isVerticalNode(routeNode)
      ? ["top", "bottom"]
      : ["left", "right"];

  return sides.flatMap((side) =>
    Array.from({ length: getPortCountForSide(routeNode, side) }).map(
      (_, index) => ({
        nodeId: routeNode.id,
        side,
        index,
      })
    )
  );
};

const getPortPosition = (
  routeNode: RouteNode,
  side: RoutePortSide,
  index: number
) => {
  const width = getNodeWidth(routeNode);
  const height = getNodeHeight(routeNode);
  if (routeNode.type === "connection") {
    const canonicalSide = getCanonicalConnectionSide(routeNode, side);
    const canonicalIndex =
      routeNode.connectionType === "turnout" && canonicalSide === "left"
        ? 0
        : index;
    const canonicalWidth = getConnectionNodeLongSize(routeNode.connectionType);
    const canonicalHeight = connectionNodeShortSize;
    const centerX = canonicalWidth / 2;
    const centerY = canonicalHeight / 2;
    const offset = (canonicalIndex === 0 ? -1 : 1) * (connectionBranchGap / 2);
    const local =
      canonicalSide === "left"
        ? {
            x: 0,
            y:
              routeNode.connectionType === "turnout"
                ? centerY
                : centerY + offset,
          }
        : {
            x: canonicalWidth,
            y: centerY + offset,
          };
    const rotation = getNodeRotation(routeNode);
    const angle = (rotation * Math.PI) / 180;
    const rotatedX =
      centerX +
      (local.x - centerX) * Math.cos(angle) -
      (local.y - centerY) * Math.sin(angle);
    const rotatedY =
      centerY +
      (local.x - centerX) * Math.sin(angle) +
      (local.y - centerY) * Math.cos(angle);

    return {
      x: routeNode.x + rotatedX + (width - canonicalWidth) / 2,
      y: routeNode.y + rotatedY + (height - canonicalHeight) / 2,
    };
  }
  const count = getPortCountForSide(routeNode, side);
  const clampedIndex = Math.max(0, Math.min(count - 1, index));
  const displayIndex = getVisualPortIndex(routeNode, side, clampedIndex);
  const offset = (displayIndex - (count - 1) / 2) * portGap;
  const centerX = routeNode.x + width / 2;
  const centerY = routeNode.y + height / 2;

  if (side === "top") {
    return {
      x: centerX + offset,
      y: routeNode.y,
    };
  }
  if (side === "bottom") {
    return {
      x: centerX + offset,
      y: routeNode.y + height,
    };
  }

  return {
    x: routeNode.x + (side === "left" ? 0 : width),
    y: centerY + offset,
  };
};

const getConnectionDrawableSegments = (routeNode: RouteNode) => {
  const refs = getRouteNodePortRefs(routeNode);
  const leftRefs = refs
    .filter(
      (portRef) =>
        getCanonicalConnectionSide(routeNode, portRef.side) === "left"
    )
    .sort((a, b) => a.index - b.index);
  const rightRefs = refs
    .filter(
      (portRef) =>
        getCanonicalConnectionSide(routeNode, portRef.side) === "right"
    )
    .sort((a, b) => a.index - b.index);
  const toPoint = (portRef: PortRef) =>
    getPortPosition(routeNode, portRef.side, portRef.index);
  const segmentFromRefs = (fromRef?: PortRef, toRef?: PortRef) =>
    fromRef && toRef ? { from: toPoint(fromRef), to: toPoint(toRef) } : null;

  return getConnectionRoutePairs(routeNode.connectionType)
    .map(([leftIndex, rightIndex]) =>
      segmentFromRefs(leftRefs[leftIndex], rightRefs[rightIndex])
    )
    .filter((segment): segment is { from: Point; to: Point } =>
      Boolean(segment)
    );
};

const getConnectionInternalSegmentsFromPorts = (
  routeNode: RouteNode,
  ports: RouteTimeSectionPort[]
) => {
  if (routeNode.type !== "connection") return [];
  return ports.flatMap((portRef, index) => {
    const nextPortRef = ports[index + 1];
    if (
      !nextPortRef ||
      portRef.nodeId !== routeNode.id ||
      nextPortRef.nodeId !== routeNode.id ||
      !canTraverseConnection(
        routeNode,
        portRef.side,
        portRef.index,
        nextPortRef.side,
        nextPortRef.index
      )
    ) {
      return [];
    }
    return [
      {
        from: getPortPosition(routeNode, portRef.side, portRef.index),
        to: getPortPosition(routeNode, nextPortRef.side, nextPortRef.index),
      },
    ];
  });
};

const getSideVector = (side: RoutePortSide): Point => {
  if (side === "top") return { x: 0, y: -1 };
  if (side === "right") return { x: 1, y: 0 };
  if (side === "bottom") return { x: 0, y: 1 };
  return { x: -1, y: 0 };
};

const moveFromSide = (point: Point, side: RoutePortSide, distance: number) => {
  const vector = getSideVector(side);
  return {
    x: point.x + vector.x * distance,
    y: point.y + vector.y * distance,
  };
};

const getRouteStubLength = (routeNode: RouteNode) =>
  routeNode.type === "connection" ? 0 : routeStubLength;

const pointsEqual = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

const pointListsEqual = (a: Point[], b: Point[]) =>
  a.length === b.length &&
  a.every((point, index) => pointsEqual(point, b[index]));

const compactPoints = (points: Point[]) =>
  points.reduce<Point[]>((result, point) => {
    const last = result[result.length - 1];
    if (last && pointsEqual(last, point)) return result;
    const previous = result[result.length - 2];
    if (
      previous &&
      last &&
      ((previous.x === last.x && last.x === point.x) ||
        (previous.y === last.y && last.y === point.y))
    ) {
      return [...result.slice(0, -1), point];
    }
    return [...result, point];
  }, []);

const pointsToPath = (points: Point[]) => {
  const compacted = compactPoints(points);
  return compacted
    .map((point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
    )
    .join(" ");
};

const getRouteNodePortSides = (routeNode: RouteNode): RoutePortSide[] =>
  routeNode.type === "connection"
    ? ["top", "right", "bottom", "left"].filter(
        (side): side is RoutePortSide =>
          getPortCountForSide(routeNode, side as RoutePortSide) > 0
      )
    : isSingleEndedNode(routeNode)
    ? [getSingleEndedPortSide(routeNode)]
    : routeNode.type === "crossing"
    ? ["top", "right", "bottom", "left"]
    : isVerticalNode(routeNode)
    ? ["top", "bottom"]
    : ["left", "right"];

const getNearestPortSides = (
  fromNode: RouteNode,
  toNode: RouteNode,
  fromPortIndex = 0,
  toPortIndex = 0
) => {
  const fromSides = getRouteNodePortSides(fromNode);
  const toSides = getRouteNodePortSides(toNode);
  return fromSides
    .flatMap((fromSide) =>
      toSides.map((toSide) => {
        const from = getPortPosition(fromNode, fromSide, fromPortIndex);
        const to = getPortPosition(toNode, toSide, toPortIndex);
        const fromStub = moveFromSide(from, fromSide, routeStubLength);
        const toStub = moveFromSide(to, toSide, routeStubLength);
        return {
          fromSide,
          toSide,
          score:
            Math.abs(fromStub.x - toStub.x) + Math.abs(fromStub.y - toStub.y),
        };
      })
    )
    .reduce((best, current) => (current.score < best.score ? current : best));
};

const getNearestAvailablePortRefToPoint = (
  routeNode: RouteNode,
  point: Point,
  occupiedPortKeys: Set<string>,
  excludedPortKey?: string
) => {
  const availablePorts = getRouteNodePortRefs(routeNode).filter(
    (portRef) =>
      getPortKey(portRef.nodeId, portRef.side, portRef.index) !==
        excludedPortKey &&
      !occupiedPortKeys.has(
        getPortKey(portRef.nodeId, portRef.side, portRef.index)
      )
  );
  if (availablePorts.length === 0) return null;
  return availablePorts
    .map((portRef) => {
      const port = getPortPosition(routeNode, portRef.side, portRef.index);
      return {
        ...portRef,
        score: Math.abs(port.x - point.x) + Math.abs(port.y - point.y),
      };
    })
    .reduce((best, current) => (current.score < best.score ? current : best));
};

const findHoveredPort = (
  routeNodes: RouteNode[],
  point: Point,
  threshold = 12
): PortRef | null => {
  const matches = routeNodes.flatMap((routeNode) =>
    getRouteNodePortRefs(routeNode).map((portRef) => {
      const port = getPortPosition(routeNode, portRef.side, portRef.index);
      return {
        ...portRef,
        distance: Math.abs(port.x - point.x) + Math.abs(port.y - point.y),
      };
    })
  );
  const best = matches.reduce(
    (currentBest, current) =>
      current.distance < currentBest.distance ? current : currentBest,
    matches[0]
  );
  return best && best.distance <= threshold ? best : null;
};

const isSideFacingPoint = (side: RoutePortSide, from: Point, to: Point) => {
  const vector = getSideVector(side);
  return (to.x - from.x) * vector.x + (to.y - from.y) * vector.y >= 0;
};

const getSideLane = (
  rect: ObstacleRect,
  side: RoutePortSide,
  offset = routeClearance + routeStubLength
) => {
  if (side === "left") return rect.x - offset;
  if (side === "right") return rect.x + rect.width + offset;
  if (side === "top") return rect.y - offset;
  return rect.y + rect.height + offset;
};

const getIndexedSideLane = (
  routeNode: RouteNode,
  side: RoutePortSide,
  index: number,
  towardPoint: Point,
  offset = routeClearance + routeStubLength
) => {
  const rect = getNodeRect(routeNode);
  const count = getPortCountForSide(routeNode, side);
  const port = getPortPosition(routeNode, side, index);
  const laneStep = layoutGridSize;
  const baseLane = getSideLane(rect, side, offset);
  const direction = side === "left" || side === "top" ? -1 : 1;
  const visualIndex = getVisualPortIndex(routeNode, side, index);
  let rank = 0;

  if (count > 1) {
    if (side === "left" || side === "right") {
      rank = towardPoint.y >= port.y ? count - 1 - visualIndex : visualIndex;
    } else {
      rank = towardPoint.x >= port.x ? count - 1 - visualIndex : visualIndex;
    }
  }

  return baseLane + direction * rank * laneStep;
};

const getSharedSameSideLane = (
  fromNode: RouteNode,
  toNode: RouteNode,
  side: RoutePortSide,
  fromPortIndex: number,
  toPortIndex: number,
  offset = routeClearance + routeStubLength
) => {
  const fromRect = getNodeRect(fromNode);
  const toRect = getNodeRect(toNode);
  const fromPort = getPortPosition(fromNode, side, fromPortIndex);
  const toPort = getPortPosition(toNode, side, toPortIndex);
  const direction = side === "left" || side === "top" ? -1 : 1;
  const fromBaseLane = getSideLane(fromRect, side, offset);
  const toBaseLane = getSideLane(toRect, side, offset);
  const baseLane =
    direction > 0
      ? Math.max(fromBaseLane, toBaseLane)
      : Math.min(fromBaseLane, toBaseLane);
  const anchorVisualIndex =
    side === "left" || side === "right"
      ? fromPort.y <= toPort.y
        ? getVisualPortIndex(fromNode, side, fromPortIndex)
        : getVisualPortIndex(toNode, side, toPortIndex)
      : fromPort.x <= toPort.x
      ? getVisualPortIndex(fromNode, side, fromPortIndex)
      : getVisualPortIndex(toNode, side, toPortIndex);
  const count = Math.max(
    getPortCountForSide(fromNode, side),
    getPortCountForSide(toNode, side)
  );
  const rank = Math.max(0, Math.min(count - 1, count - 1 - anchorVisualIndex));
  return baseLane + direction * rank * layoutGridSize;
};

const getLanePoint = (point: Point, side: RoutePortSide, lane: number): Point =>
  side === "left" || side === "right"
    ? { x: lane, y: point.y }
    : { x: point.x, y: lane };

const findHoveredNode = (routeNodes: RouteNode[], point: Point) =>
  routeNodes.find((routeNode) => {
    const rect = getNodeRect(routeNode);
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }) ?? null;

const getRoutePreviewPath = (
  from: Point,
  to: Point,
  fromSide: RoutePortSide
) => {
  const start = moveFromSide(from, fromSide, routeStubLength);
  const horizontalFirst = Math.abs(to.x - start.x) >= Math.abs(to.y - start.y);
  return pointsToPath(
    horizontalFirst
      ? [from, start, { x: to.x, y: start.y }, to]
      : [from, start, { x: start.x, y: to.y }, to]
  );
};

const inferSideToward = (from: Point, to: Point): RoutePortSide =>
  Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
    ? to.x >= from.x
      ? "right"
      : "left"
    : to.y >= from.y
    ? "bottom"
    : "top";

const rangesOverlap = (
  minA: number,
  maxA: number,
  minB: number,
  maxB: number
) => Math.max(minA, minB) < Math.min(maxA, maxB);

const segmentIntersectsRect = (from: Point, to: Point, rect: ObstacleRect) => {
  if (from.x === to.x) {
    const minY = Math.min(from.y, to.y);
    const maxY = Math.max(from.y, to.y);
    return (
      from.x > rect.x &&
      from.x < rect.x + rect.width &&
      rangesOverlap(minY, maxY, rect.y, rect.y + rect.height)
    );
  }

  if (from.y === to.y) {
    const minX = Math.min(from.x, to.x);
    const maxX = Math.max(from.x, to.x);
    return (
      from.y > rect.y &&
      from.y < rect.y + rect.height &&
      rangesOverlap(minX, maxX, rect.x, rect.x + rect.width)
    );
  }

  return true;
};

const pointInsideRect = (point: Point, rect: ObstacleRect) =>
  point.x > rect.x &&
  point.x < rect.x + rect.width &&
  point.y > rect.y &&
  point.y < rect.y + rect.height;

const canUseOrthogonalSegment = (
  from: Point,
  to: Point,
  obstacles: ObstacleRect[]
) => !obstacles.some((rect) => segmentIntersectsRect(from, to, rect));

const findSingleBendRoute = (
  from: Point,
  to: Point,
  obstacles: ObstacleRect[]
) => {
  const elbows: Point[] = [
    { x: from.x, y: to.y },
    { x: to.x, y: from.y },
  ];

  return (
    elbows.find((elbow) => {
      if (pointsEqual(elbow, from) || pointsEqual(elbow, to)) return false;
      if (obstacles.some((rect) => pointInsideRect(elbow, rect))) return false;
      return (
        canUseOrthogonalSegment(from, elbow, obstacles) &&
        canUseOrthogonalSegment(elbow, to, obstacles)
      );
    }) ?? null
  );
};

const simplifyOrthogonalRoute = (
  points: Point[],
  obstacles: ObstacleRect[]
) => {
  let simplified = compactPoints(points);
  let changed = true;
  let iteration = 0;

  while (changed && iteration < 100) {
    iteration += 1;
    changed = false;

    for (let index = 1; index < simplified.length - 1; index += 1) {
      const previous = simplified[index - 1];
      const next = simplified[index + 1];
      if (
        (previous.x === next.x || previous.y === next.y) &&
        canUseOrthogonalSegment(previous, next, obstacles)
      ) {
        const nextSimplified = compactPoints([
          ...simplified.slice(0, index),
          ...simplified.slice(index + 1),
        ]);
        if (pointListsEqual(nextSimplified, simplified)) continue;
        simplified = nextSimplified;
        changed = true;
        break;
      }
    }

    if (changed) continue;

    for (
      let startIndex = 0;
      startIndex < simplified.length - 2;
      startIndex += 1
    ) {
      let replaced = false;

      for (
        let endIndex = simplified.length - 1;
        endIndex >= startIndex + 2;
        endIndex -= 1
      ) {
        const from = simplified[startIndex];
        const to = simplified[endIndex];

        if (
          (from.x === to.x || from.y === to.y) &&
          canUseOrthogonalSegment(from, to, obstacles)
        ) {
          const nextSimplified = compactPoints([
            ...simplified.slice(0, startIndex + 1),
            ...simplified.slice(endIndex),
          ]);
          if (pointListsEqual(nextSimplified, simplified)) continue;
          simplified = nextSimplified;
          changed = true;
          replaced = true;
          break;
        }

        const elbow = findSingleBendRoute(from, to, obstacles);
        if (!elbow) continue;

        const nextSimplified = compactPoints([
          ...simplified.slice(0, startIndex + 1),
          elbow,
          ...simplified.slice(endIndex),
        ]);
        if (pointListsEqual(nextSimplified, simplified)) continue;
        simplified = nextSimplified;
        changed = true;
        replaced = true;
        break;
      }

      if (replaced) break;
    }
  }

  return simplified;
};

const findOrthogonalRoutePoints = (
  start: Point,
  end: Point,
  obstacles: ObstacleRect[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
) => {
  const xValues = new Set<number>([start.x, end.x, bounds.minX, bounds.maxX]);
  const yValues = new Set<number>([start.y, end.y, bounds.minY, bounds.maxY]);

  obstacles.forEach((rect) => {
    xValues.add(rect.x);
    xValues.add(rect.x + rect.width);
    yValues.add(rect.y);
    yValues.add(rect.y + rect.height);
  });

  const xs = [...xValues].sort((a, b) => a - b);
  const ys = [...yValues].sort((a, b) => a - b);
  const points = xs.flatMap((x) =>
    ys
      .map((y) => ({ x, y }))
      .filter(
        (point) =>
          pointsEqual(point, start) ||
          pointsEqual(point, end) ||
          !obstacles.some((rect) => pointInsideRect(point, rect))
      )
  );

  const pointIndex = new Map(
    points.map((point, index) => [`${point.x}:${point.y}`, index])
  );
  const neighbors = new Map<
    number,
    Array<{ to: number; cost: number; dir: "h" | "v" }>
  >();

  const addNeighbor = (
    fromIndex: number,
    toIndex: number,
    cost: number,
    dir: "h" | "v"
  ) => {
    const entries = neighbors.get(fromIndex) ?? [];
    entries.push({ to: toIndex, cost, dir });
    neighbors.set(fromIndex, entries);
  };

  xs.forEach((x) => {
    const column = ys
      .map((y) => ({ x, y }))
      .filter((point) => pointIndex.has(`${point.x}:${point.y}`))
      .sort((a, b) => a.y - b.y);
    for (let index = 0; index < column.length - 1; index += 1) {
      const from = column[index];
      const to = column[index + 1];
      if (!canUseOrthogonalSegment(from, to, obstacles)) continue;
      const fromIndex = pointIndex.get(`${from.x}:${from.y}`);
      const toIndex = pointIndex.get(`${to.x}:${to.y}`);
      if (fromIndex == null || toIndex == null) continue;
      const cost = Math.abs(to.y - from.y);
      addNeighbor(fromIndex, toIndex, cost, "v");
      addNeighbor(toIndex, fromIndex, cost, "v");
    }
  });

  ys.forEach((y) => {
    const row = xs
      .map((x) => ({ x, y }))
      .filter((point) => pointIndex.has(`${point.x}:${point.y}`))
      .sort((a, b) => a.x - b.x);
    for (let index = 0; index < row.length - 1; index += 1) {
      const from = row[index];
      const to = row[index + 1];
      if (!canUseOrthogonalSegment(from, to, obstacles)) continue;
      const fromIndex = pointIndex.get(`${from.x}:${from.y}`);
      const toIndex = pointIndex.get(`${to.x}:${to.y}`);
      if (fromIndex == null || toIndex == null) continue;
      const cost = Math.abs(to.x - from.x);
      addNeighbor(fromIndex, toIndex, cost, "h");
      addNeighbor(toIndex, fromIndex, cost, "h");
    }
  });

  const startIndex = pointIndex.get(`${start.x}:${start.y}`);
  const endIndex = pointIndex.get(`${end.x}:${end.y}`);
  if (startIndex == null || endIndex == null) return null;

  type SearchState = { index: number; dir: "start" | "h" | "v"; cost: number };
  const queue: SearchState[] = [{ index: startIndex, dir: "start", cost: 0 }];
  const bestCost = new Map<string, number>([[`${startIndex}:start`, 0]]);
  const previous = new Map<
    string,
    { key: string; index: number; dir: "start" | "h" | "v" }
  >();

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (!current) break;
    const currentKey = `${current.index}:${current.dir}`;
    if (current.cost !== bestCost.get(currentKey)) continue;
    if (current.index === endIndex) {
      const path = [points[endIndex]];
      let traceKey = currentKey;
      while (previous.has(traceKey)) {
        const prev = previous.get(traceKey);
        if (!prev) break;
        path.push(points[prev.index]);
        traceKey = prev.key;
      }
      return compactPoints(path.reverse());
    }

    (neighbors.get(current.index) ?? []).forEach((neighbor) => {
      const turnPenalty =
        current.dir !== "start" && current.dir !== neighbor.dir ? 160 : 0;
      const nextCost = current.cost + neighbor.cost + turnPenalty;
      const nextKey = `${neighbor.to}:${neighbor.dir}`;
      if (nextCost >= (bestCost.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        return;
      }
      bestCost.set(nextKey, nextCost);
      previous.set(nextKey, {
        key: currentKey,
        index: current.index,
        dir: current.dir,
      });
      queue.push({
        index: neighbor.to,
        dir: neighbor.dir,
        cost: nextCost,
      });
    });
  }

  return null;
};

const countCollisions = (
  points: Point[],
  obstacles: ObstacleRect[],
  fromNodeId: string,
  toNodeId: string
) => {
  const compacted = compactPoints(points);
  let collisions = 0;
  for (let index = 0; index < compacted.length - 1; index += 1) {
    const from = compacted[index];
    const to = compacted[index + 1];
    obstacles.forEach((rect) => {
      if (index === 0 && rect.id === fromNodeId) return;
      if (index === compacted.length - 2 && rect.id === toNodeId) return;
      if (segmentIntersectsRect(from, to, rect)) collisions += 1;
    });
  }
  return collisions;
};

const getRouteLength = (points: Point[]) =>
  compactPoints(points).reduce((total, point, index, points) => {
    const previous = points[index - 1];
    if (!previous) return total;
    return (
      total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
    );
  }, 0);

const getRouteLabelPoint = (points: Point[]) => {
  const compacted = compactPoints(points);
  const totalLength = getRouteLength(compacted);
  const targetLength = totalLength / 2;
  let currentLength = 0;

  for (let index = 0; index < compacted.length - 1; index += 1) {
    const from = compacted[index];
    const to = compacted[index + 1];
    const segmentLength = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    if (currentLength + segmentLength >= targetLength) {
      const remain = targetLength - currentLength;
      const ratio = segmentLength === 0 ? 0 : remain / segmentLength;
      return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      };
    }
    currentLength += segmentLength;
  }

  return compacted[Math.floor(compacted.length / 2)] ?? { x: 0, y: 0 };
};

const estimateTextWidth = (text: string, fontSize: number) =>
  [...text].reduce(
    (width, character) =>
      width + (character.charCodeAt(0) > 255 ? fontSize : fontSize * 0.6),
    0
  );

const getRoutePathSegments = (
  geometries: RouteEdgeGeometry[],
  sectionId?: string
): RoutePathSegment[] =>
  geometries.flatMap((geometry) => {
    const points = compactPoints(geometry.routePoints);
    return points.flatMap((from, index) => {
      const to = points[index + 1];
      if (!to) return [];
      const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
      return length > 0 ? [{ from, to, length, sectionId }] : [];
    });
  });

const getRouteTimeLabelRect = (
  placement: RouteTimeLabelPlacement,
  padding = 0
): ObstacleRect => ({
  id: "route-time-label",
  x: placement.x - placement.width / 2 - padding,
  y: placement.y - placement.height / 2 - padding,
  width: placement.width + padding * 2,
  height: placement.height + padding * 2,
});

const getParallelSegmentOverlapLength = (
  a: RoutePathSegment,
  b: RoutePathSegment,
  tolerance = 4
) => {
  const aHorizontal = a.from.y === a.to.y;
  const bHorizontal = b.from.y === b.to.y;
  const aVertical = a.from.x === a.to.x;
  const bVertical = b.from.x === b.to.x;

  if (aHorizontal && bHorizontal && Math.abs(a.from.y - b.from.y) <= tolerance) {
    const minA = Math.min(a.from.x, a.to.x);
    const maxA = Math.max(a.from.x, a.to.x);
    const minB = Math.min(b.from.x, b.to.x);
    const maxB = Math.max(b.from.x, b.to.x);
    return Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB));
  }

  if (aVertical && bVertical && Math.abs(a.from.x - b.from.x) <= tolerance) {
    const minA = Math.min(a.from.y, a.to.y);
    const maxA = Math.max(a.from.y, a.to.y);
    const minB = Math.min(b.from.y, b.to.y);
    const maxB = Math.max(b.from.y, b.to.y);
    return Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB));
  }

  return 0;
};

const getSharedSectionCountForSegment = (
  segment: RoutePathSegment,
  sectionId: string,
  allSegments: RoutePathSegment[]
) => {
  const sharedSectionIds = new Set<string>();
  allSegments.forEach((otherSegment) => {
    if (!otherSegment.sectionId || otherSegment.sectionId === sectionId) {
      return;
    }
    if (getParallelSegmentOverlapLength(segment, otherSegment) >= 8) {
      sharedSectionIds.add(otherSegment.sectionId);
    }
  });
  return sharedSectionIds.size;
};

const getRouteTimeLabelPlacement = (
  geometries: RouteEdgeGeometry[],
  text: string,
  sectionKey: string,
  laneIndex: number,
  laneOffset: number,
  sectionId: string,
  allRouteTimeSegments: RoutePathSegment[],
  nodeObstacles: ObstacleRect[],
  placedLabelRects: ObstacleRect[]
) => {
  const segments = getRoutePathSegments(geometries, sectionId);
  const width = Math.max(42, estimateTextWidth(text, 13) + 14);
  const height = 22;
  const laneDirection = laneIndex % 2 === 0 ? -1 : 1;
  const baseHashDirection = hashString(sectionKey) % 2 === 0 ? 1 : -1;
  const candidates = segments.flatMap((segment, segmentIndex) => {
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    const ratios = segment.length >= 180 ? [0.32, 0.5, 0.68] : [0.5];
    let preferredDirection = baseHashDirection;
    if (Math.abs(dx) >= Math.abs(dy) && Math.abs(normal.y) > 0.01) {
      preferredDirection = laneDirection * (normal.y >= 0 ? 1 : -1);
    } else if (Math.abs(normal.x) > 0.01) {
      preferredDirection = laneDirection * (normal.x >= 0 ? 1 : -1);
    }
    const offsets = [
      preferredDirection * 34 + laneOffset,
      -preferredDirection * 34 + laneOffset,
      preferredDirection * 54 + laneOffset,
      -preferredDirection * 54 + laneOffset,
    ].map((offset) =>
      Math.abs(offset) < 26 ? (offset < 0 ? -26 : 26) : offset
    );

    return ratios.flatMap((ratio, ratioIndex) =>
      offsets.map((offset, offsetIndex) => ({
        placement: {
          x: segment.from.x + dx * ratio + normal.x * offset,
          y: segment.from.y + dy * ratio + normal.y * offset,
          width,
          height,
        },
        segment,
        segmentIndex,
        ratioIndex,
        offsetIndex,
      }))
    );
  });

  if (candidates.length === 0) return null;

  const scoredCandidates = candidates.map((candidate) => {
    const labelRect = getRouteTimeLabelRect(candidate.placement, 3);
    const sharedSectionCount = getSharedSectionCountForSegment(
      candidate.segment,
      sectionId,
      allRouteTimeSegments
    );
    const labelCollisions = placedLabelRects.reduce(
      (count, rect) => count + (rectsIntersect(labelRect, rect) ? 1 : 0),
      0
    );
    const nodeCollisions = nodeObstacles.reduce(
      (count, rect) => count + (rectsIntersect(labelRect, rect) ? 1 : 0),
      0
    );
    const routeLineCollisions = allRouteTimeSegments.reduce(
      (count, segment) =>
        count + (segmentIntersectsRect(segment.from, segment.to, labelRect) ? 1 : 0),
      0
    );
    const outOfBounds =
      labelRect.x < 0 ||
      labelRect.y < 0 ||
      labelRect.x + labelRect.width > canvasWidth ||
      labelRect.y + labelRect.height > canvasHeight
        ? 1
        : 0;
    const score =
      sharedSectionCount * 1_000_000 +
      labelCollisions * 250_000 +
      nodeCollisions * 150_000 +
      outOfBounds * 120_000 +
      routeLineCollisions * 1_500 +
      candidate.offsetIndex * 120 +
      candidate.ratioIndex * 20 +
      candidate.segmentIndex -
      candidate.segment.length;
    return { ...candidate, score };
  });

  return scoredCandidates.reduce((best, candidate) =>
    candidate.score < best.score ? candidate : best
  ).placement;
};

const getBendCount = (points: Point[]) => {
  const compacted = compactPoints(points);
  let bends = 0;
  for (let index = 1; index < compacted.length - 1; index += 1) {
    const previous = compacted[index - 1];
    const current = compacted[index];
    const next = compacted[index + 1];
    if (
      (previous.x === current.x && current.y === next.y) ||
      (previous.y === current.y && current.x === next.x)
    ) {
      bends += 1;
    }
  }
  return bends;
};

const scoreRouteCandidate = (
  points: Point[],
  obstacles: ObstacleRect[],
  fromNodeId: string,
  toNodeId: string
) =>
  countCollisions(points, obstacles, fromNodeId, toNodeId) * 1_000_000 +
  getBendCount(points) * 500 +
  getRouteLength(points);

const getSimpleClearRoute = (
  from: Point,
  start: Point,
  end: Point,
  to: Point,
  obstacles: ObstacleRect[],
  fromNodeId: string,
  toNodeId: string
) => {
  const candidates: Point[][] = [
    ...(start.x === end.x || start.y === end.y ? [[from, start, end, to]] : []),
    [from, start, { x: start.x, y: end.y }, end, to],
    [from, start, { x: end.x, y: start.y }, end, to],
  ];
  const clearCandidates = candidates
    .map(compactPoints)
    .filter(
      (candidate) =>
        countCollisions(candidate, obstacles, fromNodeId, toNodeId) === 0
    );

  if (clearCandidates.length === 0) return null;

  return clearCandidates.reduce((best, candidate) =>
    scoreRouteCandidate(candidate, obstacles, fromNodeId, toNodeId) <
    scoreRouteCandidate(best, obstacles, fromNodeId, toNodeId)
      ? candidate
      : best
  );
};

const buildAutoRoutePoints = (
  fromNode: RouteNode,
  toNode: RouteNode,
  fromSide: RoutePortSide,
  toSide: RoutePortSide,
  fromPortIndex: number,
  toPortIndex: number,
  routeNodes: RouteNode[]
) => {
  const from = getPortPosition(fromNode, fromSide, fromPortIndex);
  const to = getPortPosition(toNode, toSide, toPortIndex);
  const start = moveFromSide(from, fromSide, getRouteStubLength(fromNode));
  const end = moveFromSide(to, toSide, getRouteStubLength(toNode));
  const nodeObstacles = routeNodes.flatMap(getNodeObstacleRects);
  const requiresIndexedLanes =
    fromSide === toSide &&
    (getPortCountForSide(fromNode, fromSide) > 1 ||
      getPortCountForSide(toNode, toSide) > 1);
  const simpleClearRoute = getSimpleClearRoute(
    from,
    start,
    end,
    to,
    nodeObstacles,
    fromNode.id,
    toNode.id
  );

  if (simpleClearRoute && !requiresIndexedLanes) return simpleClearRoute;

  const sharedSameSideLane =
    requiresIndexedLanes && fromSide === toSide
      ? getSharedSameSideLane(
          fromNode,
          toNode,
          fromSide,
          fromPortIndex,
          toPortIndex
        )
      : null;
  const fromLane =
    sharedSameSideLane ??
    getIndexedSideLane(fromNode, fromSide, fromPortIndex, to);
  const toLane =
    sharedSameSideLane ??
    getIndexedSideLane(toNode, toSide, toPortIndex, from);
  const laneStart = getLanePoint(start, fromSide, fromLane);
  const laneEnd = getLanePoint(end, toSide, toLane);
  const fromRect = getNodeRect(fromNode);
  const toRect = getNodeRect(toNode);

  const fromCenter = getNodeCenter(fromNode);
  const toCenter = getNodeCenter(toNode);
  const minX = Math.min(fromRect.x, toRect.x) - routeClearance;
  const maxX =
    Math.max(fromRect.x + fromRect.width, toRect.x + toRect.width) +
    routeClearance;
  const minY = Math.min(fromRect.y, toRect.y) - routeClearance;
  const maxY =
    Math.max(fromRect.y + fromRect.height, toRect.y + toRect.height) +
    routeClearance;
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const fromFacing = isSideFacingPoint(fromSide, fromCenter, toCenter);
  const toFacing = isSideFacingPoint(toSide, toCenter, fromCenter);
  const directCandidates: Point[][] = [
    [
      from,
      start,
      laneStart,
      { x: laneEnd.x, y: laneStart.y },
      laneEnd,
      end,
      to,
    ],
    [
      from,
      start,
      laneStart,
      { x: laneStart.x, y: laneEnd.y },
      laneEnd,
      end,
      to,
    ],
    [
      from,
      start,
      laneStart,
      { x: midX, y: laneStart.y },
      { x: midX, y: laneEnd.y },
      laneEnd,
      end,
      to,
    ],
    [
      from,
      start,
      laneStart,
      { x: laneStart.x, y: midY },
      { x: laneEnd.x, y: midY },
      laneEnd,
      end,
      to,
    ],
  ];
  const outerCandidates: Point[][] = [
    [
      from,
      start,
      laneStart,
      { x: minX, y: laneStart.y },
      { x: minX, y: laneEnd.y },
      laneEnd,
      end,
      to,
    ],
    [
      from,
      start,
      laneStart,
      { x: maxX, y: laneStart.y },
      { x: maxX, y: laneEnd.y },
      laneEnd,
      end,
      to,
    ],
    [
      from,
      start,
      laneStart,
      { x: laneStart.x, y: minY },
      { x: laneEnd.x, y: minY },
      laneEnd,
      end,
      to,
    ],
    [
      from,
      start,
      laneStart,
      { x: laneStart.x, y: maxY },
      { x: laneEnd.x, y: maxY },
      laneEnd,
      end,
      to,
    ],
  ];
  const sideAwareCandidates: Point[][] = [];

  if (fromSide === "left" || fromSide === "right") {
    sideAwareCandidates.push([
      from,
      start,
      laneStart,
      { x: fromLane, y: laneEnd.y },
      laneEnd,
      end,
      to,
    ]);
  } else {
    sideAwareCandidates.push([
      from,
      start,
      laneStart,
      { x: laneEnd.x, y: fromLane },
      laneEnd,
      end,
      to,
    ]);
  }

  if (toSide === "left" || toSide === "right") {
    sideAwareCandidates.push([
      from,
      start,
      laneStart,
      { x: toLane, y: laneStart.y },
      laneEnd,
      end,
      to,
    ]);
  } else {
    sideAwareCandidates.push([
      from,
      start,
      laneStart,
      { x: laneStart.x, y: toLane },
      laneEnd,
      end,
      to,
    ]);
  }

  if (
    (fromSide === "left" || fromSide === "right") &&
    (toSide === "top" || toSide === "bottom")
  ) {
    sideAwareCandidates.push([
      from,
      start,
      laneStart,
      { x: fromLane, y: toLane },
      laneEnd,
      end,
      to,
    ]);
  }

  if (
    (fromSide === "top" || fromSide === "bottom") &&
    (toSide === "left" || toSide === "right")
  ) {
    sideAwareCandidates.push([
      from,
      start,
      laneStart,
      { x: toLane, y: fromLane },
      laneEnd,
      end,
      to,
    ]);
  }

  const candidates = [
    ...(!fromFacing || !toFacing ? sideAwareCandidates : []),
    ...directCandidates,
    ...sideAwareCandidates,
    ...outerCandidates,
  ];
  const obstacles = [
    ...routeNodes.flatMap((routeNode) =>
      getNodeObstacleRects(routeNode).map((rect) => ({
        ...rect,
        x: rect.x - 4,
        y: rect.y - 4,
        width: rect.width + 8,
        height: rect.height + 8,
      }))
    ),
    ...getNodePortGateKeepoutRects(fromNode, fromSide, fromPortIndex),
    ...getNodePortGateKeepoutRects(toNode, toSide, toPortIndex),
  ];
  const searchBounds = {
    minX: Math.min(
      minX,
      ...obstacles.map((obstacle) => obstacle.x),
      start.x,
      end.x
    ),
    maxX: Math.max(
      maxX,
      ...obstacles.map((obstacle) => obstacle.x + obstacle.width),
      laneStart.x,
      laneEnd.x,
      start.x,
      end.x
    ),
    minY: Math.min(
      minY,
      ...obstacles.map((obstacle) => obstacle.y),
      start.y,
      end.y
    ),
    maxY: Math.max(
      maxY,
      ...obstacles.map((obstacle) => obstacle.y + obstacle.height),
      laneStart.y,
      laneEnd.y,
      start.y,
      end.y
    ),
  };
  if (canUseOrthogonalSegment(laneStart, laneEnd, obstacles)) {
    return compactPoints([from, start, laneStart, laneEnd, end, to]);
  }

  const singleBendBetweenLanes = findSingleBendRoute(
    laneStart,
    laneEnd,
    obstacles
  );
  if (singleBendBetweenLanes) {
    return compactPoints([
      from,
      start,
      laneStart,
      singleBendBetweenLanes,
      laneEnd,
      end,
      to,
    ]);
  }

  const searchedRoute = findOrthogonalRoutePoints(
    laneStart,
    laneEnd,
    obstacles,
    searchBounds
  );

  if (searchedRoute) {
    return compactPoints([
      from,
      start,
      ...simplifyOrthogonalRoute(searchedRoute, obstacles),
      end,
      to,
    ]);
  }

  return compactPoints(
    simplifyOrthogonalRoute(
      candidates.reduce((best, candidate) =>
        scoreRouteCandidate(candidate, obstacles, fromNode.id, toNode.id) <
        scoreRouteCandidate(best, obstacles, fromNode.id, toNode.id)
          ? candidate
          : best
      ),
      obstacles
    )
  );
};

export const RouteNetworkEditor = ({
  state,
  dispatch,
  selectedTrainRunId,
  selectedRouteTemplateId,
  setSelectedRouteTemplateId,
  routeTemplateEditKey,
  setRouteTemplateEditKey,
}: Props) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const routeMapPanelRef = useRef<HTMLElement>(null);
  const movedRef = useRef(false);
  const routeMapClipboardRef = useRef<RouteMapClipboard | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [selectedBranchEdgeIds, setSelectedBranchEdgeIds] = useState<string[]>(
    []
  );
  const [selectedRouteTimeSectionId, setSelectedRouteTimeSectionId] =
    useState("");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [canvasPanState, setCanvasPanState] = useState<CanvasPanState | null>(
    null
  );
  const [selectionState, setSelectionState] = useState<SelectionState | null>(
    null
  );
  const [connectState, setConnectState] = useState<ConnectState | null>(null);
  const [branchInsertDragState, setBranchInsertDragState] =
    useState<BranchInsertDragState | null>(null);
  const [isRouteTimeMode, setIsRouteTimeMode] = useState(false);
  const [routeTimeDraft, setRouteTimeDraft] = useState<RouteTimeDraft | null>(
    null
  );
  const [routeTimeDraftPast, setRouteTimeDraftPast] = useState<
    Array<RouteTimeDraft | null>
  >([]);
  const [routeTimeDraftFuture, setRouteTimeDraftFuture] = useState<
    Array<RouteTimeDraft | null>
  >([]);
  const [routeTimeMinutes, setRouteTimeMinutes] = useState(0);
  const [selectedRouteTimeSpeedClassIndex, setSelectedRouteTimeSpeedClassIndex] =
    useState(0);
  const [routeTimeMessage, setRouteTimeMessage] = useState("");
  const [isRouteTemplateMode, setIsRouteTemplateMode] = useState(false);
  const [routeTemplatePendingStart, setRouteTemplatePendingStart] =
    useState<RoutePlatformRef | null>(null);
  const [routeTemplateMessage, setRouteTemplateMessage] = useState("");
  const [hoveredRouteTemplatePlatform, setHoveredRouteTemplatePlatform] =
    useState<RoutePlatformRef | null>(null);
  const [canvasViewportHeight, setCanvasViewportHeight] = useState(700);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [newNodeStationId, setNewNodeStationId] = useState("");
  const [newNodeLabel, setNewNodeLabel] = useState("");
  const [newNodeType, setNewNodeType] = useState<RouteNodeType>("station");
  const [newNodePlatformNumber, setNewNodePlatformNumber] = useState("");
  const [newNodePlatformCount, setNewNodePlatformCount] = useState(1);
  const [newNodeVerticalPlatformCount, setNewNodeVerticalPlatformCount] =
    useState(1);

  const selectedTrainRun = state.trainRuns.find(
    (trainRun) => trainRun.id === selectedTrainRunId
  );
  const routeTimeSpeedClassCount = getRouteTimeSpeedClassCount(
    state.routeTimeSections,
    state.routeTimeSpeedClassCount
  );
  const routeTimeSectionsForSelectedSpeed = useMemo(
    () =>
      getRouteTimeSectionsForSpeedClass(
        state.routeTimeSections,
        selectedRouteTimeSpeedClassIndex
      ),
    [selectedRouteTimeSpeedClassIndex, state.routeTimeSections]
  );
  const selectedRouteTemplate = state.routeTemplates.find(
    (routeTemplate) => routeTemplate.id === selectedRouteTemplateId
  );
  const routeTemplateRouteSections =
    selectedRouteTemplate?.[routeTemplateEditKey] ?? [];
  const routeTemplateReachablePlatformKeys = getReachablePlatformKeys(
    state,
    routeTemplateRouteSections,
    routeTemplatePendingStart
  );
  const selectedTrainRouteSections = useMemo(
    () =>
      selectedTrainRun
        ? getSelectedTrainRouteSections(state, selectedTrainRun)
        : [],
    [selectedTrainRun, state]
  );
  const highlightedRouteSections = selectedRouteTemplate
    ? routeTemplateRouteSections
    : selectedTrainRouteSections;
  const selectedNode = state.routeNodes.find(
    (routeNode) => routeNode.id === selectedNodeId
  );
  const selectedRouteTimeSection = routeTimeSectionsForSelectedSpeed.find(
    (section) => section.id === selectedRouteTimeSectionId
  );

  useEffect(() => {
    if (selectedRouteTimeSpeedClassIndex < routeTimeSpeedClassCount) return;
    setSelectedRouteTimeSpeedClassIndex(
      Math.max(0, routeTimeSpeedClassCount - 1)
    );
  }, [routeTimeSpeedClassCount, selectedRouteTimeSpeedClassIndex]);

  useEffect(() => {
    if (
      state.routeTemplates.some(
        (routeTemplate) => routeTemplate.id === selectedRouteTemplateId
      )
    ) {
      return;
    }
    setSelectedRouteTemplateId(state.routeTemplates[0]?.id ?? "");
  }, [
    selectedRouteTemplateId,
    setSelectedRouteTemplateId,
    state.routeTemplates,
  ]);

  useEffect(() => {
    if (
      routeTemplateEditKey === "deadheadRouteSections" &&
      selectedRouteTemplate &&
      !selectedRouteTemplate.deadheadEnabled
    ) {
      setRouteTemplateEditKey("serviceRouteSections");
    }
  }, [routeTemplateEditKey, selectedRouteTemplate, setRouteTemplateEditKey]);

  useEffect(() => {
    setRouteTemplatePendingStart(null);
    setRouteTemplateMessage("");
  }, [selectedRouteTemplateId, routeTemplateEditKey]);

  useEffect(() => {
    setSelectedBranchEdgeIds((current) =>
      current.filter((routeEdgeId) =>
        state.routeEdges.some((routeEdge) => routeEdge.id === routeEdgeId)
      )
    );
  }, [state.routeEdges]);

  const routeNodeById = useMemo(
    () =>
      new Map(state.routeNodes.map((routeNode) => [routeNode.id, routeNode])),
    [state.routeNodes]
  );
  const routeEdgeById = useMemo(
    () =>
      new Map(state.routeEdges.map((routeEdge) => [routeEdge.id, routeEdge])),
    [state.routeEdges]
  );
  const routeEdgeGeometry = useMemo<RouteEdgeGeometry[]>(
    () =>
      state.routeEdges.flatMap((routeEdge) => {
        const fromNode = routeNodeById.get(routeEdge.fromNodeId);
        const toNode = routeNodeById.get(routeEdge.toNodeId);
        if (!fromNode || !toNode) return [];
        const routePoints = buildAutoRoutePoints(
          fromNode,
          toNode,
          routeEdge.fromPortSide,
          routeEdge.toPortSide,
          routeEdge.fromPortIndex,
          routeEdge.toPortIndex,
          state.routeNodes
        );
        return [
          {
            routeEdgeId: routeEdge.id,
            fromNodeId: routeEdge.fromNodeId,
            toNodeId: routeEdge.toNodeId,
            bidirectional: routeEdge.bidirectional,
            travelMinutes: routeEdge.travelMinutes,
            routePoints,
            labelPoint: getRouteLabelPoint(routePoints),
          },
        ];
      }),
    [routeNodeById, state.routeEdges, state.routeNodes]
  );
  const routeEdgeGeometryById = useMemo(
    () =>
      new Map(
        routeEdgeGeometry.map((geometry) => [geometry.routeEdgeId, geometry])
      ),
    [routeEdgeGeometry]
  );
  const selectedBranchEdgeIdSet = useMemo(
    () => new Set(selectedBranchEdgeIds),
    [selectedBranchEdgeIds]
  );
  const rotateButtonPositionByNodeId = useMemo(() => {
    const nodeObstacles = state.routeNodes.flatMap((routeNode) =>
      getNodeObstacleRects(routeNode)
    );

    const getEdgeCollisionCount = (
      routeNodeId: string,
      buttonRect: ObstacleRect
    ) =>
      routeEdgeGeometry.reduce((count, edge) => {
        const intersections = compactPoints(edge.routePoints).reduce(
          (segmentCount, point, index, points) => {
            const nextPoint = points[index + 1];
            if (!nextPoint) return segmentCount;
            return (
              segmentCount +
              (segmentIntersectsRect(point, nextPoint, buttonRect) ? 1 : 0)
            );
          },
          0
        );
        if (edge.fromNodeId === routeNodeId || edge.toNodeId === routeNodeId) {
          return count + intersections * 2;
        }
        return count + intersections;
      }, 0);

    return new Map(
      state.routeNodes.map((routeNode) => {
        const bestCenter = getRotateButtonCandidates(routeNode).reduce(
          (best, center, index) => {
            const buttonRect = getRotateButtonRect(routeNode, center);
            const edgeCollisions = getEdgeCollisionCount(
              routeNode.id,
              buttonRect
            );
            const obstacleCollisions = nodeObstacles.reduce(
              (count, obstacle) =>
                obstacle.id === routeNode.id
                  ? count
                  : count + (rectsIntersect(buttonRect, obstacle) ? 1 : 0),
              0
            );
            const outOfBounds =
              buttonRect.x < 0 ||
              buttonRect.y < 0 ||
              buttonRect.x + buttonRect.width > canvasWidth ||
              buttonRect.y + buttonRect.height > canvasHeight
                ? 1
                : 0;
            const score =
              edgeCollisions * 1_000_000 +
              obstacleCollisions * 10_000 +
              outOfBounds * 1_000 +
              index;
            if (!best || score < best.score) {
              return { center, score };
            }
            return best;
          },
          null as { center: Point; score: number } | null
        );
        return [routeNode.id, bestCenter?.center ?? { x: 0, y: -24 }];
      })
    );
  }, [routeEdgeGeometry, state.routeNodes]);

  const lastStopRouteNodeId =
    selectedTrainRun?.stops[selectedTrainRun.stops.length - 1]?.routeNodeId ??
    "";
  const connectedCandidateIds = useMemo(() => {
    if (!lastStopRouteNodeId) return new Set<string>();
    const ids = new Set<string>();

    type QueueItem = {
      nodeId: string;
      entrySide?: RoutePortSide;
      entryIndex?: number;
      visitedKey: string;
    };
    const queue: QueueItem[] = [
      {
        nodeId: lastStopRouteNodeId,
        visitedKey: lastStopRouteNodeId,
      },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current.visitedKey)) continue;
      visited.add(current.visitedKey);

      const currentNode = routeNodeById.get(current.nodeId);
      if (!currentNode) continue;

      state.routeEdges.forEach((routeEdge) => {
        const endpoint = getRouteEdgeEndpoint(routeEdge, current.nodeId);
        if (!endpoint) return;
        if (
          currentNode.type === "connection" &&
          current.entrySide &&
          !canTraverseConnection(
            currentNode,
            current.entrySide,
            current.entryIndex ?? 0,
            endpoint.side,
            endpoint.index
          )
        ) {
          return;
        }

        const nextNode = routeNodeById.get(endpoint.otherNodeId);
        if (!nextNode) return;
        if (nextNode.type === "connection") {
          queue.push({
            nodeId: nextNode.id,
            entrySide: endpoint.otherSide,
            entryIndex: endpoint.otherIndex,
            visitedKey: `${nextNode.id}:${endpoint.otherSide}:${endpoint.otherIndex}`,
          });
          return;
        }

        if (nextNode.id !== lastStopRouteNodeId) {
          ids.add(nextNode.id);
        }
      });
    }

    return ids;
  }, [lastStopRouteNodeId, routeNodeById, state.routeEdges]);

  const trainRouteGeometries = useMemo(() => {
    const routeSectionIds = highlightedRouteSections.map(
      (section) => section.routeTimeSectionId
    );
    if (routeSectionIds.length === 0) return [];
    const routeEdgeIds = new Set(
      routeSectionIds.flatMap(
        (routeSectionId) =>
          state.routeTimeSections.find(
            (section) => section.id === routeSectionId
          )?.routeEdgeIds ?? []
      )
    );
    return [...routeEdgeIds].flatMap((routeEdgeId) => {
      const geometry = routeEdgeGeometryById.get(routeEdgeId);
      return geometry ? [geometry] : [];
    });
  }, [
    highlightedRouteSections,
    routeEdgeGeometryById,
    state.routeTimeSections,
  ]);

  const trainRouteSegments = useMemo(() => {
    if (!selectedTrainRun) return [];
    if (selectedRouteTemplate) return [];
    if (highlightedRouteSections.length > 0) {
      return [];
    }
    return selectedTrainRun.stops.flatMap((stop, index) => {
      const nextStop = selectedTrainRun.stops[index + 1];
      if (!nextStop) return [];
      const fromNode = routeNodeById.get(stop.routeNodeId);
      const toNode = routeNodeById.get(nextStop.routeNodeId);
      if (!fromNode || !toNode) return [];
      return [{ from: getNodeCenter(fromNode), to: getNodeCenter(toNode) }];
    });
  }, [
    highlightedRouteSections.length,
    routeNodeById,
    selectedRouteTemplate,
    selectedTrainRun,
  ]);

  const stopTimesByRouteNodeId = useMemo(() => {
    const map = new Map<string, Map<number, string[]>>();
    selectedTrainRun?.stops.forEach((stop) => {
      const time = getStopPrimaryTime(stop) || "未入力";
      const platformIndex = Math.max(0, Math.floor(stop.routePortIndex ?? 0));
      const platformMap =
        map.get(stop.routeNodeId) ?? new Map<number, string[]>();
      const values = platformMap.get(platformIndex) ?? [];
      values.push(time);
      platformMap.set(platformIndex, values);
      map.set(stop.routeNodeId, platformMap);
    });
    return map;
  }, [selectedTrainRun]);
  const routeTimeLabelPlacementById = useMemo(() => {
    const sectionGeometriesById = new Map<string, RouteEdgeGeometry[]>();
    routeTimeSectionsForSelectedSpeed.forEach((section) => {
      sectionGeometriesById.set(
        section.id,
        section.routeEdgeIds.flatMap((routeEdgeId) => {
          const geometry = routeEdgeGeometryById.get(routeEdgeId);
          return geometry ? [geometry] : [];
        })
      );
    });
    const allRouteTimeSegments = routeTimeSectionsForSelectedSpeed.flatMap(
      (section) =>
        getRoutePathSegments(sectionGeometriesById.get(section.id) ?? [], section.id)
    );
    const nodeObstacles = state.routeNodes.flatMap(getNodeObstacleRects);
    const placedLabelRects: ObstacleRect[] = [];
    const placementById = new Map<string, RouteTimeLabelPlacement>();

    routeTimeSectionsForSelectedSpeed.forEach((section) => {
      if (section.travelMinutes <= 0) return;
      const placement = getRouteTimeLabelPlacement(
        sectionGeometriesById.get(section.id) ?? [],
        `${section.travelMinutes}分`,
        getRouteTimeSectionNodePairKey(section),
        section.startPortIndex,
        0,
        section.id,
        allRouteTimeSegments,
        nodeObstacles,
        placedLabelRects
      );
      if (!placement) return;
      placementById.set(section.id, placement);
      placedLabelRects.push({
        ...getRouteTimeLabelRect(placement, 6),
        id: `route-time-label:${section.id}`,
      });
    });

    return placementById;
  }, [routeEdgeGeometryById, routeTimeSectionsForSelectedSpeed, state.routeNodes]);
  const activeSelectedNodeIds =
    selectedNodeIds.size > 0
      ? [...selectedNodeIds]
      : selectedNodeId
      ? [selectedNodeId]
      : [];
  const routeTimeDraftEndpointCount =
    routeTimeDraft?.ports.filter((portRef) => {
      const routeNode = routeNodeById.get(portRef.nodeId);
      return routeNode && routeNode.type !== "connection";
    }).length ?? 0;
  const routeTimeDraftComplete =
    Boolean(routeTimeDraft) &&
    routeTimeDraftEndpointCount === 2 &&
    (routeTimeDraft?.routeEdgeIds.length ?? 0) > 0;
  const routeTimeDraftDuplicate =
    routeTimeDraftComplete &&
    state.routeTimeSections.some(
      (section) =>
        getRouteEdgeSetKey(section.routeEdgeIds) ===
        getRouteEdgeSetKey(routeTimeDraft?.routeEdgeIds ?? [])
    );

  const getSvgPoint = (event: MouseEvent<Element>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  const getNearestRouteEdgeSegment = (routePoints: Point[], point: Point) => {
    const points = compactPoints(routePoints);
    const totalLength = Math.max(1, getRouteLength(points));
    let lengthBefore = 0;
    let best: {
      from: Point;
      to: Point;
      projected: Point;
      ratioOnSegment: number;
      totalRatio: number;
      distance: number;
    } | null = null;

    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const segmentLength = Math.abs(dx) + Math.abs(dy);
      if (segmentLength === 0) continue;
      const rawRatio =
        Math.abs(dx) >= Math.abs(dy)
          ? (point.x - from.x) / dx
          : (point.y - from.y) / dy;
      const ratioOnSegment = Math.max(0, Math.min(1, rawRatio));
      const projected = {
        x: from.x + dx * ratioOnSegment,
        y: from.y + dy * ratioOnSegment,
      };
      const distance =
        (point.x - projected.x) ** 2 + (point.y - projected.y) ** 2;
      const totalRatio = Math.max(
        0,
        Math.min(
          1,
          (lengthBefore + segmentLength * ratioOnSegment) / totalLength
        )
      );
      if (!best || distance < best.distance) {
        best = {
          from,
          to,
          projected,
          ratioOnSegment,
          totalRatio,
          distance,
        };
      }
      lengthBefore += segmentLength;
    }

    return best;
  };

  const getConnectionRotationForSegment = (from: Point, to: Point) =>
    Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 0 : 90;

  const getConnectionTrackIndexForPoint = (
    rotation: number,
    projected: Point,
    point: Point
  ) =>
    rotation === 90 || rotation === 270
      ? point.x >= projected.x
        ? 1
        : 0
      : point.y >= projected.y
      ? 0
      : 1;

  const getConnectionTrackIndexesForParallelEdges = (
    rotation: number,
    primaryProjected: Point,
    secondaryProjected: Point
  ) => {
    if (rotation === 90 || rotation === 270) {
      const primaryIndex = primaryProjected.x >= secondaryProjected.x ? 0 : 1;
      return {
        primaryIndex,
        secondaryIndex: primaryIndex === 0 ? 1 : 0,
      };
    }
    const primaryIndex = primaryProjected.y <= secondaryProjected.y ? 0 : 1;
    return {
      primaryIndex,
      secondaryIndex: primaryIndex === 0 ? 1 : 0,
    };
  };

  const getDefaultSingleEdgeConnectionType = (
    trackIndex: number
  ): ConnectionType => (trackIndex === 0 ? "passing12" : "passing21");

  const getConnectionSplitPorts = (
    connectionType: ConnectionType,
    rotation: number,
    segment: { from: Point; to: Point },
    trackIndex: number
  ) => {
    const isVertical = rotation === 90 || rotation === 270;
    const forward = isVertical
      ? segment.to.y >= segment.from.y
      : segment.to.x >= segment.from.x;
    const entryCanonicalSide: RoutePortSide = forward ? "left" : "right";
    const exitCanonicalSide: RoutePortSide = forward ? "right" : "left";
    const getPortIndex = (canonicalSide: RoutePortSide) =>
      connectionType === "turnout" && canonicalSide === "left" ? 0 : trackIndex;

    return {
      entryPortSide: getActualConnectionSide(entryCanonicalSide, rotation),
      entryPortIndex: getPortIndex(entryCanonicalSide),
      exitPortSide: getActualConnectionSide(exitCanonicalSide, rotation),
      exitPortIndex: getPortIndex(exitCanonicalSide),
    };
  };

  const getConnectionNodePositionForSplit = (
    connectionType: ConnectionType,
    rotation: number,
    splitPorts: ReturnType<typeof getConnectionSplitPorts>,
    projected: Point
  ) => {
    const draftNode: RouteNode = {
      id: "draft-connection",
      stationId: "",
      label: "",
      type: "connection",
      x: 0,
      y: 0,
      rotation,
      platformNumber: "",
      platformCount: 1,
      platformLabels: ["1"],
      verticalPlatformCount: 1,
      verticalPlatformLabels: ["1"],
      durationMinutes: 0,
      connectionType,
    };
    const entry = getPortPosition(
      draftNode,
      splitPorts.entryPortSide,
      splitPorts.entryPortIndex
    );
    const exit = getPortPosition(
      draftNode,
      splitPorts.exitPortSide,
      splitPorts.exitPortIndex
    );
    return snapPointToGrid({
      x: projected.x - (entry.x + exit.x) / 2,
      y: projected.y - (entry.y + exit.y) / 2,
    });
  };

  const getConnectionInsertPlan = (
    placementPoint: Point,
    directionPoint: Point,
    geometry: RouteEdgeGeometry,
    edgeIdsOverride?: string[]
  ): ConnectionInsertPlan | null => {
    const selectableEdgeIds = selectedBranchEdgeIds.filter((routeEdgeId) =>
      routeEdgeGeometryById.has(routeEdgeId)
    );
    const edgeIds =
      edgeIdsOverride ??
      (selectableEdgeIds.length > 0
        ? selectableEdgeIds
        : [geometry.routeEdgeId]);
    const primaryEdgeId = edgeIds[0];
    const primaryGeometry = routeEdgeGeometryById.get(primaryEdgeId);
    if (!primaryGeometry) return null;
    const primarySegment = getNearestRouteEdgeSegment(
      primaryGeometry.routePoints,
      placementPoint
    );
    if (!primarySegment) return null;

    const secondaryEdgeId = edgeIds[1];
    const secondaryGeometry = secondaryEdgeId
      ? routeEdgeGeometryById.get(secondaryEdgeId)
      : null;
    const secondarySegment = secondaryGeometry
      ? getNearestRouteEdgeSegment(
          secondaryGeometry.routePoints,
          primarySegment.projected
        )
      : null;
    const rotation = getConnectionRotationForSegment(
      primarySegment.from,
      primarySegment.to
    );
    const trackIndexes =
      secondarySegment && secondaryGeometry
        ? getConnectionTrackIndexesForParallelEdges(
            rotation,
            primarySegment.projected,
            secondarySegment.projected
          )
        : {
            primaryIndex: getConnectionTrackIndexForPoint(
              rotation,
              primarySegment.projected,
              directionPoint
            ),
            secondaryIndex: 1,
          };
    const connectionType: ConnectionType =
      secondaryGeometry && secondarySegment
        ? "singleCrossoverZ"
        : getDefaultSingleEdgeConnectionType(trackIndexes.primaryIndex);
    const primarySplitPorts = getConnectionSplitPorts(
      connectionType,
      rotation,
      primarySegment,
      trackIndexes.primaryIndex
    );
    const position = getConnectionNodePositionForSplit(
      connectionType,
      rotation,
      primarySplitPorts,
      primarySegment.projected
    );
    const primaryRouteEdge = routeEdgeById.get(primaryEdgeId);
    const secondaryRouteEdge = secondaryEdgeId
      ? routeEdgeById.get(secondaryEdgeId)
      : null;
    if (!primaryRouteEdge) return null;

    const splits = [
      {
        routeEdgeId: primaryRouteEdge.id,
        ...primarySplitPorts,
        splitRatio: primarySegment.totalRatio,
      },
      ...(secondaryRouteEdge && secondarySegment
        ? [
            {
              routeEdgeId: secondaryRouteEdge.id,
              ...getConnectionSplitPorts(
                connectionType,
                rotation,
                secondarySegment,
                trackIndexes.secondaryIndex
              ),
              splitRatio: secondarySegment.totalRatio,
            },
          ]
        : []),
    ];

    return {
      x: position.x,
      y: position.y,
      rotation,
      connectionType,
      splits,
    };
  };

  const commitConnectionInsertPlan = (plan: ConnectionInsertPlan) => {
    const nodeId = createId("rc");

    dispatch({
      type: "insertConnectionNodeOnRouteEdges",
      payload: {
        nodeId,
        x: plan.x,
        y: plan.y,
        rotation: plan.rotation,
        connectionType: plan.connectionType,
        splits: plan.splits.map((split) => ({
          ...split,
          firstRouteEdgeId: createId("re"),
          secondRouteEdgeId: createId("re"),
        })),
      },
    });
    setSelectedNodeId(nodeId);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedEdgeId("");
    setSelectedRouteTimeSectionId("");
    setSelectedBranchEdgeIds([]);
  };

  const insertConnectionNodeOnSelectedRouteEdges = (
    point: Point,
    geometry: RouteEdgeGeometry
  ) => {
    const plan = getConnectionInsertPlan(point, point, geometry);
    if (!plan) return;
    commitConnectionInsertPlan(plan);
  };

  const selectBranchEdgeForInsertion = (routeEdgeId: string) => {
    setSelectedBranchEdgeIds((current) => {
      if (current.includes(routeEdgeId)) {
        return current.filter((selectedId) => selectedId !== routeEdgeId);
      }
      return [...current, routeEdgeId].slice(-2);
    });
    setSelectedNodeId("");
    setSelectedNodeIds(new Set());
    setSelectedEdgeId("");
    setSelectedRouteTimeSectionId("");
  };

  const addConnectionNodeAt = (point: Point) => {
    const nodeId = createId("rc");
    const position = snapPointToGrid({
      x: point.x - connectionNodeLongSize / 2,
      y: point.y - connectionNodeShortSize / 2,
    });
    dispatch({
      type: "addRouteNode",
      payload: {
        id: nodeId,
        stationId: "",
        label: "",
        nodeType: "connection",
        x: position.x,
        y: position.y,
        platformNumber: "",
        platformCount: 1,
        verticalPlatformCount: 1,
        durationMinutes: 0,
        connectionType: "passing12",
      },
    });
    setSelectedNodeId(nodeId);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedEdgeId("");
    setSelectedRouteTimeSectionId("");
    setSelectedBranchEdgeIds([]);
  };

  const maybeHandleBranchEdgeMouseDown = (
    event: MouseEvent<Element>,
    geometry?: RouteEdgeGeometry
  ) => {
    if (isRouteTimeMode || isRouteTemplateMode) return false;
    if (!event.shiftKey || event.button !== 0) return false;
    event.preventDefault();
    event.stopPropagation();
    movedRef.current = true;

    if (event.ctrlKey) {
      if (geometry) {
        const point = getSvgPoint(event);
        const insertionEdgeIds = selectedBranchEdgeIds.filter((routeEdgeId) =>
          routeEdgeGeometryById.has(routeEdgeId)
        );
        const edgeIds =
          insertionEdgeIds.length > 0
            ? insertionEdgeIds
            : [geometry.routeEdgeId];
        if (edgeIds.length === 1) {
          setBranchInsertDragState({
            routeEdgeId: edgeIds[0],
            placementPoint: point,
            currentPoint: point,
          });
          setDragState(null);
          setSelectionState(null);
          setConnectState(null);
        } else {
          insertConnectionNodeOnSelectedRouteEdges(point, geometry);
        }
      } else {
        addConnectionNodeAt(getSvgPoint(event));
      }
      return true;
    }

    if (geometry) selectBranchEdgeForInsertion(geometry.routeEdgeId);
    return true;
  };

  const maybeAddConnectionNode = (
    event: MouseEvent<Element>,
    geometry?: RouteEdgeGeometry
  ) => {
    if (!event.ctrlKey || !event.shiftKey || event.button !== 0) return false;
    return maybeHandleBranchEdgeMouseDown(event, geometry);
  };

  const maybeCycleConnectionNode = (
    event: MouseEvent<Element>,
    routeNode: RouteNode
  ) => {
    if (
      routeNode.type !== "connection" ||
      !event.ctrlKey ||
      !event.shiftKey ||
      event.button !== 0
    ) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    movedRef.current = true;
    const connectedRouteEdgeCount = state.routeEdges.filter(
      (routeEdge) =>
        routeEdge.fromNodeId === routeNode.id ||
        routeEdge.toNodeId === routeNode.id
    ).length;
    dispatch({
      type: "updateRouteNode",
      payload: {
        id: routeNode.id,
        connectionType: getNextConnectionType(
          routeNode.connectionType,
          Math.max(
            selectedBranchEdgeIds.length,
            connectedRouteEdgeCount >= 4 ? 2 : 1
          )
        ),
      },
    });
    setSelectedNodeId(routeNode.id);
    setSelectedNodeIds(new Set([routeNode.id]));
    return true;
  };

  const maybeFlipConnectionNode = (
    event: MouseEvent<Element>,
    routeNode: RouteNode
  ) => {
    if (routeNode.type !== "connection" || !event.ctrlKey || !event.shiftKey) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    const update = getFlippedConnectionUpdate(routeNode);
    if (Object.keys(update).length > 0) {
      dispatch({
        type: "updateRouteNode",
        payload: {
          id: routeNode.id,
          ...update,
        },
      });
    }
    setSelectedNodeId(routeNode.id);
    setSelectedNodeIds(new Set([routeNode.id]));
    return true;
  };

  const getCanvasViewportCenter = () => {
    const viewport = canvasViewportRef.current;
    if (!viewport) {
      return {
        x: 120 + state.routeNodes.length * 24,
        y: 120 + state.routeNodes.length * 18,
      };
    }
    return {
      x: (viewport.scrollLeft + viewport.clientWidth / 2) / canvasZoom,
      y: (viewport.scrollTop + viewport.clientHeight / 2) / canvasZoom,
    };
  };

  const addRouteNode = () => {
    const label =
      newNodeLabel.trim() ||
      (newNodeStationId
        ? getStationName(state.stations, newNodeStationId)
        : "");
    const nodeId = createId("rn");
    const draftNode: RouteNode = {
      id: nodeId,
      stationId: newNodeStationId,
      label,
      type: newNodeType,
      x: 0,
      y: 0,
      rotation: 0,
      platformNumber: newNodePlatformNumber,
      platformCount: newNodePlatformCount,
      platformLabels: [],
      verticalPlatformCount: newNodeVerticalPlatformCount,
      verticalPlatformLabels: [],
      durationMinutes: 0,
      connectionType: "passing12",
    };
    const viewportCenter = getCanvasViewportCenter();
    const position = snapNodePosition(draftNode, {
      x: viewportCenter.x - getNodeWidth(draftNode) / 2,
      y: viewportCenter.y - getNodeHeight(draftNode) / 2,
    });
    dispatch({
      type: "addRouteNode",
      payload: {
        id: nodeId,
        stationId: newNodeStationId,
        label,
        nodeType: newNodeType,
        x: position.x,
        y: position.y,
        platformNumber: newNodePlatformNumber,
        platformCount: newNodePlatformCount,
        verticalPlatformCount: newNodeVerticalPlatformCount,
        durationMinutes: 0,
        connectionType: "passing12",
      },
    });
    setNewNodeLabel("");
    setNewNodePlatformNumber("");
    setNewNodePlatformCount(1);
    setNewNodeVerticalPlatformCount(1);
    setSelectedNodeId(nodeId);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedEdgeId("");
    setSelectedRouteTimeSectionId("");
  };

  const deleteSelection = () => {
    if (activeSelectedNodeIds.length > 0) {
      const deletedNodeIds = new Set(activeSelectedNodeIds);
      dispatch({
        type: "changeFullState",
        payload: {
          state: {
            ...state,
            routeNodes: state.routeNodes.filter(
              (routeNode) => !deletedNodeIds.has(routeNode.id)
            ),
            routeEdges: state.routeEdges.filter(
              (routeEdge) =>
                !deletedNodeIds.has(routeEdge.fromNodeId) &&
                !deletedNodeIds.has(routeEdge.toNodeId)
            ),
            routeTimeSections: state.routeTimeSections.filter(
              (section) =>
                !deletedNodeIds.has(section.startNodeId) &&
                !deletedNodeIds.has(section.endNodeId) &&
                section.routeEdgeIds.every((routeEdgeId) => {
                  const routeEdge = state.routeEdges.find(
                    (edge) => edge.id === routeEdgeId
                  );
                  return (
                    routeEdge &&
                    !deletedNodeIds.has(routeEdge.fromNodeId) &&
                    !deletedNodeIds.has(routeEdge.toNodeId)
                  );
                })
            ),
            trainRuns: state.trainRuns.map((trainRun) => ({
              ...trainRun,
              serviceRouteNodeIds: trainRun.serviceRouteNodeIds.filter(
                (routeNodeId) => !deletedNodeIds.has(routeNodeId)
              ),
              deadheadRouteNodeIds: trainRun.deadheadRouteNodeIds.filter(
                (routeNodeId) => !deletedNodeIds.has(routeNodeId)
              ),
              stopSettings: trainRun.stopSettings.filter(
                (setting) => !deletedNodeIds.has(setting.routeNodeId)
              ),
              deadheadStopSettings: (
                trainRun.deadheadStopSettings ?? []
              ).filter((setting) => !deletedNodeIds.has(setting.routeNodeId)),
              stops: trainRun.stops.filter(
                (stop) => !deletedNodeIds.has(stop.routeNodeId)
              ),
            })),
          },
        },
      });
      setSelectedNodeId("");
      setSelectedNodeIds(new Set());
      setSelectedEdgeId("");
      setConnectState(null);
      return;
    }

    if (selectedEdgeId) {
      dispatch({
        type: "removeRouteEdge",
        payload: { id: selectedEdgeId },
      });
      setSelectedEdgeId("");
    }
  };

  const copySelectedNodes = () => {
    if (activeSelectedNodeIds.length === 0) return;
    const selectedNodeIdSet = new Set(activeSelectedNodeIds);
    routeMapClipboardRef.current = {
      routeNodes: state.routeNodes
        .filter((routeNode) => selectedNodeIdSet.has(routeNode.id))
        .map((routeNode) => ({ ...routeNode })),
      routeEdges: state.routeEdges
        .filter(
          (routeEdge) =>
            selectedNodeIdSet.has(routeEdge.fromNodeId) &&
            selectedNodeIdSet.has(routeEdge.toNodeId)
        )
        .map((routeEdge) => ({ ...routeEdge })),
    };
  };

  const pasteCopiedNodes = () => {
    const clipboard = routeMapClipboardRef.current;
    if (!clipboard || clipboard.routeNodes.length === 0) return;
    const nodeIdMap = new Map(
      clipboard.routeNodes.map((routeNode) => [routeNode.id, createId("rn")])
    );
    const pastedNodes = clipboard.routeNodes.map((routeNode) => {
      const id = nodeIdMap.get(routeNode.id) ?? createId("rn");
      const draft = {
        ...routeNode,
        id,
        x: routeNode.x + layoutGridSize * 4,
        y: routeNode.y + layoutGridSize * 4,
      };
      const position = snapNodePosition(draft, draft);
      return {
        ...draft,
        x: position.x,
        y: position.y,
      };
    });
    const pastedEdges = clipboard.routeEdges.flatMap((routeEdge) => {
      const fromNodeId = nodeIdMap.get(routeEdge.fromNodeId);
      const toNodeId = nodeIdMap.get(routeEdge.toNodeId);
      if (!fromNodeId || !toNodeId) return [];
      return [
        {
          ...routeEdge,
          id: createId("re"),
          fromNodeId,
          toNodeId,
        },
      ];
    });

    dispatch({
      type: "changeFullState",
      payload: {
        state: {
          ...state,
          routeNodes: [...state.routeNodes, ...pastedNodes],
          routeEdges: [...state.routeEdges, ...pastedEdges],
        },
      },
    });
    routeMapClipboardRef.current = {
      routeNodes: pastedNodes,
      routeEdges: pastedEdges,
    };
    setSelectedNodeIds(new Set(pastedNodes.map((routeNode) => routeNode.id)));
    setSelectedNodeId(pastedNodes[0]?.id ?? "");
    setSelectedEdgeId("");
  };

  const clearRouteTimeDraft = () => {
    setRouteTimeDraftPast((past) =>
      routeTimeDraft ? [...past, routeTimeDraft] : past
    );
    setRouteTimeDraftFuture([]);
    setRouteTimeDraft(null);
    setRouteTimeMessage("");
  };

  const setRouteTimeDraftWithHistory = (nextDraft: RouteTimeDraft | null) => {
    setRouteTimeDraftPast((past) => [...past, routeTimeDraft]);
    setRouteTimeDraftFuture([]);
    setRouteTimeDraft(nextDraft);
  };

  const undoRouteTimeDraft = () => {
    setRouteTimeDraftPast((past) => {
      if (past.length === 0) return past;
      const previousDraft = past[past.length - 1];
      setRouteTimeDraftFuture((future) => [routeTimeDraft, ...future]);
      setRouteTimeDraft(previousDraft);
      return past.slice(0, -1);
    });
  };

  const redoRouteTimeDraft = () => {
    setRouteTimeDraftFuture((future) => {
      const nextDraft = future[0];
      if (nextDraft === undefined) return future;
      setRouteTimeDraftPast((past) => [...past, routeTimeDraft]);
      setRouteTimeDraft(nextDraft);
      return future.slice(1);
    });
  };

  const selectRouteTimePort = (portRef: PortRef) => {
    const routeNode = routeNodeById.get(portRef.nodeId);
    if (!routeNode) return;
    if (!routeTimeDraft || routeTimeDraftComplete) {
      if (routeNode.type === "connection") {
        setRouteTimeMessage("開始点は分岐以外の接続点を選択してください。");
        return;
      }
      setRouteTimeDraftWithHistory({ ports: [portRef], routeEdgeIds: [] });
      setSelectedRouteTimeSectionId("");
      setRouteTimeMessage("終点または中継する分岐の接続点を選択してください。");
      return;
    }

    const currentPort = routeTimeDraft.ports[routeTimeDraft.ports.length - 1];
    const segment = findRouteTimePath(
      currentPort,
      portRef,
      state.routeEdges,
      routeNodeById
    );
    if (!segment) {
      setRouteTimeMessage("選択した接続点まで到達できる経路がありません。");
      return;
    }

    const nextDraft = {
      ports: [...routeTimeDraft.ports, ...segment.ports.slice(1)],
      routeEdgeIds: [...routeTimeDraft.routeEdgeIds, ...segment.routeEdgeIds],
    };
    const endpointCount = nextDraft.ports.filter((draftPortRef) => {
      const draftNode = routeNodeById.get(draftPortRef.nodeId);
      return draftNode && draftNode.type !== "connection";
    }).length;
    if (endpointCount > 2) {
      setRouteTimeMessage("所要時間区間の接続点は開始と終端の2つだけです。");
      return;
    }

    setRouteTimeDraftWithHistory(nextDraft);
    setRouteTimeMessage(
      endpointCount === 2
        ? "対象経路が完成しました。所要時間を入力して保存してください。"
        : "中継する分岐、または終点の接続点を選択してください。"
    );
  };

  const saveRouteTimeDraft = () => {
    if (!routeTimeDraft || !routeTimeDraftComplete || routeTimeDraftDuplicate) {
      return;
    }
    const startPort = routeTimeDraft.ports[0];
    const endPort = routeTimeDraft.ports[routeTimeDraft.ports.length - 1];
    const routeTimeSectionId = createId("rts");
    dispatch({
      type: "addRouteTimeSection",
      payload: {
        id: routeTimeSectionId,
        startNodeId: startPort.nodeId,
        startPortSide: startPort.side,
        startPortIndex: startPort.index,
        endNodeId: endPort.nodeId,
        endPortSide: endPort.side,
        endPortIndex: endPort.index,
        routeEdgeIds: routeTimeDraft.routeEdgeIds,
        routePorts: routeTimeDraft.ports,
        travelMinutes: routeTimeMinutes,
        speedClassIndex: selectedRouteTimeSpeedClassIndex,
      },
    });
    setSelectedRouteTimeSectionId(routeTimeSectionId);
    setRouteTimeDraft(null);
    setRouteTimeDraftPast([]);
    setRouteTimeDraftFuture([]);
    setRouteTimeMessage("所要時間区間を保存しました。");
  };

  const updateRouteTimeSectionBreakpoint = (
    section: State["routeTimeSections"][number],
    breakpointIndex: number,
    value: number
  ) => {
    const resolvedSegments = resolveRouteTimeSectionSegments(
      routeTimeSectionsForSelectedSpeed,
      section,
      state.routeNodes
    );
    const displaySegmentMinutes = getRouteTimeSectionDisplaySegmentMinutes(
      section,
      resolvedSegments.segmentMinutes
    );
    const breakpoints = getRouteTimeSectionBreakpoints(displaySegmentMinutes);
    const min = breakpointIndex === 0 ? 0 : breakpoints[breakpointIndex - 1];
    const max =
      breakpointIndex === breakpoints.length - 1
        ? section.travelMinutes
        : breakpoints[breakpointIndex + 1];
    breakpoints[breakpointIndex] = Math.max(
      min,
      Math.min(max, Math.floor(value))
    );
    const displaySegmentMinutesNext = breakpoints.reduce<number[]>(
      (segments, breakpoint, index) => {
        const previous = index === 0 ? 0 : breakpoints[index - 1];
        return [...segments, breakpoint - previous];
      },
      []
    );
    displaySegmentMinutesNext.push(
      section.travelMinutes - (breakpoints[breakpoints.length - 1] ?? 0)
    );
    dispatch({
      type: "updateRouteTimeSection",
      payload: {
        id: section.id,
        speedClassIndex: selectedRouteTimeSpeedClassIndex,
        segmentMinutes: getRouteTimeSectionStoredSegmentMinutes(
          section,
          displaySegmentMinutesNext
        ),
      },
    });
  };

  const updateSelectedRouteTemplateRoute = (
    routeSections: TrainRunRouteSection[]
  ) => {
    if (!selectedRouteTemplate) return;
    dispatch({
      type: "updateRouteTemplate",
      payload:
        routeTemplateEditKey === "serviceRouteSections"
          ? {
              id: selectedRouteTemplate.id,
              serviceRouteSections: routeSections,
            }
          : {
              id: selectedRouteTemplate.id,
              deadheadRouteSections: routeSections,
            },
    });
  };

  const selectRouteTemplatePlatform = (platform: RoutePlatformRef) => {
    if (!selectedRouteTemplate) {
      setRouteTemplateMessage("経路セットを選択してください。");
      return;
    }

    const routeSections = selectedRouteTemplate[routeTemplateEditKey];
    if (routeSections.length === 0 && !routeTemplatePendingStart) {
      setRouteTemplatePendingStart(platform);
      setRouteTemplateMessage("次の駅または車庫の番線を選択してください。");
      return;
    }

    const options =
      routeSections.length === 0 && routeTemplatePendingStart
        ? getRouteSectionOptionsFromPlatform(state, routeTemplatePendingStart)
        : getRouteSectionOptions(state, routeSections);
    const routeSection = options.find((option) =>
      routeSectionEndsAtPlatform(state, option, platform)
    );
    if (!routeSection) {
      setRouteTemplateMessage("選択した番線へ続く所要時間区間がありません。");
      return;
    }

    updateSelectedRouteTemplateRoute([...routeSections, routeSection]);
    setRouteTemplatePendingStart(null);
    setRouteTemplateMessage("経路を追加しました。");
  };

  const clearSelectedRouteTemplateRoute = () => {
    updateSelectedRouteTemplateRoute([]);
    setRouteTemplatePendingStart(null);
    setRouteTemplateMessage("");
  };

  const popSelectedRouteTemplateRoute = () => {
    if (!selectedRouteTemplate) return;
    updateSelectedRouteTemplateRoute(
      selectedRouteTemplate[routeTemplateEditKey].slice(0, -1)
    );
    setRouteTemplatePendingStart(null);
    setRouteTemplateMessage("");
  };

  const onRouteTimePortMouseDown = (
    event: MouseEvent<SVGCircleElement>,
    portRef: PortRef
  ) => {
    if (!isRouteTimeMode) return false;
    event.preventDefault();
    event.stopPropagation();
    selectRouteTimePort(portRef);
    return true;
  };

  const onSvgMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    if (canvasPanState) {
      event.preventDefault();
      movedRef.current = true;
      const viewport = canvasViewportRef.current;
      if (viewport) {
        viewport.scrollLeft =
          canvasPanState.scrollLeft - (event.clientX - canvasPanState.clientX);
        viewport.scrollTop =
          canvasPanState.scrollTop - (event.clientY - canvasPanState.clientY);
      }
      return;
    }

    const point = getSvgPoint(event);
    if (branchInsertDragState) {
      movedRef.current = true;
      setBranchInsertDragState({
        ...branchInsertDragState,
        currentPoint: point,
      });
    }
    if (dragState) {
      movedRef.current = true;
      dragState.nodes.forEach((node) => {
        const routeNode = routeNodeById.get(node.nodeId);
        if (!routeNode) return;
        const position = snapNodePosition(routeNode, {
          x: point.x - node.offsetX,
          y: point.y - node.offsetY,
        });
        dispatch({
          type: "updateRouteNode",
          historyGroup: dragState.historyGroup,
          payload: {
            id: node.nodeId,
            x: position.x,
            y: position.y,
          },
        });
      });
    }
    if (selectionState) {
      movedRef.current = true;
      setSelectionState({ ...selectionState, current: point });
    }
    if (connectState) {
      setConnectState({ ...connectState, x: point.x, y: point.y });
    }
  };

  const onSvgMouseDown = (event: MouseEvent<SVGSVGElement>) => {
    if (
      !isRouteTimeMode &&
      !isRouteTemplateMode &&
      maybeAddConnectionNode(event)
    ) {
      return;
    }
    if (
      event.button === 0 &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      event.target === svgRef.current
    ) {
      const viewport = canvasViewportRef.current;
      if (!viewport) return;
      event.preventDefault();
      movedRef.current = false;
      setCanvasPanState({
        clientX: event.clientX,
        clientY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      });
      setSelectionState(null);
      setDragState(null);
      setConnectState(null);
      return;
    }

    if (isRouteTimeMode || isRouteTemplateMode) return;
    if (!event.shiftKey || event.button !== 0) return;
    const point = getSvgPoint(event);
    movedRef.current = false;
    setSelectionState({ start: point, current: point });
    setDragState(null);
    setConnectState(null);
  };

  const onSvgMouseUp = (event: MouseEvent<SVGSVGElement>) => {
    if (canvasPanState) {
      setCanvasPanState(null);
      return;
    }

    if (branchInsertDragState) {
      const point = getSvgPoint(event);
      const geometry = routeEdgeGeometryById.get(
        branchInsertDragState.routeEdgeId
      );
      if (geometry) {
        const plan = getConnectionInsertPlan(
          branchInsertDragState.placementPoint,
          point,
          geometry,
          [branchInsertDragState.routeEdgeId]
        );
        if (plan) commitConnectionInsertPlan(plan);
      }
      setBranchInsertDragState(null);
      setDragState(null);
      setSelectionState(null);
      setConnectState(null);
      return;
    }
    if (selectionState) {
      movedRef.current = true;
      const selectionRect = getRectFromPoints(
        selectionState.start,
        selectionState.current
      );
      const nextSelectedNodeIds = new Set(
        state.routeNodes
          .filter((routeNode) =>
            rectsIntersect(selectionRect, getNodeRect(routeNode))
          )
          .map((routeNode) => routeNode.id)
      );
      setSelectedNodeIds(nextSelectedNodeIds);
      setSelectedNodeId([...nextSelectedNodeIds][0] ?? "");
      setSelectedEdgeId("");
      setSelectedBranchEdgeIds([]);
      setSelectionState(null);
    }
    setDragState(null);
    setCanvasPanState(null);
    setConnectState(null);
  };

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = viewport.getBoundingClientRect();
      const viewportX = event.clientX - rect.left;
      const viewportY = event.clientY - rect.top;
      const contentX = viewport.scrollLeft + viewportX;
      const contentY = viewport.scrollTop + viewportY;
      const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      setCanvasZoom((currentZoom) => {
        const nextZoom = Math.max(
          minCanvasZoom,
          Math.min(maxCanvasZoom, currentZoom * zoomFactor)
        );
        if (nextZoom === currentZoom) return currentZoom;
        const scale = nextZoom / currentZoom;
        requestAnimationFrame(() => {
          const nextViewport = canvasViewportRef.current;
          if (!nextViewport) return;
          nextViewport.scrollLeft = Math.max(0, contentX * scale - viewportX);
          nextViewport.scrollTop = Math.max(0, contentY * scale - viewportY);
        });
        return nextZoom;
      });
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, []);

  useEffect(() => {
    const panel = routeMapPanelRef.current;
    if (!panel) return;

    const updateCanvasViewportHeight = () => {
      setCanvasViewportHeight(
        Math.max(700, Math.ceil(panel.getBoundingClientRect().height))
      );
    };

    updateCanvasViewportHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateCanvasViewportHeight);
      return () =>
        window.removeEventListener("resize", updateCanvasViewportHeight);
    }

    const resizeObserver = new ResizeObserver(updateCanvasViewportHeight);
    resizeObserver.observe(panel);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        if (activeSelectedNodeIds.length === 0 && !selectedEdgeId) return;
        event.preventDefault();
        deleteSelection();
        return;
      }

      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (!isModifierPressed) return;

      if (
        isRouteTimeMode &&
        event.key.toLowerCase() === "z" &&
        !event.shiftKey &&
        routeTimeDraftPast.length > 0
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        undoRouteTimeDraft();
        return;
      }

      if (
        isRouteTemplateMode &&
        event.key.toLowerCase() === "z" &&
        !event.shiftKey &&
        routeTemplatePendingStart
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setRouteTemplatePendingStart(null);
        setRouteTemplateMessage("");
        return;
      }

      if (
        isRouteTimeMode &&
        (event.key.toLowerCase() === "y" ||
          (event.key.toLowerCase() === "z" && event.shiftKey)) &&
        routeTimeDraftFuture.length > 0
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        redoRouteTimeDraft();
        return;
      }

      if (event.key.toLowerCase() === "c") {
        if (activeSelectedNodeIds.length === 0) return;
        event.preventDefault();
        copySelectedNodes();
        return;
      }

      if (event.key.toLowerCase() === "v") {
        if (!routeMapClipboardRef.current) return;
        event.preventDefault();
        pasteCopiedNodes();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  });

  const onNodeMouseDown = (
    event: MouseEvent<SVGGElement>,
    routeNode: RouteNode
  ) => {
    event.stopPropagation();
    if (isRouteTimeMode || isRouteTemplateMode) return;
    if (maybeCycleConnectionNode(event, routeNode)) return;
    if (maybeAddConnectionNode(event)) return;
    if (event.button !== 0) return;
    const point = getSvgPoint(event);
    movedRef.current = false;
    if (event.shiftKey) {
      setSelectionState({ start: point, current: point });
      setDragState(null);
      return;
    }
    if (event.ctrlKey) {
      const portRef = getNearestAvailablePortRefToPoint(
        routeNode,
        point,
        occupiedPortKeys
      );
      if (!portRef) return;
      const port = getPortPosition(routeNode, portRef.side, portRef.index);
      setConnectState({
        nodeId: routeNode.id,
        side: portRef.side,
        index: portRef.index,
        x: port.x,
        y: port.y,
      });
      return;
    }

    const nodeIds =
      selectedNodeIds.has(routeNode.id) && selectedNodeIds.size > 1
        ? [...selectedNodeIds]
        : [routeNode.id];
    setDragState({
      historyGroup: createId("drag"),
      nodes: nodeIds.flatMap((nodeId) => {
        const node = routeNodeById.get(nodeId);
        if (!node) return [];
        return [
          {
            nodeId,
            offsetX: point.x - node.x,
            offsetY: point.y - node.y,
          },
        ];
      }),
    });
  };

  const rotateRouteNodeClockwise = (routeNode: RouteNode) => {
    dispatch({
      type: "rotateRouteNode",
      payload: {
        id: routeNode.id,
        delta: 90,
      },
    });
  };

  const onRotateNode = (
    event: MouseEvent<SVGGElement>,
    routeNode: RouteNode
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (isRouteTimeMode || isRouteTemplateMode) return;
    rotateRouteNodeClockwise(routeNode);
  };

  const removeRouteNode = (routeNodeId: string) => {
    dispatch({
      type: "removeRouteNode",
      payload: { id: routeNodeId },
    });
    setSelectedNodeId("");
    setSelectedNodeIds(new Set());
    setSelectedEdgeId("");
    setConnectState(null);
  };

  const removeRouteEdge = (routeEdgeId: string) => {
    dispatch({
      type: "removeRouteEdge",
      payload: { id: routeEdgeId },
    });
    setSelectedEdgeId("");
    setSelectedBranchEdgeIds((current) =>
      current.filter(
        (selectedRouteEdgeId) => selectedRouteEdgeId !== routeEdgeId
      )
    );
  };

  const selectRouteTimeSectionFromRouteEdge = (
    routeEdgeId: string,
    preferredSectionId = ""
  ) => {
    const candidateSections = state.routeTimeSections.filter((section) =>
      section.routeEdgeIds.includes(routeEdgeId)
    );
    if (candidateSections.length === 0) return false;

    const currentIndex = candidateSections.findIndex(
      (section) => section.id === selectedRouteTimeSectionId
    );
    const preferredIndex = candidateSections.findIndex(
      (section) => section.id === preferredSectionId
    );
    const nextSection =
      currentIndex >= 0
        ? candidateSections[(currentIndex + 1) % candidateSections.length]
        : candidateSections[preferredIndex >= 0 ? preferredIndex : 0];

    setSelectedRouteTimeSectionId(nextSection.id);
    setSelectedNodeId("");
    setSelectedNodeIds(new Set());
    setSelectedEdgeId("");
    setSelectedBranchEdgeIds([]);
    return true;
  };

  const onNodeContextMenu = (
    event: MouseEvent<SVGGElement>,
    routeNode: RouteNode
  ) => {
    if (maybeFlipConnectionNode(event, routeNode)) return;
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    removeRouteNode(routeNode.id);
  };

  const onEdgeContextMenu = (
    event: MouseEvent<SVGPathElement>,
    routeEdgeId: string
  ) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    removeRouteEdge(routeEdgeId);
  };

  const onNodeMouseUp = (
    event: MouseEvent<SVGGElement>,
    routeNode: RouteNode
  ) => {
    event.stopPropagation();
    if (isRouteTemplateMode) return;
    if (!connectState) {
      setDragState(null);
      return;
    }
    const point = getSvgPoint(event);
    const excludedPortKey = getPortKey(
      connectState.nodeId,
      connectState.side,
      connectState.index
    );
    const targetPortRef = getNearestAvailablePortRefToPoint(
      routeNode,
      point,
      occupiedPortKeys,
      routeNode.id === connectState.nodeId ? excludedPortKey : undefined
    );
    if (!targetPortRef) {
      setConnectState(null);
      return;
    }
    const routeEdgeId = createId("re");
    dispatch({
      type: "addRouteEdge",
      payload: {
        id: routeEdgeId,
        fromNodeId: connectState.nodeId,
        toNodeId: routeNode.id,
        fromPortSide: connectState.side,
        fromPortIndex: connectState.index,
        toPortSide: targetPortRef.side,
        toPortIndex: targetPortRef.index,
        edgeType: "main",
        travelMinutes: 0,
        bidirectional: true,
      },
    });
    setSelectedNodeId("");
    setSelectedNodeIds(new Set());
    setSelectedEdgeId("");
    setConnectState(null);
  };

  const onPortMouseDown = (
    event: MouseEvent<SVGCircleElement>,
    routeNode: RouteNode,
    side: RoutePortSide,
    index: number
  ) => {
    event.stopPropagation();
    if (isRouteTemplateMode) {
      event.preventDefault();
      return;
    }
    if (
      onRouteTimePortMouseDown(event, { nodeId: routeNode.id, side, index })
    ) {
      return;
    }
    if (maybeAddConnectionNode(event)) return;
    if (event.button !== 0) return;
    movedRef.current = false;
    if (!event.ctrlKey) return;
    if (occupiedPortKeys.has(getPortKey(routeNode.id, side, index))) return;
    const port = getPortPosition(routeNode, side, index);
    setConnectState({
      nodeId: routeNode.id,
      side,
      index,
      x: port.x,
      y: port.y,
    });
  };

  const onPortMouseUp = (
    event: MouseEvent<SVGCircleElement>,
    routeNode: RouteNode,
    side: RoutePortSide,
    index: number
  ) => {
    event.stopPropagation();
    if (isRouteTemplateMode) {
      event.preventDefault();
      return;
    }
    if (!connectState) return;
    if (
      connectState.nodeId !== routeNode.id ||
      connectState.side !== side ||
      connectState.index !== index
    ) {
      const routeEdgeId = createId("re");
      dispatch({
        type: "addRouteEdge",
        payload: {
          id: routeEdgeId,
          fromNodeId: connectState.nodeId,
          toNodeId: routeNode.id,
          fromPortSide: connectState.side,
          fromPortIndex: connectState.index,
          toPortSide: side,
          toPortIndex: index,
          edgeType: "main",
          travelMinutes: 0,
          bidirectional: true,
        },
      });
      setSelectedNodeId("");
      setSelectedNodeIds(new Set());
      setSelectedEdgeId("");
    }
    setConnectState(null);
  };

  const onNodeClick = (
    event: MouseEvent<SVGGElement>,
    routeNode: RouteNode
  ) => {
    event.stopPropagation();
    if (isRouteTemplateMode) return;
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    setSelectedNodeId(routeNode.id);
    setSelectedNodeIds(new Set([routeNode.id]));
    setSelectedEdgeId("");
    setSelectedRouteTimeSectionId("");
  };

  const selectedTrainRouteNodeIds = new Set(
    selectedTrainRun?.stops.map((stop) => stop.routeNodeId) ?? []
  );
  const portColorByKey = useMemo(() => {
    const colorMap = new Map<string, string>();
    state.routeEdges.forEach((routeEdge) => {
      const color = getEdgeStrokeColor(routeEdge.id, selectedEdgeId);
      colorMap.set(
        `${routeEdge.fromNodeId}:${routeEdge.fromPortSide}:${routeEdge.fromPortIndex}`,
        color
      );
      colorMap.set(
        `${routeEdge.toNodeId}:${routeEdge.toPortSide}:${routeEdge.toPortIndex}`,
        color
      );
    });
    return colorMap;
  }, [selectedEdgeId, state.routeEdges]);
  const occupiedPortKeys = useMemo(() => {
    const keys = new Set<string>();
    state.routeEdges.forEach((routeEdge) => {
      keys.add(
        getPortKey(
          routeEdge.fromNodeId,
          routeEdge.fromPortSide,
          routeEdge.fromPortIndex
        )
      );
      keys.add(
        getPortKey(
          routeEdge.toNodeId,
          routeEdge.toPortSide,
          routeEdge.toPortIndex
        )
      );
    });
    return keys;
  }, [state.routeEdges]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl">路線図・運行経路エディタ</h2>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative">
          <div
            ref={canvasViewportRef}
            className="min-h-[700px] overflow-auto overscroll-none rounded-lg bg-white p-2"
            style={{ height: `${canvasViewportHeight}px` }}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              className="route-map-canvas block touch-none select-none rounded border bg-gray-50"
              style={{
                width: `${canvasWidth * canvasZoom}px`,
                height: `${canvasHeight * canvasZoom}px`,
                cursor: canvasPanState ? "grabbing" : "grab",
              }}
              onMouseDown={onSvgMouseDown}
              onMouseMove={onSvgMouseMove}
              onMouseUp={onSvgMouseUp}
              onMouseLeave={onSvgMouseUp}
              onContextMenu={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                if (isRouteTemplateMode) return;
                if (movedRef.current) {
                  movedRef.current = false;
                  return;
                }
                setSelectedNodeId("");
                setSelectedNodeIds(new Set());
                setSelectedEdgeId("");
              }}
            >
              <defs>
                <pattern
                  id="route-layout-grid"
                  width={layoutGridSize}
                  height={layoutGridSize}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${layoutGridSize} 0 L 0 0 0 ${layoutGridSize}`}
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth={0.6}
                  />
                </pattern>
                <pattern
                  id="route-layout-grid-major"
                  width={layoutGridSize * 4}
                  height={layoutGridSize * 4}
                  patternUnits="userSpaceOnUse"
                >
                  <rect
                    width={layoutGridSize * 4}
                    height={layoutGridSize * 4}
                    fill="url(#route-layout-grid)"
                  />
                  <path
                    d={`M ${layoutGridSize * 4} 0 L 0 0 0 ${
                      layoutGridSize * 4
                    }`}
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth={0.8}
                  />
                </pattern>
                <marker
                  id="route-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
                </marker>
              </defs>
              <rect
                width={canvasWidth}
                height={canvasHeight}
                fill="url(#route-layout-grid-major)"
                pointerEvents="none"
              />

              {routeEdgeGeometry.map((geometry) => {
                const isSelected = geometry.routeEdgeId === selectedEdgeId;
                const isBranchSelected = selectedBranchEdgeIdSet.has(
                  geometry.routeEdgeId
                );
                const edgeStrokeColor = getEdgeStrokeColor(
                  geometry.routeEdgeId,
                  selectedEdgeId
                );
                return (
                  <g key={geometry.routeEdgeId}>
                    <path
                      d={pointsToPath(geometry.routePoints)}
                      fill="none"
                      stroke={isBranchSelected ? "#f59e0b" : edgeStrokeColor}
                      strokeWidth={isSelected || isBranchSelected ? 5 : 3}
                      markerEnd={
                        geometry.bidirectional ? undefined : "url(#route-arrow)"
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isRouteTimeMode || isRouteTemplateMode) return;
                        if (movedRef.current) {
                          movedRef.current = false;
                          return;
                        }
                        if (connectState) return;
                        if (
                          selectRouteTimeSectionFromRouteEdge(
                            geometry.routeEdgeId
                          )
                        ) {
                          return;
                        }
                        setSelectedEdgeId("");
                        setSelectedNodeId("");
                        setSelectedNodeIds(new Set());
                        setSelectedRouteTimeSectionId("");
                      }}
                      onMouseDown={(event) => {
                        maybeHandleBranchEdgeMouseDown(event, geometry);
                      }}
                      onContextMenu={(event) =>
                        onEdgeContextMenu(event, geometry.routeEdgeId)
                      }
                      className="cursor-pointer"
                    />
                  </g>
                );
              })}

              {routeTimeSectionsForSelectedSpeed.map((section) => {
                const sectionColor = getRouteTimeSectionColor(section);
                const geometries = section.routeEdgeIds.flatMap(
                  (routeEdgeId) => {
                    const geometry = routeEdgeGeometryById.get(routeEdgeId);
                    return geometry ? [geometry] : [];
                  }
                );
                const isSelected = section.id === selectedRouteTimeSectionId;
                const labelText = `${section.travelMinutes}分`;
                const labelPlacement =
                  section.travelMinutes > 0
                    ? routeTimeLabelPlacementById.get(section.id) ?? null
                    : null;
                return (
                  <g key={section.id}>
                    {geometries.map((geometry) => (
                      <path
                        key={`${section.id}-${geometry.routeEdgeId}`}
                        d={pointsToPath(geometry.routePoints)}
                        fill="none"
                        stroke={sectionColor}
                        strokeOpacity={isSelected ? 0.92 : 0.66}
                        strokeWidth={isSelected ? 9 : 7}
                        strokeLinecap="round"
                        pointerEvents="stroke"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (isRouteTemplateMode || isRouteTimeMode) return;
                          if (movedRef.current) {
                            movedRef.current = false;
                            return;
                          }
                          selectRouteTimeSectionFromRouteEdge(
                            geometry.routeEdgeId,
                            section.id
                          );
                        }}
                        onMouseDown={(event) => {
                          maybeHandleBranchEdgeMouseDown(event, geometry);
                        }}
                        className="cursor-pointer"
                      />
                    ))}
                    {labelPlacement ? (
                      <g pointerEvents="none">
                        <rect
                          x={labelPlacement.x - labelPlacement.width / 2}
                          y={labelPlacement.y - labelPlacement.height / 2}
                          width={labelPlacement.width}
                          height={labelPlacement.height}
                          rx={4}
                          fill="#ffffff"
                          fillOpacity={0.86}
                        />
                        <text
                          x={labelPlacement.x}
                          y={labelPlacement.y + 5}
                          textAnchor="middle"
                          fill={sectionColor}
                          className="text-[13px] font-bold"
                        >
                          {labelText}
                        </text>
                      </g>
                    ) : null}
                  </g>
                );
              })}

              {routeTimeDraft ? (
                <g pointerEvents="none">
                  {routeTimeDraft.routeEdgeIds.flatMap((routeEdgeId) => {
                    const geometry = routeEdgeGeometryById.get(routeEdgeId);
                    return geometry
                      ? [
                          <path
                            key={`draft-${routeEdgeId}`}
                            d={pointsToPath(geometry.routePoints)}
                            fill="none"
                            stroke="#f97316"
                            strokeOpacity={0.9}
                            strokeWidth={9}
                            strokeLinecap="round"
                          />,
                        ]
                      : [];
                  })}
                  {routeTimeDraft.ports.map((portRef, index) => {
                    const routeNode = routeNodeById.get(portRef.nodeId);
                    if (!routeNode) return null;
                    if (routeNode.type === "connection") return null;
                    const port = getPortPosition(
                      routeNode,
                      portRef.side,
                      portRef.index
                    );
                    return (
                      <circle
                        key={`draft-port-${index}-${getPortRefKey(portRef)}`}
                        cx={port.x}
                        cy={port.y}
                        r={index === 0 ? 12 : 9}
                        fill={index === 0 ? "#2563eb" : "#f97316"}
                        stroke="#ffffff"
                        strokeWidth={3}
                      />
                    );
                  })}
                </g>
              ) : null}

              {trainRouteGeometries.map((geometry) => (
                <path
                  key={`train-route-${geometry.routeEdgeId}`}
                  d={pointsToPath(geometry.routePoints)}
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth={7}
                  strokeOpacity={0.35}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              ))}

              {trainRouteSegments.map((segment, index) => (
                <path
                  key={`${segment.from.x}-${segment.from.y}-${index}`}
                  d={getRoutePreviewPath(
                    segment.from,
                    segment.to,
                    inferSideToward(segment.from, segment.to)
                  )}
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth={7}
                  strokeOpacity={0.35}
                  pointerEvents="none"
                />
              ))}

              {selectedBranchEdgeIds.flatMap((routeEdgeId, index) => {
                const geometry = routeEdgeGeometryById.get(routeEdgeId);
                return geometry
                  ? [
                      <path
                        key={`branch-insert-selected-${routeEdgeId}`}
                        d={pointsToPath(geometry.routePoints)}
                        fill="none"
                        stroke={index === 0 ? "#f59e0b" : "#eab308"}
                        strokeWidth={12}
                        strokeOpacity={0.86}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />,
                    ]
                  : [];
              })}

              {branchInsertDragState
                ? (() => {
                    const geometry = routeEdgeGeometryById.get(
                      branchInsertDragState.routeEdgeId
                    );
                    if (!geometry) return null;
                    const plan = getConnectionInsertPlan(
                      branchInsertDragState.placementPoint,
                      branchInsertDragState.currentPoint,
                      geometry,
                      [branchInsertDragState.routeEdgeId]
                    );
                    if (!plan) return null;
                    const draftNode: RouteNode = {
                      id: "branch-insert-draft",
                      stationId: "",
                      label: "",
                      type: "connection",
                      x: plan.x,
                      y: plan.y,
                      rotation: plan.rotation,
                      platformNumber: "",
                      platformCount: 1,
                      platformLabels: ["1"],
                      verticalPlatformCount: 1,
                      verticalPlatformLabels: ["1"],
                      durationMinutes: 0,
                      connectionType: plan.connectionType,
                    };
                    return (
                      <g pointerEvents="none" opacity={0.9}>
                        {getConnectionDrawableSegments(draftNode).map(
                          (segment, segmentIndex) => (
                            <path
                              key={`branch-insert-draft-${segmentIndex}`}
                              d={`M ${segment.from.x} ${segment.from.y} L ${segment.to.x} ${segment.to.y}`}
                              fill="none"
                              stroke="#f59e0b"
                              strokeWidth={7}
                              strokeLinecap="round"
                            />
                          )
                        )}
                        {getRouteNodePortRefs(draftNode).map((portRef) => {
                          const port = getPortPosition(
                            draftNode,
                            portRef.side,
                            portRef.index
                          );
                          return (
                            <circle
                              key={`branch-insert-draft-port-${portRef.side}-${portRef.index}`}
                              cx={port.x}
                              cy={port.y}
                              r={portRadius}
                              fill="#f59e0b"
                              stroke="#ffffff"
                              strokeWidth={2}
                            />
                          );
                        })}
                      </g>
                    );
                  })()
                : null}

              {connectState
                ? (() => {
                    const fromNode = routeNodeById.get(connectState.nodeId);
                    if (!fromNode) return null;
                    const hoveredPort = findHoveredPort(state.routeNodes, {
                      x: connectState.x,
                      y: connectState.y,
                    });
                    const hoveredNode = hoveredPort
                      ? routeNodeById.get(hoveredPort.nodeId) ?? null
                      : findHoveredNode(state.routeNodes, {
                          x: connectState.x,
                          y: connectState.y,
                        });
                    const from = getPortPosition(
                      fromNode,
                      connectState.side,
                      connectState.index
                    );

                    if (
                      hoveredPort &&
                      hoveredNode &&
                      (hoveredPort.nodeId !== connectState.nodeId ||
                        hoveredPort.side !== connectState.side ||
                        hoveredPort.index !== connectState.index)
                    ) {
                      return (
                        <path
                          d={pointsToPath(
                            buildAutoRoutePoints(
                              fromNode,
                              hoveredNode,
                              connectState.side,
                              hoveredPort.side,
                              connectState.index,
                              hoveredPort.index,
                              state.routeNodes
                            )
                          )}
                          fill="none"
                          stroke="#2563eb"
                          strokeDasharray="6 4"
                          strokeWidth={3}
                          pointerEvents="none"
                        />
                      );
                    }

                    if (hoveredNode) {
                      const { fromSide, toSide } = getNearestPortSides(
                        fromNode,
                        hoveredNode,
                        connectState.index,
                        0
                      );
                      return (
                        <path
                          d={pointsToPath(
                            buildAutoRoutePoints(
                              fromNode,
                              hoveredNode,
                              fromSide,
                              toSide,
                              connectState.index,
                              0,
                              state.routeNodes
                            )
                          )}
                          fill="none"
                          stroke="#2563eb"
                          strokeDasharray="6 4"
                          strokeWidth={3}
                          pointerEvents="none"
                        />
                      );
                    }

                    return (
                      <path
                        d={getRoutePreviewPath(
                          from,
                          { x: connectState.x, y: connectState.y },
                          connectState.side
                        )}
                        fill="none"
                        stroke="#2563eb"
                        strokeDasharray="6 4"
                        strokeWidth={3}
                        pointerEvents="none"
                      />
                    );
                  })()
                : null}

              {selectionState
                ? (() => {
                    const rect = getRectFromPoints(
                      selectionState.start,
                      selectionState.current
                    );
                    return (
                      <rect
                        x={rect.x}
                        y={rect.y}
                        width={rect.width}
                        height={rect.height}
                        fill="#2563eb"
                        fillOpacity={0.08}
                        stroke="#2563eb"
                        strokeDasharray="6 4"
                        strokeWidth={2}
                        pointerEvents="none"
                      />
                    );
                  })()
                : null}

              {state.routeNodes.map((routeNode) => {
                const isSelected =
                  routeNode.id === selectedNodeId ||
                  selectedNodeIds.has(routeNode.id);
                const isInSelectedTrain = selectedTrainRouteNodeIds.has(
                  routeNode.id
                );
                const isCandidate = connectedCandidateIds.has(routeNode.id);
                const stopTimeGroups = [
                  ...(stopTimesByRouteNodeId.get(routeNode.id)?.entries() ??
                    []),
                ]
                  .sort(([a], [b]) => a - b)
                  .map(([platformIndex, times]) => ({
                    platformIndex,
                    platformLabel: getPlatformLabel(routeNode, platformIndex),
                    times,
                  }));
                const routeNodeWidth = getNodeWidth(routeNode);
                const routeNodeHeight = getNodeHeight(routeNode);
                const portRefs = getRouteNodePortRefs(routeNode);
                const layout = getNodeLayoutInfo(routeNode);
                const routeTemplatePlatformRegions =
                  getRouteTemplatePlatformRegions(routeNode);
                const rotateButtonPosition = rotateButtonPositionByNodeId.get(
                  routeNode.id
                ) ?? {
                  x: routeNodeWidth / 2,
                  y: -24,
                };
                return (
                  <g
                    key={routeNode.id}
                    transform={`translate(${routeNode.x}, ${routeNode.y})`}
                    onMouseDown={(event) => onNodeMouseDown(event, routeNode)}
                    onMouseUp={(event) => onNodeMouseUp(event, routeNode)}
                    onContextMenu={(event) =>
                      onNodeContextMenu(event, routeNode)
                    }
                    onClick={(event) => onNodeClick(event, routeNode)}
                    className={
                      isRouteTemplateMode ? "cursor-default" : "cursor-move"
                    }
                  >
                    {routeNode.type === "connection" ? (
                      (() => {
                        const segments =
                          getConnectionDrawableSegments(routeNode);
                        return (
                          <>
                            {segments.map((segment, segmentIndex) => {
                              const from = {
                                x: segment.from.x - routeNode.x,
                                y: segment.from.y - routeNode.y,
                              };
                              const to = {
                                x: segment.to.x - routeNode.x,
                                y: segment.to.y - routeNode.y,
                              };
                              return (
                                <path
                                  key={segmentIndex}
                                  d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                                  fill="none"
                                  stroke={isSelected ? "#dc2626" : "#64748b"}
                                  strokeWidth={isSelected ? 5 : 4}
                                  strokeLinecap="round"
                                />
                              );
                            })}
                            {state.routeTimeSections.flatMap((section) =>
                              getConnectionInternalSegmentsFromPorts(
                                routeNode,
                                section.routePorts
                              ).map((segment, segmentIndex) => {
                                const from = {
                                  x: segment.from.x - routeNode.x,
                                  y: segment.from.y - routeNode.y,
                                };
                                const to = {
                                  x: segment.to.x - routeNode.x,
                                  y: segment.to.y - routeNode.y,
                                };
                                const isSectionSelected =
                                  section.id === selectedRouteTimeSectionId;
                                const sectionColor =
                                  getRouteTimeSectionColor(section);
                                return (
                                  <path
                                    key={`${section.id}-${segmentIndex}`}
                                    d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                                    fill="none"
                                    stroke={sectionColor}
                                    strokeOpacity={
                                      isSectionSelected ? 0.92 : 0.72
                                    }
                                    strokeWidth={isSectionSelected ? 9 : 7}
                                    strokeLinecap="round"
                                  />
                                );
                              })
                            )}
                            {highlightedRouteSections.flatMap(
                              (routeSection) => {
                                const section = state.routeTimeSections.find(
                                  (candidate) =>
                                    candidate.id ===
                                    routeSection.routeTimeSectionId
                                );
                                if (!section) return [];
                                const routePorts = routeSection.reversed
                                  ? [...section.routePorts].reverse()
                                  : section.routePorts;
                                return getConnectionInternalSegmentsFromPorts(
                                  routeNode,
                                  routePorts
                                ).map((segment, segmentIndex) => {
                                  const from = {
                                    x: segment.from.x - routeNode.x,
                                    y: segment.from.y - routeNode.y,
                                  };
                                  const to = {
                                    x: segment.to.x - routeNode.x,
                                    y: segment.to.y - routeNode.y,
                                  };
                                  return (
                                    <path
                                      key={`train-route-${section.id}-${segmentIndex}`}
                                      d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                                      fill="none"
                                      stroke="#7c3aed"
                                      strokeOpacity={0.5}
                                      strokeWidth={7}
                                      strokeLinecap="round"
                                    />
                                  );
                                });
                              }
                            )}
                            {routeTimeDraft
                              ? getConnectionInternalSegmentsFromPorts(
                                  routeNode,
                                  routeTimeDraft.ports
                                ).map((segment, segmentIndex) => {
                                  const from = {
                                    x: segment.from.x - routeNode.x,
                                    y: segment.from.y - routeNode.y,
                                  };
                                  const to = {
                                    x: segment.to.x - routeNode.x,
                                    y: segment.to.y - routeNode.y,
                                  };
                                  return (
                                    <path
                                      key={`draft-${segmentIndex}`}
                                      d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                                      fill="none"
                                      stroke="#f97316"
                                      strokeOpacity={0.95}
                                      strokeWidth={9}
                                      strokeLinecap="round"
                                    />
                                  );
                                })
                              : null}
                          </>
                        );
                      })()
                    ) : routeNode.type === "crossing" ? (
                      <>
                        <rect
                          x={0}
                          y={
                            (routeNodeHeight -
                              getPortBandSize(getPlatformCount(routeNode))) /
                            2
                          }
                          width={routeNodeWidth}
                          height={getPortBandSize(getPlatformCount(routeNode))}
                          rx={3}
                          fill={
                            isCandidate ? "#dbeafe" : nodeColors[routeNode.type]
                          }
                          stroke="none"
                        />
                        <rect
                          x={
                            (routeNodeWidth -
                              getPortBandSize(
                                getVerticalPlatformCount(routeNode)
                              )) /
                            2
                          }
                          y={0}
                          width={getPortBandSize(
                            getVerticalPlatformCount(routeNode)
                          )}
                          height={routeNodeHeight}
                          rx={3}
                          fill={
                            isCandidate ? "#dbeafe" : nodeColors[routeNode.type]
                          }
                          stroke="none"
                        />
                        <rect
                          width={routeNodeWidth}
                          height={routeNodeHeight}
                          rx={3}
                          fill="none"
                          stroke={
                            isSelected
                              ? "#dc2626"
                              : isInSelectedTrain
                              ? "#7c3aed"
                              : "#334155"
                          }
                          strokeWidth={
                            isSelected || isInSelectedTrain ? 3 : 1.5
                          }
                        />
                      </>
                    ) : (
                      <rect
                        width={routeNodeWidth}
                        height={routeNodeHeight}
                        rx={3}
                        fill={
                          isCandidate ? "#dbeafe" : nodeColors[routeNode.type]
                        }
                        stroke={
                          isSelected
                            ? "#dc2626"
                            : isInSelectedTrain
                            ? "#7c3aed"
                            : "#334155"
                        }
                        strokeWidth={isSelected || isInSelectedTrain ? 3 : 1.5}
                      />
                    )}
                    {isRouteTemplateMode && routeNode.type !== "connection" ? (
                      <g>
                        {routeTemplatePlatformRegions.map((region) => {
                          const platformKey = getPlatformKey(region.platform);
                          const isPending =
                            routeTemplatePendingStart?.nodeId ===
                              region.platform.nodeId &&
                            routeTemplatePendingStart.index ===
                              region.platform.index;
                          const isReachable =
                            routeTemplateReachablePlatformKeys.has(platformKey);
                          const isHovered =
                            hoveredRouteTemplatePlatform?.nodeId ===
                              region.platform.nodeId &&
                            hoveredRouteTemplatePlatform.index ===
                              region.platform.index;
                          const hasActiveRouteTemplateSelection =
                            routeTemplateRouteSections.length > 0 ||
                            Boolean(routeTemplatePendingStart);
                          const isDisabled =
                            hasActiveRouteTemplateSelection &&
                            !isReachable &&
                            !isPending;
                          const fill = isPending
                            ? "#2563eb"
                            : isReachable
                            ? "#22c55e"
                            : isDisabled
                            ? "#94a3b8"
                            : "#ffffff";
                          const fillOpacity = isPending
                            ? 0.34
                            : isHovered && !isDisabled
                            ? 0.36
                            : isReachable
                            ? 0.28
                            : isDisabled
                            ? 0.1
                            : 0.04;
                          return (
                            <rect
                              key={`route-template-platform-${platformKey}`}
                              x={region.rect.x}
                              y={region.rect.y}
                              width={region.rect.width}
                              height={region.rect.height}
                              fill={fill}
                              fillOpacity={fillOpacity}
                              stroke={
                                isPending
                                  ? "#1d4ed8"
                                  : isReachable || (isHovered && !isDisabled)
                                  ? "#16a34a"
                                  : "#cbd5e1"
                              }
                              strokeWidth={
                                isPending || isReachable || isHovered ? 2 : 0.8
                              }
                              pointerEvents="all"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onMouseUp={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onMouseEnter={() =>
                                setHoveredRouteTemplatePlatform(region.platform)
                              }
                              onMouseLeave={() =>
                                setHoveredRouteTemplatePlatform(null)
                              }
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (!isDisabled) {
                                  selectRouteTemplatePlatform(region.platform);
                                }
                              }}
                              className={
                                isDisabled
                                  ? "cursor-not-allowed"
                                  : "cursor-pointer"
                              }
                            />
                          );
                        })}
                      </g>
                    ) : null}
                    {routeNode.type !== "connection" && layout.labelOutside ? (
                      <rect
                        x={layout.labelBoxX}
                        y={layout.labelBoxY}
                        width={layout.labelBoxWidth}
                        height={layout.labelBoxHeight}
                        rx={4}
                        fill="#ffffff"
                        stroke="#cbd5e1"
                        strokeWidth={1}
                      />
                    ) : null}
                    {routeNode.type !== "connection" ? (
                      <>
                        <text
                          x={layout.labelX}
                          y={layout.labelY}
                          className="pointer-events-none fill-gray-900 text-[13px]"
                        >
                          {getRouteNodeLabel(state.stations, routeNode)}
                        </text>
                        <text
                          x={layout.labelX}
                          y={layout.subLabelY}
                          className="pointer-events-none fill-gray-500 text-[11px]"
                        >
                          {routeNodeTypeLabels[routeNode.type]}
                          {routeNode.rotation
                            ? ` / ${routeNode.rotation}°`
                            : ""}
                        </text>
                        <g
                          transform={`translate(${rotateButtonPosition.x}, ${rotateButtonPosition.y})`}
                          onMouseDown={(event) =>
                            onRotateNode(event, routeNode)
                          }
                          className="cursor-pointer"
                        >
                          <circle
                            cx={0}
                            cy={0}
                            r={rotateButtonRadius}
                            fill="#ffffff"
                            stroke="#475569"
                            strokeWidth={1.5}
                          />
                          <text
                            x={0}
                            y={4}
                            textAnchor="middle"
                            className="pointer-events-none fill-slate-700 text-[13px]"
                          >
                            ↻
                          </text>
                        </g>
                      </>
                    ) : null}
                    {portRefs.map((portRef) => {
                      const port = getPortPosition(
                        routeNode,
                        portRef.side,
                        portRef.index
                      );
                      const portColor =
                        portColorByKey.get(
                          `${routeNode.id}:${portRef.side}:${portRef.index}`
                        ) ?? "#1d4ed8";
                      const isOccupied = occupiedPortKeys.has(
                        getPortKey(routeNode.id, portRef.side, portRef.index)
                      );
                      const portKey = getPortKey(
                        routeNode.id,
                        portRef.side,
                        portRef.index
                      );
                      const isDraftPort = routeTimeDraft?.ports.some(
                        (draftPortRef) =>
                          getPortRefKey(draftPortRef) === portKey
                      );
                      const isSectionEndpoint = state.routeTimeSections.some(
                        (section) =>
                          getPortKey(
                            section.startNodeId,
                            section.startPortSide,
                            section.startPortIndex
                          ) === portKey ||
                          getPortKey(
                            section.endNodeId,
                            section.endPortSide,
                            section.endPortIndex
                          ) === portKey
                      );
                      const localX = port.x - routeNode.x;
                      const localY = port.y - routeNode.y;
                      const currentPortRadius =
                        routeNode.type === "connection" ? 9 : portRadius;
                      const portVisible = routeNode.type !== "connection";
                      const routeTimePortFill = isDraftPort
                        ? "#f97316"
                        : isSectionEndpoint
                        ? "#22c55e"
                        : "#ffffff";
                      const routeTimePortStroke = isDraftPort
                        ? "#f97316"
                        : isSectionEndpoint
                        ? "#16a34a"
                        : "#2563eb";
                      const platformLabel =
                        routeNode.type === "crossing" &&
                        (portRef.side === "top" || portRef.side === "bottom")
                          ? getVerticalPlatformLabel(routeNode, portRef.index)
                          : getPlatformLabel(routeNode, portRef.index);
                      const labelX =
                        portRef.side === "left"
                          ? localX - 16
                          : portRef.side === "right"
                          ? localX + 16
                          : localX;
                      const labelY =
                        portRef.side === "top"
                          ? localY - 12
                          : portRef.side === "bottom"
                          ? localY + 24
                          : localY + 5;
                      const platformLabelAnchor =
                        portRef.side === "left"
                          ? "end"
                          : portRef.side === "right"
                          ? "start"
                          : "middle";
                      const platformLabelWidth = Math.max(
                        18,
                        estimateTextWidth(platformLabel, 13) + 8
                      );
                      const platformLabelRectX =
                        platformLabelAnchor === "middle"
                          ? labelX - platformLabelWidth / 2
                          : platformLabelAnchor === "end"
                          ? labelX - platformLabelWidth + 3
                          : labelX - 3;
                      return (
                        <g key={`${portRef.side}-${portRef.index}`}>
                          <circle
                            cx={localX}
                            cy={localY}
                            r={currentPortRadius}
                            fill={
                              portVisible
                                ? isRouteTimeMode
                                  ? routeTimePortFill
                                  : isOccupied
                                  ? portColor
                                  : "#ffffff"
                                : "transparent"
                            }
                            stroke={
                              portVisible
                                ? isRouteTimeMode
                                  ? routeTimePortStroke
                                  : portColor
                                : "transparent"
                            }
                            strokeWidth={
                              portVisible ? (isRouteTimeMode ? 3 : 2) : 0
                            }
                            pointerEvents={isRouteTemplateMode ? "none" : "all"}
                            onMouseDown={(event) =>
                              onPortMouseDown(
                                event,
                                routeNode,
                                portRef.side,
                                portRef.index
                              )
                            }
                            onMouseUp={(event) =>
                              onPortMouseUp(
                                event,
                                routeNode,
                                portRef.side,
                                portRef.index
                              )
                            }
                            className="cursor-crosshair"
                          />
                          {routeNode.type !== "connection" ? (
                            <>
                              <rect
                                x={platformLabelRectX}
                                y={labelY - 13}
                                width={platformLabelWidth}
                                height={17}
                                rx={3}
                                fill="#ffffff"
                                fillOpacity={0.86}
                                pointerEvents="none"
                              />
                              <text
                                x={labelX}
                                y={labelY}
                                textAnchor={platformLabelAnchor}
                                className="pointer-events-none fill-slate-700 text-[13px] font-bold"
                              >
                                {platformLabel}
                              </text>
                            </>
                          ) : null}
                        </g>
                      );
                    })}
                    {stopTimeGroups.map((group, groupIndex) => {
                      const position = getStopTimeGroupPosition(
                        routeNode,
                        groupIndex,
                        stopTimeGroups.length,
                        rotateButtonPosition
                      );
                      const headerText =
                        stopTimeGroups.length > 1
                          ? `${group.platformLabel}番`
                          : "";
                      const stopTimeLabelWidth = Math.max(
                        48,
                        estimateTextWidth(
                          [headerText, ...group.times].join(""),
                          11
                        ) /
                          Math.max(
                            1,
                            group.times.length + (headerText ? 1 : 0)
                          ) +
                          14
                      );
                      const stopTimeBoxHeight =
                        (headerText ? 14 : 0) + group.times.length * 13 + 8;
                      const stopTimeBoxX =
                        position.textAnchor === "middle"
                          ? -stopTimeLabelWidth / 2
                          : position.textAnchor === "end"
                          ? -stopTimeLabelWidth + 6
                          : -6;
                      const stopTimeY =
                        position.y < 0
                          ? Math.min(position.y, 4 - stopTimeBoxHeight)
                          : position.y;
                      return (
                        <g
                          key={`${routeNode.id}-stop-time-${group.platformIndex}`}
                          transform={`translate(${position.x}, ${stopTimeY})`}
                          pointerEvents="none"
                        >
                          <rect
                            x={stopTimeBoxX}
                            y={-12}
                            width={stopTimeLabelWidth}
                            height={stopTimeBoxHeight}
                            rx={4}
                            fill="#ffffff"
                            fillOpacity={0.86}
                          />
                          {headerText ? (
                            <text
                              x={0}
                              y={0}
                              textAnchor={position.textAnchor}
                              className="fill-slate-700 text-[11px] font-bold"
                            >
                              {headerText}
                            </text>
                          ) : null}
                          {group.times.map((time, index) => (
                            <text
                              key={`${routeNode.id}-${group.platformIndex}-${time}-${index}`}
                              x={0}
                              y={
                                (stopTimeGroups.length > 1 ? 14 : 0) +
                                index * 13
                              }
                              textAnchor={position.textAnchor}
                              className={`text-[11px] ${
                                time.includes("未入力")
                                  ? "fill-amber-700"
                                  : "fill-violet-700"
                              }`}
                            >
                              {time}
                            </text>
                          ))}
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="absolute right-14 top-6 z-20 flex items-center gap-2 rounded border border-slate-300 bg-white/95 px-3 py-2 text-sm shadow dark:border-slate-600 dark:bg-slate-800/95">
            <label htmlFor="route-read-direction" className="text-slate-700">
              読取方向
            </label>
            <select
              id="route-read-direction"
              value={state.routeReadDirection}
              onChange={(event) =>
                dispatch({
                  type: "updateRouteReadDirection",
                  payload: {
                    routeReadDirection: event.target
                      .value as State["routeReadDirection"],
                  },
                })
              }
              className="rounded border bg-white px-3 py-2"
            >
              {Object.entries(routeReadDirectionLabels).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        <aside
          ref={routeMapPanelRef}
          className="flex flex-col gap-4 rounded-lg bg-white p-4"
        >
          <section className="flex flex-col gap-2">
            <h3 className="font-bold text-gray-700">ノード追加</h3>
            <select
              value={newNodeStationId}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setNewNodeStationId(event.target.value)
              }
              className="rounded border border-gray-300 p-2 text-sm"
            >
              <option value="">Station未指定</option>
              {state.stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newNodeLabel}
              placeholder="ノード表示名"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setNewNodeLabel(event.target.value)
              }
              className="rounded border border-gray-300 p-2 text-sm"
            />
            <select
              value={newNodeType}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setNewNodeType(event.target.value as RouteNodeType)
              }
              className="rounded border border-gray-300 p-2 text-sm"
            >
              {nodeTypes.map((nodeType) => (
                <option key={nodeType} value={nodeType}>
                  {routeNodeTypeLabels[nodeType]}
                </option>
              ))}
            </select>
            <label className="flex flex-col gap-1 text-xs text-gray-600">
              {newNodeType === "crossing" ? "水平番線数" : "番線数"}
              <input
                type="number"
                min="1"
                value={newNodePlatformCount}
                aria-label={
                  newNodeType === "crossing" ? "水平番線数" : "番線数"
                }
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setNewNodePlatformCount(
                    Math.max(1, Number(event.target.value))
                  )
                }
                className="rounded border border-gray-300 p-2 text-sm text-gray-900"
              />
            </label>
            {newNodeType === "crossing" ? (
              <label className="flex flex-col gap-1 text-xs text-gray-600">
                垂直番線数
                <input
                  type="number"
                  min="1"
                  value={newNodeVerticalPlatformCount}
                  aria-label="垂直番線数"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setNewNodeVerticalPlatformCount(
                      Math.max(1, Number(event.target.value))
                    )
                  }
                  className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                />
              </label>
            ) : null}
            <button
              type="button"
              onClick={addRouteNode}
              className="rounded bg-blue-700 px-3 py-2 text-sm text-white"
            >
              ノードを追加
            </button>
          </section>

          <section className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-gray-700">経路設定</h3>
              <button
                type="button"
                disabled={!selectedRouteTemplate}
                onClick={() => {
                  setIsRouteTemplateMode((enabled) => !enabled);
                  setIsRouteTimeMode(false);
                  clearRouteTimeDraft();
                  setRouteTemplatePendingStart(null);
                  setRouteTemplateMessage("");
                  setSelectedEdgeId("");
                  setSelectedNodeId("");
                  setSelectedNodeIds(new Set());
                }}
                className={`rounded px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300 ${
                  isRouteTemplateMode
                    ? "bg-blue-700 dark:bg-slate-700"
                    : "bg-slate-700 dark:bg-blue-700"
                }`}
              >
                {isRouteTemplateMode ? "設定中" : "設定モード"}
              </button>
            </div>
            {state.routeTemplates.length > 0 ? (
              <>
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                  経路セット
                  <select
                    value={selectedRouteTemplateId}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      setSelectedRouteTemplateId(event.target.value)
                    }
                    className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                  >
                    {state.routeTemplates.map((routeTemplate) => (
                      <option key={routeTemplate.id} value={routeTemplate.id}>
                        {routeTemplate.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setRouteTemplateEditKey("serviceRouteSections")
                    }
                    className={`rounded px-3 py-2 text-sm ${
                      routeTemplateEditKey === "serviceRouteSections"
                        ? "bg-blue-700 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    営業
                  </button>
                  <button
                    type="button"
                    disabled={!selectedRouteTemplate?.deadheadEnabled}
                    onClick={() =>
                      setRouteTemplateEditKey("deadheadRouteSections")
                    }
                    className={`rounded px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
                      routeTemplateEditKey === "deadheadRouteSections"
                        ? "bg-blue-700 text-white"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    回送
                  </button>
                </div>
                {isRouteTemplateMode ? (
                  <>
                    <p className="text-xs text-gray-500">
                      キャンバス上の駅・車庫ノードを番線部分ごとにクリックします。
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={
                          !selectedRouteTemplate ||
                          routeTemplateRouteSections.length === 0
                        }
                        onClick={popSelectedRouteTemplateRoute}
                        className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        戻す
                      </button>
                      <button
                        type="button"
                        disabled={
                          !selectedRouteTemplate ||
                          (routeTemplateRouteSections.length === 0 &&
                            !routeTemplatePendingStart)
                        }
                        onClick={clearSelectedRouteTemplateRoute}
                        className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        クリア
                      </button>
                    </div>
                    {routeTemplatePendingStart ? (
                      <p className="text-xs text-blue-700">
                        開始番線を選択中です。緑の領域から次を選択してください。
                      </p>
                    ) : null}
                    {routeTemplateMessage ? (
                      <p className="text-xs text-gray-500">
                        {routeTemplateMessage}
                      </p>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-gray-500">
                列車運用側で経路セットを追加してください。
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-gray-700">所要時間</h3>
              <button
                type="button"
                onClick={() => {
                  setIsRouteTimeMode((enabled) => !enabled);
                  setIsRouteTemplateMode(false);
                  setRouteTemplatePendingStart(null);
                  setRouteTemplateMessage("");
                  setSelectedEdgeId("");
                  setSelectedNodeId("");
                  setSelectedNodeIds(new Set());
                  clearRouteTimeDraft();
                }}
                className={`rounded px-3 py-2 text-sm text-white ${
                  isRouteTimeMode
                    ? "bg-orange-600 dark:bg-slate-700"
                    : "bg-slate-700 dark:bg-blue-700"
                }`}
              >
                {isRouteTimeMode ? "設定中" : "設定モード"}
              </button>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-gray-600">
                車速区分
                <select
                  value={selectedRouteTimeSpeedClassIndex}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    setSelectedRouteTimeSpeedClassIndex(
                      Math.max(0, Number(event.target.value))
                    )
                  }
                  className="rounded border border-gray-300 bg-white p-2 text-sm text-gray-900"
                >
                  {Array.from({ length: routeTimeSpeedClassCount }, (_, index) => (
                    <option key={index} value={index}>
                      {index + 1}番設定
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => {
                  dispatch({
                    type: "addRouteTimeSpeedClass",
                    payload: { copyFromIndex: selectedRouteTimeSpeedClassIndex },
                  });
                  setSelectedRouteTimeSpeedClassIndex(routeTimeSpeedClassCount);
                }}
                className="rounded border border-blue-200 bg-white px-3 py-2 text-sm text-blue-700"
              >
                追加
              </button>
            </div>
            {isRouteTimeMode ? (
              <>
                <p className="text-xs text-gray-500">
                  開始接続点、必要な分岐、終端接続点の順に選択します。
                </p>
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                  所要時間（分）
                  <input
                    type="number"
                    min="0"
                    value={routeTimeMinutes}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setRouteTimeMinutes(
                        Math.max(0, Number(event.target.value))
                      )
                    }
                    className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                  />
                </label>
                <button
                  type="button"
                  disabled={!routeTimeDraftComplete || routeTimeDraftDuplicate}
                  onClick={saveRouteTimeDraft}
                  className="rounded bg-green-700 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  対象経路を保存
                </button>
                <button
                  type="button"
                  onClick={clearRouteTimeDraft}
                  className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-700"
                >
                  選択をクリア
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={routeTimeDraftPast.length === 0}
                    onClick={undoRouteTimeDraft}
                    className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    戻す
                  </button>
                  <button
                    type="button"
                    disabled={routeTimeDraftFuture.length === 0}
                    onClick={redoRouteTimeDraft}
                    className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    やり直し
                  </button>
                </div>
                {routeTimeMessage ? (
                  <p className="text-xs text-gray-500">{routeTimeMessage}</p>
                ) : null}
                {routeTimeDraftDuplicate ? (
                  <p className="text-xs text-red-600">
                    同じ接続線集合の所要時間区間は既に設定済みです。
                  </p>
                ) : null}
              </>
            ) : null}
            {state.routeTimeSections.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h4 className="text-sm font-bold text-gray-700">
                  設定済み区間
                </h4>
                <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                  {routeTimeSectionsForSelectedSpeed.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setSelectedRouteTimeSectionId(section.id)}
                      onContextMenu={(event: MouseEvent<HTMLButtonElement>) => {
                        event.preventDefault();
                        setSelectedRouteTimeSectionId(section.id);
                        dispatch({
                          type: "updateRouteTimeSection",
                          payload: {
                            id: section.id,
                            internalDirection:
                              getNextRouteTimeSectionInternalDirection(
                                section.internalDirection ?? "forward"
                              ),
                          },
                        });
                      }}
                      className={`flex items-start gap-2 rounded border px-3 py-2 text-left text-sm ${
                        section.id === selectedRouteTimeSectionId
                          ? "border-blue-700 bg-blue-50 text-blue-950 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-50"
                          : "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      }`}
                    >
                      <span
                        className="mt-1 h-3 w-3 shrink-0 rounded-full"
                        style={{
                          backgroundColor: getRouteTimeSectionColor(section),
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        {getRouteTimeSectionLabel(state, section)}
                      </span>
                      <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-slate-700 dark:text-slate-100">
                        {
                          routeTimeSectionInternalDirectionLabels[
                            section.internalDirection ?? "forward"
                          ]
                        }
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {selectedRouteTimeSection
              ? (() => {
                  const resolvedSegments = resolveRouteTimeSectionSegments(
                    routeTimeSectionsForSelectedSpeed,
                    selectedRouteTimeSection,
                    state.routeNodes
                  );
                  const segmentMinutes =
                    getRouteTimeSectionDisplaySegmentMinutes(
                      selectedRouteTimeSection,
                      resolvedSegments.segmentMinutes
                    );
                  const segmentFixed = getRouteTimeSectionDisplaySegmentMinutes(
                    selectedRouteTimeSection,
                    resolvedSegments.fixed.map((fixed) => (fixed ? 1 : 0))
                  ).map((fixed) => fixed === 1);
                  const breakpoints =
                    getRouteTimeSectionBreakpoints(segmentMinutes);
                  const hasSplitTiming = segmentMinutes.length > 1;
                  const segmentDisplayTotal = Math.max(
                    selectedRouteTimeSection.travelMinutes,
                    segmentMinutes.reduce(
                      (total, minutes) => total + minutes,
                      0
                    )
                  );
                  return (
                    <div className="flex flex-col gap-3 border-t pt-3">
                      <div className="flex items-center justify-between gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                        <span>内部方向判定</span>
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({
                              type: "updateRouteTimeSection",
                              payload: {
                                id: selectedRouteTimeSection.id,
                                internalDirection:
                                  getNextRouteTimeSectionInternalDirection(
                                    selectedRouteTimeSection.internalDirection ??
                                      "forward"
                                  ),
                              },
                            })
                          }
                          className="rounded bg-slate-100 px-2 py-1 font-bold text-gray-700"
                        >
                          {
                            routeTimeSectionInternalDirectionLabels[
                              selectedRouteTimeSection.internalDirection ??
                                "forward"
                            ]
                          }
                        </button>
                      </div>
                      <label className="flex flex-col gap-1 text-xs text-gray-600">
                        選択区間の所要時間（分）
                        <input
                          type="number"
                          min="0"
                          value={selectedRouteTimeSection.travelMinutes}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            dispatch({
                              type: "updateRouteTimeSection",
                              payload: {
                                id: selectedRouteTimeSection.id,
                                speedClassIndex:
                                  selectedRouteTimeSpeedClassIndex,
                                travelMinutes: Math.max(
                                  0,
                                  Number(event.target.value)
                                ),
                              },
                            })
                          }
                          className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                        />
                      </label>
                      {hasSplitTiming ? (
                        <div className="flex flex-col gap-2 rounded border border-gray-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
                            <span>分岐ごとの所要時間</span>
                            <span>
                              {selectedRouteTimeSection.travelMinutes}分
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-xs text-gray-600">
                            <span className="min-w-0 truncate">
                              {getRouteTimeSectionEndpointLabel(
                                state,
                                getRouteTimeSectionDisplayEndpoints(
                                  selectedRouteTimeSection
                                ).startNodeId,
                                getRouteTimeSectionDisplayEndpoints(
                                  selectedRouteTimeSection
                                ).startPortIndex
                              )}
                            </span>
                            <span className="shrink-0 text-gray-400">→</span>
                            <span className="min-w-0 truncate text-right">
                              {getRouteTimeSectionEndpointLabel(
                                state,
                                getRouteTimeSectionDisplayEndpoints(
                                  selectedRouteTimeSection
                                ).endNodeId,
                                getRouteTimeSectionDisplayEndpoints(
                                  selectedRouteTimeSection
                                ).endPortIndex
                              )}
                            </span>
                          </div>
                          <div className="relative h-4 overflow-hidden rounded bg-slate-200">
                            <div className="flex h-full">
                              {segmentMinutes.map((minutes, index) => (
                                <div
                                  key={`${selectedRouteTimeSection.id}-segment-${index}`}
                                  className="h-full"
                                  style={{
                                    width: `${
                                      segmentDisplayTotal > 0
                                        ? (minutes / segmentDisplayTotal) * 100
                                        : 100 / segmentMinutes.length
                                    }%`,
                                    backgroundColor:
                                      index % 2 === 0 ? "#22c55e" : "#16a34a",
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                            {segmentMinutes.map((minutes, index) => (
                              <span
                                key={`${selectedRouteTimeSection.id}-segment-label-${index}`}
                                className="rounded bg-white px-2 py-1"
                              >
                                {index + 1}: {minutes}分
                                {segmentFixed[index] ? "（自動）" : ""}
                              </span>
                            ))}
                          </div>
                          {resolvedSegments.conflicts.length > 0 ? (
                            <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                              他区間と異なる分岐間時間があります。現在の区間の値を優先して表示しています。
                            </div>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                dispatch({
                                  type: "updateRouteTimeSection",
                                  payload: {
                                    id: selectedRouteTimeSection.id,
                                    speedClassIndex:
                                      selectedRouteTimeSpeedClassIndex,
                                    segmentMinutes: [],
                                  },
                                })
                              }
                              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
                            >
                              この区間の分岐配分を自動に戻す
                            </button>
                          </div>
                          {breakpoints.map((breakpoint, index) => (
                            <label
                              key={`${selectedRouteTimeSection.id}-breakpoint-${index}`}
                              className="flex flex-col gap-1 text-xs text-gray-600"
                            >
                              分岐{index + 1}: {breakpoint}分地点
                              <input
                                type="range"
                                min="0"
                                max={segmentDisplayTotal}
                                value={breakpoint}
                                onChange={(
                                  event: ChangeEvent<HTMLInputElement>
                                ) =>
                                  updateRouteTimeSectionBreakpoint(
                                    selectedRouteTimeSection,
                                    index,
                                    Number(event.target.value)
                                  )
                                }
                                className="accent-green-700"
                              />
                            </label>
                          ))}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          dispatch({
                            type: "removeRouteTimeSection",
                            payload: { id: selectedRouteTimeSection.id },
                          });
                          setSelectedRouteTimeSectionId("");
                        }}
                        className="rounded bg-red-600 px-3 py-2 text-sm text-white"
                      >
                        所要時間区間を削除
                      </button>
                    </div>
                  );
                })()
              : null}
          </section>

          {selectedNode ? (
            <section className="flex flex-col gap-2 border-t pt-4">
              <h3 className="font-bold text-gray-700">ノード編集</h3>
              {selectedNode.type === "connection" ? (
                <>
                  <p className="text-sm text-gray-500">
                    分岐ノードです。形状ごとに通過可能なルートを判定します。
                  </p>
                  <label className="flex flex-col gap-1 text-xs text-gray-600">
                    分岐形状
                    <select
                      value={selectedNode.connectionType}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        dispatch({
                          type: "updateRouteNode",
                          payload: {
                            id: selectedNode.id,
                            connectionType: event.target
                              .value as ConnectionType,
                          },
                        })
                      }
                      className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                    >
                      {connectionTypes.map((connectionType) => (
                        <option key={connectionType} value={connectionType}>
                          {connectionTypeLabels[connectionType]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => rotateRouteNodeClockwise(selectedNode)}
                    className="rounded bg-slate-700 px-3 py-2 text-sm text-white"
                  >
                    時計回りに回転
                  </button>
                </>
              ) : (
                <>
                  <select
                    value={selectedNode.stationId}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      dispatch({
                        type: "updateRouteNode",
                        payload: {
                          id: selectedNode.id,
                          stationId: event.target.value,
                        },
                      })
                    }
                    className="rounded border border-gray-300 p-2 text-sm"
                  >
                    <option value="">Station未指定</option>
                    {state.stations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={selectedNode.label}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      dispatch({
                        type: "updateRouteNode",
                        payload: {
                          id: selectedNode.id,
                          label: event.target.value,
                        },
                      })
                    }
                    className="rounded border border-gray-300 p-2 text-sm"
                  />
                  <select
                    value={selectedNode.type}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      dispatch({
                        type: "updateRouteNode",
                        payload: {
                          id: selectedNode.id,
                          nodeType: event.target.value as RouteNodeType,
                        },
                      })
                    }
                    className="rounded border border-gray-300 p-2 text-sm"
                  >
                    {nodeTypes.map((nodeType) => (
                      <option key={nodeType} value={nodeType}>
                        {routeNodeTypeLabels[nodeType]}
                      </option>
                    ))}
                  </select>
                  <label className="flex flex-col gap-1 text-xs text-gray-600">
                    {selectedNode.type === "crossing" ? "水平番線数" : "番線数"}
                    <input
                      type="number"
                      min="1"
                      value={getPlatformCount(selectedNode)}
                      aria-label={
                        selectedNode.type === "crossing"
                          ? "水平番線数"
                          : "番線数"
                      }
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        dispatch({
                          type: "updateRouteNode",
                          payload: {
                            id: selectedNode.id,
                            platformCount: Math.max(
                              1,
                              Number(event.target.value)
                            ),
                          },
                        })
                      }
                      className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                    />
                  </label>
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-bold text-gray-600">
                      {selectedNode.type === "crossing"
                        ? "水平番線名"
                        : "番線名"}
                    </h4>
                    {Array.from({
                      length: getPlatformCount(selectedNode),
                    }).map((_, index) => (
                      <label
                        key={`platform-label-${index}`}
                        className="flex items-center gap-2 text-xs text-gray-600"
                      >
                        {index + 1}
                        <input
                          type="text"
                          value={getPlatformLabel(selectedNode, index)}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            const platformLabels = normalizePlatformLabels(
                              selectedNode.platformLabels,
                              getPlatformCount(selectedNode)
                            );
                            platformLabels[index] = event.target.value;
                            dispatch({
                              type: "updateRouteNode",
                              payload: {
                                id: selectedNode.id,
                                platformLabels,
                              },
                            });
                          }}
                          className="min-w-0 flex-1 rounded border border-gray-300 p-2 text-sm text-gray-900"
                        />
                      </label>
                    ))}
                  </div>
                  {selectedNode.type === "crossing" ? (
                    <>
                      <label className="flex flex-col gap-1 text-xs text-gray-600">
                        垂直番線数
                        <input
                          type="number"
                          min="1"
                          value={getVerticalPlatformCount(selectedNode)}
                          aria-label="垂直番線数"
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            dispatch({
                              type: "updateRouteNode",
                              payload: {
                                id: selectedNode.id,
                                verticalPlatformCount: Math.max(
                                  1,
                                  Number(event.target.value)
                                ),
                              },
                            })
                          }
                          className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                        />
                      </label>
                      <div className="flex flex-col gap-2">
                        <h4 className="text-xs font-bold text-gray-600">
                          垂直番線名
                        </h4>
                        {Array.from({
                          length: getVerticalPlatformCount(selectedNode),
                        }).map((_, index) => (
                          <label
                            key={`vertical-platform-label-${index}`}
                            className="flex items-center gap-2 text-xs text-gray-600"
                          >
                            {index + 1}
                            <input
                              type="text"
                              value={getVerticalPlatformLabel(
                                selectedNode,
                                index
                              )}
                              onChange={(
                                event: ChangeEvent<HTMLInputElement>
                              ) => {
                                const verticalPlatformLabels =
                                  normalizePlatformLabels(
                                    selectedNode.verticalPlatformLabels,
                                    getVerticalPlatformCount(selectedNode)
                                  );
                                verticalPlatformLabels[index] =
                                  event.target.value;
                                dispatch({
                                  type: "updateRouteNode",
                                  payload: {
                                    id: selectedNode.id,
                                    verticalPlatformLabels,
                                  },
                                });
                              }}
                              className="min-w-0 flex-1 rounded border border-gray-300 p-2 text-sm text-gray-900"
                            />
                          </label>
                        ))}
                      </div>
                    </>
                  ) : null}
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  dispatch({
                    type: "removeRouteNode",
                    payload: { id: selectedNode.id },
                  });
                  setSelectedNodeId("");
                }}
                className="rounded bg-red-600 px-3 py-2 text-sm text-white"
              >
                ノードを削除
              </button>
            </section>
          ) : null}

          <p className="border-t pt-4 text-sm text-gray-500">
            通常ドラッグでノード移動。Ctrl + ドラッグでノード同士を接続。
            円形ボタンでノードを90°回転します。右上の読取方向はダイヤグラム縦軸順の判定に使います。
          </p>
        </aside>
      </div>
    </section>
  );
};
