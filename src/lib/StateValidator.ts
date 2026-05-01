import { RGBColor } from "react-color";
import { State } from "../reducer/reducer";
import {
  ConnectionType,
  dateToTimeString,
  LineStyle,
  RouteEdge,
  RouteEdgeType,
  RouteNode,
  RouteNodeType,
  RoutePortSide,
  RouteReadDirection,
  RouteTemplate,
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
} from "./domain";

type JSONObject = Record<string, unknown>;

const isObject = (value: unknown): value is JSONObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const asNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asBoolean = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const asStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

const asRoutePortSide = (value: unknown, fallback: RoutePortSide) =>
  value === "top" || value === "right" || value === "bottom" || value === "left"
    ? value
    : fallback;

const routeReadDirections: RouteReadDirection[] = [
  "topToBottom",
  "bottomToTop",
  "leftToRight",
  "rightToLeft",
];

const asRouteReadDirection = (
  value: unknown,
  fallback: RouteReadDirection
): RouteReadDirection =>
  routeReadDirections.includes(value as RouteReadDirection)
    ? (value as RouteReadDirection)
    : fallback;

const routeTimeSectionInternalDirections: RouteTimeSectionInternalDirection[] =
  ["forward", "reverse", "bidirectional"];

const asRouteTimeSectionInternalDirection = (
  value: unknown
): RouteTimeSectionInternalDirection =>
  routeTimeSectionInternalDirections.includes(
    value as RouteTimeSectionInternalDirection
  )
    ? (value as RouteTimeSectionInternalDirection)
    : "forward";

const asColor = (value: unknown, fallback: RGBColor): RGBColor => {
  if (!isObject(value)) return fallback;
  const r = asNumber(value.r, fallback.r);
  const g = asNumber(value.g, fallback.g);
  const b = asNumber(value.b, fallback.b);
  const a = value.a === undefined ? fallback.a : asNumber(value.a, 1);
  return { r, g, b, a };
};

const routeNodeTypes: RouteNodeType[] = [
  "station",
  "terminal",
  "garage",
  "yard",
  "connection",
  "turnback",
  "crossing",
];
const routeEdgeTypes: RouteEdgeType[] = [
  "main",
  "single",
  "double",
  "service",
  "yard",
];
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
const connectionTypes: ConnectionType[] = [
  "passing12",
  "passing21",
  "singleCrossoverZ",
  "singleCrossoverReverseZ",
  "doubleCrossover",
];

const asRouteNodeType = (value: unknown): RouteNodeType =>
  routeNodeTypes.includes(value as RouteNodeType)
    ? (value as RouteNodeType)
    : "station";

const asNodeRotation = (value: unknown, allowFourDirections = false) => {
  const normalized =
    (((Math.round(asNumber(value, 0) / 90) * 90) % 360) + 360) % 360;
  return allowFourDirections ? normalized : normalized % 180;
};

const asConnectionType = (value: unknown): ConnectionType => {
  if (value === "turnout") return "passing12";
  if (value === "passing") return "passing12";
  if (value === "singleCrossover") return "singleCrossoverZ";
  return connectionTypes.includes(value as ConnectionType)
    ? (value as ConnectionType)
    : "passing12";
};

const allowsFourDirectionConnection = (connectionType: ConnectionType) =>
  connectionType === "turnout" ||
  connectionType === "passing12" ||
  connectionType === "passing21";

const allowsFourDirectionNode = (
  nodeType: RouteNodeType,
  connectionType: ConnectionType
) =>
  nodeType === "terminal" ||
  nodeType === "turnback" ||
  (nodeType === "connection" && allowsFourDirectionConnection(connectionType));

const asRouteEdgeType = (value: unknown): RouteEdgeType =>
  routeEdgeTypes.includes(value as RouteEdgeType)
    ? (value as RouteEdgeType)
    : "main";

const asTrainRunType = (value: unknown): TrainRunType =>
  trainRunTypes.includes(value as TrainRunType)
    ? (value as TrainRunType)
    : "passenger";

const asStopStatus = (value: unknown): StopStatus =>
  stopStatuses.includes(value as StopStatus) ? (value as StopStatus) : "unset";

const asLineStyle = (value: unknown): LineStyle =>
  lineStyles.includes(value as LineStyle) ? (value as LineStyle) : "auto";

const normalizeStation = (value: unknown, index: number): Station => {
  if (!isObject(value)) return { id: `st_${index}`, name: `駅${index + 1}` };
  return {
    id: asString(value.id, `st_${index}`),
    name: asString(value.name, `駅${index + 1}`),
  };
};

const normalizeRouteNode = (
  value: unknown,
  index: number,
  stations: Station[]
): RouteNode => {
  if (!isObject(value)) {
    return {
      id: `rn_${index}`,
      stationId: stations[0]?.id ?? "",
      label: `ノード${index + 1}`,
      type: "station",
      x: 120 + index * 120,
      y: 120,
      rotation: 0,
      platformNumber: "",
      platformCount: 1,
      platformLabels: ["1"],
      verticalPlatformCount: 1,
      verticalPlatformLabels: ["1"],
      durationMinutes: 0,
      connectionType: "passing12",
    };
  }
  const type = asRouteNodeType(value.type);
  const connectionType = asConnectionType(value.connectionType);
  const platformCount = Math.max(
    1,
    Math.floor(asNumber(value.platformCount, 1))
  );
  const verticalPlatformCount = Math.max(
    1,
    Math.floor(
      asNumber(value.verticalPlatformCount, asNumber(value.platformCount, 1))
    )
  );
  const platformLabels = asStringArray(value.platformLabels);
  const verticalPlatformLabels = asStringArray(value.verticalPlatformLabels);

  return {
    id: asString(value.id, `rn_${index}`),
    stationId: asString(value.stationId, stations[0]?.id ?? ""),
    label: asString(value.label),
    type,
    x: asNumber(value.x, 120 + index * 120),
    y: asNumber(value.y, 120),
    rotation: asNodeRotation(
      value.rotation,
      allowsFourDirectionNode(type, connectionType)
    ),
    platformNumber: asString(value.platformNumber),
    platformCount,
    platformLabels: Array.from({ length: platformCount }).map(
      (_, labelIndex) => platformLabels[labelIndex] || `${labelIndex + 1}`
    ),
    verticalPlatformCount,
    verticalPlatformLabels: Array.from({ length: verticalPlatformCount }).map(
      (_, labelIndex) =>
        verticalPlatformLabels[labelIndex] || `${labelIndex + 1}`
    ),
    durationMinutes: Math.max(0, asNumber(value.durationMinutes, 0)),
    connectionType,
  };
};

const normalizeRouteEdge = (
  value: unknown,
  index: number,
  routeNodes: RouteNode[]
): RouteEdge | null => {
  if (!isObject(value)) return null;
  const fromNodeId = asString(value.fromNodeId);
  const toNodeId = asString(value.toNodeId);
  const nodeIds = new Set(routeNodes.map((routeNode) => routeNode.id));
  if (!nodeIds.has(fromNodeId) || !nodeIds.has(toNodeId)) return null;

  return {
    id: asString(value.id, `re_${index}`),
    fromNodeId,
    toNodeId,
    fromPortSide: asRoutePortSide(value.fromPortSide, "right"),
    fromPortIndex: Math.max(0, Math.floor(asNumber(value.fromPortIndex, 0))),
    toPortSide: asRoutePortSide(value.toPortSide, "left"),
    toPortIndex: Math.max(0, Math.floor(asNumber(value.toPortIndex, 0))),
    type: asRouteEdgeType(value.type),
    travelMinutes: Math.max(0, asNumber(value.travelMinutes, 0)),
    bidirectional: asBoolean(value.bidirectional, true),
  };
};

const normalizeRouteTimeSection = (
  value: unknown,
  index: number,
  routeEdges: RouteEdge[],
  routeNodes: RouteNode[]
): RouteTimeSection | null => {
  if (!isObject(value)) return null;
  const nodeIds = new Set(routeNodes.map((routeNode) => routeNode.id));
  const routeEdgeIds = new Set(routeEdges.map((routeEdge) => routeEdge.id));
  const sectionRouteEdgeIds = Array.isArray(value.routeEdgeIds)
    ? value.routeEdgeIds
        .map((routeEdgeId) => asString(routeEdgeId))
        .filter((routeEdgeId) => routeEdgeIds.has(routeEdgeId))
    : [];
  const startNodeId = asString(value.startNodeId);
  const endNodeId = asString(value.endNodeId);
  if (
    sectionRouteEdgeIds.length === 0 ||
    !nodeIds.has(startNodeId) ||
    !nodeIds.has(endNodeId)
  ) {
    return null;
  }

  const startPort = {
    nodeId: startNodeId,
    side: asRoutePortSide(value.startPortSide, "right"),
    index: Math.max(0, Math.floor(asNumber(value.startPortIndex, 0))),
  };
  const endPort = {
    nodeId: endNodeId,
    side: asRoutePortSide(value.endPortSide, "left"),
    index: Math.max(0, Math.floor(asNumber(value.endPortIndex, 0))),
  };
  const routePorts = Array.isArray(value.routePorts)
    ? value.routePorts.filter(isObject).flatMap((port, portIndex) => {
        const nodeId = asString(port.nodeId);
        if (!nodeIds.has(nodeId)) return [];
        return [
          {
            nodeId,
            side: asRoutePortSide(
              port.side,
              portIndex === 0 ? startPort.side : endPort.side
            ),
            index: Math.max(0, Math.floor(asNumber(port.index, 0))),
          },
        ];
      })
    : [startPort, endPort];

  const travelMinutes = Math.max(0, asNumber(value.travelMinutes, 0));
  const segmentCount =
    routePorts.slice(1, -1).reduce<string[]>((nodeIds, port) => {
      if (nodeIds[nodeIds.length - 1] === port.nodeId) return nodeIds;
      return [...nodeIds, port.nodeId];
    }, []).length + 1;
  const segmentMinutes = Array.isArray(value.segmentMinutes)
    ? value.segmentMinutes
        .map((minutes) => Math.max(0, Math.floor(asNumber(minutes, 0))))
        .slice(0, segmentCount)
    : [];
  const normalizedSegmentMinutes =
    segmentCount > 1 && segmentMinutes.length === segmentCount
      ? segmentMinutes
      : [];

  return {
    id: asString(value.id, `rts_${index}`),
    startNodeId,
    startPortSide: startPort.side,
    startPortIndex: startPort.index,
    endNodeId,
    endPortSide: endPort.side,
    endPortIndex: endPort.index,
    routeEdgeIds: [...new Set(sectionRouteEdgeIds)],
    routePorts:
      routePorts.length >= 2
        ? (routePorts as RouteTimeSectionPort[])
        : [startPort, endPort],
    travelMinutes,
    segmentMinutes: normalizedSegmentMinutes,
    internalDirection: asRouteTimeSectionInternalDirection(
      value.internalDirection
    ),
  };
};

const routeEdgeToRouteTimeSection = (
  routeEdge: RouteEdge
): RouteTimeSection | null =>
  routeEdge.travelMinutes > 0
    ? {
        id: `rts_${routeEdge.id}`,
        startNodeId: routeEdge.fromNodeId,
        startPortSide: routeEdge.fromPortSide,
        startPortIndex: routeEdge.fromPortIndex,
        endNodeId: routeEdge.toNodeId,
        endPortSide: routeEdge.toPortSide,
        endPortIndex: routeEdge.toPortIndex,
        routeEdgeIds: [routeEdge.id],
        routePorts: [
          {
            nodeId: routeEdge.fromNodeId,
            side: routeEdge.fromPortSide,
            index: routeEdge.fromPortIndex,
          },
          {
            nodeId: routeEdge.toNodeId,
            side: routeEdge.toPortSide,
            index: routeEdge.toPortIndex,
          },
        ],
        travelMinutes: routeEdge.travelMinutes,
        segmentMinutes: [],
        internalDirection: routeEdge.bidirectional
          ? "bidirectional"
          : "forward",
      }
    : null;

const normalizeStop = (
  value: unknown,
  index: number,
  routeNodes: RouteNode[]
): Stop => {
  if (!isObject(value)) {
    return {
      id: `stop_${index}`,
      routeNodeId: routeNodes[0]?.id ?? "",
      arrivalTime: "",
      departureTime: "",
      status: "unset",
      isDeadhead: false,
    };
  }

  return {
    id: asString(value.id, `stop_${index}`),
    routeNodeId: asString(
      value.routeNodeId ?? value.diagramPointId,
      routeNodes[0]?.id ?? ""
    ),
    routePortIndex:
      value.routePortIndex === undefined
        ? undefined
        : Math.max(0, Math.floor(asNumber(value.routePortIndex, 0))),
    arrivalTime: asString(value.arrivalTime),
    departureTime: asString(value.departureTime),
    status: asStopStatus(value.status),
    isDeadhead: asBoolean(value.isDeadhead, false),
  };
};

const normalizeStopSetting = (value: unknown): TrainRunStopSetting | null => {
  if (!isObject(value)) return null;
  const routeNodeId = asString(value.routeNodeId);
  if (!routeNodeId) return null;
  return {
    routeNodeId,
    status: asStopStatus(value.status),
    dwellMinutes: Math.max(0, Math.floor(asNumber(value.dwellMinutes, 5))),
  };
};

const normalizeTrainRunRouteSection = (
  value: unknown,
  routeTimeSections: RouteTimeSection[]
): TrainRunRouteSection | null => {
  if (!isObject(value)) return null;
  const routeTimeSectionId = asString(value.routeTimeSectionId);
  if (
    !routeTimeSections.some(
      (routeTimeSection) => routeTimeSection.id === routeTimeSectionId
    )
  ) {
    return null;
  }

  return {
    routeTimeSectionId,
    reversed: asBoolean(value.reversed, false),
  };
};

const normalizeRouteTemplate = (
  value: unknown,
  index: number,
  routeTimeSections: RouteTimeSection[]
): RouteTemplate | null => {
  if (!isObject(value)) return null;
  return {
    id: asString(value.id, `rtpl_${index}`),
    name: asString(value.name, `経路${index + 1}`),
    serviceRouteSections: Array.isArray(value.serviceRouteSections)
      ? value.serviceRouteSections
          .map((section) =>
            normalizeTrainRunRouteSection(section, routeTimeSections)
          )
          .filter(
            (section): section is TrainRunRouteSection => section !== null
          )
      : [],
    deadheadEnabled: asBoolean(value.deadheadEnabled, false),
    deadheadRouteSections: Array.isArray(value.deadheadRouteSections)
      ? value.deadheadRouteSections
          .map((section) =>
            normalizeTrainRunRouteSection(section, routeTimeSections)
          )
          .filter(
            (section): section is TrainRunRouteSection => section !== null
          )
      : [],
  };
};

const normalizeTrainRun = (
  value: unknown,
  index: number,
  routeNodes: RouteNode[],
  routeTimeSections: RouteTimeSection[],
  routeTemplates: RouteTemplate[]
): TrainRun => {
  if (!isObject(value)) {
    return {
      id: `tr_${index}`,
      name: `列車${index + 1}`,
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
      routeTemplateId: "",
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
  }

  const stops = Array.isArray(value.stops)
    ? value.stops.map((stop, stopIndex) =>
        normalizeStop(stop, stopIndex, routeNodes)
      )
    : [];

  return {
    id: asString(value.id, `tr_${index}`),
    name: asString(value.name, `列車${index + 1}`),
    runType: asTrainRunType(value.runType),
    lineStyle: asLineStyle(value.lineStyle),
    color: asColor(value.color, { r: 0, g: 0, b: 0, a: 1 }),
    operationGroup: asString(value.operationGroup),
    repeat: Math.max(1, asNumber(value.repeat, 1)),
    serviceStartTime: asString(value.serviceStartTime),
    serviceEndTime: asString(value.serviceEndTime),
    deadheadStartTime: asString(value.deadheadStartTime),
    deadheadEndTime: asString(value.deadheadEndTime),
    defaultStopMinutes: Math.max(0, asNumber(value.defaultStopMinutes, 5)),
    routeTemplateId: routeTemplates.some(
      (routeTemplate) => routeTemplate.id === value.routeTemplateId
    )
      ? asString(value.routeTemplateId)
      : "",
    serviceRouteNodeIds: asStringArray(value.serviceRouteNodeIds).filter(
      (routeNodeId) =>
        routeNodes.some((routeNode) => routeNode.id === routeNodeId)
    ),
    deadheadRouteNodeIds: asStringArray(value.deadheadRouteNodeIds).filter(
      (routeNodeId) =>
        routeNodes.some((routeNode) => routeNode.id === routeNodeId)
    ),
    serviceRouteSections: Array.isArray(value.serviceRouteSections)
      ? value.serviceRouteSections
          .map((section) =>
            normalizeTrainRunRouteSection(section, routeTimeSections)
          )
          .filter(
            (section): section is TrainRunRouteSection => section !== null
          )
      : [],
    deadheadRouteSections: Array.isArray(value.deadheadRouteSections)
      ? value.deadheadRouteSections
          .map((section) =>
            normalizeTrainRunRouteSection(section, routeTimeSections)
          )
          .filter(
            (section): section is TrainRunRouteSection => section !== null
          )
      : [],
    repeatRangeStartIndex:
      value.repeatRangeStartIndex === null
        ? null
        : Number.isInteger(value.repeatRangeStartIndex)
        ? Number(value.repeatRangeStartIndex)
        : null,
    repeatRangeEndIndex:
      value.repeatRangeEndIndex === null
        ? null
        : Number.isInteger(value.repeatRangeEndIndex)
        ? Number(value.repeatRangeEndIndex)
        : null,
    repeatRangeCount: Math.max(
      1,
      Math.floor(asNumber(value.repeatRangeCount, 1))
    ),
    stopSettings: Array.isArray(value.stopSettings)
      ? value.stopSettings
          .map(normalizeStopSetting)
          .filter((setting): setting is TrainRunStopSetting => setting !== null)
      : [],
    deadheadStopSettings: Array.isArray(value.deadheadStopSettings)
      ? value.deadheadStopSettings
          .map(normalizeStopSetting)
          .filter((setting): setting is TrainRunStopSetting => setting !== null)
      : [],
    stops,
  };
};

const diagramPointsToRouteNodes = (
  diagramPoints: unknown[],
  stations: Station[]
) =>
  diagramPoints.map((diagramPoint, index) => {
    const normalized = normalizeRouteNode(diagramPoint, index, stations);
    const connectionType = isObject(diagramPoint)
      ? asConnectionType(diagramPoint.connectionType)
      : "passing12";
    return {
      ...normalized,
      id: isObject(diagramPoint)
        ? asString(diagramPoint.id, normalized.id)
        : normalized.id,
      x: 120 + index * 120,
      y: 160,
      rotation: isObject(diagramPoint)
        ? asNodeRotation(
            diagramPoint.rotation,
            allowsFourDirectionNode(normalized.type, connectionType)
          )
        : 0,
      platformNumber: isObject(diagramPoint)
        ? asString(diagramPoint.platformNumber)
        : "",
      platformCount: isObject(diagramPoint)
        ? Math.max(1, Math.floor(asNumber(diagramPoint.platformCount, 1)))
        : 1,
      platformLabels: isObject(diagramPoint)
        ? asStringArray(diagramPoint.platformLabels)
        : ["1"],
      verticalPlatformCount: isObject(diagramPoint)
        ? Math.max(
            1,
            Math.floor(
              asNumber(
                diagramPoint.verticalPlatformCount,
                asNumber(diagramPoint.platformCount, 1)
              )
            )
          )
        : 1,
      verticalPlatformLabels: isObject(diagramPoint)
        ? asStringArray(diagramPoint.verticalPlatformLabels)
        : ["1"],
      durationMinutes: isObject(diagramPoint)
        ? Math.max(0, asNumber(diagramPoint.durationMinutes, 0))
        : 0,
      connectionType,
    };
  });

export const normalizeState = (value: unknown): State | null => {
  if (!isObject(value)) return null;
  if (Array.isArray(value.trainDatasets)) return migrateLegacyState(value);

  const stations = Array.isArray(value.stations)
    ? value.stations.map(normalizeStation)
    : [];
  const routeNodes = Array.isArray(value.routeNodes)
    ? value.routeNodes.map((routeNode, index) =>
        normalizeRouteNode(routeNode, index, stations)
      )
    : Array.isArray(value.diagramPoints)
    ? diagramPointsToRouteNodes(value.diagramPoints, stations)
    : [];
  const routeEdges = Array.isArray(value.routeEdges)
    ? value.routeEdges
        .map((routeEdge, index) =>
          normalizeRouteEdge(routeEdge, index, routeNodes)
        )
        .filter((routeEdge): routeEdge is RouteEdge => routeEdge !== null)
    : [];
  const routeTimeSections = Array.isArray(value.routeTimeSections)
    ? value.routeTimeSections
        .map((section, index) =>
          normalizeRouteTimeSection(section, index, routeEdges, routeNodes)
        )
        .filter((section): section is RouteTimeSection => section !== null)
    : routeEdges
        .map(routeEdgeToRouteTimeSection)
        .filter((section): section is RouteTimeSection => section !== null);
  const routeTemplates = Array.isArray(value.routeTemplates)
    ? value.routeTemplates
        .map((routeTemplate, index) =>
          normalizeRouteTemplate(routeTemplate, index, routeTimeSections)
        )
        .filter(
          (routeTemplate): routeTemplate is RouteTemplate =>
            routeTemplate !== null
        )
    : [];
  const trainRuns = Array.isArray(value.trainRuns)
    ? value.trainRuns.map((trainRun, index) =>
        normalizeTrainRun(
          trainRun,
          index,
          routeNodes,
          routeTimeSections,
          routeTemplates
        )
      )
    : [];

  return {
    version: 8,
    stations,
    routeNodes,
    routeEdges,
    routeTimeSections,
    routeTemplates,
    trainRuns,
    routeReadDirection: asRouteReadDirection(
      value.routeReadDirection,
      "topToBottom"
    ),
  };
};

const migrateLegacyState = (value: JSONObject): State | null => {
  if (!Array.isArray(value.stations)) return null;

  const legacyStationNames = value.stations.filter(
    (station): station is string => typeof station === "string"
  );
  const stations: Station[] = legacyStationNames.map((name, index) => ({
    id: `st_legacy_${index}`,
    name,
  }));
  const routeNodes: RouteNode[] = stations.map((station, index) => ({
    id: `rn_legacy_${index}`,
    stationId: station.id,
    label: station.name,
    type: "station",
    x: 120 + index * 120,
    y: 160,
    rotation: 0,
    platformNumber: "",
    platformCount: 1,
    platformLabels: ["1"],
    verticalPlatformCount: 1,
    verticalPlatformLabels: ["1"],
    durationMinutes: 0,
    connectionType: "passing12",
  }));

  const findRouteNodeId = (stationName: string) => {
    const index = legacyStationNames.indexOf(stationName);
    return routeNodes[index]?.id ?? routeNodes[0]?.id ?? "";
  };

  const trainRuns: TrainRun[] = Array.isArray(value.trainDatasets)
    ? value.trainDatasets
        .filter(isObject)
        .map((trainDataset, trainIndex): TrainRun => {
          const rawStops = Array.isArray(trainDataset.data)
            ? trainDataset.data.filter(isObject)
            : [];

          const stops: Stop[] = rawStops.map((rawStop, stopIndex) => {
            const key = asString(rawStop.key);
            const isArrival = key.endsWith("着");
            const time = dateToTimeString(rawStop.x);
            const isPass = rawStop.isPass === true;
            return {
              id: `stop_legacy_${trainIndex}_${stopIndex}`,
              routeNodeId: findRouteNodeId(asString(rawStop.y)),
              arrivalTime: isArrival ? time : "",
              departureTime: isArrival ? "" : time,
              status: time ? (isPass ? "pass" : "stop") : "unset",
              isDeadhead: false,
            };
          });

          return {
            id: `tr_legacy_${trainIndex}`,
            name: asString(trainDataset.train, `列車${trainIndex + 1}`),
            runType: "passenger",
            lineStyle: "auto",
            color: asColor(trainDataset.color, { r: 0, g: 0, b: 0, a: 1 }),
            operationGroup: "",
            repeat: Math.max(1, asNumber(trainDataset.repeat, 1)),
            serviceStartTime: "",
            serviceEndTime: "",
            deadheadStartTime: "",
            deadheadEndTime: "",
            defaultStopMinutes: 5,
            routeTemplateId: "",
            serviceRouteNodeIds: [],
            deadheadRouteNodeIds: [],
            serviceRouteSections: [],
            deadheadRouteSections: [],
            repeatRangeStartIndex: null,
            repeatRangeEndIndex: null,
            repeatRangeCount: 1,
            stopSettings: [],
            deadheadStopSettings: [],
            stops,
          };
        })
    : [];

  return {
    version: 8,
    stations,
    routeNodes,
    routeEdges: [],
    routeTimeSections: [],
    routeTemplates: [],
    trainRuns,
    routeReadDirection: "topToBottom",
  };
};

export const jSONToState = (json: string) => {
  try {
    const obj = JSON.parse(json) as unknown;
    const state = normalizeState(obj);
    if (!state) throw new Error("JSON の形式が不正です。");
    return state;
  } catch (e) {
    alert(e);
    return null;
  }
};
