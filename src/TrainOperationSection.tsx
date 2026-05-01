import {
  ChangeEvent,
  Dispatch,
  DragEvent,
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getThemeTrainColor } from "./lib/Color";
import {
  colorToHex,
  createId,
  getRouteNodeLabel,
  hexToColor,
  isValidTimeString,
  LineStyle,
  lineStyleLabels,
  RouteNode,
  RoutePortSide,
  RouteTemplate,
  RouteTimeSection,
  Stop,
  StopStatus,
  stopStatusLabels,
  timeStringToDate,
  TrainRun,
  TrainRouteKey,
  TrainRunRouteSection,
  trainRunTypeLabels,
  TrainRunType,
} from "./lib/domain";
import { Actions, State } from "./reducer/reducer";
import { TextInput } from "./TextInput";

type Props = {
  state: State;
  dispatch: Dispatch<Actions>;
  selectedTrainRunId: string;
  setSelectedTrainRunId: (trainRunId: string) => void;
  selectedRouteTemplateId: string;
  setSelectedRouteTemplateId: (routeTemplateId: string) => void;
  isDarkTheme: boolean;
};

const trainRunTypes: TrainRunType[] = [
  "passenger",
  "deadhead",
  "freight",
  "test",
];

const stopStatuses: StopStatus[] = ["stop", "pass", "unset"];
const lineStyles: LineStyle[] = [
  "auto",
  "solid",
  "dashed",
  "dotted",
  "dashDot",
  "longDash",
];

const defaultStopMinutes = 5;
const minutesPerDay = 24 * 60;

const timeStringToMinutesOfDay = (value: string) => {
  if (!value || !isValidTimeString(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const minutesToPercent = (minutes: number) =>
  `${(minutes / minutesPerDay) * 100}%`;

const getTimelineSegments = (startTime: string, endTime: string) => {
  const start = timeStringToMinutesOfDay(startTime);
  const end = timeStringToMinutesOfDay(endTime);
  if (start === null || end === null || start === end) return [];
  if (start < end) {
    return [
      {
        left: minutesToPercent(start),
        width: minutesToPercent(end - start),
      },
    ];
  }
  return [
    {
      left: minutesToPercent(start),
      width: minutesToPercent(minutesPerDay - start),
    },
    {
      left: "0%",
      width: minutesToPercent(end),
    },
  ];
};

const getTimelinePointPercent = (time: string, fallback: string) => {
  const minutes = timeStringToMinutesOfDay(time);
  return minutes === null ? fallback : minutesToPercent(minutes);
};

const getRouteNodeName = (
  routeNodes: RouteNode[],
  state: State,
  id: string
) => {
  const routeNode = routeNodes.find((node) => node.id === id);
  return routeNode
    ? getRouteNodeLabel(state.stations, routeNode)
    : "未登録ノード";
};

const stopPrimaryTime = (stop: Stop) => stop.arrivalTime || stop.departureTime;

const getCombinedTrainRouteNodeIds = (trainRun: TrainRun) =>
  trainRun.deadheadRouteNodeIds.length > 0 &&
  trainRun.serviceRouteNodeIds.length > 0 &&
  trainRun.deadheadRouteNodeIds[trainRun.deadheadRouteNodeIds.length - 1] ===
    trainRun.serviceRouteNodeIds[0]
    ? [
        ...trainRun.deadheadRouteNodeIds,
        ...trainRun.serviceRouteNodeIds.slice(1),
      ]
    : [...trainRun.deadheadRouteNodeIds, ...trainRun.serviceRouteNodeIds];

const getRouteSectionById = (state: State, routeTimeSectionId: string) =>
  state.routeTimeSections.find((section) => section.id === routeTimeSectionId);

const getRouteSectionStartPort = (
  section: RouteTimeSection,
  reversed: boolean
) =>
  reversed
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

const getRouteSectionEndPort = (section: RouteTimeSection, reversed: boolean) =>
  reversed
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

const portRefsEqual = (
  a: { nodeId: string; side: RoutePortSide; index: number },
  b: { nodeId: string; side: RoutePortSide; index: number }
) => a.nodeId === b.nodeId && a.side === b.side && a.index === b.index;

const getPortSideAxis = (side: RoutePortSide) =>
  side === "left" || side === "right" ? "horizontal" : "vertical";

const canContinueFromPort = (
  state: State,
  from: { nodeId: string; side: RoutePortSide; index: number },
  to: { nodeId: string; side: RoutePortSide; index: number }
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

const getRouteSectionKey = (section: TrainRunRouteSection) =>
  `${section.routeTimeSectionId}:${section.reversed ? "1" : "0"}`;

const getRouteSectionLabel = (
  state: State,
  routeSection: TrainRunRouteSection
) => {
  const section = getRouteSectionById(state, routeSection.routeTimeSectionId);
  if (!section) return "未登録区間";
  const startPort = getRouteSectionStartPort(section, routeSection.reversed);
  const endPort = getRouteSectionEndPort(section, routeSection.reversed);
  return `${getRouteNodeName(state.routeNodes, state, startPort.nodeId)} ${
    startPort.index + 1
  }番 → ${getRouteNodeName(state.routeNodes, state, endPort.nodeId)} ${
    endPort.index + 1
  }番 / ${section.travelMinutes}分`;
};

const getRouteNodeIdsFromSections = (
  state: State,
  routeSections: TrainRunRouteSection[]
) =>
  routeSections.reduce<string[]>((nodeIds, routeSection) => {
    const section = getRouteSectionById(state, routeSection.routeTimeSectionId);
    if (!section) return nodeIds;
    const startPort = getRouteSectionStartPort(section, routeSection.reversed);
    const endPort = getRouteSectionEndPort(section, routeSection.reversed);
    const nextNodeIds = [...nodeIds];
    if (nextNodeIds[nextNodeIds.length - 1] !== startPort.nodeId) {
      nextNodeIds.push(startPort.nodeId);
    }
    nextNodeIds.push(endPort.nodeId);
    return nextNodeIds;
  }, []);

const trainRunHasDeadheadTime = (trainRun: TrainRun) =>
  Boolean(trainRun.deadheadStartTime || trainRun.deadheadEndTime);

const getEffectiveServiceRouteSections = (
  trainRun: TrainRun,
  routeTemplate?: RouteTemplate
) => routeTemplate?.serviceRouteSections ?? trainRun.serviceRouteSections;

const getEffectiveDeadheadRouteSections = (
  trainRun: TrainRun,
  routeTemplate?: RouteTemplate
) => {
  if (!routeTemplate) return trainRun.deadheadRouteSections;
  return routeTemplate.deadheadEnabled && trainRunHasDeadheadTime(trainRun)
    ? routeTemplate.deadheadRouteSections
    : [];
};

const getTrainRouteNodeIds = (
  state: State,
  trainRun: TrainRun,
  routeTemplate?: RouteTemplate
) => {
  const serviceRouteSections = getEffectiveServiceRouteSections(
    trainRun,
    routeTemplate
  );
  const deadheadRouteSections = getEffectiveDeadheadRouteSections(
    trainRun,
    routeTemplate
  );
  const deadheadNodeIds =
    deadheadRouteSections.length > 0
      ? getRouteNodeIdsFromSections(state, deadheadRouteSections)
      : routeTemplate
      ? []
      : trainRun.deadheadRouteNodeIds;
  const serviceNodeIds =
    serviceRouteSections.length > 0
      ? getRouteNodeIdsFromSections(state, serviceRouteSections)
      : routeTemplate
      ? []
      : trainRun.serviceRouteNodeIds;

  if (
    deadheadNodeIds.length > 0 &&
    serviceNodeIds.length > 0 &&
    deadheadNodeIds[deadheadNodeIds.length - 1] === serviceNodeIds[0]
  ) {
    return [...deadheadNodeIds, ...serviceNodeIds.slice(1)];
  }
  if (
    deadheadNodeIds.length > 0 &&
    serviceNodeIds.length > 0 &&
    deadheadNodeIds[0] === serviceNodeIds[serviceNodeIds.length - 1]
  ) {
    return [...serviceNodeIds, ...deadheadNodeIds.slice(1)];
  }
  return [...deadheadNodeIds, ...serviceNodeIds];
};

const getServiceRouteNodeIds = (
  state: State,
  trainRun: TrainRun,
  routeTemplate?: RouteTemplate
) => {
  const serviceRouteSections = getEffectiveServiceRouteSections(
    trainRun,
    routeTemplate
  );
  return serviceRouteSections.length > 0
    ? getRouteNodeIdsFromSections(state, serviceRouteSections)
    : routeTemplate
    ? []
    : trainRun.serviceRouteNodeIds;
};

const hasDisconnectedRouteSections = (
  state: State,
  routeSections: TrainRunRouteSection[]
) =>
  routeSections.some((routeSection, index) => {
    if (index === 0) return false;
    const previousSection = getRouteSectionById(
      state,
      routeSections[index - 1].routeTimeSectionId
    );
    const currentSection = getRouteSectionById(
      state,
      routeSection.routeTimeSectionId
    );
    if (!previousSection || !currentSection) return true;
    return !canContinueFromPort(
      state,
      getRouteSectionEndPort(
        previousSection,
        routeSections[index - 1].reversed
      ),
      getRouteSectionStartPort(currentSection, routeSection.reversed)
    );
  });

const hasRouteTimeSectionBetween = (
  state: State,
  fromNodeId: string,
  toNodeId: string
) =>
  state.routeTimeSections.some(
    (section) =>
      (section.startNodeId === fromNodeId && section.endNodeId === toNodeId) ||
      (section.startNodeId === toNodeId && section.endNodeId === fromNodeId)
  );

const rotatePortSideByDegrees = (
  side: RoutePortSide,
  degrees: number
): RoutePortSide => {
  const sides: RoutePortSide[] = ["top", "right", "bottom", "left"];
  const index = sides.indexOf(side);
  const steps = Math.round(degrees / 90);
  return sides[(index + steps + sides.length * 4) % sides.length];
};

const getConnectionRoutePairs = (
  connectionType: RouteNode["connectionType"]
) => {
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
  const entryCanonicalSide = rotatePortSideByDegrees(
    entrySide,
    -routeNode.rotation
  );
  const exitCanonicalSide = rotatePortSideByDegrees(
    exitSide,
    -routeNode.rotation
  );
  if (entryCanonicalSide === exitCanonicalSide) return false;
  const [leftIndex, rightIndex] =
    entryCanonicalSide === "left"
      ? [entryIndex, exitIndex]
      : [exitIndex, entryIndex];

  return getConnectionRoutePairs(routeNode.connectionType).some(
    ([fromIndex, toIndex]) => fromIndex === leftIndex && toIndex === rightIndex
  );
};

const getRouteEdgeEndpoint = (
  routeEdge: State["routeEdges"][number],
  nodeId: string
) => {
  if (routeEdge.fromNodeId === nodeId) {
    return {
      side: routeEdge.fromPortSide,
      index: routeEdge.fromPortIndex,
      otherNodeId: routeEdge.toNodeId,
      otherSide: routeEdge.toPortSide,
      otherIndex: routeEdge.toPortIndex,
    };
  }
  if (routeEdge.toNodeId === nodeId && routeEdge.bidirectional) {
    return {
      side: routeEdge.toPortSide,
      index: routeEdge.toPortIndex,
      otherNodeId: routeEdge.fromNodeId,
      otherSide: routeEdge.fromPortSide,
      otherIndex: routeEdge.fromPortIndex,
    };
  }
  return null;
};

const hasValidRouteBetweenNodes = (
  state: State,
  fromNodeId: string,
  toNodeId: string
) => {
  if (fromNodeId === toNodeId) return true;
  const routeNodeById = new Map(
    state.routeNodes.map((routeNode) => [routeNode.id, routeNode])
  );
  const queue: Array<{
    nodeId: string;
    entrySide?: RoutePortSide;
    entryIndex?: number;
    visitedKey: string;
  }> = [{ nodeId: fromNodeId, visitedKey: fromNodeId }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.visitedKey)) continue;
    visited.add(current.visitedKey);

    const currentNode = routeNodeById.get(current.nodeId);
    if (!currentNode) continue;

    for (const routeEdge of state.routeEdges) {
      const endpoint = getRouteEdgeEndpoint(routeEdge, current.nodeId);
      if (!endpoint) continue;
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
        continue;
      }

      const nextNode = routeNodeById.get(endpoint.otherNodeId);
      if (!nextNode) continue;
      if (nextNode.id === toNodeId) return true;
      if (nextNode.type !== "connection") continue;

      queue.push({
        nodeId: nextNode.id,
        entrySide: endpoint.otherSide,
        entryIndex: endpoint.otherIndex,
        visitedKey: `${nextNode.id}:${endpoint.otherSide}:${endpoint.otherIndex}`,
      });
    }
  }

  return false;
};

const stopWarnings = (
  state: State,
  trainRun: TrainRun,
  stop: Stop,
  index: number
) => {
  const warnings: string[] = [];
  if (stop.status !== "unset" && !stopPrimaryTime(stop)) {
    warnings.push("時刻未入力");
  }
  if (
    stop.arrivalTime &&
    stop.departureTime &&
    timeStringToDate(stop.departureTime).getTime() <
      timeStringToDate(stop.arrivalTime).getTime()
  ) {
    warnings.push("着発が逆転");
  }

  const previousStop = trainRun.stops[index - 1];
  const previousTime = previousStop ? stopPrimaryTime(previousStop) : "";
  const currentTime = stopPrimaryTime(stop);
  if (
    previousTime &&
    currentTime &&
    timeStringToDate(currentTime).getTime() <
      timeStringToDate(previousTime).getTime()
  ) {
    warnings.push("前Stopより早い");
  }
  if (
    previousStop &&
    !hasValidRouteBetweenNodes(
      state,
      previousStop.routeNodeId,
      stop.routeNodeId
    )
  ) {
    warnings.push("経路なし");
  }

  return warnings;
};

const autoScheduleWarnings = (
  state: State,
  trainRun: TrainRun,
  routeTemplate?: RouteTemplate
) => {
  const warnings: string[] = [];
  const serviceRouteSections = getEffectiveServiceRouteSections(
    trainRun,
    routeTemplate
  );
  const deadheadRouteSections = getEffectiveDeadheadRouteSections(
    trainRun,
    routeTemplate
  );
  const usesRouteTemplate = Boolean(routeTemplate);
  const hasServiceRoute = usesRouteTemplate
    ? serviceRouteSections.length > 0
    : trainRun.serviceRouteNodeIds.length > 0 ||
      trainRun.serviceRouteSections.length > 0;
  const hasDeadheadRoute = usesRouteTemplate
    ? deadheadRouteSections.length > 0
    : trainRun.deadheadRouteNodeIds.length > 0 ||
      trainRun.deadheadRouteSections.length > 0;
  const routeNodeIds =
    usesRouteTemplate ||
    serviceRouteSections.length > 0 ||
    deadheadRouteSections.length > 0
      ? getTrainRouteNodeIds(state, trainRun, routeTemplate)
      : getCombinedTrainRouteNodeIds(trainRun);

  if (routeNodeIds.length === 0) {
    warnings.push("営業経路または回送経路");
  }
  if (hasDeadheadRoute && !trainRun.deadheadStartTime) {
    warnings.push("回送開始時刻");
  }
  if (hasDeadheadRoute && !trainRun.deadheadEndTime) {
    warnings.push("回送終了時刻");
  }
  if (!hasDeadheadRoute && hasServiceRoute && !trainRun.serviceStartTime) {
    warnings.push("営業開始時刻");
  }
  if (hasServiceRoute && !trainRun.serviceEndTime) {
    warnings.push("営業終了時刻");
  }
  if (hasDisconnectedRouteSections(state, deadheadRouteSections)) {
    warnings.push("回送経路の接続点が連続していません");
  }
  if (hasDisconnectedRouteSections(state, serviceRouteSections)) {
    warnings.push("営業経路の接続点が連続していません");
  }

  if (
    !usesRouteTemplate &&
    serviceRouteSections.length === 0 &&
    deadheadRouteSections.length === 0
  ) {
    routeNodeIds.slice(1).forEach((routeNodeId, index) => {
      const previousRouteNodeId = routeNodeIds[index];
      if (hasRouteTimeSectionBetween(state, previousRouteNodeId, routeNodeId)) {
        return;
      }
      warnings.push(
        `${getRouteNodeName(
          state.routeNodes,
          state,
          previousRouteNodeId
        )}ー${getRouteNodeName(
          state.routeNodes,
          state,
          routeNodeId
        )} の所要時間`
      );
    });
  }

  return warnings;
};

export const TrainOperationSection = ({
  state,
  dispatch,
  selectedTrainRunId,
  setSelectedTrainRunId,
  selectedRouteTemplateId,
  setSelectedRouteTemplateId,
  isDarkTheme,
}: Props) => {
  const visibleRouteNodes = useMemo(
    () =>
      state.routeNodes.filter((routeNode) => routeNode.type !== "connection"),
    [state.routeNodes]
  );
  const [newStopRouteNodeId, setNewStopRouteNodeId] = useState(
    visibleRouteNodes[0]?.id ?? ""
  );
  const [newStopStatus, setNewStopStatus] = useState<StopStatus>("stop");
  const [repeatSelectionStart, setRepeatSelectionStart] = useState<
    number | null
  >(null);
  const [repeatSelectionEnd, setRepeatSelectionEnd] = useState<number | null>(
    null
  );
  const [repeatCopyCount, setRepeatCopyCount] = useState(2);
  const [repeatSelectionMode, setRepeatSelectionMode] = useState(false);
  const [repeatRangeDragActive, setRepeatRangeDragActive] = useState(false);
  const [repeatRangeDropIndex, setRepeatRangeDropIndex] = useState<
    number | null
  >(null);
  const [draggingTrainRunId, setDraggingTrainRunId] = useState<string | null>(
    null
  );
  const [dragOverTrainRunId, setDragOverTrainRunId] = useState<string | null>(
    null
  );
  const [dragOverPosition, setDragOverPosition] = useState<
    "before" | "after" | null
  >(null);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [dragOverStopId, setDragOverStopId] = useState<string | null>(null);
  const [dragOverStopPosition, setDragOverStopPosition] = useState<
    "before" | "after" | null
  >(null);

  useEffect(() => {
    if (
      state.trainRuns.some((trainRun) => trainRun.id === selectedTrainRunId)
    ) {
      return;
    }
    setSelectedTrainRunId(state.trainRuns[0]?.id ?? "");
  }, [selectedTrainRunId, setSelectedTrainRunId, state.trainRuns]);

  useEffect(() => {
    if (
      visibleRouteNodes.some((routeNode) => routeNode.id === newStopRouteNodeId)
    ) {
      return;
    }
    setNewStopRouteNodeId(visibleRouteNodes[0]?.id ?? "");
  }, [newStopRouteNodeId, visibleRouteNodes]);

  const selectedTrainRun = useMemo<TrainRun | undefined>(
    () =>
      state.trainRuns.find((trainRun) => trainRun.id === selectedTrainRunId),
    [selectedTrainRunId, state.trainRuns]
  );
  const selectedTrainRouteTemplate = useMemo<RouteTemplate | undefined>(
    () =>
      selectedTrainRun
        ? state.routeTemplates.find(
            (routeTemplate) =>
              routeTemplate.id === selectedTrainRun.routeTemplateId
          )
        : undefined,
    [selectedTrainRun, state.routeTemplates]
  );
  const selectedRouteTemplate = useMemo<RouteTemplate | undefined>(
    () =>
      state.routeTemplates.find(
        (routeTemplate) => routeTemplate.id === selectedRouteTemplateId
      ),
    [selectedRouteTemplateId, state.routeTemplates]
  );

  useEffect(() => {
    if (
      state.routeTemplates.some(
        (routeTemplate) => routeTemplate.id === selectedRouteTemplateId
      )
    ) {
      return;
    }
    setSelectedRouteTemplateId(state.routeTemplates[0]?.id ?? "");
  }, [selectedRouteTemplateId, state.routeTemplates]);

  useEffect(() => {
    setRepeatSelectionStart(selectedTrainRun?.repeatRangeStartIndex ?? null);
    setRepeatSelectionEnd(selectedTrainRun?.repeatRangeEndIndex ?? null);
    setRepeatCopyCount(selectedTrainRun?.repeatRangeCount ?? 2);
    setRepeatSelectionMode(false);
    setRepeatRangeDragActive(false);
    setRepeatRangeDropIndex(null);
    setDraggingStopId(null);
    setDragOverStopId(null);
    setDragOverStopPosition(null);
  }, [selectedTrainRun?.id]);

  const addStop = () => {
    if (!selectedTrainRun || !newStopRouteNodeId) return;
    dispatch({
      type: "addStop",
      payload: {
        trainRunId: selectedTrainRun.id,
        routeNodeId: newStopRouteNodeId,
        status: newStopStatus,
      },
    });
  };

  const duplicateTrainRun = (trainRunId: string) => {
    const newId = createId("tr");
    dispatch({
      type: "duplicateTrainRun",
      payload: { id: trainRunId, newId },
    });
    setSelectedTrainRunId(newId);
  };

  const removeTrainRun = (trainRunId: string) => {
    dispatch({
      type: "removeTrainRun",
      payload: { id: trainRunId },
    });
  };

  const getTrainRunDropPosition = (event: DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };

  const getTrainRunDropIndex = () => {
    if (!dragOverTrainRunId || !dragOverPosition) return null;
    const targetIndex = state.trainRuns.findIndex(
      (trainRun) => trainRun.id === dragOverTrainRunId
    );
    const sourceIndex = state.trainRuns.findIndex(
      (trainRun) => trainRun.id === draggingTrainRunId
    );
    if (targetIndex < 0) return null;
    const insertIndex = targetIndex + (dragOverPosition === "after" ? 1 : 0);
    if (
      sourceIndex >= 0 &&
      (insertIndex === sourceIndex || insertIndex === sourceIndex + 1)
    ) {
      return null;
    }
    return insertIndex;
  };

  const clearTrainRunDragState = () => {
    setDraggingTrainRunId(null);
    setDragOverTrainRunId(null);
    setDragOverPosition(null);
  };

  const handleTrainRunDragStart = (
    event: DragEvent<HTMLDivElement>,
    trainRunId: string
  ) => {
    setDraggingTrainRunId(trainRunId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", trainRunId);
  };

  const handleTrainRunDragOver = (
    event: DragEvent<HTMLDivElement>,
    trainRunId: string
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (draggingTrainRunId === trainRunId) {
      setDragOverTrainRunId(null);
      setDragOverPosition(null);
      return;
    }
    setDragOverTrainRunId(trainRunId);
    setDragOverPosition(getTrainRunDropPosition(event));
  };

  const handleTrainRunDrop = (
    event: DragEvent<HTMLDivElement>,
    targetTrainRunId: string
  ) => {
    event.preventDefault();
    const sourceTrainRunId =
      draggingTrainRunId || event.dataTransfer.getData("text/plain");
    const position = getTrainRunDropPosition(event);
    clearTrainRunDragState();
    if (!sourceTrainRunId || sourceTrainRunId === targetTrainRunId) return;
    dispatch({
      type: "reorderTrainRun",
      payload: {
        sourceId: sourceTrainRunId,
        targetId: targetTrainRunId,
        position,
      },
    });
    setSelectedTrainRunId(sourceTrainRunId);
  };

  const getStopDropPosition = (event: DragEvent<HTMLTableRowElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };

  const getStopDropIndex = () => {
    if (!selectedTrainRun || !dragOverStopId || !dragOverStopPosition) {
      return null;
    }
    const targetIndex = selectedTrainRun.stops.findIndex(
      (stop) => stop.id === dragOverStopId
    );
    const sourceIndex = selectedTrainRun.stops.findIndex(
      (stop) => stop.id === draggingStopId
    );
    if (targetIndex < 0) return null;
    const insertIndex =
      targetIndex + (dragOverStopPosition === "after" ? 1 : 0);
    if (
      sourceIndex >= 0 &&
      (insertIndex === sourceIndex || insertIndex === sourceIndex + 1)
    ) {
      return null;
    }
    return insertIndex;
  };

  const clearStopDragState = () => {
    setDraggingStopId(null);
    setDragOverStopId(null);
    setDragOverStopPosition(null);
  };

  const handleStopDragStart = (
    event: DragEvent<HTMLTableRowElement>,
    stopId: string
  ) => {
    if (isAutoScheduleEnabled || repeatSelectionMode) {
      event.preventDefault();
      return;
    }
    setDraggingStopId(stopId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", stopId);
  };

  const handleStopDragOver = (
    event: DragEvent<HTMLTableRowElement>,
    stopId: string
  ) => {
    if (!draggingStopId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (draggingStopId === stopId) {
      setDragOverStopId(null);
      setDragOverStopPosition(null);
      return;
    }
    setDragOverStopId(stopId);
    setDragOverStopPosition(getStopDropPosition(event));
  };

  const handleStopDrop = (
    event: DragEvent<HTMLTableRowElement>,
    targetStopId: string
  ) => {
    if (!selectedTrainRun || !draggingStopId) return;
    event.preventDefault();
    const sourceStopId =
      draggingStopId || event.dataTransfer.getData("text/plain");
    const position = getStopDropPosition(event);
    clearStopDragState();
    if (!sourceStopId || sourceStopId === targetStopId) return;
    dispatch({
      type: "reorderStop",
      payload: {
        trainRunId: selectedTrainRun.id,
        sourceStopId,
        targetStopId,
        position,
      },
    });
  };

  const updateTrainRunStopSetting = (
    settingsKey: "stopSettings" | "deadheadStopSettings",
    routeNodeId: string,
    patch: Partial<{ status: StopStatus; dwellMinutes: number }>
  ) => {
    if (!selectedTrainRun) return;
    const settings = selectedTrainRun[settingsKey] ?? [];
    const current = settings.find(
      (setting) => setting.routeNodeId === routeNodeId
    ) ?? {
      routeNodeId,
      status: "stop" as StopStatus,
      dwellMinutes: selectedTrainRun.defaultStopMinutes || defaultStopMinutes,
    };
    const nextSetting = {
      ...current,
      ...patch,
    };
    dispatch({
      type: "updateTrainRun",
      payload:
        settingsKey === "stopSettings"
          ? {
              id: selectedTrainRun.id,
              stopSettings: [
                ...settings.filter(
                  (setting) => setting.routeNodeId !== routeNodeId
                ),
                nextSetting,
              ],
            }
          : {
              id: selectedTrainRun.id,
              deadheadStopSettings: [
                ...settings.filter(
                  (setting) => setting.routeNodeId !== routeNodeId
                ),
                nextSetting,
              ],
            },
    });
  };

  const updateStopSetting = (
    routeNodeId: string,
    patch: Partial<{ status: StopStatus; dwellMinutes: number }>
  ) => updateTrainRunStopSetting("stopSettings", routeNodeId, patch);

  const updateDeadheadStopSetting = (
    routeNodeId: string,
    patch: Partial<{ status: StopStatus; dwellMinutes: number }>
  ) => updateTrainRunStopSetting("deadheadStopSettings", routeNodeId, patch);

  const selectedTrainHasDeadheadTime = selectedTrainRun
    ? trainRunHasDeadheadTime(selectedTrainRun)
    : false;
  const currentAutoScheduleWarnings = selectedTrainRun
    ? autoScheduleWarnings(state, selectedTrainRun, selectedTrainRouteTemplate)
    : [];
  const isAutoScheduleEnabled = selectedTrainRun
    ? Boolean(selectedTrainRouteTemplate) ||
      selectedTrainRun.serviceRouteNodeIds.length > 0 ||
      selectedTrainRun.deadheadRouteNodeIds.length > 0 ||
      getEffectiveServiceRouteSections(
        selectedTrainRun,
        selectedTrainRouteTemplate
      ).length > 0 ||
      getEffectiveDeadheadRouteSections(
        selectedTrainRun,
        selectedTrainRouteTemplate
      ).length > 0
    : false;
  const showManualStopControls = Boolean(
    selectedTrainRun && !isAutoScheduleEnabled
  );
  const stopTableColumnCount = showManualStopControls ? 8 : 7;

  useEffect(() => {
    if (!selectedTrainRun || !isAutoScheduleEnabled) return;
    setRepeatSelectionMode(false);
    setRepeatSelectionStart(null);
    setRepeatSelectionEnd(null);
    setRepeatRangeDragActive(false);
    setRepeatRangeDropIndex(null);
    if (
      selectedTrainRun.repeatRangeStartIndex === null &&
      selectedTrainRun.repeatRangeEndIndex === null &&
      selectedTrainRun.repeatRangeCount === 1
    ) {
      return;
    }
    dispatch({
      type: "updateTrainRun",
      payload: {
        id: selectedTrainRun.id,
        repeatRangeStartIndex: null,
        repeatRangeEndIndex: null,
        repeatRangeCount: 1,
      },
    });
  }, [
    dispatch,
    isAutoScheduleEnabled,
    selectedTrainRun?.id,
    selectedTrainRun?.repeatRangeCount,
    selectedTrainRun?.repeatRangeEndIndex,
    selectedTrainRun?.repeatRangeStartIndex,
  ]);

  const uniqueServiceRouteNodeIds = selectedTrainRun
    ? [
        ...new Set(
          getServiceRouteNodeIds(
            state,
            selectedTrainRun,
            selectedTrainRouteTemplate
          )
        ),
      ]
    : [];
  const uniqueDeadheadRouteNodeIds = selectedTrainRun
    ? [
        ...new Set(
          (() => {
            const deadheadRouteSections = getEffectiveDeadheadRouteSections(
              selectedTrainRun,
              selectedTrainRouteTemplate
            );
            if (deadheadRouteSections.length > 0) {
              return getRouteNodeIdsFromSections(state, deadheadRouteSections);
            }
            return selectedTrainRouteTemplate
              ? []
              : selectedTrainRun.deadheadRouteNodeIds;
          })()
        ),
      ]
    : [];
  const serviceTimelineSegments = selectedTrainRun
    ? getTimelineSegments(
        selectedTrainRun.serviceStartTime,
        selectedTrainRun.serviceEndTime
      )
    : [];
  const deadheadStartTimelineSegments = selectedTrainRun
    ? getTimelineSegments(
        selectedTrainRun.deadheadStartTime,
        selectedTrainRun.serviceStartTime
      )
    : [];
  const deadheadEndTimelineSegments = selectedTrainRun
    ? getTimelineSegments(
        selectedTrainRun.serviceEndTime,
        selectedTrainRun.deadheadEndTime
      )
    : [];
  const serviceStartTimelinePosition = selectedTrainRun
    ? getTimelinePointPercent(selectedTrainRun.serviceStartTime, "18%")
    : "18%";
  const serviceEndTimelinePosition = selectedTrainRun
    ? getTimelinePointPercent(selectedTrainRun.serviceEndTime, "82%")
    : "82%";

  const selectedRepeatRange =
    repeatSelectionStart === null || repeatSelectionEnd === null
      ? null
      : {
          start: Math.min(repeatSelectionStart, repeatSelectionEnd),
          end: Math.max(repeatSelectionStart, repeatSelectionEnd),
        };

  const selectStopRepeatRangePoint = (index: number) => {
    if (repeatSelectionStart === null || repeatSelectionEnd !== null) {
      setRepeatSelectionStart(index);
      setRepeatSelectionEnd(null);
      return;
    }
    setRepeatSelectionEnd(index);
  };

  const clearSelectedStopRepeatRange = () => {
    if (!selectedTrainRun) return;
    setRepeatSelectionMode(false);
    setRepeatSelectionStart(null);
    setRepeatSelectionEnd(null);
    setRepeatRangeDragActive(false);
    setRepeatRangeDropIndex(null);
    setRepeatCopyCount(2);
    dispatch({
      type: "updateTrainRun",
      payload: {
        id: selectedTrainRun.id,
        repeatRangeStartIndex: null,
        repeatRangeEndIndex: null,
        repeatRangeCount: 1,
      },
    });
  };

  const beginRepeatSelectionMode = () => {
    if (!selectedTrainRun || isAutoScheduleEnabled) return;
    setRepeatSelectionMode(true);
    setRepeatSelectionStart(null);
    setRepeatSelectionEnd(null);
    setRepeatRangeDragActive(false);
    setRepeatRangeDropIndex(null);
  };

  const cancelRepeatSelectionMode = () => {
    setRepeatSelectionMode(false);
    setRepeatSelectionStart(null);
    setRepeatSelectionEnd(null);
    setRepeatRangeDragActive(false);
    setRepeatRangeDropIndex(null);
  };

  const setRepeatRangeDragImage = (
    event: DragEvent<HTMLTableRowElement>,
    rowCount: number
  ) => {
    const dragImage = document.createElement("div");
    dragImage.style.width = "140px";
    dragImage.style.height = `${Math.max(24, Math.min(84, rowCount * 14))}px`;
    dragImage.style.border = "2px solid rgba(37, 99, 235, 0.9)";
    dragImage.style.borderRadius = "6px";
    dragImage.style.background = "rgba(59, 130, 246, 0.22)";
    dragImage.style.position = "fixed";
    dragImage.style.top = "-1000px";
    dragImage.style.left = "-1000px";
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, 16, 12);
    window.setTimeout(() => dragImage.remove(), 0);
  };

  const getRepeatRangeDropIndexFromEvent = (
    event: DragEvent<HTMLTableRowElement>,
    targetIndex: number
  ) => targetIndex + (getStopDropPosition(event) === "after" ? 1 : 0);

  const isRepeatRangeDropIndexAllowed = (insertIndex: number) => {
    if (!selectedRepeatRange) return false;
    return (
      insertIndex <= selectedRepeatRange.start ||
      insertIndex >= selectedRepeatRange.end + 1
    );
  };

  const handleRepeatRangeDragStart = (
    event: DragEvent<HTMLTableRowElement>,
    index: number
  ) => {
    if (
      !selectedRepeatRange ||
      index < selectedRepeatRange.start ||
      index > selectedRepeatRange.end
    ) {
      event.preventDefault();
      return;
    }
    setRepeatRangeDragActive(true);
    setRepeatRangeDropIndex(null);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", "repeat-range");
    setRepeatRangeDragImage(
      event,
      selectedRepeatRange.end - selectedRepeatRange.start + 1
    );
  };

  const handleRepeatRangeDragOver = (
    event: DragEvent<HTMLTableRowElement>,
    targetIndex: number
  ) => {
    if (!repeatRangeDragActive) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const insertIndex = getRepeatRangeDropIndexFromEvent(event, targetIndex);
    setRepeatRangeDropIndex(
      isRepeatRangeDropIndexAllowed(insertIndex) ? insertIndex : null
    );
  };

  const handleRepeatRangeDrop = (
    event: DragEvent<HTMLTableRowElement>,
    targetIndex: number
  ) => {
    if (!selectedTrainRun || !selectedRepeatRange || !repeatRangeDragActive) {
      return;
    }
    event.preventDefault();
    const insertIndex = getRepeatRangeDropIndexFromEvent(event, targetIndex);
    if (!isRepeatRangeDropIndexAllowed(insertIndex)) {
      setRepeatRangeDropIndex(null);
      setRepeatRangeDragActive(false);
      return;
    }
    dispatch({
      type: "copyStopRange",
      payload: {
        trainRunId: selectedTrainRun.id,
        startIndex: selectedRepeatRange.start,
        endIndex: selectedRepeatRange.end,
        insertIndex,
        repeatCount: repeatCopyCount,
      },
    });
    cancelRepeatSelectionMode();
  };

  const addRouteTemplate = (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const existingRouteTemplate = state.routeTemplates.find(
      (routeTemplate) => routeTemplate.name === trimmedName
    );
    if (existingRouteTemplate) {
      setSelectedRouteTemplateId(existingRouteTemplate.id);
      return;
    }
    const id = createId("rtpl");
    dispatch({ type: "addRouteTemplate", payload: { id, name: trimmedName } });
    setSelectedRouteTemplateId(id);
  };

  const renderRouteTemplateEditor = (
    title: string,
    key: TrainRouteKey,
    routeTemplate: RouteTemplate
  ) => {
    const routeSections = routeTemplate[key];

    return (
      <section className="flex min-w-0 flex-col gap-2 rounded border border-gray-200 p-3">
        <h4 className="text-sm font-bold text-gray-700">{title}</h4>
        {routeSections.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {routeSections.map((routeSection, index) => (
              <li
                key={`${routeTemplate.id}-${key}-${getRouteSectionKey(
                  routeSection
                )}-${index}`}
                className="flex items-center gap-2 rounded bg-white p-2 text-sm"
              >
                <span className="w-7 text-right text-gray-500">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {getRouteSectionLabel(state, routeSection)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-gray-500">未設定</p>
        )}
      </section>
    );
  };

  const renderRouteTemplateSection = () => (
    <section className="flex flex-col gap-3 rounded-lg bg-white p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <TextInput
            placeholder="経路セット名を追加"
            onEnterPress={addRouteTemplate}
          />
        </div>
        {state.routeTemplates.length > 0 ? (
          <label className="flex min-w-[240px] flex-col gap-1 text-sm">
            表示する経路セット
            <select
              value={selectedRouteTemplateId}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setSelectedRouteTemplateId(event.target.value)
              }
              className="rounded border border-gray-300 p-2"
            >
              {state.routeTemplates.map((routeTemplate) => (
                <option key={routeTemplate.id} value={routeTemplate.id}>
                  {routeTemplate.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {selectedRouteTemplate ? (
        <>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="flex flex-col gap-1 text-sm">
              経路セット名
              <input
                type="text"
                value={selectedRouteTemplate.name}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  dispatch({
                    type: "updateRouteTemplate",
                    payload: {
                      id: selectedRouteTemplate.id,
                      name: event.target.value,
                    },
                  })
                }
                className="rounded border border-gray-300 p-2"
              />
            </label>
            <label className="flex items-center gap-2 self-end rounded border border-gray-200 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={selectedRouteTemplate.deadheadEnabled}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  dispatch({
                    type: "updateRouteTemplate",
                    payload: {
                      id: selectedRouteTemplate.id,
                      deadheadEnabled: event.target.checked,
                    },
                  })
                }
              />
              回送経路
            </label>
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: "removeRouteTemplate",
                  payload: { id: selectedRouteTemplate.id },
                })
              }
              className="self-end rounded bg-red-600 px-3 py-2 text-sm text-white"
            >
              経路セットを削除
            </button>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            {renderRouteTemplateEditor(
              "営業経路",
              "serviceRouteSections",
              selectedRouteTemplate
            )}
            {selectedRouteTemplate.deadheadEnabled ? (
              renderRouteTemplateEditor(
                "回送経路",
                "deadheadRouteSections",
                selectedRouteTemplate
              )
            ) : (
              <section className="flex min-w-0 flex-col gap-2 rounded border border-gray-200 bg-slate-50 p-3">
                <h4 className="text-sm font-bold text-gray-700">回送経路</h4>
                <p className="text-sm text-gray-500">未使用</p>
              </section>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-500">経路セットを追加してください。</p>
      )}
    </section>
  );

  const trainRunDropIndex = getTrainRunDropIndex();
  const stopDropIndex = getStopDropIndex();

  return (
    <section
      className="flex flex-col gap-4"
      onContextMenu={(event) => {
        if (!repeatSelectionMode) return;
        event.preventDefault();
        cancelRepeatSelectionMode();
      }}
    >
      <h2 className="text-2xl">列車運用 / Stop時刻</h2>

      {renderRouteTemplateSection()}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <section className="flex flex-col gap-2 rounded-lg bg-white p-4">
          <h3 className="font-bold text-gray-700">列車一覧</h3>
          <TextInput
            placeholder="列車名を追加"
            onEnterPress={(name) =>
              dispatch({ type: "addTrainRun", payload: { name } })
            }
          />
          <div className="flex flex-col gap-1">
            {state.trainRuns.map((trainRun, index) => {
              const isSelected = trainRun.id === selectedTrainRunId;
              const isDragging = trainRun.id === draggingTrainRunId;

              return (
                <Fragment key={trainRun.id}>
                  {trainRunDropIndex === index ? (
                    <div className="h-1 rounded-full bg-blue-500" />
                  ) : null}
                  <div
                    draggable
                    onDragStart={(event) =>
                      handleTrainRunDragStart(event, trainRun.id)
                    }
                    onDragOver={(event) =>
                      handleTrainRunDragOver(event, trainRun.id)
                    }
                    onDrop={(event) => handleTrainRunDrop(event, trainRun.id)}
                    onDragEnd={clearTrainRunDragState}
                    className={`flex cursor-move gap-2 rounded border p-2 transition ${
                      isSelected
                        ? "border-blue-700 bg-blue-50 text-blue-950 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-50"
                        : "border-gray-200 bg-white"
                    } ${isDragging ? "opacity-50" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedTrainRunId(trainRun.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="font-bold">{trainRun.name}</div>
                      <div className="text-sm text-gray-500">
                        {trainRunTypeLabels[trainRun.runType]} /{" "}
                        {lineStyleLabels[trainRun.lineStyle]}
                      </div>
                    </button>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => duplicateTrainRun(trainRun.id)}
                        className="rounded border border-blue-200 bg-white px-2 py-1 text-xs text-blue-700"
                      >
                        複製
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTrainRun(trainRun.id)}
                        className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </Fragment>
              );
            })}
            {trainRunDropIndex === state.trainRuns.length ? (
              <div className="h-1 rounded-full bg-blue-500" />
            ) : null}
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-4 rounded-lg bg-white p-4">
          {selectedTrainRun ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="flex flex-col gap-1 text-sm">
                  列車名
                  <input
                    type="text"
                    value={selectedTrainRun.name}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      dispatch({
                        type: "updateTrainRun",
                        payload: {
                          id: selectedTrainRun.id,
                          name: event.target.value,
                        },
                      })
                    }
                    className="rounded border border-gray-300 p-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  種別
                  <select
                    value={selectedTrainRun.runType}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      dispatch({
                        type: "updateTrainRun",
                        payload: {
                          id: selectedTrainRun.id,
                          runType: event.target.value as TrainRunType,
                        },
                      })
                    }
                    className="rounded border border-gray-300 p-2"
                  >
                    {trainRunTypes.map((runType) => (
                      <option key={runType} value={runType}>
                        {trainRunTypeLabels[runType]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  色
                  <input
                    type="color"
                    value={colorToHex(
                      getThemeTrainColor(selectedTrainRun.color, isDarkTheme)
                    )}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      dispatch({
                        type: "updateTrainRun",
                        payload: {
                          id: selectedTrainRun.id,
                          color: hexToColor(event.target.value),
                        },
                      })
                    }
                    className="h-10 rounded border border-gray-300 p-1"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  線種
                  <select
                    value={selectedTrainRun.lineStyle}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      dispatch({
                        type: "updateTrainRun",
                        payload: {
                          id: selectedTrainRun.id,
                          lineStyle: event.target.value as LineStyle,
                        },
                      })
                    }
                    className="rounded border border-gray-300 p-2"
                  >
                    {lineStyles.map((lineStyle) => (
                      <option key={lineStyle} value={lineStyle}>
                        {lineStyleLabels[lineStyle]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <section className="flex flex-col gap-3 rounded border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-gray-700">自動時刻計算</h3>
                  <span
                    className={`rounded px-2 py-1 text-xs ${
                      isAutoScheduleEnabled
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {isAutoScheduleEnabled ? "自動" : "手動"}
                  </span>
                </div>
                <div className="flex flex-col gap-3 rounded bg-slate-50 p-3">
                  <div className="relative h-6 rounded-full bg-slate-800">
                    {deadheadStartTimelineSegments.map((segment, index) => (
                      <div
                        key={`deadhead-start-${index}`}
                        className="absolute top-1 h-4 rounded-full bg-amber-300"
                        style={segment}
                      />
                    ))}
                    {deadheadEndTimelineSegments.map((segment, index) => (
                      <div
                        key={`deadhead-end-${index}`}
                        className="absolute top-1 h-4 rounded-full bg-amber-300"
                        style={segment}
                      />
                    ))}
                    {serviceTimelineSegments.length > 0 ? (
                      serviceTimelineSegments.map((segment, index) => (
                        <div
                          key={`service-${index}`}
                          className="absolute top-1 h-4 rounded-full bg-emerald-400"
                          style={segment}
                        />
                      ))
                    ) : (
                      <div className="absolute left-[18%] right-[18%] top-1 h-4 rounded-full bg-emerald-400" />
                    )}
                    <span
                      className="absolute top-0 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-emerald-400 text-xs font-bold text-white"
                      style={{ left: serviceStartTimelinePosition }}
                    >
                      A
                    </span>
                    <span
                      className="absolute top-0 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-emerald-400 text-xs font-bold text-white"
                      style={{ left: serviceEndTimelinePosition }}
                    >
                      B
                    </span>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px]">
                    <div className="grid gap-3 md:grid-cols-2">
                      <section className="flex flex-col gap-2 rounded border border-slate-200 bg-white p-3">
                        <h4 className="text-sm font-bold text-emerald-700">
                          A 営業開始時刻 / B 営業終了時刻
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1 text-sm">
                            営業開始
                            <input
                              type="time"
                              value={selectedTrainRun.serviceStartTime}
                              onChange={(
                                event: ChangeEvent<HTMLInputElement>
                              ) =>
                                dispatch({
                                  type: "updateTrainRun",
                                  payload: {
                                    id: selectedTrainRun.id,
                                    serviceStartTime: event.target.value,
                                  },
                                })
                              }
                              className="rounded border border-gray-300 p-2"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-sm">
                            営業終了
                            <input
                              type="time"
                              value={selectedTrainRun.serviceEndTime}
                              onChange={(
                                event: ChangeEvent<HTMLInputElement>
                              ) =>
                                dispatch({
                                  type: "updateTrainRun",
                                  payload: {
                                    id: selectedTrainRun.id,
                                    serviceEndTime: event.target.value,
                                  },
                                })
                              }
                              className="rounded border border-gray-300 p-2"
                            />
                          </label>
                        </div>
                      </section>
                      <section className="flex flex-col gap-2 rounded border border-slate-200 bg-white p-3">
                        <h4 className="text-sm font-bold text-slate-700">
                          A 回送開始時刻 / B 回送終了時刻
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1 text-sm">
                            回送開始
                            <input
                              type="time"
                              value={selectedTrainRun.deadheadStartTime}
                              onChange={(
                                event: ChangeEvent<HTMLInputElement>
                              ) =>
                                dispatch({
                                  type: "updateTrainRun",
                                  payload: {
                                    id: selectedTrainRun.id,
                                    deadheadStartTime: event.target.value,
                                  },
                                })
                              }
                              className="rounded border border-gray-300 p-2"
                            />
                          </label>
                          <label className="flex flex-col gap-1 text-sm">
                            回送終了
                            <input
                              type="time"
                              value={selectedTrainRun.deadheadEndTime}
                              onChange={(
                                event: ChangeEvent<HTMLInputElement>
                              ) =>
                                dispatch({
                                  type: "updateTrainRun",
                                  payload: {
                                    id: selectedTrainRun.id,
                                    deadheadEndTime: event.target.value,
                                  },
                                })
                              }
                              className="rounded border border-gray-300 p-2"
                            />
                          </label>
                        </div>
                      </section>
                    </div>
                    <label className="flex flex-col gap-1 text-sm">
                      標準停車分
                      <input
                        type="number"
                        min="0"
                        value={selectedTrainRun.defaultStopMinutes}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          dispatch({
                            type: "updateTrainRun",
                            payload: {
                              id: selectedTrainRun.id,
                              defaultStopMinutes: Math.max(
                                0,
                                Number(event.target.value)
                              ),
                            },
                          })
                        }
                        className="rounded border border-gray-300 bg-white p-2"
                      />
                    </label>
                  </div>
                </div>

                <div className="grid gap-3 rounded border border-slate-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                  <label className="flex flex-col gap-1 text-sm">
                    適用する経路セット
                    <select
                      value={selectedTrainRun.routeTemplateId}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                        dispatch({
                          type: "updateTrainRun",
                          payload: {
                            id: selectedTrainRun.id,
                            routeTemplateId: event.target.value,
                          },
                        })
                      }
                      className="rounded border border-gray-300 p-2"
                    >
                      <option value="">未設定</option>
                      {state.routeTemplates.map((routeTemplate) => (
                        <option key={routeTemplate.id} value={routeTemplate.id}>
                          {routeTemplate.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-col justify-end gap-1 text-sm text-gray-600">
                    {selectedTrainRouteTemplate ? (
                      <>
                        <div>
                          営業:{" "}
                          {
                            selectedTrainRouteTemplate.serviceRouteSections
                              .length
                          }
                          区間
                        </div>
                        <div>
                          回送:{" "}
                          {selectedTrainRouteTemplate.deadheadEnabled &&
                          selectedTrainHasDeadheadTime
                            ? `${selectedTrainRouteTemplate.deadheadRouteSections.length}区間`
                            : "未使用"}
                        </div>
                      </>
                    ) : (
                      <div>手動Stop</div>
                    )}
                  </div>
                </div>

                {currentAutoScheduleWarnings.length > 0 &&
                isAutoScheduleEnabled ? (
                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    不足: {currentAutoScheduleWarnings.join(" / ")}
                  </div>
                ) : null}

                {uniqueServiceRouteNodeIds.length > 0 ? (
                  <section className="flex flex-col gap-1">
                    <h4 className="text-sm font-bold text-gray-700">
                      営業停車設定
                    </h4>
                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="min-w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-left text-xs text-gray-600">
                            <th className="border-b px-2 py-1">駅・車庫</th>
                            <th className="w-28 border-b px-2 py-1">状態</th>
                            <th className="w-24 border-b px-2 py-1">停車分</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uniqueServiceRouteNodeIds.map((routeNodeId) => {
                            const setting = selectedTrainRun.stopSettings.find(
                              (stopSetting) =>
                                stopSetting.routeNodeId === routeNodeId
                            );
                            const status = setting?.status ?? "stop";
                            const dwellMinutes =
                              setting?.dwellMinutes ??
                              selectedTrainRun.defaultStopMinutes ??
                              defaultStopMinutes;
                            return (
                              <tr key={routeNodeId}>
                                <td className="max-w-[260px] truncate border-t px-2 py-1 font-medium text-gray-700">
                                  {getRouteNodeName(
                                    state.routeNodes,
                                    state,
                                    routeNodeId
                                  )}
                                </td>
                                <td className="border-t px-2 py-1">
                                  <select
                                    value={status}
                                    onChange={(
                                      event: ChangeEvent<HTMLSelectElement>
                                    ) =>
                                      updateStopSetting(routeNodeId, {
                                        status: event.target
                                          .value as StopStatus,
                                      })
                                    }
                                    className="h-8 w-full rounded border border-gray-300 px-2 text-sm text-gray-900"
                                  >
                                    {stopStatuses.map((stopStatus) => (
                                      <option
                                        key={stopStatus}
                                        value={stopStatus}
                                      >
                                        {stopStatusLabels[stopStatus]}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="border-t px-2 py-1">
                                  <input
                                    type="number"
                                    min="0"
                                    disabled={status === "pass"}
                                    value={dwellMinutes}
                                    onChange={(
                                      event: ChangeEvent<HTMLInputElement>
                                    ) =>
                                      updateStopSetting(routeNodeId, {
                                        dwellMinutes: Math.max(
                                          0,
                                          Number(event.target.value)
                                        ),
                                      })
                                    }
                                    className="h-8 w-full rounded border border-gray-300 px-2 text-sm text-gray-900 disabled:bg-gray-100"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : null}

                {uniqueDeadheadRouteNodeIds.length > 0 ? (
                  <section className="flex flex-col gap-1">
                    <h4 className="text-sm font-bold text-gray-700">
                      回送停車設定
                    </h4>
                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="min-w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-left text-xs text-gray-600">
                            <th className="border-b px-2 py-1">駅・車庫</th>
                            <th className="w-28 border-b px-2 py-1">状態</th>
                            <th className="w-24 border-b px-2 py-1">停車分</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uniqueDeadheadRouteNodeIds.map((routeNodeId) => {
                            const setting = (
                              selectedTrainRun.deadheadStopSettings ?? []
                            ).find(
                              (stopSetting) =>
                                stopSetting.routeNodeId === routeNodeId
                            );
                            const status = setting?.status ?? "stop";
                            const dwellMinutes =
                              setting?.dwellMinutes ??
                              selectedTrainRun.defaultStopMinutes ??
                              defaultStopMinutes;
                            return (
                              <tr key={routeNodeId}>
                                <td className="max-w-[260px] truncate border-t px-2 py-1 font-medium text-gray-700">
                                  {getRouteNodeName(
                                    state.routeNodes,
                                    state,
                                    routeNodeId
                                  )}
                                </td>
                                <td className="border-t px-2 py-1">
                                  <select
                                    value={status}
                                    onChange={(
                                      event: ChangeEvent<HTMLSelectElement>
                                    ) =>
                                      updateDeadheadStopSetting(routeNodeId, {
                                        status: event.target
                                          .value as StopStatus,
                                      })
                                    }
                                    className="h-8 w-full rounded border border-gray-300 px-2 text-sm text-gray-900"
                                  >
                                    {stopStatuses.map((stopStatus) => (
                                      <option
                                        key={stopStatus}
                                        value={stopStatus}
                                      >
                                        {stopStatusLabels[stopStatus]}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="border-t px-2 py-1">
                                  <input
                                    type="number"
                                    min="0"
                                    disabled={status === "pass"}
                                    value={dwellMinutes}
                                    onChange={(
                                      event: ChangeEvent<HTMLInputElement>
                                    ) =>
                                      updateDeadheadStopSetting(routeNodeId, {
                                        dwellMinutes: Math.max(
                                          0,
                                          Number(event.target.value)
                                        ),
                                      })
                                    }
                                    className="h-8 w-full rounded border border-gray-300 px-2 text-sm text-gray-900 disabled:bg-gray-100"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : null}
              </section>

              <section className="flex flex-col gap-3">
                {!isAutoScheduleEnabled ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex min-w-[220px] flex-col gap-1 text-sm">
                      追加するノード
                      <select
                        value={newStopRouteNodeId}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                          setNewStopRouteNodeId(event.target.value)
                        }
                        className="rounded border border-gray-300 p-2"
                      >
                        {visibleRouteNodes.map((routeNode) => (
                          <option key={routeNode.id} value={routeNode.id}>
                            {getRouteNodeLabel(state.stations, routeNode)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      状態
                      <select
                        value={newStopStatus}
                        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                          setNewStopStatus(event.target.value as StopStatus)
                        }
                        className="rounded border border-gray-300 p-2"
                      >
                        {stopStatuses.map((status) => (
                          <option key={status} value={status}>
                            {stopStatusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={!newStopRouteNodeId}
                      onClick={addStop}
                      className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:bg-gray-300"
                    >
                      Stopを追加
                    </button>
                  </div>
                ) : null}

                {!isAutoScheduleEnabled ? (
                  <div
                    className="flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-white p-3"
                    onContextMenu={(event) => {
                      if (!repeatSelectionMode) return;
                      event.preventDefault();
                      cancelRepeatSelectionMode();
                    }}
                  >
                    <label className="flex w-32 flex-col gap-1 text-sm">
                      回数
                      <input
                        type="number"
                        min="2"
                        value={repeatCopyCount}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          setRepeatCopyCount(
                            Math.max(2, Number(event.target.value))
                          )
                        }
                        className="rounded border border-gray-300 p-2"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={selectedTrainRun.stops.length === 0}
                      onClick={beginRepeatSelectionMode}
                      className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:bg-gray-300"
                    >
                      {repeatSelectionMode
                        ? "範囲選択中"
                        : "選択範囲を繰り返し"}
                    </button>
                    <button
                      type="button"
                      disabled={
                        repeatSelectionStart === null &&
                        selectedTrainRun.repeatRangeStartIndex === null &&
                        !repeatSelectionMode
                      }
                      onClick={clearSelectedStopRepeatRange}
                      className="rounded border px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      クリア
                    </button>
                    <div className="text-sm text-gray-500">
                      範囲:{" "}
                      {selectedRepeatRange
                        ? `${selectedRepeatRange.start + 1} - ${
                            selectedRepeatRange.end + 1
                          }`
                        : "未選択"}
                    </div>
                  </div>
                ) : null}

                <div
                  className="overflow-x-auto"
                  onContextMenu={(event) => {
                    if (!repeatSelectionMode) return;
                    event.preventDefault();
                    cancelRepeatSelectionMode();
                  }}
                >
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-100 text-left">
                        <th className="border p-2">順</th>
                        <th className="border p-2">ノード</th>
                        <th className="border p-2">状態</th>
                        <th className="border p-2">着</th>
                        <th className="border p-2">発</th>
                        <th className="border p-2">回送</th>
                        <th className="border p-2">警告</th>
                        {showManualStopControls ? (
                          <th className="border p-2">削除</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTrainRun.stops.map((stop, index) => {
                        const warnings = stopWarnings(
                          state,
                          selectedTrainRun,
                          stop,
                          index
                        );
                        const isInRepeatRange =
                          selectedRepeatRange !== null &&
                          index >= selectedRepeatRange.start &&
                          index <= selectedRepeatRange.end;
                        const showDropLineBefore =
                          stopDropIndex === index ||
                          repeatRangeDropIndex === index;
                        return (
                          <Fragment key={stop.id}>
                            {showDropLineBefore ? (
                              <tr>
                                <td
                                  colSpan={stopTableColumnCount}
                                  className="border-0 p-0"
                                >
                                  <div className="h-1 rounded-full bg-blue-500" />
                                </td>
                              </tr>
                            ) : null}
                            <tr
                              draggable={
                                repeatSelectionMode
                                  ? Boolean(
                                      selectedRepeatRange && isInRepeatRange
                                    )
                                  : !isAutoScheduleEnabled
                              }
                              onDragStart={(event) =>
                                repeatSelectionMode
                                  ? handleRepeatRangeDragStart(event, index)
                                  : handleStopDragStart(event, stop.id)
                              }
                              onDragOver={(event) =>
                                repeatRangeDragActive
                                  ? handleRepeatRangeDragOver(event, index)
                                  : handleStopDragOver(event, stop.id)
                              }
                              onDrop={(event) =>
                                repeatRangeDragActive
                                  ? handleRepeatRangeDrop(event, index)
                                  : handleStopDrop(event, stop.id)
                              }
                              onDragEnd={() => {
                                clearStopDragState();
                                setRepeatRangeDragActive(false);
                                setRepeatRangeDropIndex(null);
                              }}
                              onClickCapture={(event) => {
                                if (!repeatSelectionMode) return;
                                event.preventDefault();
                                event.stopPropagation();
                                if (!repeatRangeDragActive) {
                                  selectStopRepeatRangePoint(index);
                                }
                              }}
                              className={`${
                                repeatSelectionMode
                                  ? "cursor-pointer"
                                  : !isAutoScheduleEnabled
                                  ? "cursor-move"
                                  : ""
                              } ${
                                isInRepeatRange
                                  ? "bg-blue-50 text-blue-950 dark:bg-blue-900 dark:text-blue-50"
                                  : warnings.length
                                  ? "bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100"
                                  : ""
                              } ${
                                stop.id === draggingStopId ||
                                (repeatRangeDragActive && isInRepeatRange)
                                  ? "opacity-50"
                                  : ""
                              }`}
                            >
                              <td className="border p-2">{index + 1}</td>
                              <td className="min-w-[220px] border p-2">
                                <select
                                  value={stop.routeNodeId}
                                  disabled={isAutoScheduleEnabled}
                                  onChange={(
                                    event: ChangeEvent<HTMLSelectElement>
                                  ) =>
                                    dispatch({
                                      type: "updateStop",
                                      payload: {
                                        trainRunId: selectedTrainRun.id,
                                        stopId: stop.id,
                                        routeNodeId: event.target.value,
                                      },
                                    })
                                  }
                                  className="w-full rounded border border-gray-300 p-2 disabled:bg-gray-100"
                                >
                                  {visibleRouteNodes.map((routeNode) => (
                                    <option
                                      key={routeNode.id}
                                      value={routeNode.id}
                                    >
                                      {getRouteNodeLabel(
                                        state.stations,
                                        routeNode
                                      )}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="border p-2">
                                <select
                                  value={stop.status}
                                  onChange={(
                                    event: ChangeEvent<HTMLSelectElement>
                                  ) => {
                                    const status = event.target
                                      .value as StopStatus;
                                    if (isAutoScheduleEnabled) {
                                      const updateSetting = stop.isDeadhead
                                        ? updateDeadheadStopSetting
                                        : updateStopSetting;
                                      updateSetting(stop.routeNodeId, {
                                        status,
                                      });
                                      return;
                                    }
                                    dispatch({
                                      type: "updateStop",
                                      payload: {
                                        trainRunId: selectedTrainRun.id,
                                        stopId: stop.id,
                                        status,
                                      },
                                    });
                                  }}
                                  className="rounded border border-gray-300 p-2"
                                >
                                  {stopStatuses.map((status) => (
                                    <option key={status} value={status}>
                                      {stopStatusLabels[status]}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="border p-2">
                                <input
                                  type="time"
                                  value={stop.arrivalTime}
                                  disabled={isAutoScheduleEnabled}
                                  onChange={(
                                    event: ChangeEvent<HTMLInputElement>
                                  ) => {
                                    if (
                                      !isValidTimeString(event.target.value)
                                    ) {
                                      return;
                                    }
                                    dispatch({
                                      type: "updateStop",
                                      payload: {
                                        trainRunId: selectedTrainRun.id,
                                        stopId: stop.id,
                                        arrivalTime: event.target.value,
                                      },
                                    });
                                  }}
                                  className="rounded border border-gray-300 p-2 disabled:bg-gray-100"
                                />
                              </td>
                              <td className="border p-2">
                                <input
                                  type="time"
                                  value={stop.departureTime}
                                  disabled={isAutoScheduleEnabled}
                                  onChange={(
                                    event: ChangeEvent<HTMLInputElement>
                                  ) => {
                                    if (
                                      !isValidTimeString(event.target.value)
                                    ) {
                                      return;
                                    }
                                    dispatch({
                                      type: "updateStop",
                                      payload: {
                                        trainRunId: selectedTrainRun.id,
                                        stopId: stop.id,
                                        departureTime: event.target.value,
                                      },
                                    });
                                  }}
                                  className="rounded border border-gray-300 p-2 disabled:bg-gray-100"
                                />
                              </td>
                              <td className="border p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={stop.isDeadhead}
                                  disabled={isAutoScheduleEnabled}
                                  onChange={(
                                    event: ChangeEvent<HTMLInputElement>
                                  ) =>
                                    dispatch({
                                      type: "updateStop",
                                      payload: {
                                        trainRunId: selectedTrainRun.id,
                                        stopId: stop.id,
                                        isDeadhead: event.target.checked,
                                      },
                                    })
                                  }
                                />
                              </td>
                              <td className="border p-2 text-amber-700">
                                {warnings.join(" / ")}
                              </td>
                              {showManualStopControls ? (
                                <td className="border p-2 text-center">
                                  <button
                                    type="button"
                                    disabled={repeatSelectionMode}
                                    onClick={() =>
                                      dispatch({
                                        type: "removeStop",
                                        payload: {
                                          trainRunId: selectedTrainRun.id,
                                          stopId: stop.id,
                                        },
                                      })
                                    }
                                    className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-red-500 dark:bg-red-950 dark:text-red-100 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                                  >
                                    削除
                                  </button>
                                </td>
                              ) : null}
                            </tr>
                          </Fragment>
                        );
                      })}
                      {stopDropIndex === selectedTrainRun.stops.length ||
                      repeatRangeDropIndex === selectedTrainRun.stops.length ? (
                        <tr>
                          <td
                            colSpan={stopTableColumnCount}
                            className="border-0 p-0"
                          >
                            <div className="h-1 rounded-full bg-blue-500" />
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="text-sm text-gray-500">
                  現在の終端:{" "}
                  {selectedTrainRun.stops.length
                    ? getRouteNodeName(
                        state.routeNodes,
                        state,
                        selectedTrainRun.stops[
                          selectedTrainRun.stops.length - 1
                        ].routeNodeId
                      )
                    : "未設定"}
                </div>
              </section>
            </>
          ) : (
            <p className="text-sm text-gray-500">列車を追加してください。</p>
          )}
        </section>
      </div>
    </section>
  );
};
