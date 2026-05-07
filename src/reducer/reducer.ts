import { RGBColor } from "react-color";
import {
  createId,
  ConnectionType,
  LineStyle,
  RouteEdge,
  RouteEdgeType,
  RouteNode,
  RouteNodeType,
  RoutePortSide,
  RouteReadDirection,
  RouteTemplate,
  RouteTimeSpeedClass,
  RouteTimeSection,
  RouteTimeSectionInternalDirection,
  RouteTimeSectionPort,
  Station,
  Stop,
  StopStatus,
  TrainRun,
  TrainRunRouteSection,
  TrainRunStopSetting,
  TrainRunType,
} from "../lib/domain";
import {
  getRouteTimeSectionBreakGroups,
  getRouteTimeSectionsForSpeedClass,
  getRouteTimeSectionSpeedProfile,
  getRouteTimeSectionSegmentRefs,
  getRouteTimeSpeedClassCount,
  normalizeRouteTimeSectionSegmentMinutesForTotal,
  resolveRouteTimeSectionSegments,
} from "../lib/route-time";

export type State = {
  version: 8;
  stations: Station[];
  routeNodes: RouteNode[];
  routeEdges: RouteEdge[];
  routeTimeSections: RouteTimeSection[];
  routeTimeSpeedClassCount: number;
  routeTimeSpeedClasses: RouteTimeSpeedClass[];
  routeTimeSpeedMultiplierEnabled: boolean;
  routeTemplates: RouteTemplate[];
  trainRuns: TrainRun[];
  routeReadDirection: RouteReadDirection;
};

type CoreAction =
  | { type: "addStation"; payload: { name: string } }
  | { type: "updateStation"; payload: { id: string; name: string } }
  | { type: "removeStation"; payload: { id: string } }
  | {
      type: "addRouteNode";
      payload: {
        id?: string;
        stationId: string;
        label: string;
        nodeType: RouteNodeType;
        x: number;
        y: number;
        rotation?: number;
        isFlipped?: boolean;
        isTerminal?: boolean;
        isHorizontalTerminal?: boolean;
        isVerticalTerminal?: boolean;
        platformNumber: string;
        platformCount: number;
        verticalPlatformCount?: number;
        durationMinutes: number;
        connectionType?: ConnectionType;
      };
    }
  | {
      type: "updateRouteNode";
      payload: {
        id: string;
        stationId?: string;
        label?: string;
        nodeType?: RouteNodeType;
        x?: number;
        y?: number;
        rotation?: number;
        isFlipped?: boolean;
        isTerminal?: boolean;
        isHorizontalTerminal?: boolean;
        isVerticalTerminal?: boolean;
        platformNumber?: string;
        platformCount?: number;
        platformLabels?: string[];
        verticalPlatformCount?: number;
        verticalPlatformLabels?: string[];
        durationMinutes?: number;
        connectionType?: ConnectionType;
      };
    }
  | { type: "rotateRouteNode"; payload: { id: string; delta: 90 | -90 } }
  | { type: "flipRouteNode"; payload: { id: string } }
  | { type: "removeRouteNode"; payload: { id: string } }
  | {
      type: "addRouteEdge";
      payload: {
        id?: string;
        fromNodeId: string;
        toNodeId: string;
        fromPortSide?: RoutePortSide;
        fromPortIndex?: number;
        toPortSide?: RoutePortSide;
        toPortIndex?: number;
        edgeType?: RouteEdgeType;
        travelMinutes?: number;
        bidirectional?: boolean;
        manualWaypoints?: Array<{ x: number; y: number }>;
      };
    }
  | {
      type: "updateRouteEdge";
      payload: {
        id: string;
        edgeType?: RouteEdgeType;
        travelMinutes?: number;
        bidirectional?: boolean;
        manualWaypoints?: Array<{ x: number; y: number }> | null;
      };
    }
  | { type: "reverseRouteEdge"; payload: { id: string } }
  | { type: "removeRouteEdge"; payload: { id: string } }
  | {
      type: "insertConnectionNodeOnRouteEdge";
      payload: {
        routeEdgeId: string;
        nodeId?: string;
        firstRouteEdgeId?: string;
        secondRouteEdgeId?: string;
        x: number;
        y: number;
        rotation: number;
        connectionType?: ConnectionType;
        entryPortSide: RoutePortSide;
        entryPortIndex: number;
        exitPortSide: RoutePortSide;
        exitPortIndex: number;
        splitRatio: number;
      };
    }
  | {
      type: "insertConnectionNodeOnRouteEdges";
      payload: {
        nodeId?: string;
        x: number;
        y: number;
        rotation: number;
        connectionType: ConnectionType;
        splits: Array<{
          routeEdgeId: string;
          firstRouteEdgeId?: string;
          secondRouteEdgeId?: string;
          entryPortSide: RoutePortSide;
          entryPortIndex: number;
          exitPortSide: RoutePortSide;
          exitPortIndex: number;
          splitRatio: number;
        }>;
      };
    }
  | {
      type: "addRouteTimeSection";
      payload: {
        id?: string;
        startNodeId: string;
        startPortSide: RoutePortSide;
        startPortIndex: number;
        endNodeId: string;
        endPortSide: RoutePortSide;
        endPortIndex: number;
        routeEdgeIds: string[];
        routePorts: RouteTimeSectionPort[];
        travelMinutes: number;
        segmentMinutes?: number[];
        speedClassIndex?: number;
      };
    }
  | {
      type: "updateRouteTimeSection";
      payload: {
        id: string;
        travelMinutes?: number;
        segmentMinutes?: number[];
        speedClassIndex?: number;
        internalDirection?: RouteTimeSectionInternalDirection;
      };
    }
  | {
      type: "addRouteTimeSpeedClass";
      payload?: { copyFromIndex?: number };
    }
  | {
      type: "updateRouteTimeSpeedClass";
      payload: { index: number; baseIndex?: number; multiplier?: number };
    }
  | {
      type: "setRouteTimeSpeedMultiplierEnabled";
      payload: { enabled: boolean };
    }
  | { type: "removeRouteTimeSpeedClass"; payload: { index: number } }
  | { type: "removeRouteTimeSection"; payload: { id: string } }
  | {
      type: "updateRouteReadDirection";
      payload: { routeReadDirection: RouteReadDirection };
    }
  | { type: "addTrainRun"; payload: { name: string } }
  | { type: "removeTrainRun"; payload: { id: string } }
  | { type: "moveTrainRun"; payload: { id: string; direction: "up" | "down" } }
  | {
      type: "reorderTrainRun";
      payload: {
        sourceId: string;
        targetId: string;
        position: "before" | "after";
      };
    }
  | { type: "duplicateTrainRun"; payload: { id: string; newId?: string } }
  | { type: "addRouteTemplate"; payload: { id?: string; name: string } }
  | { type: "removeRouteTemplate"; payload: { id: string } }
  | {
      type: "updateRouteTemplate";
      payload: {
        id: string;
        name?: string;
        serviceRouteSections?: TrainRunRouteSection[];
        deadheadEnabled?: boolean;
        deadheadRouteSections?: TrainRunRouteSection[];
      };
    }
  | {
      type: "updateTrainRun";
      payload: {
        id: string;
        name?: string;
        runType?: TrainRunType;
        lineStyle?: LineStyle;
        color?: RGBColor;
        operationGroup?: string;
        repeat?: number;
        serviceStartTime?: string;
        serviceEndTime?: string;
        deadheadStartTime?: string;
        deadheadEndTime?: string;
        defaultStopMinutes?: number;
        routeTemplateId?: string;
        speedClassIndex?: number;
        serviceRouteNodeIds?: string[];
        deadheadRouteNodeIds?: string[];
        serviceRouteSections?: TrainRunRouteSection[];
        deadheadRouteSections?: TrainRunRouteSection[];
        repeatRangeStartIndex?: number | null;
        repeatRangeEndIndex?: number | null;
        repeatRangeCount?: number;
        stopSettings?: TrainRunStopSetting[];
        deadheadStopSettings?: TrainRunStopSetting[];
      };
    }
  | {
      type: "addStop";
      payload: {
        trainRunId: string;
        routeNodeId: string;
        status: StopStatus;
        isDeadhead?: boolean;
      };
    }
  | {
      type: "updateStop";
      payload: {
        trainRunId: string;
        stopId: string;
        routeNodeId?: string;
        arrivalTime?: string;
        departureTime?: string;
        status?: StopStatus;
        isDeadhead?: boolean;
      };
    }
  | { type: "removeStop"; payload: { trainRunId: string; stopId: string } }
  | {
      type: "moveStop";
      payload: { trainRunId: string; stopId: string; direction: "up" | "down" };
    }
  | {
      type: "reorderStop";
      payload: {
        trainRunId: string;
        sourceStopId: string;
        targetStopId: string;
        position: "before" | "after";
      };
    }
  | {
      type: "copyStopRange";
      payload: {
        trainRunId: string;
        startIndex: number;
        endIndex: number;
        insertIndex: number;
        repeatCount: number;
      };
    }
  | {
      type: "changeFullState";
      payload: { state: State };
    };

export type Actions = CoreAction & {
  historyGroup?: string;
};

const moveItem = <T>(items: T[], index: number, direction: "up" | "down") => {
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;

  const next = [...items];
  const current = next[index];
  next[index] = next[nextIndex];
  next[nextIndex] = current;
  return next;
};

const moveItemToPosition = <T>(
  items: T[],
  sourceIndex: number,
  targetIndex: number,
  position: "before" | "after"
) => {
  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex >= items.length ||
    targetIndex >= items.length ||
    sourceIndex === targetIndex
  ) {
    return items;
  }

  const next = [...items];
  const [source] = next.splice(sourceIndex, 1);
  const adjustedTargetIndex =
    sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const insertIndex =
    position === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1;
  next.splice(Math.max(0, Math.min(insertIndex, next.length)), 0, source);
  return next;
};

const normalizePlatformLabels = (labels: string[] | undefined, count: number) =>
  Array.from({ length: Math.max(1, count) }).map(
    (_, index) => labels?.[index]?.trim() || `${index + 1}`
  );

const minutesToTimeString = (minutes: number) => {
  const normalized = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  return `${Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0")}:${(normalized % 60).toString().padStart(2, "0")}`;
};

const timeStringToMinutes = (value: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const getElapsedTime = (from: number, to: number) =>
  to >= from ? to : to + 1440;

const findRouteTimeSectionMinutes = (
  routeTimeSections: RouteTimeSection[],
  fromNodeId: string,
  toNodeId: string
) =>
  routeTimeSections.find(
    (section) =>
      (section.startNodeId === fromNodeId && section.endNodeId === toNodeId) ||
      (section.startNodeId === toNodeId && section.endNodeId === fromNodeId)
  )?.travelMinutes ?? null;

const getStopSettings = (trainRun: TrainRun, isDeadhead: boolean) =>
  isDeadhead
    ? trainRun.deadheadStopSettings ?? []
    : trainRun.stopSettings ?? [];

const getStopSetting = (
  trainRun: TrainRun,
  routeNodeId: string,
  isDeadhead: boolean
) =>
  getStopSettings(trainRun, isDeadhead).find(
    (setting) => setting.routeNodeId === routeNodeId
  );

const normalizeStopSettings = (settings: TrainRunStopSetting[]) =>
  settings.map((setting) => ({
    routeNodeId: setting.routeNodeId,
    status: setting.status,
    dwellMinutes: Math.max(0, Math.floor(setting.dwellMinutes)),
  }));

const normalizeRouteSections = (sections: TrainRunRouteSection[]) =>
  sections.map((section) => ({
    routeTimeSectionId: section.routeTimeSectionId,
    reversed: section.reversed,
  }));

const createDuplicateTrainRunName = (
  trainRuns: TrainRun[],
  sourceName: string
) => {
  const baseName = `${sourceName} コピー`;
  if (!trainRuns.some((trainRun) => trainRun.name === baseName)) {
    return baseName;
  }

  let index = 2;
  while (
    trainRuns.some((trainRun) => trainRun.name === `${baseName} ${index}`)
  ) {
    index += 1;
  }
  return `${baseName} ${index}`;
};

const getRouteTemplate = (routeTemplates: RouteTemplate[], id: string) =>
  routeTemplates.find((routeTemplate) => routeTemplate.id === id);

const trainRunHasDeadheadTime = (trainRun: TrainRun) =>
  Boolean(trainRun.deadheadStartTime || trainRun.deadheadEndTime);

const getEffectiveServiceRouteSections = (
  trainRun: TrainRun,
  routeTemplates: RouteTemplate[]
) =>
  getRouteTemplate(routeTemplates, trainRun.routeTemplateId)
    ?.serviceRouteSections ?? trainRun.serviceRouteSections;

const getEffectiveDeadheadRouteSections = (
  trainRun: TrainRun,
  routeTemplates: RouteTemplate[]
) => {
  const routeTemplate = getRouteTemplate(
    routeTemplates,
    trainRun.routeTemplateId
  );
  if (!routeTemplate) return trainRun.deadheadRouteSections;
  return routeTemplate.deadheadEnabled && trainRunHasDeadheadTime(trainRun)
    ? routeTemplate.deadheadRouteSections
    : [];
};

const shouldUseAutoStops = (
  trainRun: TrainRun,
  routeTemplates: RouteTemplate[]
) =>
  trainRun.serviceRouteNodeIds.length > 0 ||
  trainRun.deadheadRouteNodeIds.length > 0 ||
  getEffectiveServiceRouteSections(trainRun, routeTemplates).length > 0 ||
  getEffectiveDeadheadRouteSections(trainRun, routeTemplates).length > 0;

type AutoRoutePoint = {
  routeNodeId: string;
  portSide?: RoutePortSide;
  portIndex?: number;
  travelMinutesFromPrevious: number | null;
  isDeadhead: boolean;
  isTimingPoint?: boolean;
};

type AutoRoutePlan = {
  preDeadheadPoints: AutoRoutePoint[];
  servicePoints: AutoRoutePoint[];
  deadheadPoints: AutoRoutePoint[];
  deadheadRoutePoints: AutoRoutePoint[];
};

const getSectionEndpointPoints = (
  section: RouteTimeSection,
  reversed: boolean
) => {
  const startPoint = {
    routeNodeId: section.startNodeId,
    portSide: section.startPortSide,
    portIndex: section.startPortIndex,
  };
  const endPoint = {
    routeNodeId: section.endNodeId,
    portSide: section.endPortSide,
    portIndex: section.endPortIndex,
  };
  return reversed ? [endPoint, startPoint] : [startPoint, endPoint];
};

const isSameRouteLocation = (a: AutoRoutePoint, b: AutoRoutePoint) => {
  if (a.routeNodeId !== b.routeNodeId) return false;
  if (a.isTimingPoint || b.isTimingPoint) {
    if (
      a.portSide !== undefined &&
      b.portSide !== undefined &&
      a.portSide !== b.portSide
    ) {
      return false;
    }
    if (
      a.portIndex !== undefined &&
      b.portIndex !== undefined &&
      a.portIndex !== b.portIndex
    ) {
      return false;
    }
    return true;
  }
  if (a.portIndex === undefined || b.portIndex === undefined) return true;
  return a.portIndex === b.portIndex;
};

const buildRoutePointsFromSections = (
  routeSections: TrainRunRouteSection[],
  routeTimeSections: RouteTimeSection[],
  routeNodes: RouteNode[],
  isDeadhead: boolean
) =>
  routeSections.reduce<AutoRoutePoint[]>((points, routeSection) => {
    const section = routeTimeSections.find(
      (candidate) => candidate.id === routeSection.routeTimeSectionId
    );
    if (!section) return points;
    const [startPoint, endPoint] = getSectionEndpointPoints(
      section,
      routeSection.reversed
    );
    const routePorts = routeSection.reversed
      ? [...section.routePorts].reverse()
      : section.routePorts;
    const directionalSection = {
      ...section,
      internalDirection: section.internalDirection ?? "forward",
      routePorts,
      segmentMinutes: routeSection.reversed
        ? [...section.segmentMinutes].reverse()
        : section.segmentMinutes,
    };
    const segmentMinutes = resolveRouteTimeSectionSegments(
      routeTimeSections,
      directionalSection,
      routeNodes
    ).segmentMinutes;
    const breakGroups = getRouteTimeSectionBreakGroups(
      directionalSection,
      routeNodes
    );
    const nextPoints = [...points];
    if (
      nextPoints.length === 0 ||
      !isSameRouteLocation(nextPoints[nextPoints.length - 1], {
        ...startPoint,
        travelMinutesFromPrevious: null,
        isDeadhead,
      })
    ) {
      nextPoints.push({
        ...startPoint,
        travelMinutesFromPrevious: null,
        isDeadhead,
      });
    }
    breakGroups.forEach((group, groupIndex) => {
      group.forEach((port, portIndex) => {
        nextPoints.push({
          routeNodeId: port.nodeId,
          portSide: port.side,
          portIndex: port.index,
          travelMinutesFromPrevious:
            portIndex === 0 ? segmentMinutes[groupIndex] ?? 0 : 0,
          isDeadhead,
          isTimingPoint: true,
        });
      });
    });
    nextPoints.push({
      ...endPoint,
      travelMinutesFromPrevious:
        segmentMinutes.length > 0
          ? segmentMinutes[segmentMinutes.length - 1] ?? 0
          : section.travelMinutes,
      isDeadhead,
    });
    return nextPoints;
  }, []);

const buildRoutePointsFromNodeIds = (
  routeNodeIds: string[],
  routeTimeSections: RouteTimeSection[],
  isDeadhead: boolean
) =>
  routeNodeIds.map<AutoRoutePoint>((routeNodeId, index) => ({
    routeNodeId,
    travelMinutesFromPrevious:
      index === 0
        ? null
        : findRouteTimeSectionMinutes(
            routeTimeSections,
            routeNodeIds[index - 1],
            routeNodeId
          ),
    isDeadhead,
  }));

const normalizeRouteSegmentStart = (points: AutoRoutePoint[]) =>
  points.map((point, index) =>
    index === 0 ? { ...point, travelMinutesFromPrevious: null } : point
  );

const getRouteSegmentThroughPoint = (
  points: AutoRoutePoint[],
  routePoint: AutoRoutePoint
) => {
  const index = points.findIndex((point) =>
    isSameRouteLocation(point, routePoint)
  );
  return index < 0
    ? []
    : normalizeRouteSegmentStart(points.slice(0, index + 1));
};

const getRouteSegmentFromPoint = (
  points: AutoRoutePoint[],
  routePoint: AutoRoutePoint
) => {
  const index = points.findIndex((point) =>
    isSameRouteLocation(point, routePoint)
  );
  return index < 0 ? [] : normalizeRouteSegmentStart(points.slice(index));
};

const getPrimaryStopTime = (stop: Stop) =>
  stop.arrivalTime || stop.departureTime;

const getAbsoluteStopMinutes = (stops: Stop[]) => {
  let dayOffset = 0;
  let previousMinutes = 0;
  return stops.map((stop, index) => {
    const time = getPrimaryStopTime(stop);
    const minutes = timeStringToMinutes(time);
    if (minutes === null) return null;
    let absoluteMinutes = minutes + dayOffset * 1440;
    while (index !== 0 && absoluteMinutes < previousMinutes) {
      dayOffset += 1;
      absoluteMinutes = minutes + dayOffset * 1440;
    }
    previousMinutes = absoluteMinutes;
    return absoluteMinutes;
  });
};

const shiftStopTime = (value: string, offsetMinutes: number) => {
  const minutes = timeStringToMinutes(value);
  if (minutes === null) return "";
  return minutesToTimeString(minutes + offsetMinutes);
};

const copyStopWithOffset = (
  trainRun: TrainRun,
  stop: Stop,
  copyIndex: number,
  offsetMinutes: number,
  sourceIndex: number,
  idSuffix = ""
): Stop => ({
  ...stop,
  id: `${trainRun.id}_repeat_${copyIndex}_${sourceIndex}_${stop.routeNodeId}${
    idSuffix ? `_${idSuffix}` : ""
  }`,
  arrivalTime: stop.arrivalTime
    ? shiftStopTime(stop.arrivalTime, offsetMinutes)
    : "",
  departureTime: stop.departureTime
    ? shiftStopTime(stop.departureTime, offsetMinutes)
    : "",
});

const applyRepeatRange = (stops: Stop[], trainRun: TrainRun) => {
  if (
    trainRun.repeatRangeStartIndex === null ||
    trainRun.repeatRangeEndIndex === null ||
    trainRun.repeatRangeCount <= 1
  ) {
    return stops;
  }

  const startIndex = Math.max(
    0,
    Math.min(trainRun.repeatRangeStartIndex, trainRun.repeatRangeEndIndex)
  );
  const endIndex = Math.min(
    stops.length - 1,
    Math.max(trainRun.repeatRangeStartIndex, trainRun.repeatRangeEndIndex)
  );
  if (startIndex >= stops.length || endIndex < startIndex) return stops;

  const selectedStops = stops.slice(startIndex, endIndex + 1);
  const absoluteMinutes = getAbsoluteStopMinutes(selectedStops);
  const firstMinutes = absoluteMinutes.find(
    (minutes): minutes is number => minutes !== null
  );
  const lastMinutes = [...absoluteMinutes]
    .reverse()
    .find((minutes): minutes is number => minutes !== null);
  const intervalMinutes =
    firstMinutes === undefined || lastMinutes === undefined
      ? null
      : Math.max(0, lastMinutes - firstMinutes);

  const repeatedStops = Array.from({
    length: Math.max(1, Math.floor(trainRun.repeatRangeCount)),
  }).flatMap((_, repeatIndex) => {
    if (repeatIndex === 0) return selectedStops;
    const offsetMinutes =
      intervalMinutes === null ? 0 : intervalMinutes * repeatIndex;
    return selectedStops.map((stop, stopIndex) =>
      copyStopWithOffset(trainRun, stop, repeatIndex, offsetMinutes, stopIndex)
    );
  });

  return [
    ...stops.slice(0, startIndex),
    ...repeatedStops,
    ...stops.slice(endIndex + 1),
  ];
};

const getAutoRoutePlan = (
  trainRun: TrainRun,
  routeTimeSections: RouteTimeSection[],
  routeNodes: RouteNode[],
  routeTemplates: RouteTemplate[]
): AutoRoutePlan => {
  const speedRouteTimeSections = getRouteTimeSectionsForSpeedClass(
    routeTimeSections,
    getNormalizedSpeedClassIndex(trainRun.speedClassIndex)
  );
  const deadheadRouteSections = getEffectiveDeadheadRouteSections(
    trainRun,
    routeTemplates
  );
  const serviceRouteSections = getEffectiveServiceRouteSections(
    trainRun,
    routeTemplates
  );
  const deadheadPoints =
    deadheadRouteSections.length > 0
      ? buildRoutePointsFromSections(
          deadheadRouteSections,
          speedRouteTimeSections,
          routeNodes,
          true
        )
      : buildRoutePointsFromNodeIds(
          trainRun.deadheadRouteNodeIds,
          speedRouteTimeSections,
          true
        );
  const servicePoints =
    serviceRouteSections.length > 0
      ? buildRoutePointsFromSections(
          serviceRouteSections,
          speedRouteTimeSections,
          routeNodes,
          false
        )
      : buildRoutePointsFromNodeIds(
          trainRun.serviceRouteNodeIds,
          speedRouteTimeSections,
          false
        );
  const serviceStartPoint = servicePoints[0];
  const serviceEndPoint = servicePoints[servicePoints.length - 1];

  return {
    preDeadheadPoints:
      deadheadPoints.length > 0 && serviceStartPoint
        ? getRouteSegmentThroughPoint(deadheadPoints, serviceStartPoint)
        : deadheadPoints,
    servicePoints,
    deadheadPoints:
      deadheadPoints.length > 0 && serviceEndPoint
        ? getRouteSegmentFromPoint(deadheadPoints, serviceEndPoint)
        : deadheadPoints,
    deadheadRoutePoints: deadheadPoints,
  };
};

const buildAutoStops = (
  trainRun: TrainRun,
  routeTimeSections: RouteTimeSection[],
  routeNodes: RouteNode[],
  routeTemplates: RouteTemplate[]
): Stop[] => {
  if (!shouldUseAutoStops(trainRun, routeTemplates)) return trainRun.stops;
  const routePlan = getAutoRoutePlan(
    trainRun,
    routeTimeSections,
    routeNodes,
    routeTemplates
  );
  const {
    preDeadheadPoints,
    servicePoints,
    deadheadPoints,
    deadheadRoutePoints,
  } = routePlan;
  const firstPoint =
    preDeadheadPoints[0] ?? servicePoints[0] ?? deadheadPoints[0];
  if (!firstPoint) return [];

  const firstTime = firstPoint.isDeadhead
    ? timeStringToMinutes(trainRun.deadheadStartTime)
    : timeStringToMinutes(trainRun.serviceStartTime);
  const serviceEndTime = timeStringToMinutes(trainRun.serviceEndTime);
  const deadheadEndTime = timeStringToMinutes(trainRun.deadheadEndTime);
  const scheduleBase =
    firstTime ??
    timeStringToMinutes(trainRun.serviceStartTime) ??
    timeStringToMinutes(trainRun.deadheadStartTime) ??
    0;
  const serviceEndElapsed =
    serviceEndTime === null
      ? null
      : getElapsedTime(scheduleBase, serviceEndTime);
  const deadheadEndElapsed =
    deadheadEndTime === null
      ? serviceEndElapsed
      : getElapsedTime(scheduleBase, deadheadEndTime);
  const maxAutoStops = 500;
  const maxServiceCycles = 200;
  const stops: Stop[] = [];
  let currentDeparture: number | null = firstTime;
  let lastRoutePoint: AutoRoutePoint | null = null;
  let stopIndex = 0;

  const clearLastDeparture = () => {
    const lastStop = stops[stops.length - 1];
    if (!lastStop) return;
    stops[stops.length - 1] = { ...lastStop, departureTime: "" };
    currentDeparture = null;
  };

  const appendPoint = (
    routePoint: AutoRoutePoint,
    patch: Partial<Pick<AutoRoutePoint, "isDeadhead">> = {},
    options: { restHere?: boolean } = {}
  ) => {
    if (stops.length >= maxAutoStops) return false;
    const isFirstStop = stopIndex === 0;
    const point = { ...routePoint, ...patch };
    let arrivalMinutes: number | null = null;

    if (!isFirstStop) {
      if (
        currentDeparture === null ||
        point.travelMinutesFromPrevious === null
      ) {
        return false;
      }
      arrivalMinutes = currentDeparture + point.travelMinutesFromPrevious;
    }

    if (point.isTimingPoint) {
      currentDeparture = isFirstStop ? firstTime : arrivalMinutes;
      lastRoutePoint = point;
      return currentDeparture !== null;
    }

    const isDeadhead = point.isDeadhead;
    const setting = getStopSetting(
      trainRun,
      routePoint.routeNodeId,
      isDeadhead
    );
    const status = setting?.status ?? "stop";
    const isPass = status === "pass";
    const dwellMinutes = isPass
      ? 0
      : Math.max(
          0,
          Math.floor(setting?.dwellMinutes ?? trainRun.defaultStopMinutes)
        );
    const eventMinutes = isFirstStop ? firstTime : arrivalMinutes;
    const arrivalTime =
      isPass || isFirstStop || eventMinutes === null
        ? ""
        : minutesToTimeString(eventMinutes);
    const departureBase = isFirstStop
      ? firstTime
      : arrivalMinutes === null
      ? null
      : arrivalMinutes;
    const departureMinutes =
      options.restHere || departureBase === null
        ? null
        : isFirstStop || isPass
        ? departureBase
        : departureBase + dwellMinutes;
    const departureTime =
      departureMinutes === null ? "" : minutesToTimeString(departureMinutes);

    currentDeparture = departureMinutes;
    lastRoutePoint = point;

    stops.push({
      id: `${trainRun.id}_auto_${stopIndex}_${routePoint.routeNodeId}`,
      routeNodeId: routePoint.routeNodeId,
      routePortIndex: routePoint.portIndex,
      arrivalTime,
      departureTime,
      status,
      isDeadhead,
    });
    stopIndex += 1;
    return true;
  };

  const appendPoints = (
    routePoints: AutoRoutePoint[],
    patch: Partial<Pick<AutoRoutePoint, "isDeadhead">> = {}
  ) => {
    for (const routePoint of routePoints) {
      if (!appendPoint(routePoint, patch)) return false;
    }
    return true;
  };

  const appendDeadheadUntilRest = (
    routePoint: AutoRoutePoint,
    restTriggerElapsed: number | null
  ) => {
    const routePoints =
      deadheadRoutePoints.length > 1 ? deadheadRoutePoints : deadheadPoints;
    if (routePoints.length <= 1) return false;
    const maxDeadheadHops = maxAutoStops - stops.length;
    const initialSegment = getRouteSegmentFromPoint(routePoints, routePoint);
    if (initialSegment.length === 0) return false;
    let segment = initialSegment.slice(1);
    let hopCount = 0;

    while (hopCount < maxDeadheadHops) {
      if (segment.length === 0) {
        const canCycle =
          lastRoutePoint &&
          isSameRouteLocation(
            routePoints[0],
            routePoints[routePoints.length - 1]
          ) &&
          isSameRouteLocation(
            lastRoutePoint,
            routePoints[routePoints.length - 1]
          );
        if (!canCycle) break;
        segment = routePoints.slice(1);
      }
      const routePoint = segment.shift();
      if (!routePoint) break;
      hopCount += 1;

      const arrivalMinutes =
        currentDeparture !== null &&
        routePoint.travelMinutesFromPrevious !== null
          ? currentDeparture + routePoint.travelMinutesFromPrevious
          : null;
      const reachesRestBeforeTimingPoint =
        routePoint.isTimingPoint &&
        restTriggerElapsed !== null &&
        currentDeparture !== null &&
        arrivalMinutes !== null &&
        currentDeparture < restTriggerElapsed &&
        arrivalMinutes > restTriggerElapsed;
      const restAlreadyBeforeTimingPoint =
        routePoint.isTimingPoint &&
        restTriggerElapsed !== null &&
        currentDeparture !== null &&
        currentDeparture >= restTriggerElapsed;
      if (reachesRestBeforeTimingPoint || restAlreadyBeforeTimingPoint) {
        return true;
      }
      const setting = getStopSetting(trainRun, routePoint.routeNodeId, true);
      const status = setting?.status ?? "stop";
      const isPass = status === "pass";
      const dwellMinutes = isPass
        ? 0
        : Math.max(
            0,
            Math.floor(setting?.dwellMinutes ?? trainRun.defaultStopMinutes)
          );
      const departureMinutes =
        arrivalMinutes === null
          ? null
          : isPass
          ? arrivalMinutes
          : arrivalMinutes + dwellMinutes;
      const reachesRestTriggerDuringDwell =
        !isPass &&
        restTriggerElapsed !== null &&
        arrivalMinutes !== null &&
        departureMinutes !== null &&
        arrivalMinutes < restTriggerElapsed &&
        departureMinutes >= restTriggerElapsed;
      const hasReachedRestTrigger =
        restTriggerElapsed === null ||
        (currentDeparture !== null && currentDeparture >= restTriggerElapsed) ||
        (arrivalMinutes !== null && arrivalMinutes >= restTriggerElapsed) ||
        reachesRestTriggerDuringDwell;
      const canRestHere = !routePoint.isTimingPoint && status !== "pass";
      const shouldRestHere = canRestHere && hasReachedRestTrigger;
      if (
        !appendPoint(
          routePoint,
          { isDeadhead: true },
          { restHere: shouldRestHere }
        )
      ) {
        return false;
      }
      if (shouldRestHere) return true;
    }

    clearLastDeparture();
    return true;
  };

  if (servicePoints.length === 0) {
    appendPoints(
      preDeadheadPoints.length > 0 ? preDeadheadPoints : deadheadPoints,
      { isDeadhead: true }
    );
    return applyRepeatRange(stops, trainRun);
  }

  let firstServiceCycle = servicePoints;
  const serviceStartNodeId = servicePoints[0].routeNodeId;
  if (preDeadheadPoints.length > 0) {
    const preDeadheadLast = preDeadheadPoints[preDeadheadPoints.length - 1];
    if (preDeadheadLast.routeNodeId === serviceStartNodeId) {
      appendPoints(preDeadheadPoints.slice(0, -1), { isDeadhead: true });
      firstServiceCycle = [
        {
          ...servicePoints[0],
          travelMinutesFromPrevious: preDeadheadLast.travelMinutesFromPrevious,
        },
        ...servicePoints.slice(1),
      ];
    } else {
      appendPoints(preDeadheadPoints, { isDeadhead: true });
    }
  }

  const isServiceCycle =
    servicePoints.length > 1 &&
    servicePoints[0].routeNodeId ===
      servicePoints[servicePoints.length - 1].routeNodeId;
  let serviceCycle = firstServiceCycle;
  let serviceCycleCount = 0;
  let serviceFinished = false;
  let serviceEndReached = false;

  const finishWithDeadheadRoute = () => {
    if (
      !lastRoutePoint ||
      !appendDeadheadUntilRest(lastRoutePoint, deadheadEndElapsed)
    ) {
      clearLastDeparture();
    }
  };

  const getArrivalMinutesForRoutePoint = (routePoint: AutoRoutePoint) =>
    currentDeparture !== null && routePoint.travelMinutesFromPrevious !== null
      ? currentDeparture + routePoint.travelMinutesFromPrevious
      : null;

  const shouldRestAtConstrainedDeadheadPoint = (
    routePoint: AutoRoutePoint,
    arrivalMinutes: number | null
  ) => {
    if (routePoint.isTimingPoint || deadheadEndElapsed === null) return false;
    const setting = getStopSetting(trainRun, routePoint.routeNodeId, true);
    const status = setting?.status ?? "stop";
    if (status === "pass") return false;
    const dwellMinutes = Math.max(
      0,
      Math.floor(setting?.dwellMinutes ?? trainRun.defaultStopMinutes)
    );
    const departureMinutes =
      arrivalMinutes === null ? null : arrivalMinutes + dwellMinutes;
    return (
      (currentDeparture !== null && currentDeparture >= deadheadEndElapsed) ||
      (arrivalMinutes !== null && arrivalMinutes >= deadheadEndElapsed) ||
      (arrivalMinutes !== null &&
        departureMinutes !== null &&
        arrivalMinutes < deadheadEndElapsed &&
        departureMinutes >= deadheadEndElapsed)
    );
  };

  const appendConstrainedDeadheadPoint = (routePoint: AutoRoutePoint) => {
    const arrivalMinutes = getArrivalMinutesForRoutePoint(routePoint);
    const shouldRestHere = shouldRestAtConstrainedDeadheadPoint(
      routePoint,
      arrivalMinutes
    );
    if (
      !appendPoint(
        routePoint,
        { isDeadhead: true },
        { restHere: shouldRestHere }
      )
    ) {
      return "failed" as const;
    }
    if (shouldRestHere) return "rested" as const;
    return appendDeadheadUntilRest(routePoint, deadheadEndElapsed)
      ? ("switched" as const)
      : ("continue" as const);
  };

  while (
    !serviceFinished &&
    stops.length < maxAutoStops &&
    serviceCycleCount < maxServiceCycles
  ) {
    for (const routePoint of serviceCycle) {
      const previousStop = stops[stops.length - 1];
      if (
        previousStop &&
        routePoint.travelMinutesFromPrevious === null &&
        previousStop.routeNodeId === routePoint.routeNodeId
      ) {
        continue;
      }

      const serviceAlreadyEnded =
        serviceEndElapsed !== null &&
        currentDeparture !== null &&
        currentDeparture >= serviceEndElapsed;
      if (serviceAlreadyEnded) {
        if (
          !serviceEndReached &&
          lastRoutePoint &&
          appendDeadheadUntilRest(lastRoutePoint, deadheadEndElapsed)
        ) {
          serviceFinished = true;
          break;
        }
        serviceEndReached = true;
        const result = appendConstrainedDeadheadPoint(routePoint);
        if (result !== "continue") {
          if (result === "failed") clearLastDeparture();
          serviceFinished = true;
          break;
        }
        continue;
      }

      const arrivalMinutes = getArrivalMinutesForRoutePoint(routePoint);
      const reachesServiceEnd =
        serviceEndElapsed !== null &&
        currentDeparture !== null &&
        arrivalMinutes !== null &&
        currentDeparture < serviceEndElapsed &&
        arrivalMinutes >= serviceEndElapsed;

      if (reachesServiceEnd) {
        serviceEndReached = true;
        const result = appendConstrainedDeadheadPoint(routePoint);
        if (result !== "continue") {
          if (result === "failed" || !previousStop) clearLastDeparture();
          serviceFinished = true;
          break;
        }
        continue;
      }

      if (serviceEndReached) {
        const result = appendConstrainedDeadheadPoint(routePoint);
        if (result !== "continue") {
          if (result === "failed") clearLastDeparture();
          serviceFinished = true;
          break;
        }
        continue;
      }

      if (!appendPoint(routePoint, { isDeadhead: false })) {
        serviceFinished = true;
        break;
      }
    }

    if (serviceFinished) break;
    serviceCycleCount += 1;

    if (serviceEndReached) {
      if (!isServiceCycle || currentDeparture === null) {
        if (currentDeparture !== null) clearLastDeparture();
        break;
      }
      serviceCycle = servicePoints.slice(1);
      continue;
    }

    if (
      serviceEndElapsed === null ||
      !isServiceCycle ||
      currentDeparture === null
    ) {
      if (serviceEndElapsed !== null) {
        const lastStop = stops[stops.length - 1];
        if (
          lastStop &&
          currentDeparture !== null &&
          currentDeparture >= serviceEndElapsed
        ) {
          finishWithDeadheadRoute();
        } else if (lastStop) {
          clearLastDeparture();
        }
      }
      break;
    }

    if (currentDeparture >= serviceEndElapsed) {
      finishWithDeadheadRoute();
      break;
    }

    serviceCycle = servicePoints.slice(1);
  }

  return applyRepeatRange(stops, trainRun);
};

const withAutoStops = (
  trainRun: TrainRun,
  routeTimeSections: RouteTimeSection[],
  routeNodes: RouteNode[],
  routeTemplates: RouteTemplate[]
) => {
  const routeTimeSectionIds = new Set(
    routeTimeSections.map((section) => section.id)
  );
  const prunedTrainRun = {
    ...trainRun,
    serviceRouteSections: trainRun.serviceRouteSections.filter((section) =>
      routeTimeSectionIds.has(section.routeTimeSectionId)
    ),
    deadheadRouteSections: trainRun.deadheadRouteSections.filter((section) =>
      routeTimeSectionIds.has(section.routeTimeSectionId)
    ),
  };
  return {
    ...prunedTrainRun,
    stops: buildAutoStops(
      prunedTrainRun,
      routeTimeSections,
      routeNodes,
      routeTemplates
    ),
  };
};

const updateTrainRun = (
  trainRuns: TrainRun[],
  trainRunId: string,
  updater: (trainRun: TrainRun) => TrainRun
) =>
  trainRuns.map((trainRun) =>
    trainRun.id === trainRunId ? updater(trainRun) : trainRun
  );

const routeNodeExists = (routeNodes: RouteNode[], id: string) =>
  routeNodes.some((routeNode) => routeNode.id === id);

const routeEdgeExists = (routeEdges: RouteEdge[], id: string) =>
  routeEdges.some((routeEdge) => routeEdge.id === id);

const routeTimeSectionPortsEqual = (
  a: RouteTimeSectionPort,
  b: RouteTimeSectionPort
) => a.nodeId === b.nodeId && a.side === b.side && a.index === b.index;

const getRouteEdgeStartPort = (routeEdge: RouteEdge): RouteTimeSectionPort => ({
  nodeId: routeEdge.fromNodeId,
  side: routeEdge.fromPortSide,
  index: routeEdge.fromPortIndex,
});

const getRouteEdgeEndPort = (routeEdge: RouteEdge): RouteTimeSectionPort => ({
  nodeId: routeEdge.toNodeId,
  side: routeEdge.toPortSide,
  index: routeEdge.toPortIndex,
});

const splitMinutes = (minutes: number, splitRatio: number) => {
  const clampedRatio = Math.max(0, Math.min(1, splitRatio));
  const first = Math.max(
    0,
    Math.min(minutes, Math.round(minutes * clampedRatio))
  );
  return [first, Math.max(0, minutes - first)];
};

const getNormalizedSpeedClassIndex = (value: number | undefined) =>
  Math.max(0, Math.floor(value ?? 0));

const normalizeSpeedClassMultiplier = (value: number | undefined) => {
  const multiplier = Number.isFinite(value) ? Number(value) : 1;
  return Math.max(0.05, Math.min(20, multiplier));
};

const normalizeRouteTimeSpeedClasses = (
  speedClasses: RouteTimeSpeedClass[] | undefined,
  count: number
): RouteTimeSpeedClass[] => {
  const normalizedCount = Math.max(1, Math.floor(count));
  return Array.from({ length: normalizedCount }, (_, index) => ({
    baseIndex: 0,
    multiplier: normalizeSpeedClassMultiplier(
      speedClasses?.[index]?.multiplier
    ),
  }));
};

const getStateRouteTimeSpeedClassCount = (state: State) =>
  Math.max(
    state.routeTimeSpeedClasses?.length ?? 0,
    getRouteTimeSpeedClassCount(
      state.routeTimeSections,
      state.routeTimeSpeedClassCount
    )
  );

const normalizeRouteTimeSectionSpeedProfiles = (
  section: RouteTimeSection,
  routeNodes: RouteNode[],
  speedClassCount: number
) => {
  const segmentCount =
    getRouteTimeSectionBreakGroups(section, routeNodes).length + 1;
  const fallbackProfiles =
    section.speedProfiles && section.speedProfiles.length > 0
      ? section.speedProfiles
      : [
          {
            travelMinutes: section.travelMinutes,
            segmentMinutes: section.segmentMinutes,
          },
        ];
  const normalizedCount = Math.max(1, Math.floor(speedClassCount));
  const speedProfiles = Array.from({ length: normalizedCount }, (_, index) => {
    const fallback =
      fallbackProfiles[index] ??
      fallbackProfiles[fallbackProfiles.length - 1] ??
      fallbackProfiles[0];
    const travelMinutes = Math.max(
      0,
      Math.floor(fallback?.travelMinutes ?? section.travelMinutes)
    );
    return {
      travelMinutes,
      segmentMinutes: normalizeRouteTimeSectionSegmentMinutesForTotal(
        travelMinutes,
        fallback?.segmentMinutes ?? section.segmentMinutes,
        segmentCount
      ),
    };
  });
  const firstProfile = speedProfiles[0];
  return {
    ...section,
    travelMinutes: firstProfile.travelMinutes,
    segmentMinutes: firstProfile.segmentMinutes,
    speedProfiles,
  };
};

const updateRouteTimeSectionSpeedProfile = (
  section: RouteTimeSection,
  routeNodes: RouteNode[],
  speedClassCount: number,
  speedClassIndex: number,
  patch: { travelMinutes?: number; segmentMinutes?: number[] }
) => {
  const normalizedSection = normalizeRouteTimeSectionSpeedProfiles(
    section,
    routeNodes,
    Math.max(speedClassCount, speedClassIndex + 1)
  );
  const segmentCount =
    getRouteTimeSectionBreakGroups(normalizedSection, routeNodes).length + 1;
  const speedProfiles = normalizedSection.speedProfiles.map(
    (profile, index) => {
      if (index !== speedClassIndex) return profile;
      const travelMinutes = Math.max(
        0,
        Math.floor(patch.travelMinutes ?? profile.travelMinutes)
      );
      return {
        travelMinutes,
        segmentMinutes: normalizeRouteTimeSectionSegmentMinutesForTotal(
          travelMinutes,
          patch.segmentMinutes ?? profile.segmentMinutes,
          segmentCount
        ),
      };
    }
  );
  const firstProfile = speedProfiles[0];
  return {
    ...normalizedSection,
    travelMinutes: firstProfile.travelMinutes,
    segmentMinutes: firstProfile.segmentMinutes,
    speedProfiles,
  };
};

const removeRouteTimeSectionSpeedProfile = (
  section: RouteTimeSection,
  routeNodes: RouteNode[],
  speedClassCount: number,
  speedClassIndex: number
) => {
  const normalizedSection = normalizeRouteTimeSectionSpeedProfiles(
    section,
    routeNodes,
    speedClassCount
  );
  const fallbackProfile = normalizedSection.speedProfiles[0] ?? {
    travelMinutes: normalizedSection.travelMinutes,
    segmentMinutes: normalizedSection.segmentMinutes,
  };
  const speedProfiles =
    normalizedSection.speedProfiles.length <= 1
      ? [fallbackProfile]
      : normalizedSection.speedProfiles.filter(
          (_, index) => index !== speedClassIndex
        );
  const firstProfile = speedProfiles[0];
  return {
    ...normalizedSection,
    travelMinutes: firstProfile.travelMinutes,
    segmentMinutes: firstProfile.segmentMinutes,
    speedProfiles,
  };
};

const getScaledSpeedProfileFromBase = (
  section: RouteTimeSection,
  routeNodes: RouteNode[],
  baseProfile: { travelMinutes: number; segmentMinutes: number[] },
  multiplier: number
) => {
  const normalizedMultiplier = normalizeSpeedClassMultiplier(multiplier);
  const segmentCount =
    getRouteTimeSectionBreakGroups(section, routeNodes).length + 1;
  const travelMinutes = Math.max(
    0,
    Math.round(baseProfile.travelMinutes * normalizedMultiplier)
  );
  return {
    travelMinutes,
    segmentMinutes: normalizeRouteTimeSectionSegmentMinutesForTotal(
      travelMinutes,
      baseProfile.segmentMinutes.map((minutes) =>
        Math.max(0, Math.round(minutes * normalizedMultiplier))
      ),
      segmentCount
    ),
  };
};

const applySpeedClassMultipliersToRouteTimeSections = (
  routeTimeSections: RouteTimeSection[],
  routeNodes: RouteNode[],
  speedClasses: RouteTimeSpeedClass[],
  speedClassCount: number
) => {
  const normalizedSpeedClasses = normalizeRouteTimeSpeedClasses(
    speedClasses,
    speedClassCount
  );
  return routeTimeSections.map((section) => {
    const normalizedSection = normalizeRouteTimeSectionSpeedProfiles(
      section,
      routeNodes,
      speedClassCount
    );
    const baseProfile = getRouteTimeSectionSpeedProfile(normalizedSection, 0);
    const speedProfiles = normalizedSection.speedProfiles.map(
      (profile, index) =>
        index === 0
          ? profile
          : getScaledSpeedProfileFromBase(
              normalizedSection,
              routeNodes,
              baseProfile,
              normalizedSpeedClasses[index]?.multiplier ?? 1
            )
    );
    const firstProfile = speedProfiles[0];
    return {
      ...normalizedSection,
      travelMinutes: firstProfile.travelMinutes,
      segmentMinutes: firstProfile.segmentMinutes,
      speedProfiles,
    };
  });
};

const replaceRouteEdgeInRouteTimeSection = (
  section: RouteTimeSection,
  routeEdge: RouteEdge,
  firstRouteEdgeId: string,
  secondRouteEdgeId: string,
  entryPort: RouteTimeSectionPort,
  exitPort: RouteTimeSectionPort,
  splitRatio: number,
  routeNodes: RouteNode[]
) => {
  if (!section.routeEdgeIds.includes(routeEdge.id)) return section;

  const routeEdgeStartPort = getRouteEdgeStartPort(routeEdge);
  const routeEdgeEndPort = getRouteEdgeEndPort(routeEdge);
  const nextRouteEdgeIds = section.routeEdgeIds.flatMap((routeEdgeId) =>
    routeEdgeId === routeEdge.id
      ? [firstRouteEdgeId, secondRouteEdgeId]
      : [routeEdgeId]
  );
  const nextRoutePorts = section.routePorts.reduce<RouteTimeSectionPort[]>(
    (ports, port, index, sourcePorts) => {
      const nextPort = sourcePorts[index + 1];
      ports.push(port);
      if (!nextPort) return ports;

      if (
        routeTimeSectionPortsEqual(port, routeEdgeStartPort) &&
        routeTimeSectionPortsEqual(nextPort, routeEdgeEndPort)
      ) {
        ports.push(entryPort, exitPort);
      } else if (
        routeTimeSectionPortsEqual(port, routeEdgeEndPort) &&
        routeTimeSectionPortsEqual(nextPort, routeEdgeStartPort)
      ) {
        ports.push(exitPort, entryPort);
      }
      return ports;
    },
    []
  );

  const oldSegmentCount =
    getRouteTimeSectionBreakGroups(section, routeNodes).length + 1;
  const oldSegmentIndex = getRouteTimeSectionSegmentRefs(
    section,
    routeNodes
  ).findIndex(
    (segment) =>
      (routeTimeSectionPortsEqual(segment.fromPort, routeEdgeStartPort) &&
        routeTimeSectionPortsEqual(segment.toPort, routeEdgeEndPort)) ||
      (routeTimeSectionPortsEqual(segment.fromPort, routeEdgeEndPort) &&
        routeTimeSectionPortsEqual(segment.toPort, routeEdgeStartPort))
  );
  const nextSection = {
    ...section,
    routeEdgeIds: nextRouteEdgeIds,
    routePorts: nextRoutePorts,
  };
  const nextSegmentCount =
    getRouteTimeSectionBreakGroups(nextSection, routeNodes).length + 1;
  const nextSpeedProfiles = (
    section.speedProfiles && section.speedProfiles.length > 0
      ? section.speedProfiles
      : [
          {
            travelMinutes: section.travelMinutes,
            segmentMinutes: section.segmentMinutes,
          },
        ]
  ).map((profile) => {
    const profileOldSegmentMinutes =
      normalizeRouteTimeSectionSegmentMinutesForTotal(
        profile.travelMinutes,
        profile.segmentMinutes,
        oldSegmentCount
      );
    const profileNextSegmentMinutes =
      oldSegmentIndex >= 0 && nextSegmentCount > oldSegmentCount
        ? profileOldSegmentMinutes.flatMap((minutes, index) =>
            index === oldSegmentIndex
              ? splitMinutes(minutes, splitRatio)
              : [minutes]
          )
        : profile.segmentMinutes;
    return {
      travelMinutes: profile.travelMinutes,
      segmentMinutes: normalizeRouteTimeSectionSegmentMinutesForTotal(
        profile.travelMinutes,
        profileNextSegmentMinutes,
        nextSegmentCount
      ),
    };
  });
  const firstProfile = nextSpeedProfiles[0];

  return {
    ...nextSection,
    travelMinutes: firstProfile.travelMinutes,
    segmentMinutes: firstProfile.segmentMinutes,
    speedProfiles: nextSpeedProfiles,
  };
};

const pruneRouteTemplates = (
  routeTemplates: RouteTemplate[],
  routeTimeSections: RouteTimeSection[]
) => {
  const routeTimeSectionIds = new Set(
    routeTimeSections.map((section) => section.id)
  );
  return routeTemplates.map((routeTemplate) => ({
    ...routeTemplate,
    serviceRouteSections: routeTemplate.serviceRouteSections.filter((section) =>
      routeTimeSectionIds.has(section.routeTimeSectionId)
    ),
    deadheadRouteSections: routeTemplate.deadheadRouteSections.filter(
      (section) => routeTimeSectionIds.has(section.routeTimeSectionId)
    ),
  }));
};

const removeRouteNodeIdFromTrainRun = (
  trainRun: TrainRun,
  routeNodeId: string,
  routeTimeSections: RouteTimeSection[],
  routeNodes: RouteNode[],
  routeTemplates: RouteTemplate[]
) =>
  withAutoStops(
    {
      ...trainRun,
      serviceRouteNodeIds: trainRun.serviceRouteNodeIds.filter(
        (nodeId) => nodeId !== routeNodeId
      ),
      deadheadRouteNodeIds: trainRun.deadheadRouteNodeIds.filter(
        (nodeId) => nodeId !== routeNodeId
      ),
      stopSettings: trainRun.stopSettings.filter(
        (setting) => setting.routeNodeId !== routeNodeId
      ),
      deadheadStopSettings: (trainRun.deadheadStopSettings ?? []).filter(
        (setting) => setting.routeNodeId !== routeNodeId
      ),
      stops: trainRun.stops.filter((stop) => stop.routeNodeId !== routeNodeId),
    },
    routeTimeSections,
    routeNodes,
    routeTemplates
  );

const getRouteEdgeSetKey = (routeEdgeIds: string[]) =>
  [...new Set(routeEdgeIds)].sort().join("|");

const isPortOccupied = (
  routeEdges: RouteEdge[],
  nodeId: string,
  side: RoutePortSide,
  index: number,
  ignoreEdgeId?: string
) =>
  routeEdges.some(
    (routeEdge) =>
      routeEdge.id !== ignoreEdgeId &&
      ((routeEdge.fromNodeId === nodeId &&
        routeEdge.fromPortSide === side &&
        routeEdge.fromPortIndex === index) ||
        (routeEdge.toNodeId === nodeId &&
          routeEdge.toPortSide === side &&
          routeEdge.toPortIndex === index))
  );

const rotatePortSide = (
  side: RoutePortSide,
  degrees: number
): RoutePortSide => {
  const sides: RoutePortSide[] = ["top", "right", "bottom", "left"];
  const index = sides.indexOf(side);
  const offset = Math.round(degrees / 90);
  return sides[(index + offset + sides.length * 4) % sides.length];
};

const normalizeNodeRotation = (rotation = 0, allowFourDirections = false) => {
  const normalized = (((Math.round(rotation / 90) * 90) % 360) + 360) % 360;
  return allowFourDirections ? normalized : normalized % 180;
};

const allowsFourDirectionNode = (
  _nodeType: RouteNodeType,
  _connectionType?: ConnectionType
) => true;

const remapConnectionPortIndexForType = (
  routeNode: RouteNode,
  nextConnectionType: ConnectionType,
  side: RoutePortSide,
  index: number
) => {
  const canonicalSide = rotatePortSide(side, -routeNode.rotation);
  if (canonicalSide !== "left" && canonicalSide !== "right") return index;
  if (
    canonicalSide === "left" &&
    (nextConnectionType === "turnout" || nextConnectionType === "passing12")
  ) {
    return 0;
  }
  if (canonicalSide === "left" && nextConnectionType === "passing21") {
    return 1;
  }
  return Math.max(0, Math.min(1, Math.floor(index)));
};

const remapConnectionRouteTimePortForType = (
  routeNode: RouteNode,
  nextConnectionType: ConnectionType,
  port: RouteTimeSectionPort
): RouteTimeSectionPort =>
  port.nodeId === routeNode.id
    ? {
        ...port,
        index: remapConnectionPortIndexForType(
          routeNode,
          nextConnectionType,
          port.side,
          port.index
        ),
      }
    : port;

export const reducer = (prevState: State, action: Actions): State => {
  switch (action.type) {
    case "addStation": {
      const name = action.payload.name.trim();
      if (!name) return prevState;
      if (prevState.stations.some((station) => station.name === name)) {
        return prevState;
      }

      return {
        ...prevState,
        stations: [...prevState.stations, { id: createId("st"), name }],
      };
    }

    case "updateStation": {
      const station = prevState.stations.find(
        (candidate) => candidate.id === action.payload.id
      );
      const previousName = station?.name ?? "";
      return {
        ...prevState,
        stations: prevState.stations.map((station) =>
          station.id === action.payload.id
            ? { ...station, name: action.payload.name }
            : station
        ),
        routeNodes: prevState.routeNodes.map((routeNode) =>
          routeNode.stationId === action.payload.id &&
          (!routeNode.label || routeNode.label === previousName)
            ? { ...routeNode, label: action.payload.name }
            : routeNode
        ),
      };
    }

    case "removeStation": {
      const isUsed = prevState.routeNodes.some(
        (routeNode) => routeNode.stationId === action.payload.id
      );
      if (isUsed) return prevState;

      return {
        ...prevState,
        stations: prevState.stations.filter(
          (station) => station.id !== action.payload.id
        ),
      };
    }

    case "addRouteNode": {
      const platformCount = Math.max(
        1,
        Math.floor(action.payload.platformCount)
      );
      const verticalPlatformCount = Math.max(
        1,
        Math.floor(
          action.payload.verticalPlatformCount ?? action.payload.platformCount
        )
      );
      const routeNode: RouteNode = {
        id: action.payload.id ?? createId("rn"),
        stationId: action.payload.stationId,
        label: action.payload.label.trim(),
        type: action.payload.nodeType,
        x: action.payload.x,
        y: action.payload.y,
        rotation: normalizeNodeRotation(
          action.payload.rotation,
          allowsFourDirectionNode(
            action.payload.nodeType,
            action.payload.connectionType
          )
        ),
        isFlipped: action.payload.isFlipped ?? false,
        isTerminal: action.payload.isTerminal ?? false,
        isHorizontalTerminal: action.payload.isHorizontalTerminal ?? false,
        isVerticalTerminal: action.payload.isVerticalTerminal ?? false,
        platformNumber: action.payload.platformNumber.trim(),
        platformCount,
        platformLabels: normalizePlatformLabels(undefined, platformCount),
        verticalPlatformCount,
        verticalPlatformLabels: normalizePlatformLabels(
          undefined,
          verticalPlatformCount
        ),
        durationMinutes: Math.max(0, action.payload.durationMinutes),
        connectionType: action.payload.connectionType ?? "passing12",
      };

      return {
        ...prevState,
        routeNodes: [...prevState.routeNodes, routeNode],
      };
    }

    case "updateRouteNode": {
      const previousRouteNode = prevState.routeNodes.find(
        (routeNode) => routeNode.id === action.payload.id
      );
      if (!previousRouteNode) return prevState;
      const nextConnectionType =
        action.payload.connectionType ?? previousRouteNode.connectionType;
      const shouldRemapConnectionPorts =
        previousRouteNode.type === "connection" &&
        action.payload.connectionType !== undefined &&
        action.payload.connectionType !== previousRouteNode.connectionType;
      const nextX = action.payload.x ?? previousRouteNode.x;
      const nextY = action.payload.y ?? previousRouteNode.y;
      const nodeMoved = nextX !== previousRouteNode.x || nextY !== previousRouteNode.y;
      const stationChanged =
        action.payload.stationId !== undefined &&
        action.payload.stationId !== previousRouteNode.stationId;
      const nextStationName = stationChanged
        ? prevState.stations.find(
            (station) => station.id === action.payload.stationId
          )?.name ?? ""
        : "";
      const clearMovedNodeManualWaypoints = (routeEdge: RouteEdge): RouteEdge =>
        nodeMoved &&
        (routeEdge.fromNodeId === previousRouteNode.id ||
          routeEdge.toNodeId === previousRouteNode.id)
          ? { ...routeEdge, manualWaypoints: undefined }
          : routeEdge;
      const routeNodes = prevState.routeNodes.map((routeNode) => {
        if (routeNode.id !== action.payload.id) return routeNode;
        const platformCount =
          action.payload.platformCount === undefined
            ? routeNode.platformCount
            : Math.max(1, Math.floor(action.payload.platformCount));
        const verticalPlatformCount =
          action.payload.verticalPlatformCount === undefined
            ? routeNode.verticalPlatformCount
            : Math.max(1, Math.floor(action.payload.verticalPlatformCount));
        return {
          ...routeNode,
          stationId: action.payload.stationId ?? routeNode.stationId,
          label:
            action.payload.label === undefined
              ? stationChanged
                ? nextStationName
                : routeNode.label
              : action.payload.label,
          type: action.payload.nodeType ?? routeNode.type,
          x: action.payload.x ?? routeNode.x,
          y: action.payload.y ?? routeNode.y,
          rotation: normalizeNodeRotation(
            action.payload.rotation ?? routeNode.rotation,
            allowsFourDirectionNode(
              action.payload.nodeType ?? routeNode.type,
              action.payload.connectionType ?? routeNode.connectionType
            )
          ),
          isFlipped: action.payload.isFlipped ?? routeNode.isFlipped,
          isTerminal: action.payload.isTerminal ?? routeNode.isTerminal,
          isHorizontalTerminal:
            action.payload.isHorizontalTerminal ??
            routeNode.isHorizontalTerminal,
          isVerticalTerminal:
            action.payload.isVerticalTerminal ?? routeNode.isVerticalTerminal,
          platformNumber:
            action.payload.platformNumber === undefined
              ? routeNode.platformNumber
              : action.payload.platformNumber,
          platformCount,
          platformLabels: normalizePlatformLabels(
            action.payload.platformLabels ?? routeNode.platformLabels,
            platformCount
          ),
          verticalPlatformCount,
          verticalPlatformLabels: normalizePlatformLabels(
            action.payload.verticalPlatformLabels ??
              routeNode.verticalPlatformLabels,
            verticalPlatformCount
          ),
          durationMinutes:
            action.payload.durationMinutes ?? routeNode.durationMinutes,
          connectionType: nextConnectionType,
        };
      });

      if (!shouldRemapConnectionPorts) {
        return {
          ...prevState,
          routeNodes,
          routeEdges: nodeMoved
            ? prevState.routeEdges.map(clearMovedNodeManualWaypoints)
            : prevState.routeEdges,
        };
      }

      const routeEdges = prevState.routeEdges.map((routeEdge) =>
        clearMovedNodeManualWaypoints({
          ...routeEdge,
          fromPortIndex:
            routeEdge.fromNodeId === previousRouteNode.id
              ? remapConnectionPortIndexForType(
                  previousRouteNode,
                  nextConnectionType,
                  routeEdge.fromPortSide,
                  routeEdge.fromPortIndex
                )
              : routeEdge.fromPortIndex,
          toPortIndex:
            routeEdge.toNodeId === previousRouteNode.id
              ? remapConnectionPortIndexForType(
                  previousRouteNode,
                  nextConnectionType,
                  routeEdge.toPortSide,
                  routeEdge.toPortIndex
                )
              : routeEdge.toPortIndex,
        })
      );
      const routeTimeSections = prevState.routeTimeSections.map((section) => ({
        ...section,
        startPortIndex:
          section.startNodeId === previousRouteNode.id
            ? remapConnectionPortIndexForType(
                previousRouteNode,
                nextConnectionType,
                section.startPortSide,
                section.startPortIndex
              )
            : section.startPortIndex,
        endPortIndex:
          section.endNodeId === previousRouteNode.id
            ? remapConnectionPortIndexForType(
                previousRouteNode,
                nextConnectionType,
                section.endPortSide,
                section.endPortIndex
              )
            : section.endPortIndex,
        routePorts: section.routePorts.map((port) =>
          remapConnectionRouteTimePortForType(
            previousRouteNode,
            nextConnectionType,
            port
          )
        ),
      }));

      return {
        ...prevState,
        routeNodes,
        routeEdges,
        routeTimeSections,
        trainRuns: prevState.trainRuns.map((trainRun) =>
          withAutoStops(
            trainRun,
            routeTimeSections,
            routeNodes,
            prevState.routeTemplates
          )
        ),
      };
    }

    case "rotateRouteNode": {
      const rotatedNode = prevState.routeNodes.find(
        (routeNode) => routeNode.id === action.payload.id
      );
      if (!rotatedNode) return prevState;
      const previousRotation = normalizeNodeRotation(
        rotatedNode.rotation,
        allowsFourDirectionNode(rotatedNode.type, rotatedNode.connectionType)
      );
      const nextRotation = normalizeNodeRotation(
        previousRotation + action.payload.delta,
        allowsFourDirectionNode(rotatedNode.type, rotatedNode.connectionType)
      );
      const portRotationDelta = (nextRotation - previousRotation + 360) % 360;
      const rotateRouteNodePort = <T extends RouteTimeSectionPort>(
        port: T
      ): T =>
        port.nodeId === action.payload.id
          ? {
              ...port,
              side: rotatePortSide(port.side, portRotationDelta),
            }
          : port;
      const routeNodes = prevState.routeNodes.map((routeNode) =>
        routeNode.id === action.payload.id
          ? {
              ...routeNode,
              rotation: nextRotation,
            }
          : routeNode
      );
      const routeTimeSections = prevState.routeTimeSections.map((section) => ({
        ...section,
        startPortSide:
          section.startNodeId === action.payload.id
            ? rotatePortSide(section.startPortSide, portRotationDelta)
            : section.startPortSide,
        endPortSide:
          section.endNodeId === action.payload.id
            ? rotatePortSide(section.endPortSide, portRotationDelta)
            : section.endPortSide,
        routePorts: section.routePorts.map(rotateRouteNodePort),
      }));

      return {
        ...prevState,
        routeNodes,
        routeEdges: prevState.routeEdges.map((routeEdge) => ({
          ...routeEdge,
          fromPortSide:
            routeEdge.fromNodeId === action.payload.id
              ? rotatePortSide(routeEdge.fromPortSide, portRotationDelta)
              : routeEdge.fromPortSide,
          toPortSide:
            routeEdge.toNodeId === action.payload.id
              ? rotatePortSide(routeEdge.toPortSide, portRotationDelta)
              : routeEdge.toPortSide,
        })),
        routeTimeSections,
        trainRuns: prevState.trainRuns.map((trainRun) =>
          withAutoStops(
            trainRun,
            routeTimeSections,
            routeNodes,
            prevState.routeTemplates
          )
        ),
      };
    }

    case "flipRouteNode": {
      return {
        ...prevState,
        routeNodes: prevState.routeNodes.map((routeNode) =>
          routeNode.id === action.payload.id
            ? { ...routeNode, isFlipped: !routeNode.isFlipped }
            : routeNode
        ),
      };
    }

    case "removeRouteNode": {
      const routeTimeSections = prevState.routeTimeSections.filter(
        (section) =>
          section.startNodeId !== action.payload.id &&
          section.endNodeId !== action.payload.id &&
          section.routeEdgeIds.every((routeEdgeId) => {
            const routeEdge = prevState.routeEdges.find(
              (edge) => edge.id === routeEdgeId
            );
            return (
              routeEdge &&
              routeEdge.fromNodeId !== action.payload.id &&
              routeEdge.toNodeId !== action.payload.id
            );
          })
      );
      const routeTemplates = pruneRouteTemplates(
        prevState.routeTemplates,
        routeTimeSections
      );

      return {
        ...prevState,
        routeNodes: prevState.routeNodes.filter(
          (routeNode) => routeNode.id !== action.payload.id
        ),
        routeEdges: prevState.routeEdges.filter(
          (routeEdge) =>
            routeEdge.fromNodeId !== action.payload.id &&
            routeEdge.toNodeId !== action.payload.id
        ),
        routeTimeSections,
        routeTemplates,
        trainRuns: prevState.trainRuns.map((trainRun) =>
          removeRouteNodeIdFromTrainRun(
            trainRun,
            action.payload.id,
            routeTimeSections,
            prevState.routeNodes.filter(
              (routeNode) => routeNode.id !== action.payload.id
            ),
            routeTemplates
          )
        ),
      };
    }

    case "addRouteEdge": {
      const fromPortSide = action.payload.fromPortSide ?? "right";
      const toPortSide = action.payload.toPortSide ?? "left";
      const fromPortIndex = Math.max(
        0,
        Math.floor(action.payload.fromPortIndex ?? 0)
      );
      const toPortIndex = Math.max(
        0,
        Math.floor(action.payload.toPortIndex ?? 0)
      );
      if (
        action.payload.fromNodeId === action.payload.toNodeId &&
        fromPortSide === toPortSide &&
        fromPortIndex === toPortIndex
      ) {
        return prevState;
      }
      if (
        !routeNodeExists(prevState.routeNodes, action.payload.fromNodeId) ||
        !routeNodeExists(prevState.routeNodes, action.payload.toNodeId)
      ) {
        return prevState;
      }
      if (
        prevState.routeEdges.some(
          (routeEdge) =>
            routeEdge.fromNodeId === action.payload.fromNodeId &&
            routeEdge.toNodeId === action.payload.toNodeId &&
            routeEdge.fromPortSide === fromPortSide &&
            routeEdge.fromPortIndex === fromPortIndex &&
            routeEdge.toPortSide === toPortSide &&
            routeEdge.toPortIndex === toPortIndex
        )
      ) {
        return prevState;
      }
      if (
        isPortOccupied(
          prevState.routeEdges,
          action.payload.fromNodeId,
          fromPortSide,
          fromPortIndex
        ) ||
        isPortOccupied(
          prevState.routeEdges,
          action.payload.toNodeId,
          toPortSide,
          toPortIndex
        )
      ) {
        return prevState;
      }

      const routeEdge: RouteEdge = {
        id: action.payload.id ?? createId("re"),
        fromNodeId: action.payload.fromNodeId,
        toNodeId: action.payload.toNodeId,
        fromPortSide,
        fromPortIndex,
        toPortSide,
        toPortIndex,
        type: action.payload.edgeType ?? "main",
        travelMinutes: Math.max(0, action.payload.travelMinutes ?? 0),
        bidirectional: action.payload.bidirectional ?? true,
        manualWaypoints: action.payload.manualWaypoints?.map((point) => ({
          x: point.x,
          y: point.y,
        })),
      };

      return {
        ...prevState,
        routeEdges: [...prevState.routeEdges, routeEdge],
      };
    }

    case "insertConnectionNodeOnRouteEdge": {
      const routeEdge = prevState.routeEdges.find(
        (edge) => edge.id === action.payload.routeEdgeId
      );
      if (!routeEdge) return prevState;
      const nodeId = action.payload.nodeId ?? createId("rc");
      if (routeNodeExists(prevState.routeNodes, nodeId)) return prevState;

      const firstRouteEdgeId =
        action.payload.firstRouteEdgeId ?? createId("re");
      const secondRouteEdgeId =
        action.payload.secondRouteEdgeId ?? createId("re");
      const entryPort: RouteTimeSectionPort = {
        nodeId,
        side: action.payload.entryPortSide,
        index: Math.max(0, Math.floor(action.payload.entryPortIndex)),
      };
      const exitPort: RouteTimeSectionPort = {
        nodeId,
        side: action.payload.exitPortSide,
        index: Math.max(0, Math.floor(action.payload.exitPortIndex)),
      };
      const connectionType = action.payload.connectionType ?? "passing12";
      const routeNode: RouteNode = {
        id: nodeId,
        stationId: "",
        label: "",
        type: "connection",
        x: action.payload.x,
        y: action.payload.y,
        rotation: normalizeNodeRotation(
          action.payload.rotation,
          allowsFourDirectionNode("connection", connectionType)
        ),
        isFlipped: false,
        isTerminal: false,
        isHorizontalTerminal: false,
        isVerticalTerminal: false,
        platformNumber: "",
        platformCount: 1,
        platformLabels: normalizePlatformLabels(undefined, 1),
        verticalPlatformCount: 1,
        verticalPlatformLabels: normalizePlatformLabels(undefined, 1),
        durationMinutes: 0,
        connectionType,
      };
      const [firstTravelMinutes, secondTravelMinutes] = splitMinutes(
        routeEdge.travelMinutes,
        action.payload.splitRatio
      );
      const firstRouteEdge: RouteEdge = {
        ...routeEdge,
        id: firstRouteEdgeId,
        toNodeId: nodeId,
        toPortSide: entryPort.side,
        toPortIndex: entryPort.index,
        travelMinutes: firstTravelMinutes,
        manualWaypoints: undefined,
      };
      const secondRouteEdge: RouteEdge = {
        ...routeEdge,
        id: secondRouteEdgeId,
        fromNodeId: nodeId,
        fromPortSide: exitPort.side,
        fromPortIndex: exitPort.index,
        travelMinutes: secondTravelMinutes,
        manualWaypoints: undefined,
      };
      const routeEdges = prevState.routeEdges.flatMap((edge) =>
        edge.id === routeEdge.id ? [firstRouteEdge, secondRouteEdge] : [edge]
      );
      const routeNodes = [...prevState.routeNodes, routeNode];
      const routeTimeSections = prevState.routeTimeSections.map((section) =>
        replaceRouteEdgeInRouteTimeSection(
          section,
          routeEdge,
          firstRouteEdgeId,
          secondRouteEdgeId,
          entryPort,
          exitPort,
          action.payload.splitRatio,
          routeNodes
        )
      );

      return {
        ...prevState,
        routeNodes,
        routeEdges,
        routeTimeSections,
        trainRuns: prevState.trainRuns.map((trainRun) =>
          withAutoStops(
            trainRun,
            routeTimeSections,
            routeNodes,
            prevState.routeTemplates
          )
        ),
      };
    }

    case "insertConnectionNodeOnRouteEdges": {
      const splits = action.payload.splits.filter(
        (split, index, source) =>
          source.findIndex(
            (candidate) => candidate.routeEdgeId === split.routeEdgeId
          ) === index
      );
      if (splits.length === 0 || splits.length > 2) return prevState;

      const routeEdgesById = new Map(
        prevState.routeEdges.map((routeEdge) => [routeEdge.id, routeEdge])
      );
      if (splits.some((split) => !routeEdgesById.has(split.routeEdgeId))) {
        return prevState;
      }

      const nodeId = action.payload.nodeId ?? createId("rc");
      if (routeNodeExists(prevState.routeNodes, nodeId)) return prevState;

      const connectionType = action.payload.connectionType;
      const routeNode: RouteNode = {
        id: nodeId,
        stationId: "",
        label: "",
        type: "connection",
        x: action.payload.x,
        y: action.payload.y,
        rotation: normalizeNodeRotation(
          action.payload.rotation,
          allowsFourDirectionNode("connection", connectionType)
        ),
        isFlipped: false,
        isTerminal: false,
        isHorizontalTerminal: false,
        isVerticalTerminal: false,
        platformNumber: "",
        platformCount: 1,
        platformLabels: normalizePlatformLabels(undefined, 1),
        verticalPlatformCount: 1,
        verticalPlatformLabels: normalizePlatformLabels(undefined, 1),
        durationMinutes: 0,
        connectionType,
      };

      const splitPlans = splits.map((split) => {
        const routeEdge = routeEdgesById.get(split.routeEdgeId);
        if (!routeEdge) return null;
        const firstRouteEdgeId = split.firstRouteEdgeId ?? createId("re");
        const secondRouteEdgeId = split.secondRouteEdgeId ?? createId("re");
        const entryPort: RouteTimeSectionPort = {
          nodeId,
          side: split.entryPortSide,
          index: Math.max(0, Math.floor(split.entryPortIndex)),
        };
        const exitPort: RouteTimeSectionPort = {
          nodeId,
          side: split.exitPortSide,
          index: Math.max(0, Math.floor(split.exitPortIndex)),
        };
        const [firstTravelMinutes, secondTravelMinutes] = splitMinutes(
          routeEdge.travelMinutes,
          split.splitRatio
        );
        return {
          routeEdge,
          firstRouteEdgeId,
          secondRouteEdgeId,
          entryPort,
          exitPort,
          splitRatio: split.splitRatio,
          firstRouteEdge: {
            ...routeEdge,
            id: firstRouteEdgeId,
            toNodeId: nodeId,
            toPortSide: entryPort.side,
            toPortIndex: entryPort.index,
            travelMinutes: firstTravelMinutes,
            manualWaypoints: undefined,
          } satisfies RouteEdge,
          secondRouteEdge: {
            ...routeEdge,
            id: secondRouteEdgeId,
            fromNodeId: nodeId,
            fromPortSide: exitPort.side,
            fromPortIndex: exitPort.index,
            travelMinutes: secondTravelMinutes,
            manualWaypoints: undefined,
          } satisfies RouteEdge,
        };
      });

      if (splitPlans.some((plan) => !plan)) return prevState;
      const splitPlanByRouteEdgeId = new Map(
        splitPlans.flatMap((plan) =>
          plan ? [[plan.routeEdge.id, plan] as const] : []
        )
      );
      const routeEdges = prevState.routeEdges.flatMap((routeEdge) => {
        const plan = splitPlanByRouteEdgeId.get(routeEdge.id);
        return plan ? [plan.firstRouteEdge, plan.secondRouteEdge] : [routeEdge];
      });
      const routeNodes = [...prevState.routeNodes, routeNode];
      const routeTimeSections = splitPlans.reduce(
        (sections, plan) =>
          plan
            ? sections.map((section) =>
                replaceRouteEdgeInRouteTimeSection(
                  section,
                  plan.routeEdge,
                  plan.firstRouteEdgeId,
                  plan.secondRouteEdgeId,
                  plan.entryPort,
                  plan.exitPort,
                  plan.splitRatio,
                  routeNodes
                )
              )
            : sections,
        prevState.routeTimeSections
      );

      return {
        ...prevState,
        routeNodes,
        routeEdges,
        routeTimeSections,
        trainRuns: prevState.trainRuns.map((trainRun) =>
          withAutoStops(
            trainRun,
            routeTimeSections,
            routeNodes,
            prevState.routeTemplates
          )
        ),
      };
    }

    case "updateRouteEdge": {
      return {
        ...prevState,
        routeEdges: prevState.routeEdges.map((routeEdge) =>
          routeEdge.id === action.payload.id
            ? {
                ...routeEdge,
                type: action.payload.edgeType ?? routeEdge.type,
                travelMinutes:
                  action.payload.travelMinutes ?? routeEdge.travelMinutes,
                bidirectional:
                  action.payload.bidirectional ?? routeEdge.bidirectional,
                manualWaypoints: Object.prototype.hasOwnProperty.call(
                  action.payload,
                  "manualWaypoints"
                )
                  ? action.payload.manualWaypoints?.map((point) => ({
                      x: point.x,
                      y: point.y,
                    }))
                  : routeEdge.manualWaypoints,
              }
            : routeEdge
        ),
      };
    }

    case "reverseRouteEdge": {
      return {
        ...prevState,
        routeEdges: prevState.routeEdges.map((routeEdge) =>
          routeEdge.id === action.payload.id
            ? {
                ...routeEdge,
                fromNodeId: routeEdge.toNodeId,
                toNodeId: routeEdge.fromNodeId,
                fromPortSide: routeEdge.toPortSide,
                fromPortIndex: routeEdge.toPortIndex,
                toPortSide: routeEdge.fromPortSide,
                toPortIndex: routeEdge.fromPortIndex,
                manualWaypoints: routeEdge.manualWaypoints
                  ? [...routeEdge.manualWaypoints].reverse()
                  : undefined,
              }
            : routeEdge
        ),
      };
    }

    case "removeRouteEdge": {
      const routeTimeSections = prevState.routeTimeSections.filter(
        (section) => !section.routeEdgeIds.includes(action.payload.id)
      );
      const routeTemplates = pruneRouteTemplates(
        prevState.routeTemplates,
        routeTimeSections
      );
      return {
        ...prevState,
        routeEdges: prevState.routeEdges.filter(
          (routeEdge) => routeEdge.id !== action.payload.id
        ),
        routeTimeSections,
        routeTemplates,
        trainRuns: prevState.trainRuns.map((trainRun) =>
          withAutoStops(
            trainRun,
            routeTimeSections,
            prevState.routeNodes,
            routeTemplates
          )
        ),
      };
    }

    case "addRouteTimeSection": {
      const routeEdgeIds = [...new Set(action.payload.routeEdgeIds)];
      if (routeEdgeIds.length === 0) return prevState;
      if (
        routeEdgeIds.some(
          (routeEdgeId) => !routeEdgeExists(prevState.routeEdges, routeEdgeId)
        )
      ) {
        return prevState;
      }
      const routeEdgeSetKey = getRouteEdgeSetKey(routeEdgeIds);
      if (
        prevState.routeTimeSections.some(
          (section) =>
            getRouteEdgeSetKey(section.routeEdgeIds) === routeEdgeSetKey
        )
      ) {
        return prevState;
      }

      const speedClassCount = getStateRouteTimeSpeedClassCount(prevState);
      const selectedSpeedClassIndex = prevState.routeTimeSpeedMultiplierEnabled
        ? 0
        : Math.min(
            Math.max(0, speedClassCount - 1),
            getNormalizedSpeedClassIndex(action.payload.speedClassIndex)
          );
      const draftSection: RouteTimeSection = {
        id: action.payload.id ?? createId("rts"),
        startNodeId: action.payload.startNodeId,
        startPortSide: action.payload.startPortSide,
        startPortIndex: Math.max(0, Math.floor(action.payload.startPortIndex)),
        endNodeId: action.payload.endNodeId,
        endPortSide: action.payload.endPortSide,
        endPortIndex: Math.max(0, Math.floor(action.payload.endPortIndex)),
        routeEdgeIds,
        routePorts: action.payload.routePorts,
        travelMinutes: Math.max(0, action.payload.travelMinutes),
        internalDirection: "forward",
        segmentMinutes: [],
        speedProfiles: [],
      };
      const segmentCount =
        getRouteTimeSectionBreakGroups(draftSection, prevState.routeNodes)
          .length + 1;
      const enteredProfile = {
        travelMinutes: Math.max(0, action.payload.travelMinutes),
        segmentMinutes: normalizeRouteTimeSectionSegmentMinutesForTotal(
          action.payload.travelMinutes,
          action.payload.segmentMinutes,
          segmentCount
        ),
      };
      const speedProfiles = Array.from(
        { length: speedClassCount },
        (_, index) =>
          index === selectedSpeedClassIndex
            ? enteredProfile
            : {
                travelMinutes: enteredProfile.travelMinutes,
                segmentMinutes: [...enteredProfile.segmentMinutes],
              }
      );
      const firstProfile = speedProfiles[0];
      const section: RouteTimeSection = {
        ...draftSection,
        travelMinutes: firstProfile.travelMinutes,
        segmentMinutes: firstProfile.segmentMinutes,
        speedProfiles,
      };

      const nextRouteTimeSections = [...prevState.routeTimeSections, section];
      const routeTimeSections = prevState.routeTimeSpeedMultiplierEnabled
        ? applySpeedClassMultipliersToRouteTimeSections(
            nextRouteTimeSections,
            prevState.routeNodes,
            prevState.routeTimeSpeedClasses,
            speedClassCount
          )
        : nextRouteTimeSections;
      return {
        ...prevState,
        routeTimeSections,
        trainRuns: prevState.trainRuns.map((trainRun) =>
          withAutoStops(
            trainRun,
            routeTimeSections,
            prevState.routeNodes,
            prevState.routeTemplates
          )
        ),
      };
    }

    case "updateRouteTimeSection": {
      const speedClassCount = getStateRouteTimeSpeedClassCount(prevState);
      const speedClassIndex = prevState.routeTimeSpeedMultiplierEnabled
        ? 0
        : Math.min(
            Math.max(0, speedClassCount - 1),
            getNormalizedSpeedClassIndex(action.payload.speedClassIndex)
          );
      const nextRouteTimeSections = prevState.routeTimeSections.map((section) =>
        section.id === action.payload.id
          ? (() => {
              const normalizedSection = normalizeRouteTimeSectionSpeedProfiles(
                section,
                prevState.routeNodes,
                speedClassCount
              );
              const nextSection = {
                ...normalizedSection,
                internalDirection:
                  action.payload.internalDirection ??
                  normalizedSection.internalDirection ??
                  "forward",
              };
              return updateRouteTimeSectionSpeedProfile(
                nextSection,
                prevState.routeNodes,
                speedClassCount,
                speedClassIndex,
                {
                  travelMinutes: action.payload.travelMinutes,
                  segmentMinutes: action.payload.segmentMinutes,
                }
              );
            })()
          : section
      );
      const routeTimeSections = prevState.routeTimeSpeedMultiplierEnabled
        ? applySpeedClassMultipliersToRouteTimeSections(
            nextRouteTimeSections,
            prevState.routeNodes,
            prevState.routeTimeSpeedClasses,
            speedClassCount
          )
        : nextRouteTimeSections;
      return {
        ...prevState,
        routeTimeSections,
        trainRuns: prevState.trainRuns.map((trainRun) =>
          withAutoStops(
            trainRun,
            routeTimeSections,
            prevState.routeNodes,
            prevState.routeTemplates
          )
        ),
      };
    }

    case "addRouteTimeSpeedClass": {
      const currentCount = getStateRouteTimeSpeedClassCount(prevState);
      const copyFromIndex = prevState.routeTimeSpeedMultiplierEnabled
        ? 0
        : Math.min(
            Math.max(0, currentCount - 1),
            getNormalizedSpeedClassIndex(action.payload?.copyFromIndex)
          );
      const nextSpeedClasses = [
        ...normalizeRouteTimeSpeedClasses(
          prevState.routeTimeSpeedClasses,
          currentCount
        ),
        { baseIndex: 0, multiplier: 1 },
      ];
      const nextRouteTimeSections = prevState.routeTimeSections.map(
        (section) => {
          const normalizedSection = normalizeRouteTimeSectionSpeedProfiles(
            section,
            prevState.routeNodes,
            currentCount
          );
          const sourceProfile = getRouteTimeSectionSpeedProfile(
            normalizedSection,
            copyFromIndex
          );
          return {
            ...normalizedSection,
            speedProfiles: [
              ...normalizedSection.speedProfiles,
              {
                travelMinutes: sourceProfile.travelMinutes,
                segmentMinutes: [...sourceProfile.segmentMinutes],
              },
            ],
          };
        }
      );
      const routeTimeSections = prevState.routeTimeSpeedMultiplierEnabled
        ? applySpeedClassMultipliersToRouteTimeSections(
            nextRouteTimeSections,
            prevState.routeNodes,
            nextSpeedClasses,
            currentCount + 1
          )
        : nextRouteTimeSections;
      return {
        ...prevState,
        routeTimeSpeedClassCount: currentCount + 1,
        routeTimeSpeedClasses: nextSpeedClasses,
        routeTimeSections,
        trainRuns: prevState.trainRuns.map((trainRun) =>
          withAutoStops(
            trainRun,
            routeTimeSections,
            prevState.routeNodes,
            prevState.routeTemplates
          )
        ),
      };
    }

    case "updateRouteTimeSpeedClass": {
      const currentCount = getStateRouteTimeSpeedClassCount(prevState);
      const speedClassIndex = Math.min(
        Math.max(0, currentCount - 1),
        getNormalizedSpeedClassIndex(action.payload.index)
      );
      const speedClasses = normalizeRouteTimeSpeedClasses(
        prevState.routeTimeSpeedClasses,
        currentCount
      );
      const previousSpeedClass = speedClasses[speedClassIndex] ?? {
        baseIndex: 0,
        multiplier: 1,
      };
      const nextMultiplier = normalizeSpeedClassMultiplier(
        speedClassIndex === 0
          ? 1
          : action.payload.multiplier ?? previousSpeedClass.multiplier
      );
      const nextBaseIndex = 0;
      const nextSpeedClasses = speedClasses.map((speedClass, index) =>
        index === speedClassIndex
          ? {
              ...speedClass,
              baseIndex: nextBaseIndex,
              multiplier: nextMultiplier,
            }
          : speedClass
      );
      const routeTimeSections = prevState.routeTimeSpeedMultiplierEnabled
        ? applySpeedClassMultipliersToRouteTimeSections(
            prevState.routeTimeSections,
            prevState.routeNodes,
            nextSpeedClasses,
            currentCount
          )
        : prevState.routeTimeSections;
      return {
        ...prevState,
        routeTimeSpeedClassCount: currentCount,
        routeTimeSpeedClasses: nextSpeedClasses,
        routeTimeSections,
        trainRuns: prevState.trainRuns.map((trainRun) =>
          withAutoStops(
            trainRun,
            routeTimeSections,
            prevState.routeNodes,
            prevState.routeTemplates
          )
        ),
      };
    }

    case "setRouteTimeSpeedMultiplierEnabled": {
      const currentCount = getStateRouteTimeSpeedClassCount(prevState);
      const enabled = action.payload.enabled;
      const routeTimeSpeedClasses = normalizeRouteTimeSpeedClasses(
        prevState.routeTimeSpeedClasses,
        currentCount
      ).map((speedClass, index) => ({
        ...speedClass,
        baseIndex: 0,
        multiplier: enabled ? 1 : index === 0 ? 1 : speedClass.multiplier,
      }));
      const routeTimeSections = enabled
        ? applySpeedClassMultipliersToRouteTimeSections(
            prevState.routeTimeSections,
            prevState.routeNodes,
            routeTimeSpeedClasses,
            currentCount
          )
        : prevState.routeTimeSections;
      return {
        ...prevState,
        routeTimeSpeedClassCount: currentCount,
        routeTimeSpeedClasses,
        routeTimeSpeedMultiplierEnabled: enabled,
        routeTimeSections,
        trainRuns: prevState.trainRuns.map((trainRun) =>
          withAutoStops(
            trainRun,
            routeTimeSections,
            prevState.routeNodes,
            prevState.routeTemplates
          )
        ),
      };
    }

    case "removeRouteTimeSpeedClass": {
      const currentCount = getStateRouteTimeSpeedClassCount(prevState);
      if (currentCount <= 1) return prevState;
      const speedClassIndex = Math.min(
        Math.max(0, currentCount - 1),
        getNormalizedSpeedClassIndex(action.payload.index)
      );
      const routeTimeSections = prevState.routeTimeSections.map((section) =>
        removeRouteTimeSectionSpeedProfile(
          section,
          prevState.routeNodes,
          currentCount,
          speedClassIndex
        )
      );
      const routeTimeSpeedClasses = normalizeRouteTimeSpeedClasses(
        prevState.routeTimeSpeedClasses,
        currentCount
      )
        .filter((_, index) => index !== speedClassIndex)
        .map((speedClass) => {
          const remappedBaseIndex =
            speedClass.baseIndex > speedClassIndex
              ? speedClass.baseIndex - 1
              : speedClass.baseIndex === speedClassIndex
              ? 0
              : speedClass.baseIndex;
          return {
            ...speedClass,
            baseIndex: Math.max(
              0,
              Math.min(currentCount - 2, remappedBaseIndex)
            ),
          };
        });
      const trainRuns = prevState.trainRuns.map((trainRun) => {
        const currentIndex = getNormalizedSpeedClassIndex(
          trainRun.speedClassIndex
        );
        const nextSpeedClassIndex =
          currentIndex > speedClassIndex
            ? currentIndex - 1
            : currentIndex === speedClassIndex
            ? Math.max(0, speedClassIndex - 1)
            : currentIndex;
        return withAutoStops(
          { ...trainRun, speedClassIndex: nextSpeedClassIndex },
          routeTimeSections,
          prevState.routeNodes,
          prevState.routeTemplates
        );
      });
      return {
        ...prevState,
        routeTimeSpeedClassCount: currentCount - 1,
        routeTimeSpeedClasses,
        routeTimeSections,
        trainRuns,
      };
    }

    case "removeRouteTimeSection": {
      const routeTimeSections = prevState.routeTimeSections.filter(
        (section) => section.id !== action.payload.id
      );
      const routeTemplates = pruneRouteTemplates(
        prevState.routeTemplates,
        routeTimeSections
      );
      return {
        ...prevState,
        routeTimeSections,
        routeTemplates,
        trainRuns: prevState.trainRuns.map((trainRun) =>
          withAutoStops(
            trainRun,
            routeTimeSections,
            prevState.routeNodes,
            routeTemplates
          )
        ),
      };
    }

    case "updateRouteReadDirection": {
      return {
        ...prevState,
        routeReadDirection: action.payload.routeReadDirection,
      };
    }

    case "addTrainRun": {
      const name = action.payload.name.trim();
      if (!name) return prevState;
      if (prevState.trainRuns.some((trainRun) => trainRun.name === name)) {
        return prevState;
      }

      const trainRun: TrainRun = {
        id: createId("tr"),
        name,
        runType: "passenger",
        lineStyle: "auto",
        color: { r: 0, g: 0, b: 0, a: 1 },
        operationGroup: "",
        repeat: 1,
        serviceStartTime: "",
        serviceEndTime: "",
        deadheadStartTime: "",
        deadheadEndTime: "",
        defaultStopMinutes: 5,
        routeTemplateId: prevState.routeTemplates[0]?.id ?? "",
        speedClassIndex: 0,
        serviceRouteNodeIds: [],
        deadheadRouteNodeIds: [],
        serviceRouteSections: [],
        deadheadRouteSections: [],
        repeatRangeStartIndex: null,
        repeatRangeEndIndex: null,
        repeatRangeCount: 1,
        stopSettings: [],
        deadheadStopSettings: [],
        stops: [],
      };

      return {
        ...prevState,
        trainRuns: [...prevState.trainRuns, trainRun],
      };
    }

    case "moveTrainRun": {
      const index = prevState.trainRuns.findIndex(
        (trainRun) => trainRun.id === action.payload.id
      );
      return {
        ...prevState,
        trainRuns: moveItem(
          prevState.trainRuns,
          index,
          action.payload.direction
        ),
      };
    }

    case "reorderTrainRun": {
      const sourceIndex = prevState.trainRuns.findIndex(
        (trainRun) => trainRun.id === action.payload.sourceId
      );
      const targetIndex = prevState.trainRuns.findIndex(
        (trainRun) => trainRun.id === action.payload.targetId
      );
      return {
        ...prevState,
        trainRuns: moveItemToPosition(
          prevState.trainRuns,
          sourceIndex,
          targetIndex,
          action.payload.position
        ),
      };
    }

    case "duplicateTrainRun": {
      const sourceIndex = prevState.trainRuns.findIndex(
        (trainRun) => trainRun.id === action.payload.id
      );
      if (sourceIndex < 0) return prevState;

      const sourceTrainRun = prevState.trainRuns[sourceIndex];
      const newId = action.payload.newId ?? createId("tr");
      const duplicatedTrainRun = withAutoStops(
        {
          ...sourceTrainRun,
          id: newId,
          name: createDuplicateTrainRunName(
            prevState.trainRuns,
            sourceTrainRun.name
          ),
          color: { ...sourceTrainRun.color },
          serviceRouteNodeIds: [...sourceTrainRun.serviceRouteNodeIds],
          deadheadRouteNodeIds: [...sourceTrainRun.deadheadRouteNodeIds],
          serviceRouteSections: normalizeRouteSections(
            sourceTrainRun.serviceRouteSections
          ),
          deadheadRouteSections: normalizeRouteSections(
            sourceTrainRun.deadheadRouteSections
          ),
          stopSettings: normalizeStopSettings(sourceTrainRun.stopSettings),
          deadheadStopSettings: normalizeStopSettings(
            sourceTrainRun.deadheadStopSettings ?? []
          ),
          stops: sourceTrainRun.stops.map((stop, index) => ({
            ...stop,
            id: `${newId}_copy_${index}_${createId("stop")}`,
          })),
        },
        prevState.routeTimeSections,
        prevState.routeNodes,
        prevState.routeTemplates
      );

      return {
        ...prevState,
        trainRuns: [
          ...prevState.trainRuns.slice(0, sourceIndex + 1),
          duplicatedTrainRun,
          ...prevState.trainRuns.slice(sourceIndex + 1),
        ],
      };
    }

    case "removeTrainRun": {
      return {
        ...prevState,
        trainRuns: prevState.trainRuns.filter(
          (trainRun) => trainRun.id !== action.payload.id
        ),
      };
    }

    case "addRouteTemplate": {
      const name = action.payload.name.trim();
      if (!name) return prevState;
      if (
        prevState.routeTemplates.some(
          (routeTemplate) => routeTemplate.name === name
        )
      ) {
        return prevState;
      }
      return {
        ...prevState,
        routeTemplates: [
          ...prevState.routeTemplates,
          {
            id: action.payload.id ?? createId("rtpl"),
            name,
            serviceRouteSections: [],
            deadheadEnabled: false,
            deadheadRouteSections: [],
          },
        ],
      };
    }

    case "removeRouteTemplate": {
      return {
        ...prevState,
        routeTemplates: prevState.routeTemplates.filter(
          (routeTemplate) => routeTemplate.id !== action.payload.id
        ),
        trainRuns: prevState.trainRuns.map((trainRun) =>
          trainRun.routeTemplateId === action.payload.id
            ? withAutoStops(
                { ...trainRun, routeTemplateId: "" },
                prevState.routeTimeSections,
                prevState.routeNodes,
                prevState.routeTemplates
              )
            : trainRun
        ),
      };
    }

    case "updateRouteTemplate": {
      const routeTemplates = prevState.routeTemplates.map((routeTemplate) =>
        routeTemplate.id === action.payload.id
          ? {
              ...routeTemplate,
              name: action.payload.name ?? routeTemplate.name,
              serviceRouteSections:
                action.payload.serviceRouteSections === undefined
                  ? routeTemplate.serviceRouteSections
                  : normalizeRouteSections(action.payload.serviceRouteSections),
              deadheadEnabled:
                action.payload.deadheadEnabled ?? routeTemplate.deadheadEnabled,
              deadheadRouteSections:
                action.payload.deadheadRouteSections === undefined
                  ? routeTemplate.deadheadRouteSections
                  : normalizeRouteSections(
                      action.payload.deadheadRouteSections
                    ),
            }
          : routeTemplate
      );
      return {
        ...prevState,
        routeTemplates,
        trainRuns: prevState.trainRuns.map((trainRun) =>
          withAutoStops(
            trainRun,
            prevState.routeTimeSections,
            prevState.routeNodes,
            routeTemplates
          )
        ),
      };
    }

    case "updateTrainRun": {
      const shouldRecalculateAutoStops =
        action.payload.serviceStartTime !== undefined ||
        action.payload.serviceEndTime !== undefined ||
        action.payload.deadheadStartTime !== undefined ||
        action.payload.deadheadEndTime !== undefined ||
        action.payload.defaultStopMinutes !== undefined ||
        action.payload.routeTemplateId !== undefined ||
        action.payload.speedClassIndex !== undefined ||
        action.payload.serviceRouteNodeIds !== undefined ||
        action.payload.deadheadRouteNodeIds !== undefined ||
        action.payload.serviceRouteSections !== undefined ||
        action.payload.deadheadRouteSections !== undefined ||
        action.payload.stopSettings !== undefined ||
        action.payload.deadheadStopSettings !== undefined;

      return {
        ...prevState,
        trainRuns: updateTrainRun(
          prevState.trainRuns,
          action.payload.id,
          (run) => {
            const nextRun = {
              ...run,
              name: action.payload.name ?? run.name,
              runType: action.payload.runType ?? run.runType,
              lineStyle: action.payload.lineStyle ?? run.lineStyle,
              color: action.payload.color ?? run.color,
              operationGroup:
                action.payload.operationGroup === undefined
                  ? run.operationGroup
                  : action.payload.operationGroup,
              repeat: action.payload.repeat ?? run.repeat,
              serviceStartTime:
                action.payload.serviceStartTime ?? run.serviceStartTime,
              serviceEndTime:
                action.payload.serviceEndTime ?? run.serviceEndTime,
              deadheadStartTime:
                action.payload.deadheadStartTime ?? run.deadheadStartTime,
              deadheadEndTime:
                action.payload.deadheadEndTime ?? run.deadheadEndTime,
              defaultStopMinutes: 5,
              routeTemplateId:
                action.payload.routeTemplateId ?? run.routeTemplateId,
              speedClassIndex:
                action.payload.speedClassIndex === undefined
                  ? run.speedClassIndex ?? 0
                  : getNormalizedSpeedClassIndex(action.payload.speedClassIndex),
              serviceRouteNodeIds:
                action.payload.serviceRouteNodeIds ?? run.serviceRouteNodeIds,
              deadheadRouteNodeIds:
                action.payload.deadheadRouteNodeIds ?? run.deadheadRouteNodeIds,
              serviceRouteSections:
                action.payload.serviceRouteSections === undefined
                  ? run.serviceRouteSections
                  : normalizeRouteSections(action.payload.serviceRouteSections),
              deadheadRouteSections:
                action.payload.deadheadRouteSections === undefined
                  ? run.deadheadRouteSections
                  : normalizeRouteSections(
                      action.payload.deadheadRouteSections
                    ),
              repeatRangeStartIndex:
                action.payload.repeatRangeStartIndex === undefined
                  ? run.repeatRangeStartIndex
                  : action.payload.repeatRangeStartIndex,
              repeatRangeEndIndex:
                action.payload.repeatRangeEndIndex === undefined
                  ? run.repeatRangeEndIndex
                  : action.payload.repeatRangeEndIndex,
              repeatRangeCount:
                action.payload.repeatRangeCount === undefined
                  ? run.repeatRangeCount
                  : Math.max(1, Math.floor(action.payload.repeatRangeCount)),
              stopSettings:
                action.payload.stopSettings === undefined
                  ? run.stopSettings
                  : normalizeStopSettings(action.payload.stopSettings),
              deadheadStopSettings:
                action.payload.deadheadStopSettings === undefined
                  ? run.deadheadStopSettings ?? []
                  : normalizeStopSettings(action.payload.deadheadStopSettings),
            };

            return shouldRecalculateAutoStops
              ? withAutoStops(
                  nextRun,
                  prevState.routeTimeSections,
                  prevState.routeNodes,
                  prevState.routeTemplates
                )
              : nextRun;
          }
        ),
      };
    }

    case "addStop": {
      if (!routeNodeExists(prevState.routeNodes, action.payload.routeNodeId)) {
        return prevState;
      }

      const stop: Stop = {
        id: createId("stop"),
        routeNodeId: action.payload.routeNodeId,
        arrivalTime: "",
        departureTime: "",
        status: action.payload.status,
        isDeadhead: action.payload.isDeadhead ?? false,
      };

      return {
        ...prevState,
        trainRuns: updateTrainRun(
          prevState.trainRuns,
          action.payload.trainRunId,
          (run) => ({ ...run, stops: [...run.stops, stop] })
        ),
      };
    }

    case "updateStop": {
      return {
        ...prevState,
        trainRuns: updateTrainRun(
          prevState.trainRuns,
          action.payload.trainRunId,
          (run) => ({
            ...run,
            stops: run.stops.map((stop) =>
              stop.id === action.payload.stopId
                ? {
                    ...stop,
                    routeNodeId: action.payload.routeNodeId ?? stop.routeNodeId,
                    arrivalTime:
                      action.payload.arrivalTime === undefined
                        ? stop.arrivalTime
                        : action.payload.arrivalTime,
                    departureTime:
                      action.payload.departureTime === undefined
                        ? stop.departureTime
                        : action.payload.departureTime,
                    status: action.payload.status ?? stop.status,
                    isDeadhead:
                      action.payload.isDeadhead === undefined
                        ? stop.isDeadhead
                        : action.payload.isDeadhead,
                  }
                : stop
            ),
          })
        ),
      };
    }

    case "removeStop": {
      return {
        ...prevState,
        trainRuns: updateTrainRun(
          prevState.trainRuns,
          action.payload.trainRunId,
          (run) => ({
            ...run,
            stops: run.stops.filter(
              (stop) => stop.id !== action.payload.stopId
            ),
          })
        ),
      };
    }

    case "moveStop": {
      return {
        ...prevState,
        trainRuns: updateTrainRun(
          prevState.trainRuns,
          action.payload.trainRunId,
          (run) => {
            const index = run.stops.findIndex(
              (stop) => stop.id === action.payload.stopId
            );
            return {
              ...run,
              stops: moveItem(run.stops, index, action.payload.direction),
            };
          }
        ),
      };
    }

    case "reorderStop": {
      return {
        ...prevState,
        trainRuns: updateTrainRun(
          prevState.trainRuns,
          action.payload.trainRunId,
          (run) => {
            const sourceIndex = run.stops.findIndex(
              (stop) => stop.id === action.payload.sourceStopId
            );
            const targetIndex = run.stops.findIndex(
              (stop) => stop.id === action.payload.targetStopId
            );
            return {
              ...run,
              stops: moveItemToPosition(
                run.stops,
                sourceIndex,
                targetIndex,
                action.payload.position
              ),
            };
          }
        ),
      };
    }

    case "copyStopRange": {
      return {
        ...prevState,
        trainRuns: updateTrainRun(
          prevState.trainRuns,
          action.payload.trainRunId,
          (run) => {
            const startIndex = Math.max(
              0,
              Math.min(action.payload.startIndex, action.payload.endIndex)
            );
            const endIndex = Math.min(
              run.stops.length - 1,
              Math.max(action.payload.startIndex, action.payload.endIndex)
            );
            if (startIndex >= run.stops.length || endIndex < startIndex) {
              return run;
            }
            const insertIndex = Math.max(
              0,
              Math.min(action.payload.insertIndex, run.stops.length)
            );
            if (insertIndex > startIndex && insertIndex < endIndex + 1) {
              return run;
            }

            const selectedStops = run.stops.slice(startIndex, endIndex + 1);
            const absoluteMinutes = getAbsoluteStopMinutes(selectedStops);
            const firstMinutes = absoluteMinutes.find(
              (minutes): minutes is number => minutes !== null
            );
            const lastMinutes = [...absoluteMinutes]
              .reverse()
              .find((minutes): minutes is number => minutes !== null);
            const intervalMinutes =
              firstMinutes === undefined || lastMinutes === undefined
                ? null
                : Math.max(0, lastMinutes - firstMinutes);
            const copyCount = Math.max(
              1,
              Math.floor(action.payload.repeatCount) - 1
            );
            const copiedStops = Array.from({ length: copyCount }).flatMap(
              (_, copyIndex) => {
                const repeatIndex = copyIndex + 1;
                const offsetMinutes =
                  intervalMinutes === null ? 0 : intervalMinutes * repeatIndex;
                return selectedStops.map((stop, stopIndex) =>
                  copyStopWithOffset(
                    run,
                    stop,
                    repeatIndex,
                    offsetMinutes,
                    stopIndex,
                    createId("stop")
                  )
                );
              }
            );

            return {
              ...run,
              repeatRangeStartIndex: null,
              repeatRangeEndIndex: null,
              repeatRangeCount: 1,
              stops: [
                ...run.stops.slice(0, insertIndex),
                ...copiedStops,
                ...run.stops.slice(insertIndex),
              ],
            };
          }
        ),
      };
    }

    case "changeFullState": {
      return {
        ...action.payload.state,
        trainRuns: action.payload.state.trainRuns.map((trainRun) =>
          withAutoStops(
            trainRun,
            action.payload.state.routeTimeSections,
            action.payload.state.routeNodes,
            action.payload.state.routeTemplates
          )
        ),
      };
    }
  }
};
