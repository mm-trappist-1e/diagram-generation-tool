import { State } from "../reducer/reducer";
import {
  getRouteNodeLabel,
  getStationName,
  lineStyleLabels,
  routeEdgeTypeLabels,
  routeNodeTypeLabels,
  stopStatusLabels,
  trainRunTypeLabels,
} from "./domain";

const escapeCsv = (value: string | number | boolean) => {
  const text = String(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
};

export const stateToCsv = (state: State) => {
  const stopHeader = [
    "recordType",
    "trainRunId",
    "trainName",
    "trainType",
    "lineStyle",
    "sequence",
    "stopId",
    "routeNodeId",
    "routeNodeLabel",
    "stationId",
    "stationName",
    "routeNodeType",
    "platformNumber",
    "platformCount",
    "verticalPlatformCount",
    "status",
    "isDeadhead",
    "arrivalTime",
    "departureTime",
  ];

  const stopRows = state.trainRuns.flatMap((trainRun) =>
    trainRun.stops.map((stop, index) => {
      const routeNode = state.routeNodes.find(
        (node) => node.id === stop.routeNodeId
      );
      const stationId = routeNode?.stationId ?? "";
      return [
        "stop",
        trainRun.id,
        trainRun.name,
        trainRunTypeLabels[trainRun.runType],
        lineStyleLabels[trainRun.lineStyle],
        index + 1,
        stop.id,
        stop.routeNodeId,
        routeNode ? getRouteNodeLabel(state.stations, routeNode) : "",
        stationId,
        stationId ? getStationName(state.stations, stationId) : "",
        routeNode ? routeNodeTypeLabels[routeNode.type] : "",
        routeNode?.platformNumber ?? "",
        routeNode?.platformCount ?? "",
        routeNode?.verticalPlatformCount ?? "",
        stopStatusLabels[stop.status],
        stop.isDeadhead,
        stop.arrivalTime,
        stop.departureTime,
      ];
    })
  );

  const edgeHeader = [
    "recordType",
    "routeEdgeId",
    "fromNodeId",
    "fromPortSide",
    "fromPortIndex",
    "toNodeId",
    "toPortSide",
    "toPortIndex",
    "edgeType",
    "travelMinutes",
    "bidirectional",
  ];
  const edgeRows = state.routeEdges.map((routeEdge) => [
    "edge",
    routeEdge.id,
    routeEdge.fromNodeId,
    routeEdge.fromPortSide,
    routeEdge.fromPortIndex + 1,
    routeEdge.toNodeId,
    routeEdge.toPortSide,
    routeEdge.toPortIndex + 1,
    routeEdgeTypeLabels[routeEdge.type],
    routeEdge.travelMinutes,
    routeEdge.bidirectional,
  ]);

  const timeSectionHeader = [
    "recordType",
    "routeTimeSectionId",
    "startNodeId",
    "startNodeLabel",
    "startPortSide",
    "startPortIndex",
    "endNodeId",
    "endNodeLabel",
    "endPortSide",
    "endPortIndex",
    "routeEdgeIds",
    "speedClass",
    "travelMinutes",
    "segmentMinutes",
  ];
  const timeSectionRows = state.routeTimeSections.flatMap((section) => {
    const startNode = state.routeNodes.find(
      (routeNode) => routeNode.id === section.startNodeId
    );
    const endNode = state.routeNodes.find(
      (routeNode) => routeNode.id === section.endNodeId
    );
    const speedProfiles =
      section.speedProfiles.length > 0
        ? section.speedProfiles
        : [
            {
              travelMinutes: section.travelMinutes,
              segmentMinutes: section.segmentMinutes,
            },
          ];
    return speedProfiles.map((profile, index) => [
      "routeTimeSection",
      section.id,
      section.startNodeId,
        startNode ? getRouteNodeLabel(state.stations, startNode) : "",
        section.startPortSide,
        section.startPortIndex + 1,
        section.endNodeId,
        endNode ? getRouteNodeLabel(state.stations, endNode) : "",
        section.endPortSide,
        section.endPortIndex + 1,
        section.routeEdgeIds.join(" "),
      index + 1,
      profile.travelMinutes,
      profile.segmentMinutes.join(" "),
    ]);
  });

  return [
    stopHeader,
    ...stopRows,
    [],
    edgeHeader,
    ...edgeRows,
    [],
    timeSectionHeader,
    ...timeSectionRows,
  ]
    .map((row) => row.map((value) => escapeCsv(value)).join(","))
    .join("\n");
};
