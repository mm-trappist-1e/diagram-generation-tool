import {
  ChangeEvent,
  Dispatch,
  MouseEvent,
  SyntheticEvent,
  TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  connectionTypeLabels,
  ConnectionType,
  createId,
  getRouteNodeLabel,
  getStopPrimaryTime,
  getStationName,
  RouteEdge,
  RouteNode,
  routeNodeTypeLabels,
  RouteNodeType,
  RoutePortSide,
  RouteTimeSectionPort,
  TrainRun,
  TrainRouteKey,
  TrainRunRouteSection,
} from "./lib/domain";
import {
  getRouteTimeSectionBreakpoints,
  getRouteTimeSectionBreakGroups,
  getRouteTimeSectionsForSpeedClass,
  getRouteTimeSpeedClassCount,
  resolveRouteTimeSectionSegments,
} from "./lib/route-time";
import { Actions, State } from "./reducer/reducer";
import { TextInput } from "./TextInput";
import addNodeIconUrl from "./assets/icons/editor-tools/addnode.svg";
import durationIconUrl from "./assets/icons/editor-tools/duration.svg";
import routeEditingIconUrl from "./assets/icons/editor-tools/routeediting.svg";
import routeSettingIconUrl from "./assets/icons/editor-tools/routesetting.svg";
import speedClassificationIconUrl from "./assets/icons/editor-tools/speedclassification.svg";

type Props = {
  state: State;
  dispatch: Dispatch<Actions>;
  workspaceName?: string;
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
type RouteTemplateDraft = {
  templateId: string;
  serviceRouteSections: TrainRunRouteSection[];
  deadheadRouteSections: TrainRunRouteSection[];
};
type FloatingPanelSectionKey =
  | "addNode"
  | "routeEditing"
  | "routeSetting"
  | "duration"
  | "speedClassification"
  | "nodeEdit";
type BranchInsertDragState = {
  routeEdgeIds: string[];
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
type SourceObstacleRect = ObstacleRect & {
  sourceRouteEdgeId?: string;
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
type RouteEdgeRelation =
  | "sameCorridor"
  | "fanOut"
  | "fanIn"
  | "sharedEndpointSide"
  | "independent";
type RouteEdgeRelationDetail = {
  routeEdgeId: string;
  relation: RouteEdgeRelation;
  reason: string;
};
type RouteOrderingAnalysis = {
  routeEdgeOrderIndex?: number;
  totalRouteEdges?: number;
  sameSideLaneGroupKey?: string;
  sameSideLaneRank?: number;
  relationGroupId?: string;
  previousRouteEdgeIds: string[];
  previousRouteEdgesUsedAsSoftObstacles: string[];
  previousRouteEdgesUsedAsTrackOverlapObstacles: string[];
  blockingPreviousRouteEdgeIds: string[];
  relationToPreviousEdges: Array<
    RouteEdgeRelationDetail & {
      usedAsSoftObstacle: boolean;
      usedAsTrackOverlapObstacle: boolean;
      causedPenalty?: boolean;
      penaltyContribution?: number;
    }
  >;
  blockedByEarlierGeometry: boolean;
  routeOrderSensitive: boolean;
};
type RouteEdgeRelationAnalysis = {
  relationGroupId?: string;
  relationType?: RouteEdgeRelation;
  relatedEdges: RouteEdgeRelationDetail[];
};
type CorridorAnalysis = {
  endpointCorridorType?: "singlePort" | "sideBand" | "sharedThroat" | "none";
  ownEndpointKeepoutAllowedCount: number;
  ownEndpointKeepoutBlockedCount: number;
  foreignKeepoutBlockedCount: number;
  nodeBacksideRisk?: boolean;
  corridorTooNarrow?: boolean;
};
type CandidateGenerationAnalysis = {
  candidateGenerationGap: boolean;
  searchGraphMissingLine: boolean;
  virtualWouldWinIfCandidate: boolean;
  virtualWouldWinWithoutPreviousGeometry?: boolean;
  scoreWithPreviousGeometry?: number;
  scoreWithoutPreviousGeometry?: number;
  sameCorridorGroupScore?: number;
  selectedFirstWouldWin?: boolean;
  sameCorridorGroupWouldWin?: boolean;
  missingXValues?: number[];
  missingYValues?: number[];
};
type DebugSelectedBy =
  | "simpleClearRoute"
  | "straightLane"
  | "singleBendBetweenLanes"
  | "searchedRoute"
  | "fallbackScore"
  | "fallbackAfterSimplify"
  | "unknown";
type DebugRouteCandidateSource =
  | "simple"
  | "direct"
  | "sideAware"
  | "outer"
  | "searched"
  | "searchedSimplified"
  | "fallback"
  | "final";
type RouteScoreBreakdown = {
  hardCollisionCount: number;
  hardCollisionPenalty: number;
  softObstacleScore: number;
  softObstaclePenalty: number;
  trackOverlapScore: number;
  trackOverlapPenalty: number;
  routeCrossingCount: number;
  routeCrossingPenalty: number;
  detourScore: number;
  bendCount: number;
  bendPenalty: number;
  length: number;
  total: number;
};
type DebugRouteCandidate = {
  id: string;
  source: DebugRouteCandidateSource;
  points: Point[];
  accepted: boolean;
  rejectionReasons: string[];
  score: number;
  scoreBreakdown?: RouteScoreBreakdown;
};
type DebugObstacleKind =
  | "node"
  | "label"
  | "ownEndpointKeepout"
  | "foreignPortKeepout"
  | "softRoute"
  | "trackOverlap"
  | "searchBounds";
type DebugObstacle = {
  id: string;
  kind: DebugObstacleKind;
  rect: ObstacleRect;
  sourceNodeId?: string;
  sourceRouteEdgeId?: string;
  sourceLabel?: string;
  portSide?: RoutePortSide;
  portIndex?: number;
};
type DebugSearchGraph = {
  points: Point[];
  edges: Array<{ from: Point; to: Point; cost: number; dir: "h" | "v" }>;
  visited: Array<{ point: Point; dir: "start" | "h" | "v"; cost: number }>;
  finalPath: Point[] | null;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  bestCost?: Array<{ key: string; cost: number }>;
  previous?: Array<{ key: string; previousKey: string; index: number }>;
};
type DebugEndpointInfo = {
  fromSide: RoutePortSide;
  toSide: RoutePortSide;
  fromFacing: boolean;
  toFacing: boolean;
  requiresSharedSameSideLane: boolean;
  requiresLaneRoute: boolean;
  fromRule: EndpointDirectionRule;
  toRule: EndpointDirectionRule;
  from: Point;
  to: Point;
  fromDirection: Point;
  toDirection: Point;
  failures: string[];
};
type DebugSimplificationInfo = {
  beforeSimplify: Point[] | null;
  afterSimplify: Point[] | null;
  finalCompacted: Point[] | null;
};
type RoutingDebugInfo = {
  routeEdgeId: string;
  selectedBy: DebugSelectedBy;
  candidates: DebugRouteCandidate[];
  obstacles: DebugObstacle[];
  searchGraph: DebugSearchGraph | null;
  endpointInfo: DebugEndpointInfo | null;
  simplification: DebugSimplificationInfo;
};
type RoutingDebugCollector = {
  addCandidate(candidate: DebugRouteCandidate): void;
  addObstacle(obstacle: DebugObstacle): void;
  setSelectedBy(value: DebugSelectedBy): void;
  setSearchGraph(graph: DebugSearchGraph): void;
  setEndpointInfo(info: DebugEndpointInfo): void;
  setSimplification(info: Partial<DebugSimplificationInfo>): void;
};
type RoutingDebugResult = RoutingDebugInfo & {
  routeEdge: RouteEdge;
  orderIndex: number;
  routePoints: Point[];
  lintWarnings: string[];
  orderingAnalysis: RouteOrderingAnalysis;
  relationAnalysis: RouteEdgeRelationAnalysis;
  connectionMatrix: Array<{
    nodeId: string;
    nodeLabel: string;
    entry: PortRef;
    exit: PortRef;
    ok: boolean;
    scope: "routeSection" | "endpointProbe";
  }>;
};
type VirtualRouteFeasibility =
  | "possible"
  | "blocked"
  | "candidateGenerationGap"
  | "worseScore"
  | "manualOnly"
  | "unknown";
type RoutingFailurePrimaryCause =
  | "none"
  | "blockedByNode"
  | "blockedByLabel"
  | "blockedByForeignKeepout"
  | "blockedByOwnEndpointKeepout"
  | "blockedByEndpointDirection"
  | "blockedByConnectionTraversal"
  | "candidateGenerationGap"
  | "searchGraphMissingLine"
  | "outsideSearchBounds"
  | "worseScore"
  | "trackOverlapPenalty"
  | "softObstaclePenalty"
  | "manualRouteRequired"
  | "unknown";
type VirtualRouteCollision = {
  obstacle: DebugObstacle;
  segmentIndex: number;
  allowed: boolean;
  reason: string;
  category: "allowed" | "suspicious" | "blocked";
};
type VirtualRouteDiagnosis = {
  feasibility: VirtualRouteFeasibility;
  primaryCause: RoutingFailurePrimaryCause;
  blockingReasons: string[];
  missingRequirements: string[];
  secondaryNotes: string[];
  collidedObstacles: DebugObstacle[];
  collidedObstacleDetails: VirtualRouteCollision[];
  allowedOwnEndpointKeepoutCollisions: VirtualRouteCollision[];
  suspiciousOwnEndpointKeepoutCollisions: VirtualRouteCollision[];
  blockedOwnEndpointKeepoutCollisions: VirtualRouteCollision[];
  scoreBreakdown: RouteScoreBreakdown;
  endpointDirectionResult: {
    ok: boolean;
    reasons: string[];
  };
  currentScoreBreakdown?: RouteScoreBreakdown;
  currentLength: number;
  virtualLength: number;
  currentBendCount: number;
  virtualBendCount: number;
  currentSelectedBy: DebugSelectedBy;
  virtualCollisionCount: number;
  rejectedReasons: string[];
  graphMissingSegments: Array<{ from: Point; to: Point; reason: string }>;
  missingXValues: number[];
  missingYValues: number[];
  virtualInsideSearchBounds?: boolean;
  endpointViolationPoints: Point[];
  candidateAnalysis: {
    nearestCandidateSource?: string;
    nearestCandidateDistance?: number;
    candidateSourcesPresent: string[];
    candidateSourcesRejected: Array<{
      source: string;
      reasons: string[];
      score?: number;
    }>;
    virtualMatchesExistingCandidate: boolean;
  };
  collisionCounts: {
    hardCollisionCount: number;
    nodeCollisionCount: number;
    labelCollisionCount: number;
    ownEndpointKeepoutCollisionCount: number;
    allowedOwnEndpointKeepoutCollisionCount: number;
    suspiciousOwnEndpointKeepoutCollisionCount: number;
    blockedOwnEndpointKeepoutCollisionCount: number;
    foreignPortKeepoutCollisionCount: number;
    softRouteCollisionScore: number;
    trackOverlapScore: number;
  };
  routeOrderingAnalysis: RouteOrderingAnalysis;
  routeEdgeRelationAnalysis: RouteEdgeRelationAnalysis;
  corridorAnalysis: CorridorAnalysis;
  candidateGenerationAnalysis: CandidateGenerationAnalysis;
  tags: string[];
};
type DebugNodeSnapshot = {
  id: string;
  label?: string;
  type: RouteNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  isFlipped?: boolean;
  platformCount?: number;
  verticalPlatformCount?: number;
};
type RoutingDebugLogEntryV1 = {
  timestamp: string;
  routeEdgeId: string;
  fromNodeId: string;
  toNodeId: string;
  fromPortSide: RoutePortSide;
  toPortSide: RoutePortSide;
  fromPortIndex: number;
  toPortIndex: number;
  currentRoutePoints: Point[];
  virtualRoutePoints: Point[];
  currentScoreBreakdown?: RouteScoreBreakdown;
  virtualScoreBreakdown?: RouteScoreBreakdown;
  selectedBy?: DebugSelectedBy;
  feasibility: VirtualRouteFeasibility | "notCandidate";
  blockingReasons: string[];
  missingRequirements: string[];
  collidedObstacles: Array<{
    kind: string;
    id: string;
    sourceId?: string;
  }>;
  routeEdgeOrderIndex?: number;
  notes?: string;
};
type RoutingDebugLogEntryV2 = {
  schemaVersion: 2;
  timestamp: string;
  appContext: {
    workspaceName?: string;
    debugToolVersion?: string;
    userAgent?: string;
    viewport?: {
      width: number;
      height: number;
      zoom?: number;
    };
  };
  routeEdge: {
    id: string;
    orderIndex?: number;
    totalRouteEdges?: number;
    fromNodeId: string;
    toNodeId: string;
    fromNodeLabel?: string;
    toNodeLabel?: string;
    fromPortSide: RoutePortSide;
    toPortSide: RoutePortSide;
    fromPortIndex: number;
    toPortIndex: number;
    bidirectional: boolean;
    travelMinutes: number;
  };
  nodes: {
    fromNode?: DebugNodeSnapshot;
    toNode?: DebugNodeSnapshot;
    nearbyNodes?: DebugNodeSnapshot[];
  };
  routingFlags: {
    fromFacing: boolean;
    toFacing: boolean;
    requiresSharedSameSideLane: boolean;
    requiresLaneRoute: boolean;
    endpointDirectionOk: boolean;
    endpointDirectionReasons: string[];
  };
  currentRoute: {
    points: Point[];
    length: number;
    bendCount: number;
    selectedBy?: DebugSelectedBy;
    scoreBreakdown?: RouteScoreBreakdown;
  };
  virtualRoute: {
    points: Point[];
    waypointCount: number;
    length: number;
    bendCount: number;
    scoreBreakdown?: RouteScoreBreakdown;
  };
  comparison: {
    lengthDelta: number;
    bendDelta: number;
    scoreDelta?: number;
    virtualIsShorter: boolean;
    virtualHasFewerBends: boolean;
    virtualScoreBetter?: boolean;
  };
  diagnosis: {
    feasibility: VirtualRouteFeasibility;
    primaryCause: RoutingFailurePrimaryCause;
    blockingReasons: string[];
    missingRequirements: string[];
    secondaryNotes: string[];
  };
  collisions: {
    hardCollisionCount: number;
    nodeCollisionCount: number;
    labelCollisionCount: number;
    ownEndpointKeepoutCollisionCount: number;
    allowedOwnEndpointKeepoutCollisionCount: number;
    suspiciousOwnEndpointKeepoutCollisionCount?: number;
    blockedOwnEndpointKeepoutCollisionCount: number;
    foreignPortKeepoutCollisionCount: number;
    softRouteCollisionScore: number;
    trackOverlapScore: number;
    collidedObstacles: Array<{
      id: string;
      kind: DebugObstacleKind;
      sourceNodeId?: string;
      sourceRouteEdgeId?: string;
      sourceLabel?: string;
      portSide?: RoutePortSide;
      portIndex?: number;
      segmentIndex?: number;
      allowed?: boolean;
      reason?: string;
    }>;
  };
  candidateAnalysis: {
    nearestCandidateSource?: string;
    nearestCandidateDistance?: number;
    candidateSourcesPresent: string[];
    candidateSourcesRejected: Array<{
      source: string;
      reasons: string[];
      score?: number;
    }>;
    virtualMatchesExistingCandidate: boolean;
  };
  searchGraphAnalysis: {
    searchBounds?: {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
    };
    virtualInsideSearchBounds?: boolean;
    missingXValues?: number[];
    missingYValues?: number[];
    segmentsNotInSearchGraph?: Array<{
      from: Point;
      to: Point;
      reason: string;
    }>;
    finalPathExists?: boolean;
  };
  connectionTraversal?: {
    involvedConnectionNodeIds: string[];
    blockedPairs: Array<{
      nodeId: string;
      entrySide: RoutePortSide;
      entryIndex: number;
      exitSide: RoutePortSide;
      exitIndex: number;
      reason: string;
    }>;
  };
  density?: {
    maxDensityOnCurrentRoute?: number;
    maxDensityOnVirtualRoute?: number;
    averageDensityOnVirtualRoute?: number;
  };
  routeOrderingAnalysis?: {
    routeEdgeOrderIndex?: number;
    totalRouteEdges?: number;
    sameSideLaneGroupKey?: string;
    sameSideLaneRank?: number;
    relationGroupId?: string;
    previousRouteEdgeIds?: string[];
    previousRouteEdgesUsedAsSoftObstacles?: string[];
    previousRouteEdgesUsedAsTrackOverlapObstacles?: string[];
    blockingPreviousRouteEdgeIds?: string[];
    relationToPreviousEdges?: Array<{
      routeEdgeId: string;
      relation: RouteEdgeRelation;
      usedAsSoftObstacle: boolean;
      usedAsTrackOverlapObstacle: boolean;
      causedPenalty?: boolean;
      penaltyContribution?: number;
    }>;
    blockedByEarlierGeometry: boolean;
    routeOrderSensitive: boolean;
  };
  routeEdgeRelationAnalysis?: RouteEdgeRelationAnalysis;
  corridorAnalysis?: CorridorAnalysis;
  candidateGenerationAnalysis?: CandidateGenerationAnalysis;
  tags: string[];
  userNotes?: string;
};
type RoutingDebugLogEntry = RoutingDebugLogEntryV1 | RoutingDebugLogEntryV2;
type RoutingDebugLayerKey =
  | "candidates"
  | "nodeObstacles"
  | "labelObstacles"
  | "portGateKeepoutObstacles"
  | "softRouteObstacles"
  | "trackOverlapObstacles"
  | "searchBounds"
  | "searchGraph"
  | "searchVisited"
  | "simplification"
  | "endpointVectors"
  | "density";
type NodeActionIconKind = "rotate" | "flip" | "delete";

const nodeActionIconPaths: Record<NodeActionIconKind, string[]> = {
  delete: [
    `M1780 3800 c-258 -36 -528 -133 -736 -266 -239 -152 -465 -384 -613
-629 -288 -477 -328 -1104 -103 -1620 138 -317 389 -612 687 -808 429 -282
962 -375 1445 -252 667 170 1191 742 1315 1435 23 128 31 408 16 540 -92 807
-644 1421 -1421 1582 -109 22 -477 33 -590 18z m376 -141 c711 -69 1265 -537
1444 -1221 94 -360 72 -740 -65 -1079 -155 -387 -410 -668 -787 -868 -471
-250 -1111 -226 -1586 61 -179 108 -317 224 -441 373 -212 254 -339 541 -382
861 -17 128 -6 422 20 542 37 173 110 359 197 505 115 191 333 422 511 541
333 221 717 322 1089 285z`,
    `M1775 3071 c-61 -5 -92 -13 -127 -34 -82 -48 -117 -109 -127 -222
l-6 -70 -219 -3 c-241 -3 -256 -6 -256 -62 0 -38 24 -54 89 -60 l56 -5 3 -45
c5 -84 82 -1114 98 -1310 19 -247 32 -282 117 -331 l42 -24 515 -3 c366 -3
530 0 568 8 68 15 135 75 150 135 6 22 24 227 41 455 33 446 46 612 61 785
5 61 12 161 16 223 l7 112 51 0 c63 0 96 20 96 59 0 58 -14 61 -257 61 l-220 0
-6 75 c-8 84 -29 136 -79 185 -63 63 -95 71 -326 75 -114 2 -243 0 -287 -4z
m503 -134 c43 -23 74 -91 70 -150 l-3 -42 -352 -3 -353 -2 0 58 c0 69 25 114
80 144 32 17 56 19 280 16 215 -3 249 -5 278 -21z m398 -369 c-11 -94 -64
-794 -86 -1123 -12 -176 -26 -337 -31 -357 -18 -69 -6 -68 -574 -68 l-507 0
-29 29 c-16 16 -29 38 -29 48 0 32 -81 1155 -105 1456 l-5 67 686 0 685 0 -5
-52z`,
    `M1708 2318 l-21 -21 6 -496 c6 -494 6 -496 27 -513 29 -24 55 -23 81
3 20 20 20 24 13 517 -6 425 -9 500 -22 515 -21 23 -57 22 -84 -5z`,
    `M2194 2319 c-18 -20 -19 -46 -22 -516 -3 -461 -2 -496 14 -515 23
-25 62 -20 85 12 17 23 18 61 20 519 3 473 2 494 -16 507 -27 20 -59 17 -81
-7z`,
  ],
  flip: [
    `M1770 3800 c-597 -81 -1124 -461 -1399 -1008 -196 -388 -239 -873
-115 -1304 163 -566 621 -1042 1183 -1228 155 -52 238 -68 414 -82 409 -33
800 71 1147 305 122 83 336 289 422 407 177 243 296 530 344 825 21 130 24
396 5 525 -101 718 -570 1284 -1237 1493 -164 52 -284 69 -499 73 -110 1 -229
-1 -265 -6z m355 -140 c520 -50 950 -300 1230 -715 117 -175 220 -435 261
-660 25 -138 25 -441 0 -575 -90 -488 -352 -885 -752 -1142 -78 -50 -259 -135
-354 -166 -171 -57 -268 -73 -470 -79 -159 -5 -202 -2 -309 16 -394 67 -766
285 -1020 596 -314 384 -440 873 -351 1362 135 745 774 1312 1540 1366 95 7
118 7 225 -3z`,
    `M2477 2602 c-35 -38 -22 -62 86 -164 l102 -97 -772 0 c-688 -1 -773
-3 -787 -17 -22 -21 -20 -67 2 -87 17 -16 86 -17 787 -17 l768 0 -101 -96
c-83 -78 -102 -101 -102 -124 0 -30 30 -60 61 -60 10 0 92 70 183 156 200 189
201 189 105 273 -33 29 -107 98 -164 152 -109 104 -136 117 -168 81z`,
    `M1331 1878 c-47 -46 -121 -116 -164 -156 -60 -56 -77 -79 -77 -100 0
-15 4 -32 8 -38 4 -5 78 -76 164 -157 164 -153 187 -167 221 -129 36 39 23 65
-78 157 -52 48 -95 91 -95 96 0 5 335 9 769 9 l770 0 15 22 c21 30 20 54 -4
78 -20 20 -33 20 -785 20 -421 0 -765 2 -765 5 0 3 43 47 95 97 76 72 95 96
95 119 0 30 -31 59 -63 59 -10 0 -58 -37 -106 -82z`,
  ],
  rotate: [
    `M1728 3794 c-509 -79 -952 -357 -1233 -774 -341 -507 -409 -1151
-178 -1714 137 -338 373 -628 671 -827 330 -221 688 -322 1082 -306 297 12
541 82 801 229 432 243 738 645 864 1133 40 155 41 165 55 327 39 470 -125
972 -441 1344 -268 316 -694 542 -1119 594 -116 14 -396 11 -502 -6z m398
-135 c297 -29 563 -119 789 -268 348 -229 604 -609 696 -1036 80 -371 28 -777
-141 -1116 -199 -396 -554 -706 -959 -839 -192 -62 -274 -74 -516 -74 -242 0
-331 13 -520 75 -126 41 -332 146 -445 226 -122 87 -296 261 -383 383 -82 116
-197 341 -236 464 -64 201 -76 281 -76 521 0 192 3 234 23 327 131 608 548
1075 1128 1263 118 38 240 63 364 75 127 11 156 11 276 -1z`,
    `M1847 2849 c-252 -27 -499 -187 -636 -414 -47 -77 -98 -217 -112
-306 -16 -103 -6 -285 21 -379 67 -233 228 -425 445 -531 122 -59 196 -78 340
-86 182 -9 370 41 510 137 116 79 227 204 289 329 31 61 29 92 -9 117 -40 26
-74 6 -112 -69 -95 -182 -288 -332 -481 -373 -86 -18 -228 -18 -317 1 -38 8
-113 36 -165 61 -79 39 -109 62 -180 133 -96 97 -148 179 -187 296 -25 72 -27
94 -27 225 0 129 3 154 26 223 135 405 576 616 960 460 179 -72 337 -237 409
-426 12 -31 20 -60 17 -62 -3 -3 -55 22 -116 55 -60 33 -119 60 -130 60 -28 0
-52 -32 -52 -69 0 -25 6 -35 28 -47 35 -19 274 -149 330 -179 72 -38 90 -27
134 86 96 245 128 332 128 345 0 22 -38 54 -64 54 -34 0 -56 -32 -96 -143 -19
-53 -37 -97 -40 -97 -3 0 -17 31 -32 68 -146 359 -497 571 -881 531z`,
  ],
};

const NodeActionIcon = ({ kind }: { kind: NodeActionIconKind }) => (
  <g
    transform="translate(-12 -12)"
    pointerEvents="none"
    style={{ color: "#4A5568" }}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 400 400"
      fill="none"
    >
      <circle
        cx="200"
        cy="200"
        r="170"
        fill="#ffffff"
        className="canvas-fixed-light-button"
      />
      <g transform="translate(0 400) scale(0.1 -0.1)">
        {nodeActionIconPaths[kind].map((pathData, index) => (
          <path
            key={`${kind}-${index}`}
            d={pathData}
            fill="currentColor"
            className="canvas-fixed-light-fill"
          />
        ))}
      </g>
    </svg>
  </g>
);

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
const routeNodeExitStubLength = layoutGridSize * 5;
const routeClearance = layoutGridSize * 2;
const routeLaneStep = portGap;
const routeTrackOverlapPenalty = 120;
const routeTimeFlowDasharray = "10 26";
const routeTimeFlowDashoffsetValues = "36;0";
const rotateButtonRadius = 12;
const baseCanvasSide = 3600;
const canvasSizeMultiplier = 10;
const canvasWidth = baseCanvasSide * canvasSizeMultiplier;
const canvasHeight = canvasWidth;
const minCanvasZoom = 0.4;
const maxCanvasZoom = 2.4;
const desktopCanvasPanelMediaQuery = "(min-width: 1536px)";
const compactCanvasViewportMinHeight = 630;
const compactCanvasViewportMaxHeight = 930;
const desktopCanvasViewportHeight = 1050;

const getInitialCanvasZoom = () =>
  typeof window !== "undefined" && window.innerWidth < 640 ? 0.7 : 1;

const getCompactCanvasViewportHeight = () => {
  if (typeof window === "undefined") return compactCanvasViewportMaxHeight;
  return Math.max(
    compactCanvasViewportMinHeight,
    Math.min(
      compactCanvasViewportMaxHeight,
      Math.round(window.innerHeight * 0.93)
    )
  );
};

const nodeColors: Record<RouteNodeType, string> = {
  station: "#ffffff",
  garage: "#e0f2fe",
  yard: "#ecfccb",
  connection: "#dbeafe",
  turnback: "#fce7f3",
  crossing: "#ede9fe",
};

const routeEditorCommandGroups = [
  {
    title: "ワークスペース・保存",
    commands: [
      "上部タブ: ワークスペースを切り替え",
      "＋: 新規ワークスペースを追加",
      "コピーアイコン: 現在のワークスペースを複製",
      "鉛筆: ワークスペース名を直接変更",
      "×: ワークスペースを閉じる",
      "ダウンロードアイコン: JSON保存 / CSV出力を選択",
      "JSON読込: 現在のワークスペースへ復元",
      "編集内容はワークスペース単位でブラウザ内に自動保存",
      "重要なデータはJSONで手元に保存",
    ],
  },
  {
    title: "表示・キャンバス",
    commands: [
      "左端アイコン: ノード追加 / ルート修正 / 経路設定 / 所要時間 / 車速区分を開く",
      "選択中アイコンを再クリック: ツールを閉じる",
      "ツール選択中にキャンバス右クリック: ツールと設定モードを閉じる",
      "空白ドラッグ: キャンバス移動",
      "ホイール / ピンチ: 拡大縮小",
      "空白クリック: 選択解除",
    ],
  },
  {
    title: "ノード",
    commands: [
      "ノード追加: ノード名・種類・番線数を指定して追加",
      "新規ノードは表示中キャンバスの中央へ追加",
      "ノードドラッグ: ノード移動",
      "回転ボタン: 90°回転",
      "裏返しボタン: 接続点と番線の向きを反転",
      "終端: 片側だけ接続点を出す",
      "ノード編集: 種類・終端・番線数・番線名・分岐形状を変更",
    ],
  },
  {
    title: "接続線・選択",
    commands: [
      "Ctrl + 接続点ドラッグ: 接続線を作成",
      "未接続の接続点: 白抜き表示",
      "接続線クリック: 接続線を選択",
      "Shift + 左ドラッグ: 範囲選択",
      "Delete / Backspace: 選択対象を削除",
      "Ctrl + 右クリック: 選択対象を削除",
      "Ctrl + C / Ctrl + V: 選択ノードをコピー・貼り付け",
      "Ctrl + Z / Ctrl + Y: 戻す・やり直し",
    ],
  },
  {
    title: "分岐器",
    commands: [
      "Shift + 左クリック: 分岐を入れる接続線を選択",
      "Ctrl + Shift + 左ドラッグ: 選択接続線へ分岐器を挿入",
      "Ctrl + Shift + 左クリック: 単独の分岐器を追加",
      "1本選択時: ドラッグ方向で待避分岐の開く向きを決定",
      "2本選択時: 接続線側で片渡りZ / 逆Zを切り替え",
      "分岐器選択後: ノード編集で形状・番線を変更",
    ],
  },
  {
    title: "ルート修正",
    commands: [
      "ルート修正アイコンを押して接続線を選択: 修正開始",
      "クリック: 中継点を追加",
      "Shift + クリック: 直交補助つきで追加",
      "右クリック / Esc: 中断",
      "Ctrl + Z / Ctrl + Y: 中継点を戻す・やり直し",
      "保存: 中継点を接続線へ反映",
      "自動に戻す: 手動中継点を削除",
      "ノード移動時: 手動中継点は自動ルートへフォールバック",
    ],
  },
  {
    title: "所要時間・車速区分",
    commands: [
      "所要時間 設定モード: 接続点を順に選択",
      "設定済み区間クリック: 所要時間や分岐ごとの時間配分を編集",
      "設定済み区間右クリック: 進行方向を順 / 逆 / 双方向に切り替え",
      "車速区分: 車速ごとに所要時間セットを管理",
      "倍率ON: 車速1を基準に全区間の時間を一括変換",
    ],
  },
  {
    title: "経路セット・列車",
    commands: [
      "経路設定 設定モード: ノードの番線領域を順に選択して下書き作成",
      "経路設定の保存: 営業 / 回送の下書きを経路セットへ反映",
      "戻す / クリア: 下書きだけを変更",
      "回送経路ON: 回送用の経路も指定",
      "経路設定中の Ctrl + Z / Ctrl + Y: 入力手順を戻す・やり直す",
      "列車一覧: 列車追加・複製・削除・ドラッグ並び替え",
      "列車設定: 経路セット・車速区分・営業時間・回送時間を指定",
      "停車 / 通過: 表の状態欄で変更",
      "標準停車分は5分固定",
      "時刻表は所要時間と停車 / 通過から自動計算",
    ],
  },
  {
    title: "ダイヤグラム・表示",
    commands: [
      "読取方向: ダイヤグラムの縦軸順を指定",
      "テーマ: ライトテーマ / グレーテーマ / ダークテーマを切り替え",
      "列車色: 色ボタンから簡易カラーピッカーで変更",
      "ダイヤグラムは列車設定と時刻から自動描画",
    ],
  },
];

const floatingPanelTools: Array<{
  key: FloatingPanelSectionKey;
  label: string;
  iconUrl: string;
}> = [
  { key: "addNode", label: "ノード追加", iconUrl: addNodeIconUrl },
  { key: "routeEditing", label: "ルート修正", iconUrl: routeEditingIconUrl },
  { key: "routeSetting", label: "経路設定", iconUrl: routeSettingIconUrl },
  { key: "duration", label: "所要時間", iconUrl: durationIconUrl },
  {
    key: "speedClassification",
    label: "車速区分",
    iconUrl: speedClassificationIconUrl,
  },
];

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

const routingDebugCandidateColors: Record<DebugRouteCandidateSource, string> = {
  simple: "#22c55e",
  direct: "#38bdf8",
  sideAware: "#a78bfa",
  outer: "#f97316",
  searched: "#eab308",
  searchedSimplified: "#facc15",
  fallback: "#ec4899",
  final: "#ef4444",
};

const routingDebugObstacleColors: Record<DebugObstacle["kind"], string> = {
  node: "#ef4444",
  label: "#f97316",
  ownEndpointKeepout: "#f59e0b",
  foreignPortKeepout: "#fb923c",
  softRoute: "#a855f7",
  trackOverlap: "#38bdf8",
  searchBounds: "#84cc16",
};

const routingDebugObstacleLayerByKind: Record<
  DebugObstacle["kind"],
  RoutingDebugLayerKey
> = {
  node: "nodeObstacles",
  label: "labelObstacles",
  ownEndpointKeepout: "portGateKeepoutObstacles",
  foreignPortKeepout: "portGateKeepoutObstacles",
  softRoute: "softRouteObstacles",
  trackOverlap: "trackOverlapObstacles",
  searchBounds: "searchBounds",
};

const routingDebugLayerLabels: Record<RoutingDebugLayerKey, string> = {
  candidates: "候補経路",
  nodeObstacles: "node obstacle",
  labelObstacles: "node label obstacle",
  portGateKeepoutObstacles: "port keepout",
  softRouteObstacles: "soft route obstacle",
  trackOverlapObstacles: "track overlap obstacle",
  searchBounds: "search bounds",
  searchGraph: "探索グラフ",
  searchVisited: "探索済み点",
  simplification: "簡略化前後",
  endpointVectors: "ポート方向",
  density: "密度ヒートマップ",
};

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

const cloneTrainRouteSections = (sections: TrainRunRouteSection[]) =>
  sections.map((section) => ({ ...section }));

const createRouteTemplateDraft = (
  routeTemplate: State["routeTemplates"][number]
): RouteTemplateDraft => ({
  templateId: routeTemplate.id,
  serviceRouteSections: cloneTrainRouteSections(
    routeTemplate.serviceRouteSections
  ),
  deadheadRouteSections: cloneTrainRouteSections(
    routeTemplate.deadheadRouteSections
  ),
});

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

const routeTimeSectionPortMatchesEdgeEndpoint = (
  port: RouteTimeSectionPort,
  nodeId: string,
  side: RoutePortSide,
  index: number
) => port.nodeId === nodeId && port.side === side && port.index === index;

const getRouteTimeSectionRouteEdgeDirection = (
  section: State["routeTimeSections"][number],
  routeEdge: RouteEdge
) => {
  for (let index = 0; index < section.routePorts.length - 1; index += 1) {
    const fromPort = section.routePorts[index];
    const toPort = section.routePorts[index + 1];
    if (
      routeTimeSectionPortMatchesEdgeEndpoint(
        fromPort,
        routeEdge.fromNodeId,
        routeEdge.fromPortSide,
        routeEdge.fromPortIndex
      ) &&
      routeTimeSectionPortMatchesEdgeEndpoint(
        toPort,
        routeEdge.toNodeId,
        routeEdge.toPortSide,
        routeEdge.toPortIndex
      )
    ) {
      return "forward";
    }
    if (
      routeTimeSectionPortMatchesEdgeEndpoint(
        fromPort,
        routeEdge.toNodeId,
        routeEdge.toPortSide,
        routeEdge.toPortIndex
      ) &&
      routeTimeSectionPortMatchesEdgeEndpoint(
        toPort,
        routeEdge.fromNodeId,
        routeEdge.fromPortSide,
        routeEdge.fromPortIndex
      )
    ) {
      return "reverse";
    }
  }
  return "forward";
};

const getRouteTimeFlowRoutePoints = (
  section: State["routeTimeSections"][number],
  routeEdge: RouteEdge,
  geometry: RouteEdgeGeometry
) => {
  const sectionForwardUsesGeometry =
    getRouteTimeSectionRouteEdgeDirection(section, routeEdge) === "forward";
  const toFlowPoints = (useSectionForward: boolean) => {
    const useGeometryDirection =
      sectionForwardUsesGeometry === useSectionForward;
    return useGeometryDirection
      ? geometry.routePoints
      : [...geometry.routePoints].reverse();
  };
  switch (section.internalDirection ?? "forward") {
    case "reverse":
      return [toFlowPoints(false)];
    case "bidirectional":
      return [toFlowPoints(true), toFlowPoints(false)];
    case "forward":
    default:
      return [toFlowPoints(true)];
  }
};

const getRouteTimeSectionLabel = (
  state: State,
  section: State["routeTimeSections"][number]
) => {
  const endpoints = getRouteTimeSectionDisplayEndpoints(section);
  const arrow =
    (section.internalDirection ?? "forward") === "bidirectional" ? "↔" : "→";
  return `${getRouteTimeSectionEndpointLabel(
    state,
    endpoints.startNodeId,
    endpoints.startPortIndex
  )} ${arrow} ${getRouteTimeSectionEndpointLabel(
    state,
    endpoints.endNodeId,
    endpoints.endPortIndex
  )} / ${section.travelMinutes}分`;
};

const getTrainRouteSectionKey = (section: TrainRunRouteSection) =>
  `${section.routeTimeSectionId}:${section.reversed ? "reverse" : "forward"}`;

const getTrainRouteSectionLabel = (
  state: State,
  routeSection: TrainRunRouteSection
) => {
  const section = getRouteSectionById(state, routeSection.routeTimeSectionId);
  const startPort = getRouteSectionStartPort(state, routeSection);
  const endPort = getRouteSectionEndPort(state, routeSection);
  if (!section || !startPort || !endPort) return "未設定区間";
  return `${getRouteTimeSectionEndpointLabel(
    state,
    startPort.nodeId,
    startPort.index
  )} → ${getRouteTimeSectionEndpointLabel(
    state,
    endPort.nodeId,
    endPort.index
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

const isFloatingPanelDragControl = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest(
      'button,input,select,textarea,summary,label,a,[role="button"],[contenteditable="true"],[data-floating-panel-no-drag="true"]'
    )
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
  if (routeNode.type === "connection") {
    return false;
  }
  if (routeNode.type === "crossing") return Boolean(routeNode.isFlipped);
  const rotation = getNodeRotation(routeNode);
  const isFlipped = Boolean(routeNode.isFlipped);
  if (rotation === 0) return isFlipped;
  const canonicalSide = rotatePortSideByDegrees(side, -rotation);
  const rotatedAxis = rotateAxisByDegrees(
    getPortIndexAxis(canonicalSide),
    rotation
  );
  const currentAxis = getPortIndexAxis(side);
  const isRotationReversed =
    rotatedAxis.x * currentAxis.x + rotatedAxis.y * currentAxis.y < 0;
  return isRotationReversed !== isFlipped;
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

const shouldReverseRouteTemplatePlatformOrder = (routeNode: RouteNode) => {
  const isFlipped = Boolean(routeNode.isFlipped);
  if (routeNode.type === "crossing") return isFlipped;
  const isRotationReversed =
    routeNode.type !== "connection" &&
    (getNodeRotation(routeNode) === 90 || getNodeRotation(routeNode) === 180);
  return isRotationReversed !== isFlipped;
};

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

const getRouteEdgeBundleEndpointKey = (
  nodeId: string,
  side: RoutePortSide
) => `${nodeId}:${side}`;

const getRouteEdgeBundleKey = (routeEdge: State["routeEdges"][number]) => {
  const fromKey = getRouteEdgeBundleEndpointKey(
    routeEdge.fromNodeId,
    routeEdge.fromPortSide
  );
  const toKey = getRouteEdgeBundleEndpointKey(
    routeEdge.toNodeId,
    routeEdge.toPortSide
  );
  return fromKey < toKey ? `${fromKey}|${toKey}` : `${toKey}|${fromKey}`;
};

const getRouteEdgeEndpointSideKeys = (
  routeEdge: State["routeEdges"][number]
) => [
  getRouteEdgeBundleEndpointKey(routeEdge.fromNodeId, routeEdge.fromPortSide),
  getRouteEdgeBundleEndpointKey(routeEdge.toNodeId, routeEdge.toPortSide),
];

const getSharedRouteEdgeEndpointSideKeys = (
  routeEdge: State["routeEdges"][number],
  otherRouteEdge: State["routeEdges"][number]
) => {
  const endpointSideKeys = new Set(getRouteEdgeEndpointSideKeys(routeEdge));
  return getRouteEdgeEndpointSideKeys(otherRouteEdge).filter((key) =>
    endpointSideKeys.has(key)
  );
};

const getRouteEdgeRelationGroupId = (
  routeEdge: State["routeEdges"][number],
  relation: RouteEdgeRelation
) => {
  if (relation === "sameCorridor") {
    return `sameCorridor:${getRouteEdgeBundleKey(routeEdge)}`;
  }
  if (relation === "fanOut") {
    return `fanOut:${getRouteEdgeBundleEndpointKey(
      routeEdge.fromNodeId,
      routeEdge.fromPortSide
    )}`;
  }
  if (relation === "fanIn") {
    return `fanIn:${getRouteEdgeBundleEndpointKey(
      routeEdge.toNodeId,
      routeEdge.toPortSide
    )}`;
  }
  return undefined;
};

const getRouteEdgeRelationDetail = (
  routeEdge: State["routeEdges"][number],
  otherRouteEdge: State["routeEdges"][number]
): RouteEdgeRelationDetail => {
  if (routeEdge.id === otherRouteEdge.id) {
    return {
      routeEdgeId: otherRouteEdge.id,
      relation: "independent",
      reason: "same routeEdge",
    };
  }
  if (getRouteEdgeBundleKey(routeEdge) === getRouteEdgeBundleKey(otherRouteEdge)) {
    return {
      routeEdgeId: otherRouteEdge.id,
      relation: "sameCorridor",
      reason: "both endpoint node-side pairs match",
    };
  }
  const sameFromSide =
    routeEdge.fromNodeId === otherRouteEdge.fromNodeId &&
    routeEdge.fromPortSide === otherRouteEdge.fromPortSide;
  const sameToSide =
    routeEdge.toNodeId === otherRouteEdge.toNodeId &&
    routeEdge.toPortSide === otherRouteEdge.toPortSide;
  if (sameFromSide) {
    return {
      routeEdgeId: otherRouteEdge.id,
      relation: "fanOut",
      reason: "same from node side but different destination corridor",
    };
  }
  if (sameToSide) {
    return {
      routeEdgeId: otherRouteEdge.id,
      relation: "fanIn",
      reason: "same to node side but different origin corridor",
    };
  }
  const sharedEndpointSideKeys = getSharedRouteEdgeEndpointSideKeys(
    routeEdge,
    otherRouteEdge
  );
  if (sharedEndpointSideKeys.length > 0) {
    return {
      routeEdgeId: otherRouteEdge.id,
      relation: "sharedEndpointSide",
      reason: `shares endpoint side ${sharedEndpointSideKeys.join(", ")}`,
    };
  }
  return {
    routeEdgeId: otherRouteEdge.id,
    relation: "independent",
    reason: "no endpoint side corridor is shared",
  };
};

const getRouteEdgeRelationAnalysis = (
  routeEdge: State["routeEdges"][number],
  routeEdges: State["routeEdges"]
): RouteEdgeRelationAnalysis => {
  const relatedEdges = routeEdges
    .filter((otherRouteEdge) => otherRouteEdge.id !== routeEdge.id)
    .map((otherRouteEdge) =>
      getRouteEdgeRelationDetail(routeEdge, otherRouteEdge)
    )
    .filter((detail) => detail.relation !== "independent");
  const relationPriority: RouteEdgeRelation[] = [
    "sameCorridor",
    "fanOut",
    "fanIn",
    "sharedEndpointSide",
  ];
  const relationType = relationPriority.find((relation) =>
    relatedEdges.some((detail) => detail.relation === relation)
  );
  return {
    relationGroupId: relationType
      ? getRouteEdgeRelationGroupId(routeEdge, relationType)
      : undefined,
    relationType,
    relatedEdges,
  };
};

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
  routeNode.type !== "connection" &&
  routeNode.type !== "crossing" &&
  Boolean(routeNode.isTerminal);

const getSingleEndedPortSide = (routeNode: RouteNode): RoutePortSide => {
  const rotation = getNodeRotation(routeNode);
  if (rotation === 90) return "bottom";
  if (rotation === 180) return "left";
  if (rotation === 270) return "top";
  return "right";
};

const getCrossingHorizontalTerminalPortSide = (
  routeNode: RouteNode
): RoutePortSide => (getNodeRotation(routeNode) === 180 ? "left" : "right");

const getCrossingVerticalTerminalPortSide = (
  routeNode: RouteNode
): RoutePortSide => (getNodeRotation(routeNode) === 270 ? "top" : "bottom");

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
    if (
      routeNode.isVerticalTerminal &&
      (side === "top" || side === "bottom") &&
      side !== getCrossingVerticalTerminalPortSide(routeNode)
    ) {
      return 0;
    }
    if (
      routeNode.isHorizontalTerminal &&
      (side === "left" || side === "right") &&
      side !== getCrossingHorizontalTerminalPortSide(routeNode)
    ) {
      return 0;
    }
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
  const reverseOrder = shouldReverseRouteTemplatePlatformOrder(routeNode);
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
  if (isVerticalNode(routeNode)) {
    return {
      labelX: 0,
      labelY: 0,
      subLabelY: 17,
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

const getTextFitProps = (text: string, fontSize: number, maxWidth: number) =>
  estimateTextWidth(text, fontSize) > maxWidth
    ? {
        textLength: Math.max(12, maxWidth),
        lengthAdjust: "spacingAndGlyphs" as const,
      }
    : {};

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

const getNodeSideBandPortGateKeepoutRects = (
  routeNode: RouteNode,
  allowedSide: RoutePortSide,
  allowedIndex: number,
  padding = routeStubLength + routeClearance
) => {
  const portCount = getPortCountForSide(routeNode, allowedSide);
  if (portCount <= 1) {
    return getNodePortGateKeepoutRects(
      routeNode,
      allowedSide,
      allowedIndex,
      padding
    );
  }

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
  const ports = Array.from({ length: portCount }).map((_, index) =>
    getPortPosition(routeNode, allowedSide, index)
  );
  const gateHalf = Math.max(portRadius + 8, portGap / 2 + 2);
  const minPortX = Math.min(...ports.map((port) => port.x)) - gateHalf;
  const maxPortX = Math.max(...ports.map((port) => port.x)) + gateHalf;
  const minPortY = Math.min(...ports.map((port) => port.y)) - gateHalf;
  const maxPortY = Math.max(...ports.map((port) => port.y)) + gateHalf;
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
  const bandRects: ObstacleRect[] =
    allowedSide === "left"
      ? [
          {
            id: `${routeNode.id}:keepout:left:upper`,
            x: outer.x,
            y: outer.y,
            width: padding,
            height: minPortY - outer.y,
          },
          {
            id: `${routeNode.id}:keepout:left:lower`,
            x: outer.x,
            y: maxPortY,
            width: padding,
            height: outerBottom - maxPortY,
          },
        ]
      : allowedSide === "right"
      ? [
          {
            id: `${routeNode.id}:keepout:right:upper`,
            x: rectRight,
            y: outer.y,
            width: padding,
            height: minPortY - outer.y,
          },
          {
            id: `${routeNode.id}:keepout:right:lower`,
            x: rectRight,
            y: maxPortY,
            width: padding,
            height: outerBottom - maxPortY,
          },
        ]
      : allowedSide === "top"
      ? [
          {
            id: `${routeNode.id}:keepout:top:left`,
            x: outer.x,
            y: outer.y,
            width: minPortX - outer.x,
            height: padding,
          },
          {
            id: `${routeNode.id}:keepout:top:right`,
            x: maxPortX,
            y: outer.y,
            width: outerRight - maxPortX,
            height: padding,
          },
        ]
      : [
          {
            id: `${routeNode.id}:keepout:bottom:left`,
            x: outer.x,
            y: rectBottom,
            width: minPortX - outer.x,
            height: padding,
          },
          {
            id: `${routeNode.id}:keepout:bottom:right`,
            x: maxPortX,
            y: rectBottom,
            width: outerRight - maxPortX,
            height: padding,
          },
        ];

  const filteredBase = rects.filter(
    (candidate) => candidate.id !== `${routeNode.id}:keepout:${allowedSide}`
  );
  return [...filteredBase, ...bandRects].filter(
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

const getRouteTimeConnectionFlowSegments = (
  routeNode: RouteNode,
  section: State["routeTimeSections"][number]
) => {
  const toSegments = (ports: RouteTimeSectionPort[]) =>
    getConnectionInternalSegmentsFromPorts(routeNode, ports);

  switch (section.internalDirection ?? "forward") {
    case "reverse":
      return toSegments([...section.routePorts].reverse());
    case "bidirectional":
      return [
        ...toSegments(section.routePorts),
        ...toSegments([...section.routePorts].reverse()),
      ];
    case "forward":
    default:
      return toSegments(section.routePorts);
  }
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
  routeNode.type === "connection" ? 0 : routeNodeExitStubLength;

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

const segmentExtendsFromSide = (
  anchor: Point,
  next: Point,
  side: RoutePortSide
) => {
  const dx = next.x - anchor.x;
  const dy = next.y - anchor.y;
  if (dx === 0 && dy === 0) return false;
  const vector = getSideVector(side);
  return (
    dx * vector.x + dy * vector.y > 0 &&
    dx * Math.abs(vector.y) === 0 &&
    dy * Math.abs(vector.x) === 0
  );
};

const segmentDoesNotReverseFromSide = (
  anchor: Point,
  next: Point,
  side: RoutePortSide
) => {
  const dx = next.x - anchor.x;
  const dy = next.y - anchor.y;
  if (dx === 0 && dy === 0) return false;
  const vector = getSideVector(side);
  return dx * vector.x + dy * vector.y >= 0;
};

type EndpointDirectionRule = "none" | "straight" | "nonReverse";

const segmentMatchesEndpointDirectionRule = (
  anchor: Point,
  next: Point,
  side: RoutePortSide,
  rule: EndpointDirectionRule
) => {
  if (rule === "none") return true;
  if (rule === "nonReverse") {
    return segmentDoesNotReverseFromSide(anchor, next, side);
  }
  return segmentExtendsFromSide(anchor, next, side);
};

const routeRespectsEndpointDirections = (
  points: Point[],
  from: Point,
  fromSide: RoutePortSide,
  to: Point,
  toSide: RoutePortSide,
  fromRule: EndpointDirectionRule,
  toRule: EndpointDirectionRule
) => {
  const compacted = compactPoints(points);
  if (fromRule !== "none") {
    const first = compacted[0];
    const next = compacted[1];
    if (!first || !next || !pointsEqual(first, from)) return false;
    if (!segmentMatchesEndpointDirectionRule(from, next, fromSide, fromRule)) {
      return false;
    }
  }
  if (toRule !== "none") {
    const previous = compacted[compacted.length - 2];
    const last = compacted[compacted.length - 1];
    if (!previous || !last || !pointsEqual(last, to)) return false;
    if (!segmentMatchesEndpointDirectionRule(to, previous, toSide, toRule)) {
      return false;
    }
  }
  return true;
};

const getRouteEndpointDirectionFailures = (
  points: Point[],
  from: Point,
  fromSide: RoutePortSide,
  to: Point,
  toSide: RoutePortSide,
  fromRule: EndpointDirectionRule,
  toRule: EndpointDirectionRule
) => {
  const failures: string[] = [];
  const compacted = compactPoints(points);
  if (fromRule !== "none") {
    const first = compacted[0];
    const next = compacted[1];
    if (!first || !next || !pointsEqual(first, from)) {
      failures.push("from endpoint is not at route start");
    } else if (
      !segmentMatchesEndpointDirectionRule(from, next, fromSide, fromRule)
    ) {
      failures.push(`from endpoint rule failed: ${fromSide}/${fromRule}`);
    }
  }
  if (toRule !== "none") {
    const previous = compacted[compacted.length - 2];
    const last = compacted[compacted.length - 1];
    if (!previous || !last || !pointsEqual(last, to)) {
      failures.push("to endpoint is not at route end");
    } else if (
      !segmentMatchesEndpointDirectionRule(to, previous, toSide, toRule)
    ) {
      failures.push(`to endpoint rule failed: ${toSide}/${toRule}`);
    }
  }
  return failures;
};

const pointsToPath = (points: Point[]) => {
  const compacted = compactPoints(points);
  return compacted
    .map((point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
    )
    .join(" ");
};

const createRoutingDebugCollector = (routeEdgeId: string) => {
  const info: RoutingDebugInfo = {
    routeEdgeId,
    selectedBy: "unknown",
    candidates: [],
    obstacles: [],
    searchGraph: null,
    endpointInfo: null,
    simplification: {
      beforeSimplify: null,
      afterSimplify: null,
      finalCompacted: null,
    },
  };
  const collector: RoutingDebugCollector = {
    addCandidate(candidate) {
      info.candidates.push(candidate);
    },
    addObstacle(obstacle) {
      info.obstacles.push(obstacle);
    },
    setSelectedBy(value) {
      info.selectedBy = value;
    },
    setSearchGraph(graph) {
      info.searchGraph = graph;
    },
    setEndpointInfo(endpointInfo) {
      info.endpointInfo = endpointInfo;
    },
    setSimplification(nextInfo) {
      info.simplification = {
        ...info.simplification,
        ...nextInfo,
      };
    },
  };
  return { info, collector };
};

const getRoutingDebugLintWarnings = (
  debugInfo: RoutingDebugInfo,
  routePoints: Point[]
) => {
  const warnings: string[] = [];
  const finalCandidate =
    [...debugInfo.candidates].reverse().find((candidate) => candidate.accepted) ??
    debugInfo.candidates.find((candidate) => candidate.source === "final");
  const score = finalCandidate?.scoreBreakdown;
  const compacted = compactPoints(routePoints);
  const first = compacted[0];
  const last = compacted[compacted.length - 1];
  const directDistance =
    first && last ? getRouteManhattanDistance(first, last) : 0;
  const routeLength = getRouteLength(compacted);
  if (directDistance > 0 && routeLength > directDistance * 2.6) {
    warnings.push(
      `direct distance に対して route length が長い: ${routeLength}/${directDistance}`
    );
  }
  if ((score?.bendCount ?? 0) >= 7) {
    warnings.push(`bend count が多い: ${score?.bendCount}`);
  }
  if ((score?.hardCollisionCount ?? 0) > 0) {
    warnings.push(`hard obstacle collision がある: ${score?.hardCollisionCount}`);
  }
  if ((score?.softObstacleScore ?? 0) > 0) {
    warnings.push(`soft obstacle score が高い: ${score?.softObstacleScore}`);
  }
  if ((score?.trackOverlapScore ?? 0) > 0) {
    warnings.push(`track overlap score がある: ${score?.trackOverlapScore}`);
  }
  if (debugInfo.selectedBy === "searchedRoute") {
    warnings.push("search fallback が使われている");
  }
  if (
    debugInfo.selectedBy === "fallbackScore" ||
    debugInfo.selectedBy === "fallbackAfterSimplify"
  ) {
    warnings.push(`selectedBy が ${debugInfo.selectedBy}`);
  }
  return warnings;
};

const routingDebugLogStorageKey =
  "diagram-generation-tool:routing-debug-log-v1";

const isRoutingDebugHostAllowed = () => {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(
    window.location.hostname
  );
};

const loadRoutingDebugLogEntries = (): RoutingDebugLogEntry[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(routingDebugLogStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getAcceptedRoutingDebugCandidate = (debugInfo: RoutingDebugInfo) =>
  [...debugInfo.candidates].reverse().find((candidate) => candidate.accepted) ??
  debugInfo.candidates.find((candidate) => candidate.source === "final") ??
  null;

const getOwnEndpointKeepoutCollisionStatus = (
  segment: RoutePathSegment,
  segmentIndex: number,
  lastSegmentIndex: number,
  obstacle: DebugObstacle,
  routeEdge: RouteEdge,
  endpointInfo: DebugEndpointInfo | null
): Pick<VirtualRouteCollision, "allowed" | "reason" | "category"> => {
  if (!endpointInfo) {
    return {
      allowed: false,
      reason: "endpoint info missing",
      category: "blocked",
    };
  }
  const isFromEndpoint = obstacle.sourceNodeId === routeEdge.fromNodeId;
  const isToEndpoint = obstacle.sourceNodeId === routeEdge.toNodeId;
  if (!isFromEndpoint && !isToEndpoint) {
    return {
      allowed: false,
      reason: "not selected edge endpoint keepout",
      category: "blocked",
    };
  }
  const endpoint = isFromEndpoint ? endpointInfo.from : endpointInfo.to;
  const side = isFromEndpoint ? endpointInfo.fromSide : endpointInfo.toSide;
  const relatedSegmentIndex = isFromEndpoint ? 0 : lastSegmentIndex;
  const awayPoint = isFromEndpoint ? segment.to : segment.from;
  const closestPoint = getClosestPointOnSegment(
    endpoint,
    segment.from,
    segment.to
  );
  if (
    segmentIndex === relatedSegmentIndex &&
    !segmentMatchesEndpointDirectionRule(endpoint, awayPoint, side, "nonReverse")
  ) {
    return {
      allowed: false,
      reason: "own keepout hit while leaving endpoint in reverse direction",
      category: "blocked",
    };
  }
  const vector = getSideVector(side);
  const dx = closestPoint.x - endpoint.x;
  const dy = closestPoint.y - endpoint.y;
  const projection = dx * vector.x + dy * vector.y;
  const orthogonalDistance =
    vector.x === 0
      ? Math.abs(closestPoint.x - endpoint.x)
      : Math.abs(closestPoint.y - endpoint.y);
  const corridorHalfWidth = portGap / 2 + routeClearance;
  const allowedDistance = routeNodeExitStubLength + routeClearance;
  if (projection < 0 || orthogonalDistance > corridorHalfWidth * 1.5) {
    return {
      allowed: false,
      reason: "own keepout hit outside endpoint corridor",
      category: "blocked",
    };
  }
  if (
    segmentIndex === relatedSegmentIndex &&
    projection <= allowedDistance &&
    orthogonalDistance <= corridorHalfWidth
  ) {
    return {
      allowed: true,
      reason: "allowed own endpoint keepout corridor",
      category: "allowed",
    };
  }
  if (projection <= allowedDistance * 1.75) {
    return {
      allowed: true,
      reason:
        segmentIndex === relatedSegmentIndex
          ? "suspicious own endpoint keepout corridor"
          : "suspicious own endpoint keepout near endpoint bend",
      category: "suspicious",
    };
  }
  return {
    allowed: false,
    reason: "own keepout corridor is too long",
    category: "blocked",
  };
};

const getRouteObstacleCollisions = (
  points: Point[],
  obstacles: DebugObstacle[],
  routeEdge: RouteEdge,
  endpointInfo: DebugEndpointInfo | null
) => {
  const compacted = compactPoints(points);
  const segments = getRouteSegmentsFromPoints(compacted);
  const collisions: VirtualRouteCollision[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < compacted.length - 1; index += 1) {
    const from = compacted[index];
    const to = compacted[index + 1];
    obstacles.forEach((obstacle) => {
      if (index === 0 && obstacle.rect.id === routeEdge.fromNodeId) return;
      if (
        index === compacted.length - 2 &&
        obstacle.rect.id === routeEdge.toNodeId
      ) {
        return;
      }
      if (segmentIntersectsRect(from, to, obstacle.rect)) {
        const segment = segments[index];
        const status =
          obstacle.kind === "ownEndpointKeepout" && segment
            ? getOwnEndpointKeepoutCollisionStatus(
                segment,
                index,
                segments.length - 1,
                obstacle,
                routeEdge,
                endpointInfo
              )
            : {
                allowed: false,
                reason: `${obstacle.kind} collision`,
                category: "blocked" as const,
              };
        const key = `${obstacle.kind}:${obstacle.id}:${index}:${status.category}`;
        if (seen.has(key)) return;
        seen.add(key);
        collisions.push({
          obstacle,
          segmentIndex: index,
          ...status,
        });
      }
    });
  }
  return collisions;
};

const pointToSegmentDistance = (point: Point, from: Point, to: Point) => {
  if (from.x === to.x) {
    const minY = Math.min(from.y, to.y);
    const maxY = Math.max(from.y, to.y);
    const clampedY = Math.max(minY, Math.min(maxY, point.y));
    return Math.hypot(point.x - from.x, point.y - clampedY);
  }
  if (from.y === to.y) {
    const minX = Math.min(from.x, to.x);
    const maxX = Math.max(from.x, to.x);
    const clampedX = Math.max(minX, Math.min(maxX, point.x));
    return Math.hypot(point.x - clampedX, point.y - from.y);
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared)
  );
  return Math.hypot(point.x - (from.x + dx * ratio), point.y - (from.y + dy * ratio));
};

const getClosestPointOnSegment = (
  point: Point,
  from: Point,
  to: Point
): Point => {
  if (from.x === to.x) {
    return {
      x: from.x,
      y: Math.max(Math.min(from.y, to.y), Math.min(Math.max(from.y, to.y), point.y)),
    };
  }
  if (from.y === to.y) {
    return {
      x: Math.max(Math.min(from.x, to.x), Math.min(Math.max(from.x, to.x), point.x)),
      y: from.y,
    };
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return from;
  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared)
  );
  return {
    x: from.x + dx * ratio,
    y: from.y + dy * ratio,
  };
};

const getPointDistanceToRoute = (point: Point, routePoints: Point[]) => {
  const segments = getRouteSegmentsFromPoints(routePoints);
  if (segments.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(
    ...segments.map((segment) =>
      pointToSegmentDistance(point, segment.from, segment.to)
    )
  );
};

const getRouteDistanceToRoute = (points: Point[], otherPoints: Point[]) => {
  const compacted = compactPoints(points);
  if (compacted.length === 0) return Number.POSITIVE_INFINITY;
  return Math.max(
    ...compacted.map((point) => getPointDistanceToRoute(point, otherPoints))
  );
};

const segmentCoveredBySearchGraph = (
  from: Point,
  to: Point,
  searchGraph: DebugSearchGraph | null,
  tolerance = 0.5
) => {
  if (!searchGraph) return false;
  if (from.x !== to.x && from.y !== to.y) return false;
  const horizontal = from.y === to.y;
  const targetLine = horizontal ? from.y : from.x;
  const min = horizontal ? Math.min(from.x, to.x) : Math.min(from.y, to.y);
  const max = horizontal ? Math.max(from.x, to.x) : Math.max(from.y, to.y);
  const intervals = searchGraph.edges
    .filter((edge) => {
      if (horizontal) {
        return edge.dir === "h" && Math.abs(edge.from.y - targetLine) <= tolerance;
      }
      return edge.dir === "v" && Math.abs(edge.from.x - targetLine) <= tolerance;
    })
    .map((edge) =>
      horizontal
        ? [Math.min(edge.from.x, edge.to.x), Math.max(edge.from.x, edge.to.x)]
        : [Math.min(edge.from.y, edge.to.y), Math.max(edge.from.y, edge.to.y)]
    )
    .filter(([start, end]) => end >= min - tolerance && start <= max + tolerance)
    .sort((a, b) => a[0] - b[0]);

  let coveredTo = min;
  for (const [start, end] of intervals) {
    if (start > coveredTo + tolerance) return false;
    coveredTo = Math.max(coveredTo, end);
    if (coveredTo >= max - tolerance) return true;
  }
  return coveredTo >= max - tolerance;
};

const getVirtualRouteGraphMissingSegments = (
  points: Point[],
  searchGraph: DebugSearchGraph | null
) =>
  !searchGraph
    ? []
    : getRouteSegmentsFromPoints(points).flatMap((segment) => {
        if (segment.from.x !== segment.to.x && segment.from.y !== segment.to.y) {
          return [
            { from: segment.from, to: segment.to, reason: "not orthogonal" },
          ];
        }
        if (!segmentCoveredBySearchGraph(segment.from, segment.to, searchGraph)) {
          return [
            {
              from: segment.from,
              to: segment.to,
              reason: "not covered by search graph",
            },
          ];
        }
        return [];
      });

const getVirtualRouteOutsideBoundsReasons = (
  points: Point[],
  bounds?: DebugSearchGraph["bounds"]
) => {
  if (!bounds) return [];
  return compactPoints(points).flatMap((point, index) =>
    point.x < bounds.minX ||
    point.x > bounds.maxX ||
    point.y < bounds.minY ||
    point.y > bounds.maxY
      ? [`waypoint ${index + 1} が searchBounds の外です`]
      : []
  );
};

const getVirtualRouteEndpointViolationPoints = (
  endpointInfo: DebugEndpointInfo | null,
  failures: string[]
) => {
  if (!endpointInfo) return [];
  const points: Point[] = [];
  if (failures.some((failure) => failure.includes("from endpoint"))) {
    points.push(endpointInfo.from);
  }
  if (failures.some((failure) => failure.includes("to endpoint"))) {
    points.push(endpointInfo.to);
  }
  if (points.length === 0 && failures.length > 0) {
    points.push(endpointInfo.from, endpointInfo.to);
  }
  return points;
};

const getVirtualRouteSearchGraphValueGaps = (
  points: Point[],
  searchGraph: DebugSearchGraph | null
) => {
  if (!searchGraph) return { missingXValues: [], missingYValues: [] };
  const graphXs = new Set(searchGraph.points.map((point) => point.x));
  const graphYs = new Set(searchGraph.points.map((point) => point.y));
  const missingXValues = new Set<number>();
  const missingYValues = new Set<number>();
  getRouteSegmentsFromPoints(points).forEach((segment) => {
    if (segment.from.x === segment.to.x && !graphXs.has(segment.from.x)) {
      missingXValues.add(segment.from.x);
    }
    if (segment.from.y === segment.to.y && !graphYs.has(segment.from.y)) {
      missingYValues.add(segment.from.y);
    }
  });
  compactPoints(points).forEach((point) => {
    if (!graphXs.has(point.x)) missingXValues.add(point.x);
    if (!graphYs.has(point.y)) missingYValues.add(point.y);
  });
  return {
    missingXValues: [...missingXValues].sort((a, b) => a - b),
    missingYValues: [...missingYValues].sort((a, b) => a - b),
  };
};

const getCandidateAnalysisForVirtualRoute = (
  debugResult: RoutingDebugResult,
  compactedVirtual: Point[]
): VirtualRouteDiagnosis["candidateAnalysis"] => {
  const candidates = debugResult.candidates.filter(
    (candidate) => candidate.source !== "final"
  );
  const candidateSourcesPresent = [...new Set(candidates.map((candidate) => candidate.source))];
  const distances = candidates.map((candidate) => ({
    source: candidate.source,
    distance: getRouteDistanceToRoute(compactedVirtual, candidate.points),
    candidate,
  }));
  const nearest = distances.reduce<
    { source: string; distance: number; candidate: DebugRouteCandidate } | null
  >(
    (best, current) =>
      !best || current.distance < best.distance
        ? {
            source: current.source,
            distance: current.distance,
            candidate: current.candidate,
          }
        : best,
    null
  );
  return {
    nearestCandidateSource: nearest?.source,
    nearestCandidateDistance: nearest?.distance,
    candidateSourcesPresent,
    candidateSourcesRejected: candidates
      .filter((candidate) => !candidate.accepted)
      .map((candidate) => ({
        source: candidate.source,
        reasons: candidate.rejectionReasons,
        score: candidate.score,
      })),
    virtualMatchesExistingCandidate:
      nearest != null && nearest.distance <= layoutGridSize * 2,
  };
};

const diagnoseVirtualRoute = (
  debugResult: RoutingDebugResult,
  virtualRoutePoints: Point[]
): VirtualRouteDiagnosis => {
  const hardObstacles = debugResult.obstacles.filter(
    (obstacle) =>
      obstacle.kind === "node" ||
      obstacle.kind === "label"
  );
  const softObstacles = debugResult.obstacles.filter(
    (obstacle) => obstacle.kind === "softRoute"
  );
  const trackObstacles = debugResult.obstacles.filter(
    (obstacle) => obstacle.kind === "trackOverlap"
  );
  const routeEdge = debugResult.routeEdge;
  const hardRects = hardObstacles.map((obstacle) => obstacle.rect);
  const softRects = softObstacles.map((obstacle) => obstacle.rect);
  const trackRects = trackObstacles.map((obstacle) => obstacle.rect);
  const endpointFailures = debugResult.endpointInfo
    ? getRouteEndpointDirectionFailures(
        virtualRoutePoints,
        debugResult.endpointInfo.from,
        debugResult.endpointInfo.fromSide,
        debugResult.endpointInfo.to,
        debugResult.endpointInfo.toSide,
        debugResult.endpointInfo.fromRule,
        debugResult.endpointInfo.toRule
      )
    : [];
  const collidedObstacleDetails = getRouteObstacleCollisions(
    virtualRoutePoints,
    debugResult.obstacles.filter((obstacle) => obstacle.kind !== "searchBounds"),
    routeEdge,
    debugResult.endpointInfo
  );
  const collidedObstacles = [
    ...new Map(
      collidedObstacleDetails.map((detail) => [
        `${detail.obstacle.kind}:${detail.obstacle.id}`,
        detail.obstacle,
      ])
    ).values(),
  ];
  const nodeCollisions = collidedObstacleDetails.filter(
    (detail) => detail.obstacle.kind === "node"
  );
  const labelCollisions = collidedObstacleDetails.filter(
    (detail) => detail.obstacle.kind === "label"
  );
  const foreignKeepoutCollisions = collidedObstacleDetails.filter(
    (detail) => detail.obstacle.kind === "foreignPortKeepout"
  );
  const ownEndpointKeepoutCollisions = collidedObstacleDetails.filter(
    (detail) => detail.obstacle.kind === "ownEndpointKeepout"
  );
  const allowedOwnEndpointKeepoutCollisions =
    ownEndpointKeepoutCollisions.filter(
      (detail) => detail.category === "allowed"
    );
  const suspiciousOwnEndpointKeepoutCollisions =
    ownEndpointKeepoutCollisions.filter(
      (detail) => detail.category === "suspicious"
    );
  const blockedOwnEndpointKeepoutCollisions =
    ownEndpointKeepoutCollisions.filter(
      (detail) => detail.category === "blocked"
    );
  const softCollisions = collidedObstacleDetails.filter(
    (detail) => detail.obstacle.kind === "softRoute"
  );
  const trackCollisions = collidedObstacleDetails.filter(
    (detail) => detail.obstacle.kind === "trackOverlap"
  );
  const scoreBreakdown = scoreRouteCandidateBreakdown(
    virtualRoutePoints,
    hardRects,
    routeEdge.fromNodeId,
    routeEdge.toNodeId,
    softRects,
    trackRects
  );
  const acceptedCandidate = getAcceptedRoutingDebugCandidate(debugResult);
  const currentScoreBreakdown =
    acceptedCandidate?.scoreBreakdown ??
    scoreRouteCandidateBreakdown(
      debugResult.routePoints,
      hardRects,
      routeEdge.fromNodeId,
      routeEdge.toNodeId,
      softRects,
      trackRects
    );
  const compactedVirtual = compactPoints(virtualRoutePoints);
  const hasSearchGraph = Boolean(debugResult.searchGraph?.edges.length);
  const graphMissingSegments = hasSearchGraph
    ? getVirtualRouteGraphMissingSegments(
        virtualRoutePoints,
        debugResult.searchGraph
      )
    : [];
  const { missingXValues, missingYValues } =
    getVirtualRouteSearchGraphValueGaps(
      virtualRoutePoints,
      debugResult.searchGraph
    );
  const outsideBoundsReasons = getVirtualRouteOutsideBoundsReasons(
    virtualRoutePoints,
    debugResult.searchGraph?.bounds
  );
  const virtualInsideSearchBounds = outsideBoundsReasons.length === 0;
  const notOrthogonal = getRouteSegmentsFromPoints(compactedVirtual).some(
    (segment) =>
      segment.from.x !== segment.to.x && segment.from.y !== segment.to.y
  );
  const candidateAnalysis = getCandidateAnalysisForVirtualRoute(
    debugResult,
    compactedVirtual
  );
  const nearestCandidateDistance =
    candidateAnalysis.nearestCandidateDistance ?? Number.POSITIVE_INFINITY;
  const candidateIsFar =
    !Number.isFinite(nearestCandidateDistance) ||
    nearestCandidateDistance > layoutGridSize * 4;
  const candidateNotGenerated =
    !candidateAnalysis.virtualMatchesExistingCandidate;
  const hardCollisionCount = nodeCollisions.length + labelCollisions.length;
  const blockedConnectionPairs = debugResult.connectionMatrix.filter(
    (row) => row.scope === "routeSection" && !row.ok
  );
  const scoreWithoutPreviousGeometry = scoreRouteCandidateBreakdown(
    virtualRoutePoints,
    hardRects,
    routeEdge.fromNodeId,
    routeEdge.toNodeId,
    [],
    []
  );
  const currentScoreTotal = currentScoreBreakdown?.total ?? 0;
  const virtualWouldWinIfCandidate =
    hardCollisionCount === 0 && scoreBreakdown.total < currentScoreTotal;
  const virtualWouldWinWithoutPreviousGeometry =
    hardCollisionCount === 0 &&
    scoreWithoutPreviousGeometry.total < currentScoreTotal;
  const previousPenaltyByRouteEdgeId = new Map<string, number>();
  [...softCollisions, ...trackCollisions].forEach((detail) => {
    const routeEdgeId = detail.obstacle.sourceRouteEdgeId;
    if (!routeEdgeId) return;
    previousPenaltyByRouteEdgeId.set(
      routeEdgeId,
      (previousPenaltyByRouteEdgeId.get(routeEdgeId) ?? 0) + 1
    );
  });
  const blockingPreviousRouteEdgeIds = [
    ...previousPenaltyByRouteEdgeId.keys(),
  ];
  const relationToPreviousEdges =
    debugResult.orderingAnalysis.relationToPreviousEdges.map((relation) => {
      const penaltyContribution =
        previousPenaltyByRouteEdgeId.get(relation.routeEdgeId) ?? 0;
      return {
        ...relation,
        causedPenalty: penaltyContribution > 0,
        penaltyContribution,
      };
    });
  const blockedByEarlierGeometry = blockingPreviousRouteEdgeIds.length > 0;
  const routeOrderSensitive =
    blockedByEarlierGeometry &&
    (virtualWouldWinIfCandidate || virtualWouldWinWithoutPreviousGeometry);
  const sameCorridorPreviousRouteEdgeIds = new Set(
    relationToPreviousEdges
      .filter((relation) => relation.relation === "sameCorridor")
      .map((relation) => relation.routeEdgeId)
  );
  const isSameCorridorPreviousObstacle = (rect: ObstacleRect) => {
    const sourceRouteEdgeId = (rect as SourceObstacleRect).sourceRouteEdgeId;
    return sourceRouteEdgeId
      ? sameCorridorPreviousRouteEdgeIds.has(sourceRouteEdgeId)
      : false;
  };
  const scoreAsSameCorridorGroup = scoreRouteCandidateBreakdown(
    virtualRoutePoints,
    hardRects,
    routeEdge.fromNodeId,
    routeEdge.toNodeId,
    softRects.filter((rect) => !isSameCorridorPreviousObstacle(rect)),
    trackRects.filter((rect) => !isSameCorridorPreviousObstacle(rect))
  );
  const sameCorridorGroupWouldWin =
    hardCollisionCount === 0 &&
    scoreAsSameCorridorGroup.total < currentScoreTotal;

  const blockingReasons: string[] = [];
  const missingRequirements: string[] = [];
  const secondaryNotes: string[] = [];
  if (nodeCollisions.length > 0) {
    blockingReasons.push(`node collision: ${nodeCollisions.length}`);
    missingRequirements.push("この仮想ルートは node body を避ける必要があります。");
  }
  if (labelCollisions.length > 0) {
    blockingReasons.push(`label collision: ${labelCollisions.length}`);
    missingRequirements.push("この仮想ルートは node label を避ける必要があります。");
  }
  if (foreignKeepoutCollisions.length > 0) {
    secondaryNotes.push(
      `foreignPortKeepout は参考表示のみでhard blockから除外: ${foreignKeepoutCollisions.length}`
    );
  }
  if (blockedOwnEndpointKeepoutCollisions.length > 0) {
    secondaryNotes.push(
      `ownEndpointKeepout は出口 corridor 外だが、自分の端点側 keepout のためhard blockから除外: ${blockedOwnEndpointKeepoutCollisions.length}`
    );
  }
  if (allowedOwnEndpointKeepoutCollisions.length > 0) {
    secondaryNotes.push(
      `ownEndpointKeepout は出口 corridor 内のため許容: ${allowedOwnEndpointKeepoutCollisions.length}`
    );
  }
  if (suspiciousOwnEndpointKeepoutCollisions.length > 0) {
    secondaryNotes.push(
      `ownEndpointKeepout は長めの出口 corridor として許容: ${suspiciousOwnEndpointKeepoutCollisions.length}`
    );
  }
  if (endpointFailures.length > 0) {
    blockingReasons.push(...endpointFailures);
    missingRequirements.push("endpoint direction rule に従う始端・終端の曲げ方が必要です。");
  }
  if (blockedConnectionPairs.length > 0) {
    blockingReasons.push(
      `connection traversal blocked: ${blockedConnectionPairs.length}`
    );
    missingRequirements.push("connection ノードの通過可能な entry / exit の組にする必要があります。");
  }
  if (outsideBoundsReasons.length > 0) {
    blockingReasons.push(...outsideBoundsReasons);
    missingRequirements.push("searchBounds を広げるか、探索候補に外側レーンを追加する必要があります。");
  }
  if (notOrthogonal) {
    blockingReasons.push("仮想ルートに直交していない線分があります。");
    missingRequirements.push("自動ルーティング候補は直交線分として表現する必要があります。");
  }
  if (graphMissingSegments.length > 0) {
    missingRequirements.push("この中間ラインは探索グラフの x/y 候補に含まれていません。");
    missingRequirements.push("このルートを候補にするには waypoint 候補を追加する必要があります。");
  } else if (!hasSearchGraph && candidateNotGenerated) {
    missingRequirements.push("採用ルートが早期 return されたため探索グラフが生成されていません。");
    missingRequirements.push("このルートを候補にするには waypoint 候補を追加する必要があります。");
  }
  if (candidateNotGenerated) {
    missingRequirements.push(
      candidateIsFar
        ? "既存候補 direct/sideAware/outer/searched のどれにも近くありません。"
        : "既存候補とは近いものの、同一候補として扱われていません。"
    );
  }
  if (softCollisions.length > 0) {
    secondaryNotes.push(`soft route obstacle overlap: ${softCollisions.length}`);
    missingRequirements.push("routeEdges の処理順により、前に生成された線が soft obstacle になっています。");
  }
  if (trackCollisions.length > 0) {
    secondaryNotes.push(`track overlap obstacle overlap: ${trackCollisions.length}`);
    missingRequirements.push("同束線路との重なりペナルティで現在の採点では不利になる可能性があります。");
  }
  if (debugResult.endpointInfo?.requiresLaneRoute) {
    missingRequirements.push("requiresLaneRoute のため、単純な clear route ではなくレーン付き候補として扱われます。");
  }
  if (scoreBreakdown.total > (currentScoreBreakdown?.total ?? 0)) {
    missingRequirements.push("このルートは現在の採点では採用中ルートより総合点が高く、不利です。");
  }
  const manualRouteRequired =
    candidateNotGenerated || graphMissingSegments.length > 0;
  if (manualRouteRequired) {
    secondaryNotes.push(
      "このルートを固定するには manualRoutePoints または waypoints を routeEdge に保存する設計が必要です。"
    );
  }

  const relationType = debugResult.relationAnalysis.relationType;
  const endpointCorridorType: CorridorAnalysis["endpointCorridorType"] =
    relationType === "fanOut" ||
    relationType === "fanIn" ||
    relationType === "sharedEndpointSide"
      ? "sharedThroat"
      : ownEndpointKeepoutCollisions.length > 1
      ? "sideBand"
      : ownEndpointKeepoutCollisions.length === 1
      ? "singlePort"
      : "none";
  const corridorTooNarrow =
    ownEndpointKeepoutCollisions.length > 0 &&
    hardCollisionCount === 0 &&
    foreignKeepoutCollisions.length === 0 &&
    (candidateNotGenerated || routeOrderSensitive);
  const nodeBacksideRisk = blockedOwnEndpointKeepoutCollisions.length > 0;
  const corridorAnalysis: CorridorAnalysis = {
    endpointCorridorType,
    ownEndpointKeepoutAllowedCount:
      allowedOwnEndpointKeepoutCollisions.length +
      suspiciousOwnEndpointKeepoutCollisions.length,
    ownEndpointKeepoutBlockedCount:
      blockedOwnEndpointKeepoutCollisions.length,
    foreignKeepoutBlockedCount: 0,
    nodeBacksideRisk,
    corridorTooNarrow,
  };
  const candidateGenerationAnalysis: CandidateGenerationAnalysis = {
    candidateGenerationGap: candidateNotGenerated,
    searchGraphMissingLine: graphMissingSegments.length > 0,
    virtualWouldWinIfCandidate,
    virtualWouldWinWithoutPreviousGeometry,
    scoreWithPreviousGeometry: scoreBreakdown.total,
    scoreWithoutPreviousGeometry: scoreWithoutPreviousGeometry.total,
    sameCorridorGroupScore: scoreAsSameCorridorGroup.total,
    selectedFirstWouldWin: virtualWouldWinWithoutPreviousGeometry,
    sameCorridorGroupWouldWin,
    missingXValues,
    missingYValues,
  };
  const routeOrderingAnalysis: RouteOrderingAnalysis = {
    ...debugResult.orderingAnalysis,
    relationToPreviousEdges,
    blockingPreviousRouteEdgeIds,
    blockedByEarlierGeometry,
    routeOrderSensitive,
  };

  const primaryCause: RoutingFailurePrimaryCause =
    nodeCollisions.length > 0
      ? "blockedByNode"
      : labelCollisions.length > 0
      ? "blockedByLabel"
      : endpointFailures.length > 0
      ? "blockedByEndpointDirection"
      : blockedConnectionPairs.length > 0
      ? "blockedByConnectionTraversal"
      : outsideBoundsReasons.length > 0
      ? "outsideSearchBounds"
      : graphMissingSegments.length > 0
      ? "searchGraphMissingLine"
      : candidateNotGenerated
      ? "candidateGenerationGap"
      : scoreBreakdown.total > (currentScoreBreakdown?.total ?? 0)
      ? "worseScore"
      : trackCollisions.length > 0
      ? "trackOverlapPenalty"
      : softCollisions.length > 0
      ? "softObstaclePenalty"
      : manualRouteRequired
      ? "manualRouteRequired"
      : "none";

  const feasibility: VirtualRouteFeasibility =
    hardCollisionCount > 0 ||
    endpointFailures.length > 0 ||
    blockedConnectionPairs.length > 0 ||
    outsideBoundsReasons.length > 0 ||
    notOrthogonal
      ? "blocked"
      : graphMissingSegments.length > 0 || candidateNotGenerated
      ? "candidateGenerationGap"
      : scoreBreakdown.total > (currentScoreBreakdown?.total ?? 0)
      ? "worseScore"
      : "possible";

  const rejectedReasons = [
    ...blockingReasons,
    ...(graphMissingSegments.length > 0
      ? [`search graph missing segments: ${graphMissingSegments.length}`]
      : []),
    ...(candidateNotGenerated ? ["既存候補として生成されていません"] : []),
    ...(scoreBreakdown.total > (currentScoreBreakdown?.total ?? 0)
      ? ["現在採用ルートよりスコアが悪い"]
      : []),
  ];
  const tags = [
    feasibility === "blocked" ? "blocked" : null,
    feasibility === "candidateGenerationGap" ? "candidateGenerationGap" : null,
    feasibility === "worseScore" ? "worseScore" : null,
    ownEndpointKeepoutCollisions.length > 0 ? "ownEndpointKeepout" : null,
    foreignKeepoutCollisions.length > 0 ? "foreignPortKeepout" : null,
    nodeCollisions.length > 0 ? "nodeCollision" : null,
    labelCollisions.length > 0 ? "labelCollision" : null,
    endpointFailures.length > 0 ? "endpointDirection" : null,
    blockedConnectionPairs.length > 0 ? "connectionTraversal" : null,
    graphMissingSegments.length > 0 ? "searchGraphMissingLine" : null,
    outsideBoundsReasons.length > 0 ? "outsideSearchBounds" : null,
    trackCollisions.length > 0 ? "trackOverlap" : null,
    softCollisions.length > 0 ? "softObstacle" : null,
    manualRouteRequired ? "manualRouteNeeded" : null,
    routeOrderSensitive ? "routeOrderSensitive" : null,
    blockedByEarlierGeometry ? "blockedByEarlierGeometry" : null,
    relationType === "sameCorridor" ? "sameCorridor" : null,
    relationType === "fanOut" ? "fanOut" : null,
    relationType === "fanIn" ? "fanIn" : null,
    relationType === "sharedEndpointSide" ? "sharedEndpointSide" : null,
    corridorTooNarrow ? "corridorTooNarrow" : null,
    virtualWouldWinIfCandidate ? "virtualWouldWinIfCandidate" : null,
    virtualWouldWinWithoutPreviousGeometry
      ? "virtualWouldWinWithoutPreviousGeometry"
      : null,
    sameCorridorGroupWouldWin ? "sameCorridorGroupWouldWin" : null,
    allowedOwnEndpointKeepoutCollisions.length +
      suspiciousOwnEndpointKeepoutCollisions.length >
    0
      ? "ownEndpointKeepoutAllowed"
      : null,
    blockedOwnEndpointKeepoutCollisions.length > 0
      ? "ownEndpointKeepoutBlocked"
      : null,
    scoreBreakdown.total < (currentScoreBreakdown?.total ?? 0)
      ? "virtualBetterScore"
      : null,
    getRouteLength(compactedVirtual) < getRouteLength(debugResult.routePoints)
      ? "virtualShorter"
      : getRouteLength(compactedVirtual) === getRouteLength(debugResult.routePoints)
      ? "sameLength"
      : null,
    getBendCount(compactedVirtual) > getBendCount(debugResult.routePoints)
      ? "moreBends"
      : getBendCount(compactedVirtual) < getBendCount(debugResult.routePoints)
      ? "fewerBends"
      : null,
  ].filter((tag): tag is string => Boolean(tag));

  return {
    feasibility,
    primaryCause,
    blockingReasons: [...new Set(blockingReasons)],
    missingRequirements: [...new Set(missingRequirements)],
    secondaryNotes: [...new Set(secondaryNotes)],
    collidedObstacles,
    collidedObstacleDetails,
    allowedOwnEndpointKeepoutCollisions,
    suspiciousOwnEndpointKeepoutCollisions,
    blockedOwnEndpointKeepoutCollisions,
    scoreBreakdown,
    endpointDirectionResult: {
      ok: endpointFailures.length === 0,
      reasons: endpointFailures,
    },
    currentScoreBreakdown,
    currentLength: getRouteLength(debugResult.routePoints),
    virtualLength: getRouteLength(compactedVirtual),
    currentBendCount: getBendCount(debugResult.routePoints),
    virtualBendCount: getBendCount(compactedVirtual),
    currentSelectedBy: debugResult.selectedBy,
    virtualCollisionCount: hardCollisionCount,
    rejectedReasons: [...new Set(rejectedReasons)],
    graphMissingSegments,
    missingXValues,
    missingYValues,
    virtualInsideSearchBounds,
    endpointViolationPoints: getVirtualRouteEndpointViolationPoints(
      debugResult.endpointInfo,
      endpointFailures
    ),
    candidateAnalysis,
    collisionCounts: {
      hardCollisionCount,
      nodeCollisionCount: nodeCollisions.length,
      labelCollisionCount: labelCollisions.length,
      ownEndpointKeepoutCollisionCount: ownEndpointKeepoutCollisions.length,
      allowedOwnEndpointKeepoutCollisionCount:
        allowedOwnEndpointKeepoutCollisions.length,
      suspiciousOwnEndpointKeepoutCollisionCount:
        suspiciousOwnEndpointKeepoutCollisions.length,
      blockedOwnEndpointKeepoutCollisionCount:
        blockedOwnEndpointKeepoutCollisions.length,
      foreignPortKeepoutCollisionCount: foreignKeepoutCollisions.length,
      softRouteCollisionScore: scoreBreakdown.softObstacleScore,
      trackOverlapScore: scoreBreakdown.trackOverlapScore,
    },
    routeOrderingAnalysis,
    routeEdgeRelationAnalysis: debugResult.relationAnalysis,
    corridorAnalysis,
    candidateGenerationAnalysis,
    tags: [...new Set(tags)],
  };
};

const getPrimaryCauseRelatedReasons = (diagnosis: VirtualRouteDiagnosis) => {
  const patternsByCause: Partial<Record<RoutingFailurePrimaryCause, string[]>> = {
    blockedByNode: ["node collision"],
    blockedByLabel: ["label collision"],
    blockedByForeignKeepout: ["foreignPortKeepout"],
    blockedByOwnEndpointKeepout: ["ownEndpointKeepout"],
    blockedByEndpointDirection: ["endpoint"],
    blockedByConnectionTraversal: ["connection traversal"],
    outsideSearchBounds: ["searchBounds"],
    searchGraphMissingLine: ["search graph", "直交していない"],
    trackOverlapPenalty: ["track overlap"],
    softObstaclePenalty: ["soft route"],
  };
  const patterns = patternsByCause[diagnosis.primaryCause] ?? [];
  if (patterns.length === 0) return diagnosis.blockingReasons;
  const matched = diagnosis.blockingReasons.filter((reason) =>
    patterns.some((pattern) => reason.includes(pattern))
  );
  return matched.length > 0 ? matched : diagnosis.blockingReasons;
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
    ? ["top", "right", "bottom", "left"].filter(
        (side): side is RoutePortSide =>
          getPortCountForSide(routeNode, side as RoutePortSide) > 0
      )
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

const getStablePortLaneRank = (
  routeNode: RouteNode,
  side: RoutePortSide,
  index: number
) => {
  const count = getPortCountForSide(routeNode, side);
  if (count <= 1) return 0;
  return getVisualPortIndex(routeNode, side, index);
};

const getIndexedSideLane = (
  routeNode: RouteNode,
  side: RoutePortSide,
  index: number,
  offset = routeClearance + routeStubLength
) => {
  const rect = getNodeRect(routeNode);
  const baseLane = getSideLane(rect, side, offset);
  const direction = side === "left" || side === "top" ? -1 : 1;
  const rank = getStablePortLaneRank(routeNode, side, index);

  return baseLane + direction * rank * routeLaneStep;
};

const getSharedSameSideLane = (
  fromNode: RouteNode,
  toNode: RouteNode,
  side: RoutePortSide,
  fromPortIndex: number,
  toPortIndex: number,
  laneRankOverride?: number,
  offset = routeClearance + routeStubLength
) => {
  const fromRect = getNodeRect(fromNode);
  const toRect = getNodeRect(toNode);
  const direction = side === "left" || side === "top" ? -1 : 1;
  const fromBaseLane = getSideLane(fromRect, side, offset);
  const toBaseLane = getSideLane(toRect, side, offset);
  const baseLane =
    direction > 0
      ? Math.max(fromBaseLane, toBaseLane)
      : Math.min(fromBaseLane, toBaseLane);
  const rank =
    laneRankOverride ??
    Math.max(
      getStablePortLaneRank(fromNode, side, fromPortIndex),
      getStablePortLaneRank(toNode, side, toPortIndex)
  );
  return baseLane + direction * rank * routeLaneStep;
};

const getRouteEdgeSameSideLaneGroupKey = (
  routeEdge: State["routeEdges"][number]
) =>
  routeEdge.fromPortSide === routeEdge.toPortSide
    ? getRouteEdgeBundleKey(routeEdge)
    : null;

const getRouteEdgeSameSideLaneSortKey = (
  routeEdge: State["routeEdges"][number],
  routeNodeById: Map<string, RouteNode>
) => {
  const fromNode = routeNodeById.get(routeEdge.fromNodeId);
  const toNode = routeNodeById.get(routeEdge.toNodeId);
  const endpoints = [
    {
      key: getRouteEdgeBundleEndpointKey(
        routeEdge.fromNodeId,
        routeEdge.fromPortSide
      ),
      rank: fromNode
        ? getStablePortLaneRank(
            fromNode,
            routeEdge.fromPortSide,
            routeEdge.fromPortIndex
          )
        : routeEdge.fromPortIndex,
    },
    {
      key: getRouteEdgeBundleEndpointKey(
        routeEdge.toNodeId,
        routeEdge.toPortSide
      ),
      rank: toNode
        ? getStablePortLaneRank(
            toNode,
            routeEdge.toPortSide,
            routeEdge.toPortIndex
          )
        : routeEdge.toPortIndex,
    },
  ].sort((a, b) => a.key.localeCompare(b.key));

  return `${endpoints[0].key}:${endpoints[0].rank}|${endpoints[1].key}:${endpoints[1].rank}|${routeEdge.id}`;
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
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  debugCollector?: RoutingDebugCollector,
  guidePoints: Point[] = []
) => {
  const xValues = new Set<number>([start.x, end.x, bounds.minX, bounds.maxX]);
  const yValues = new Set<number>([start.y, end.y, bounds.minY, bounds.maxY]);

  guidePoints.forEach((point) => {
    xValues.add(point.x);
    yValues.add(point.y);
  });

  obstacles.forEach((rect) => {
    [
      rect.x - layoutGridSize,
      rect.x,
      rect.x + rect.width,
      rect.x + rect.width + layoutGridSize,
    ].forEach((x) => {
      if (x >= bounds.minX && x <= bounds.maxX) xValues.add(x);
    });
    [
      rect.y - layoutGridSize,
      rect.y,
      rect.y + rect.height,
      rect.y + rect.height + layoutGridSize,
    ].forEach((y) => {
      if (y >= bounds.minY && y <= bounds.maxY) yValues.add(y);
    });
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
  const debugGraphEdges: DebugSearchGraph["edges"] = [];

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
      if (debugCollector) {
        debugGraphEdges.push({ from, to, cost, dir: "v" });
      }
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
      if (debugCollector) {
        debugGraphEdges.push({ from, to, cost, dir: "h" });
      }
    }
  });

  const startIndex = pointIndex.get(`${start.x}:${start.y}`);
  const endIndex = pointIndex.get(`${end.x}:${end.y}`);
  const emitSearchGraph = (
    finalPath: Point[] | null,
    visited: DebugSearchGraph["visited"],
    bestCost: Map<string, number>,
    previous: Map<
      string,
      { key: string; index: number; dir: "start" | "h" | "v" }
    >
  ) => {
    debugCollector?.setSearchGraph({
      points,
      edges: debugGraphEdges,
      visited,
      finalPath,
      bounds,
      bestCost: [...bestCost.entries()].map(([key, cost]) => ({ key, cost })),
      previous: [...previous.entries()].map(([key, value]) => ({
        key,
        previousKey: value.key,
        index: value.index,
      })),
    });
  };

  if (startIndex == null || endIndex == null) {
    emitSearchGraph(null, [], new Map(), new Map());
    return null;
  }

  type SearchState = { index: number; dir: "start" | "h" | "v"; cost: number };
  const queue: SearchState[] = [{ index: startIndex, dir: "start", cost: 0 }];
  const bestCost = new Map<string, number>([[`${startIndex}:start`, 0]]);
  const previous = new Map<
    string,
    { key: string; index: number; dir: "start" | "h" | "v" }
  >();
  const visited: DebugSearchGraph["visited"] = [];

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (!current) break;
    const currentKey = `${current.index}:${current.dir}`;
    if (current.cost !== bestCost.get(currentKey)) continue;
    if (debugCollector) {
      visited.push({
        point: points[current.index],
        dir: current.dir,
        cost: current.cost,
      });
    }
    if (current.index === endIndex) {
      const path = [points[endIndex]];
      let traceKey = currentKey;
      while (previous.has(traceKey)) {
        const prev = previous.get(traceKey);
        if (!prev) break;
        path.push(points[prev.index]);
        traceKey = prev.key;
      }
      const finalPath = compactPoints(path.reverse());
      emitSearchGraph(finalPath, visited, bestCost, previous);
      return finalPath;
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

  emitSearchGraph(null, visited, bestCost, previous);
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

const getRouteSegmentsFromPoints = (points: Point[]): RoutePathSegment[] => {
  const compacted = compactPoints(points);
  return compacted.flatMap((from, index) => {
    const to = compacted[index + 1];
    if (!to) return [];
    const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    return length > 0 ? [{ from, to, length }] : [];
  });
};

const getRouteSoftObstacleScore = (
  points: Point[],
  softObstacles: ObstacleRect[]
) => {
  if (softObstacles.length === 0) return 0;
  return getRouteSegmentsFromPoints(points).reduce(
    (score, segment) =>
      score +
      softObstacles.reduce(
        (segmentScore, obstacle) =>
          segmentScore +
          (segmentIntersectsRect(segment.from, segment.to, obstacle)
            ? Math.max(
                1,
                Math.min(segment.length, obstacle.width + obstacle.height)
              )
            : 0),
        0
      ),
    0
  );
};

const segmentCrossesRouteSegment = (
  segment: RoutePathSegment,
  otherSegment: RoutePathSegment,
  tolerance = 1
) => {
  const horizontal = segment.from.y === segment.to.y;
  const vertical = segment.from.x === segment.to.x;
  const otherHorizontal = otherSegment.from.y === otherSegment.to.y;
  const otherVertical = otherSegment.from.x === otherSegment.to.x;
  if (!((horizontal && otherVertical) || (vertical && otherHorizontal))) {
    return false;
  }
  const h = horizontal ? segment : otherSegment;
  const v = vertical ? segment : otherSegment;
  const hMinX = Math.min(h.from.x, h.to.x);
  const hMaxX = Math.max(h.from.x, h.to.x);
  const vMinY = Math.min(v.from.y, v.to.y);
  const vMaxY = Math.max(v.from.y, v.to.y);
  return (
    v.from.x > hMinX + tolerance &&
    v.from.x < hMaxX - tolerance &&
    h.from.y > vMinY + tolerance &&
    h.from.y < vMaxY - tolerance
  );
};

const getRouteCrossingCount = (
  points: Point[],
  crossingSegments: RoutePathSegment[]
) => {
  if (crossingSegments.length === 0) return 0;
  return getRouteSegmentsFromPoints(points).reduce(
    (count, segment) =>
      count +
      crossingSegments.reduce(
        (segmentCount, otherSegment) =>
          segmentCount +
          (segmentCrossesRouteSegment(segment, otherSegment) ? 1 : 0),
        0
      ),
    0
  );
};

const getRouteLength = (points: Point[]) =>
  compactPoints(points).reduce((total, point, index, points) => {
    const previous = points[index - 1];
    if (!previous) return total;
    return (
      total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
    );
  }, 0);

const getRouteManhattanDistance = (from: Point, to: Point) =>
  Math.abs(to.x - from.x) + Math.abs(to.y - from.y);

const getRouteExcessLength = (points: Point[]) => {
  const compacted = compactPoints(points);
  const first = compacted[0];
  const last = compacted[compacted.length - 1];
  if (!first || !last) return 0;
  return Math.max(
    0,
    getRouteLength(compacted) - getRouteManhattanDistance(first, last)
  );
};

const getRouteDetourScore = (points: Point[]) => {
  const excess = getRouteExcessLength(points);
  return Math.min(750_000, excess * 160);
};

const isReasonableRouteDetour = (points: Point[]) => {
  const compacted = compactPoints(points);
  const first = compacted[0];
  const last = compacted[compacted.length - 1];
  if (!first || !last) return true;
  const directDistance = getRouteManhattanDistance(first, last);
  const excess = getRouteExcessLength(compacted);
  return excess <= Math.max(routeClearance * 8, directDistance * 1.2);
};

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

const getPlatformLabelObstacleRects = (
  routeNode: RouteNode,
  padding = 4
): ObstacleRect[] => {
  if (routeNode.type === "connection") return [];
  return getRouteNodePortRefs(routeNode).map((portRef) => {
    const port = getPortPosition(routeNode, portRef.side, portRef.index);
    const platformLabel =
      routeNode.type === "crossing" &&
      (portRef.side === "top" || portRef.side === "bottom")
        ? getVerticalPlatformLabel(routeNode, portRef.index)
        : getPlatformLabel(routeNode, portRef.index);
    const labelX =
      portRef.side === "left"
        ? port.x - 16
        : portRef.side === "right"
        ? port.x + 16
        : port.x;
    const labelY =
      portRef.side === "top"
        ? port.y - 12
        : portRef.side === "bottom"
        ? port.y + 24
        : port.y + 5;
    const platformLabelAnchor =
      portRef.side === "left"
        ? "end"
        : portRef.side === "right"
        ? "start"
        : "middle";
    const width = Math.max(18, estimateTextWidth(platformLabel, 13) + 8);
    const x =
      platformLabelAnchor === "middle"
        ? labelX - width / 2
        : platformLabelAnchor === "end"
        ? labelX - width + 3
        : labelX - 3;
    const height = 17;
    return {
      id: `${routeNode.id}:platform-label:${portRef.side}:${portRef.index}`,
      x: x - padding,
      y: labelY - 13 - padding,
      width: width + padding * 2,
      height: height + padding * 2,
    };
  });
};

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

const getRouteSegmentObstacleRect = (
  segment: RoutePathSegment,
  padding = 12
): ObstacleRect => {
  const minX = Math.min(segment.from.x, segment.to.x);
  const maxX = Math.max(segment.from.x, segment.to.x);
  const minY = Math.min(segment.from.y, segment.to.y);
  const maxY = Math.max(segment.from.y, segment.to.y);
  return {
    id: `route-segment:${
      segment.sectionId ?? ""
    }:${minX}:${minY}:${maxX}:${maxY}`,
    x: minX - padding,
    y: minY - padding,
    width: Math.max(maxX - minX, 1) + padding * 2,
    height: Math.max(maxY - minY, 1) + padding * 2,
  };
};

const getRouteGeometryObstacleRects = (
  geometry: RouteEdgeGeometry,
  padding: number
): SourceObstacleRect[] =>
  getRoutePathSegments([geometry]).map((segment) => ({
    ...getRouteSegmentObstacleRect(segment, padding),
    id: `route-segment:${geometry.routeEdgeId}:${segment.from.x}:${segment.from.y}:${segment.to.x}:${segment.to.y}:${padding}`,
    sourceRouteEdgeId: geometry.routeEdgeId,
  }));

const countRectCollisions = (rect: ObstacleRect, obstacles: ObstacleRect[]) =>
  obstacles.reduce(
    (count, obstacle) => count + (rectsIntersect(rect, obstacle) ? 1 : 0),
    0
  );

const routePointsIntersectRect = (points: Point[], rect: ObstacleRect) => {
  const compacted = compactPoints(points);
  return compacted.some((point, index) => {
    const next = compacted[index + 1];
    return (
      pointInsideRect(point, rect) ||
      Boolean(next && segmentIntersectsRect(point, next, rect))
    );
  });
};

const getParallelSegmentOverlapLength = (
  a: RoutePathSegment,
  b: RoutePathSegment,
  tolerance = 4
) => {
  const aHorizontal = a.from.y === a.to.y;
  const bHorizontal = b.from.y === b.to.y;
  const aVertical = a.from.x === a.to.x;
  const bVertical = b.from.x === b.to.x;

  if (
    aHorizontal &&
    bHorizontal &&
    Math.abs(a.from.y - b.from.y) <= tolerance
  ) {
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
  routeLineObstacles: ObstacleRect[],
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
      preferredDirection * 42 + laneOffset,
      -preferredDirection * 42 + laneOffset,
      preferredDirection * 64 + laneOffset,
      -preferredDirection * 64 + laneOffset,
      preferredDirection * 86 + laneOffset,
      -preferredDirection * 86 + laneOffset,
    ].map((offset) =>
      Math.abs(offset) < 34 ? (offset < 0 ? -34 : 34) : offset
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
    const labelCollisions = countRectCollisions(labelRect, placedLabelRects);
    const nodeCollisions = countRectCollisions(labelRect, nodeObstacles);
    const routeLineCollisions = countRectCollisions(
      labelRect,
      routeLineObstacles
    );
    const outOfBounds =
      labelRect.x < 0 ||
      labelRect.y < 0 ||
      labelRect.x + labelRect.width > canvasWidth ||
      labelRect.y + labelRect.height > canvasHeight
        ? 1
        : 0;
    const score =
      nodeCollisions * 5_000_000 +
      routeLineCollisions * 2_000_000 +
      labelCollisions * 1_500_000 +
      sharedSectionCount * 1_000_000 +
      outOfBounds * 120_000 +
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

const resolveRouteTimeLabelOverlaps = (
  placements: Map<string, RouteTimeLabelPlacement>,
  fixedObstacles: ObstacleRect[],
  routeLineObstacles: ObstacleRect[]
) => {
  const resolved = new Map(placements);
  const padding = 6;
  const stackGap = 4;
  const clampValue = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));
  const getPlacementCollisionScore = (placement: RouteTimeLabelPlacement) => {
    const rect = getRouteTimeLabelRect(placement, padding);
    const outOfBounds =
      rect.x < 0 ||
      rect.y < 0 ||
      rect.x + rect.width > canvasWidth ||
      rect.y + rect.height > canvasHeight
        ? 1
        : 0;
    return (
      countRectCollisions(rect, fixedObstacles) * 5_000_000 +
      countRectCollisions(rect, routeLineObstacles) * 2_000_000 +
      outOfBounds * 120_000
    );
  };

  for (let pass = 0; pass < 3; pass += 1) {
    const ids = [...resolved.keys()];
    const parent = new Map(ids.map((id) => [id, id]));
    const find = (id: string): string => {
      const current = parent.get(id) ?? id;
      if (current === id) return id;
      const root = find(current);
      parent.set(id, root);
      return root;
    };
    const unite = (a: string, b: string) => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent.set(rootB, rootA);
    };

    ids.forEach((id, index) => {
      const placement = resolved.get(id);
      if (!placement) return;
      const rect = getRouteTimeLabelRect(placement, padding);
      ids.slice(index + 1).forEach((otherId) => {
        const otherPlacement = resolved.get(otherId);
        if (!otherPlacement) return;
        const otherRect = getRouteTimeLabelRect(otherPlacement, padding);
        if (rectsIntersect(rect, otherRect)) {
          unite(id, otherId);
        }
      });
    });

    const groups = new Map<string, string[]>();
    ids.forEach((id) => {
      const root = find(id);
      groups.set(root, [...(groups.get(root) ?? []), id]);
    });

    let changed = false;
    groups.forEach((groupIds) => {
      if (groupIds.length <= 1) return;
      const groupPlacements = groupIds.flatMap((id) => {
        const placement = resolved.get(id);
        return placement ? [{ id, placement }] : [];
      });
      if (groupPlacements.length <= 1) return;
      const maxWidth = Math.max(
        ...groupPlacements.map(({ placement }) => placement.width)
      );
      const maxHeight = Math.max(
        ...groupPlacements.map(({ placement }) => placement.height)
      );
      const centerX =
        groupPlacements.reduce((sum, { placement }) => sum + placement.x, 0) /
        groupPlacements.length;
      const centerY =
        groupPlacements.reduce((sum, { placement }) => sum + placement.y, 0) /
        groupPlacements.length;
      const sorted = [...groupPlacements].sort(
        (a, b) =>
          a.placement.y - b.placement.y ||
          a.placement.x - b.placement.x ||
          a.id.localeCompare(b.id)
      );
      const totalHeight =
        sorted.length * maxHeight + (sorted.length - 1) * stackGap;
      const xCandidates = [
        centerX,
        ...sorted.map(({ placement }) => placement.x),
        centerX - maxWidth - stackGap,
        centerX + maxWidth + stackGap,
        centerX - maxWidth * 1.5 - stackGap,
        centerX + maxWidth * 1.5 + stackGap,
      ];
      const yCandidates = [
        centerY,
        centerY - maxHeight - stackGap,
        centerY + maxHeight + stackGap,
      ];
      const candidateStacks = xCandidates.flatMap((candidateX) =>
        yCandidates.map((candidateY) => {
          const startY = clampValue(
            candidateY - totalHeight / 2 + maxHeight / 2,
            maxHeight / 2,
            canvasHeight - maxHeight / 2
          );
          const x = clampValue(
            candidateX,
            maxWidth / 2,
            canvasWidth - maxWidth / 2
          );
          const placements = sorted.map(({ id, placement }, index) => ({
            id,
            placement: {
              ...placement,
              x,
              y: clampValue(
                startY + index * (maxHeight + stackGap),
                placement.height / 2,
                canvasHeight - placement.height / 2
              ),
            },
          }));
          const score =
            placements.reduce(
              (total, item) =>
                total + getPlacementCollisionScore(item.placement),
              0
            ) +
            Math.abs(x - centerX) * 8 +
            Math.abs(candidateY - centerY) * 4;
          return { placements, score };
        })
      );
      const bestStack = candidateStacks.reduce((best, candidate) =>
        candidate.score < best.score ? candidate : best
      );
      bestStack.placements.forEach(({ id, placement }) => {
        resolved.set(id, placement);
      });
      changed = true;
    });

    if (!changed) break;
  }

  return resolved;
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

const scoreRouteCandidateBreakdown = (
  points: Point[],
  obstacles: ObstacleRect[],
  fromNodeId: string,
  toNodeId: string,
  softObstacles: ObstacleRect[] = [],
  trackOverlapObstacles: ObstacleRect[] = [],
  routeCrossingSegments: RoutePathSegment[] = []
): RouteScoreBreakdown => {
  const hardCollisionCount = countCollisions(
    points,
    obstacles,
    fromNodeId,
    toNodeId
  );
  const hardCollisionPenalty = hardCollisionCount * 50_000_000;
  const softObstacleScore = getRouteSoftObstacleScore(points, softObstacles);
  const softObstaclePenalty = softObstacleScore * 40_000;
  const trackOverlapScore = getRouteSoftObstacleScore(
    points,
    trackOverlapObstacles
  );
  const trackOverlapPenalty =
    trackOverlapScore * routeTrackOverlapPenalty;
  const routeCrossingCount = getRouteCrossingCount(
    points,
    routeCrossingSegments
  );
  const routeCrossingPenalty = routeCrossingCount * 20_000_000;
  const detourScore = getRouteDetourScore(points);
  const bendCount = getBendCount(points);
  const bendPenalty = bendCount * 500;
  const length = getRouteLength(points);
  const total =
    hardCollisionPenalty +
    softObstaclePenalty +
    trackOverlapPenalty +
    routeCrossingPenalty +
    detourScore +
    bendPenalty +
    length;
  return {
    hardCollisionCount,
    hardCollisionPenalty,
    softObstacleScore,
    softObstaclePenalty,
    trackOverlapScore,
    trackOverlapPenalty,
    routeCrossingCount,
    routeCrossingPenalty,
    detourScore,
    bendCount,
    bendPenalty,
    length,
    total,
  };
};

const scoreRouteCandidate = (
  points: Point[],
  obstacles: ObstacleRect[],
  fromNodeId: string,
  toNodeId: string,
  softObstacles: ObstacleRect[] = [],
  trackOverlapObstacles: ObstacleRect[] = [],
  routeCrossingSegments: RoutePathSegment[] = []
) =>
  scoreRouteCandidateBreakdown(
    points,
    obstacles,
    fromNodeId,
    toNodeId,
    softObstacles,
    trackOverlapObstacles,
    routeCrossingSegments
  ).total;

const hasRouteConflict = (
  points: Point[],
  softObstacles: ObstacleRect[],
  trackOverlapObstacles: ObstacleRect[],
  routeCrossingSegments: RoutePathSegment[] = []
) =>
  getRouteSoftObstacleScore(points, softObstacles) > 0 ||
  getRouteSoftObstacleScore(points, trackOverlapObstacles) > 0 ||
  getRouteCrossingCount(points, routeCrossingSegments) > 0;

const getSimpleClearRoute = (
  from: Point,
  start: Point,
  end: Point,
  to: Point,
  obstacles: ObstacleRect[],
  fromNodeId: string,
  toNodeId: string,
  softObstacles: ObstacleRect[] = [],
  trackOverlapObstacles: ObstacleRect[] = [],
  routeCrossingSegments: RoutePathSegment[] = []
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
    scoreRouteCandidate(
      candidate,
      obstacles,
      fromNodeId,
      toNodeId,
      softObstacles,
      trackOverlapObstacles,
      routeCrossingSegments
    ) <
    scoreRouteCandidate(
      best,
      obstacles,
      fromNodeId,
      toNodeId,
      softObstacles,
      trackOverlapObstacles,
      routeCrossingSegments
    )
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
  routeNodes: RouteNode[],
  softRouteObstacles: ObstacleRect[] = [],
  trackOverlapObstacles: ObstacleRect[] = [],
  routeCrossingSegments: RoutePathSegment[] = [],
  sameSideLaneRank?: number,
  debugCollector?: RoutingDebugCollector
) => {
  const from = getPortPosition(fromNode, fromSide, fromPortIndex);
  const to = getPortPosition(toNode, toSide, toPortIndex);
  const start = moveFromSide(from, fromSide, getRouteStubLength(fromNode));
  const end = moveFromSide(to, toSide, getRouteStubLength(toNode));
  const fromCenter = getNodeCenter(fromNode);
  const toCenter = getNodeCenter(toNode);
  const fromFacing = isSideFacingPoint(fromSide, fromCenter, toCenter);
  const toFacing = isSideFacingPoint(toSide, toCenter, fromCenter);
  const nodeObstacles = routeNodes.flatMap(getNodeObstacleRects);
  const ownPortGateKeepoutObstacles = [
    ...getNodeSideBandPortGateKeepoutRects(fromNode, fromSide, fromPortIndex).map(
      (rect) => ({
        rect,
        routeNode: fromNode,
        portSide: fromSide,
        portIndex: fromPortIndex,
      })
    ),
    ...getNodeSideBandPortGateKeepoutRects(toNode, toSide, toPortIndex).map(
      (rect) => ({
        rect,
        routeNode: toNode,
        portSide: toSide,
        portIndex: toPortIndex,
      })
    ),
  ];
  const obstacles = nodeObstacles.map((rect) => ({ ...rect }));
  const routingObstacles = obstacles;
  const requiresSharedSameSideLane = fromSide === toSide;
  const requiresLaneRoute =
    requiresSharedSameSideLane || !fromFacing || !toFacing;
  const fromRule: EndpointDirectionRule =
    fromNode.type === "connection" ? "nonReverse" : "straight";
  const toRule: EndpointDirectionRule =
    toNode.type === "connection" ? "nonReverse" : "straight";
  const respectsEndpointDirections = (candidate: Point[]) =>
    routeRespectsEndpointDirections(
      candidate,
      from,
      fromSide,
      to,
      toSide,
      fromRule,
      toRule
    );
  debugCollector?.setEndpointInfo({
    fromSide,
    toSide,
    fromFacing,
    toFacing,
    requiresSharedSameSideLane,
    requiresLaneRoute,
    fromRule,
    toRule,
    from,
    to,
    fromDirection: getSideVector(fromSide),
    toDirection: getSideVector(toSide),
    failures: [],
  });
  const getCandidateRejectionReasons = (candidate: Point[]) => {
    const scoreBreakdown = scoreRouteCandidateBreakdown(
      candidate,
      obstacles,
      fromNode.id,
      toNode.id,
      softRouteObstacles,
      trackOverlapObstacles,
      routeCrossingSegments
    );
    const reasons = [
      ...getRouteEndpointDirectionFailures(
        candidate,
        from,
        fromSide,
        to,
        toSide,
        fromRule,
        toRule
      ),
    ];
    if (scoreBreakdown.hardCollisionCount > 0) {
      reasons.push(
        `hard obstacle collision: ${scoreBreakdown.hardCollisionCount}`
      );
    }
    if (scoreBreakdown.softObstacleScore > 0) {
      reasons.push(`soft route obstacle: ${scoreBreakdown.softObstacleScore}`);
    }
    if (scoreBreakdown.trackOverlapScore > 0) {
      reasons.push(`track overlap: ${scoreBreakdown.trackOverlapScore}`);
    }
    if (scoreBreakdown.routeCrossingCount > 0) {
      reasons.push(`route crossing: ${scoreBreakdown.routeCrossingCount}`);
    }
    if (!isReasonableRouteDetour(candidate)) {
      reasons.push(`excessive detour: ${getRouteExcessLength(candidate)}`);
    }
    return { reasons, scoreBreakdown };
  };
  const addDebugCandidate = (
    id: string,
    source: DebugRouteCandidateSource,
    points: Point[],
    accepted = false,
    extraRejectionReasons: string[] = []
  ) => {
    if (!debugCollector) return;
    const compacted = compactPoints(points);
    const { reasons, scoreBreakdown } = getCandidateRejectionReasons(compacted);
    debugCollector.addCandidate({
      id,
      source,
      points: compacted,
      accepted,
      rejectionReasons: accepted
        ? []
        : [...reasons, ...extraRejectionReasons],
      score: scoreBreakdown.total,
      scoreBreakdown,
    });
  };
  if (debugCollector) {
    const routeNodeById = new Map(
      routeNodes.map((routeNode) => [routeNode.id, routeNode])
    );
    nodeObstacles.forEach((rect) =>
      debugCollector.addObstacle({
        id: rect.id,
        kind: rect.id.endsWith(":label") ? "label" : "node",
        rect,
        sourceNodeId: rect.id.split(":")[0],
        sourceLabel: routeNodeById.get(rect.id.split(":")[0])?.label,
      })
    );
    ownPortGateKeepoutObstacles.forEach(
      ({ rect, routeNode, portSide, portIndex }) =>
        debugCollector.addObstacle({
          id: rect.id,
          kind: "ownEndpointKeepout",
          rect,
          sourceNodeId: routeNode.id,
          sourceLabel: routeNode.label,
          portSide,
          portIndex,
        })
    );
    routeNodes
      .filter(
        (routeNode) =>
          routeNode.id !== fromNode.id &&
          routeNode.id !== toNode.id &&
          routeNode.type !== "connection"
      )
      .forEach((routeNode) => {
        getRouteNodePortRefs(routeNode).forEach((portRef) => {
          getNodePortGateKeepoutRects(
            routeNode,
            portRef.side,
            portRef.index
          ).forEach((rect) =>
            debugCollector.addObstacle({
              id: `foreign:${rect.id}:${portRef.side}:${portRef.index}`,
              kind: "foreignPortKeepout",
              rect,
              sourceNodeId: routeNode.id,
              sourceLabel: routeNode.label,
              portSide: portRef.side,
              portIndex: portRef.index,
            })
          );
        });
      });
    softRouteObstacles.forEach((rect) =>
      debugCollector.addObstacle({
        id: rect.id,
        kind: "softRoute",
        rect,
        sourceRouteEdgeId: (rect as SourceObstacleRect).sourceRouteEdgeId,
      })
    );
    trackOverlapObstacles.forEach((rect) =>
      debugCollector.addObstacle({
        id: rect.id,
        kind: "trackOverlap",
        rect,
        sourceRouteEdgeId: (rect as SourceObstacleRect).sourceRouteEdgeId,
      })
    );
  }
  const simpleClearRoute = getSimpleClearRoute(
    from,
    start,
    end,
    to,
    routingObstacles,
    fromNode.id,
    toNode.id,
    softRouteObstacles,
    trackOverlapObstacles,
    routeCrossingSegments
  );

  if (simpleClearRoute) {
    addDebugCandidate(
      "simpleClearRoute",
      "simple",
      simpleClearRoute,
      !requiresLaneRoute,
      requiresLaneRoute ? ["lane route required"] : []
    );
  }

  if (simpleClearRoute && !requiresLaneRoute) {
    debugCollector?.setSelectedBy("simpleClearRoute");
    debugCollector?.setSimplification({
      finalCompacted: compactPoints(simpleClearRoute),
    });
    addDebugCandidate("final:simpleClearRoute", "final", simpleClearRoute, true);
    return simpleClearRoute;
  }

  const sharedSameSideLane =
    requiresSharedSameSideLane
      ? getSharedSameSideLane(
          fromNode,
          toNode,
          fromSide,
          fromPortIndex,
          toPortIndex,
          sameSideLaneRank
        )
      : null;
  const fromLane =
    sharedSameSideLane ??
    getIndexedSideLane(fromNode, fromSide, fromPortIndex);
  const toLane =
    sharedSameSideLane ?? getIndexedSideLane(toNode, toSide, toPortIndex);
  const laneStart = getLanePoint(start, fromSide, fromLane);
  const laneEnd = getLanePoint(end, toSide, toLane);
  const fromRect = getNodeRect(fromNode);
  const toRect = getNodeRect(toNode);
  debugCollector?.setEndpointInfo({
    fromSide,
    toSide,
    fromFacing,
    toFacing,
    requiresSharedSameSideLane,
    requiresLaneRoute,
    fromRule,
    toRule,
    from,
    to,
    fromDirection: getSideVector(fromSide),
    toDirection: getSideVector(toSide),
    failures: [],
  });

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
  directCandidates.forEach((candidate, index) =>
    addDebugCandidate(`direct:${index + 1}`, "direct", candidate)
  );
  sideAwareCandidates.forEach((candidate, index) =>
    addDebugCandidate(`sideAware:${index + 1}`, "sideAware", candidate)
  );
  outerCandidates.forEach((candidate, index) =>
    addDebugCandidate(`outer:${index + 1}`, "outer", candidate)
  );
  const searchBounds = {
    minX: Math.min(
      minX,
      ...routingObstacles.map((obstacle) => obstacle.x),
      start.x,
      end.x
    ),
    maxX: Math.max(
      maxX,
      ...routingObstacles.map((obstacle) => obstacle.x + obstacle.width),
      laneStart.x,
      laneEnd.x,
      start.x,
      end.x
    ),
    minY: Math.min(
      minY,
      ...routingObstacles.map((obstacle) => obstacle.y),
      start.y,
      end.y
    ),
    maxY: Math.max(
      maxY,
      ...routingObstacles.map((obstacle) => obstacle.y + obstacle.height),
      laneStart.y,
      laneEnd.y,
      start.y,
      end.y
    ),
  };
  debugCollector?.addObstacle({
    id: "searchBounds",
    kind: "searchBounds",
    rect: {
      id: "searchBounds",
      x: searchBounds.minX,
      y: searchBounds.minY,
      width: searchBounds.maxX - searchBounds.minX,
      height: searchBounds.maxY - searchBounds.minY,
    },
  });
  if (canUseOrthogonalSegment(laneStart, laneEnd, routingObstacles)) {
    const candidate = compactPoints([from, start, laneStart, laneEnd, end, to]);
    addDebugCandidate("straightLane", "direct", candidate);
    if (
      respectsEndpointDirections(candidate) &&
      !hasRouteConflict(
        candidate,
        softRouteObstacles,
        trackOverlapObstacles,
        routeCrossingSegments
      )
    ) {
      debugCollector?.setSelectedBy("straightLane");
      debugCollector?.setSimplification({
        finalCompacted: compactPoints(candidate),
      });
      addDebugCandidate("final:straightLane", "final", candidate, true);
      return candidate;
    }
  }

  const singleBendBetweenLanes = findSingleBendRoute(
    laneStart,
    laneEnd,
    routingObstacles
  );
  if (singleBendBetweenLanes) {
    const candidate = compactPoints([
      from,
      start,
      laneStart,
      singleBendBetweenLanes,
      laneEnd,
      end,
      to,
    ]);
    addDebugCandidate("singleBendBetweenLanes", "direct", candidate);
    if (
      respectsEndpointDirections(candidate) &&
      !hasRouteConflict(
        candidate,
        softRouteObstacles,
        trackOverlapObstacles,
        routeCrossingSegments
      )
    ) {
      debugCollector?.setSelectedBy("singleBendBetweenLanes");
      debugCollector?.setSimplification({
        finalCompacted: compactPoints(candidate),
      });
      addDebugCandidate(
        "final:singleBendBetweenLanes",
        "final",
        candidate,
        true
      );
      return candidate;
    }
  }

  const searchedRoute = findOrthogonalRoutePoints(
    laneStart,
    laneEnd,
    routingObstacles,
    searchBounds,
    debugCollector,
    [
      from,
      start,
      laneStart,
      laneEnd,
      end,
      to,
      { x: midX, y: midY },
      { x: laneStart.x, y: laneEnd.y },
      { x: laneEnd.x, y: laneStart.y },
    ]
  );

  if (searchedRoute) {
    addDebugCandidate("searchedRoute", "searched", searchedRoute);
    debugCollector?.setSimplification({
      beforeSimplify: searchedRoute,
    });
  }

  const searchedSimplifiedRoute = searchedRoute
    ? simplifyOrthogonalRoute(searchedRoute, routingObstacles)
    : null;
  if (searchedSimplifiedRoute) {
    addDebugCandidate(
      "searchedSimplified",
      "searchedSimplified",
      searchedSimplifiedRoute
    );
    debugCollector?.setSimplification({
      afterSimplify: searchedSimplifiedRoute,
    });
  }

  const searchedCandidate = searchedRoute
    ? compactPoints([
        from,
        start,
        ...(searchedSimplifiedRoute ?? searchedRoute),
        end,
        to,
      ])
    : null;
  if (searchedCandidate) {
    addDebugCandidate("searchedCandidate", "searchedSimplified", searchedCandidate);
  }

  if (
    searchedCandidate &&
    respectsEndpointDirections(searchedCandidate) &&
    isReasonableRouteDetour(searchedCandidate) &&
    !hasRouteConflict(
      searchedCandidate,
      softRouteObstacles,
      trackOverlapObstacles,
      routeCrossingSegments
    )
  ) {
    debugCollector?.setSelectedBy("searchedRoute");
    debugCollector?.setSimplification({
      finalCompacted: compactPoints(searchedCandidate),
    });
    addDebugCandidate("final:searchedRoute", "final", searchedCandidate, true);
    return searchedCandidate;
  }

  const fallbackCandidates = searchedCandidate
    ? [...candidates, searchedCandidate]
    : candidates;
  const endpointSafeFallbackCandidates = fallbackCandidates.filter(
    respectsEndpointDirections
  );
  const scoredFallbackCandidates =
    endpointSafeFallbackCandidates.length > 0
      ? endpointSafeFallbackCandidates
      : fallbackCandidates;

  const selectedCandidate = scoredFallbackCandidates.reduce((best, candidate) =>
        scoreRouteCandidate(
          candidate,
          obstacles,
          fromNode.id,
          toNode.id,
          softRouteObstacles,
          trackOverlapObstacles,
          routeCrossingSegments
        ) <
        scoreRouteCandidate(
          best,
          obstacles,
          fromNode.id,
          toNode.id,
          softRouteObstacles,
          trackOverlapObstacles,
          routeCrossingSegments
        )
          ? candidate
          : best
  );
  addDebugCandidate(
    "fallback:selectedCandidate",
    "fallback",
    selectedCandidate,
    false,
    ["selected by fallback score"]
  );
  const simplifiedCandidate = simplifyOrthogonalRoute(
    selectedCandidate,
    routingObstacles
  );
  debugCollector?.setSelectedBy(
    respectsEndpointDirections(simplifiedCandidate)
      ? "fallbackAfterSimplify"
      : "fallbackScore"
  );
  debugCollector?.setSimplification({
    beforeSimplify: selectedCandidate,
    afterSimplify: simplifiedCandidate,
    finalCompacted: compactPoints(
      respectsEndpointDirections(simplifiedCandidate)
        ? simplifiedCandidate
        : selectedCandidate
    ),
  });
  addDebugCandidate(
    "final:fallback",
    "final",
    respectsEndpointDirections(simplifiedCandidate)
      ? simplifiedCandidate
      : selectedCandidate,
    true
  );

  return compactPoints(
    respectsEndpointDirections(simplifiedCandidate)
      ? simplifiedCandidate
      : selectedCandidate
  );
};

const getManualRoutePoints = (
  routeEdge: RouteEdge,
  fromNode: RouteNode,
  toNode: RouteNode
) => {
  if (!routeEdge.manualWaypoints || routeEdge.manualWaypoints.length === 0) {
    return null;
  }
  return compactPoints([
    getPortPosition(fromNode, routeEdge.fromPortSide, routeEdge.fromPortIndex),
    ...routeEdge.manualWaypoints,
    getPortPosition(toNode, routeEdge.toPortSide, routeEdge.toPortIndex),
  ]);
};

export const RouteNetworkEditor = ({
  state,
  dispatch,
  workspaceName,
  selectedTrainRunId,
  selectedRouteTemplateId,
  setSelectedRouteTemplateId,
  routeTemplateEditKey,
  setRouteTemplateEditKey,
}: Props) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const routeMapPanelRef = useRef<HTMLElement>(null);
  const floatingPanelDragRef = useRef<{
    clientX: number;
    clientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const canvasZoomRef = useRef(getInitialCanvasZoom());
  const canvasPinchStateRef = useRef<{
    lastDistance: number;
  } | null>(null);
  const dragStateTouchRef = useRef<DragState | null>(null);
  const isTouchDraggingRef = useRef(false);
  const selectionStateRef = useRef<SelectionState | null>(null);
  const canvasViewportStyleRef = useRef<{
    overflow: string;
    touchAction: string;
    overscrollBehavior: string;
  } | null>(null);
  const pageScrollStyleRef = useRef<{
    htmlOverflow: string;
    htmlOverscrollBehavior: string;
    bodyOverflow: string;
    bodyTouchAction: string;
    bodyOverscrollBehavior: string;
  } | null>(null);
  const movedRef = useRef(false);
  const routeMapClipboardRef = useRef<RouteMapClipboard | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [selectedRouteEdgeIds, setSelectedRouteEdgeIds] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedBranchEdgeIds, setSelectedBranchEdgeIds] = useState<string[]>(
    []
  );
  const [selectedRouteTimeSectionId, setSelectedRouteTimeSectionId] =
    useState("");
  const [selectedRouteTimeSectionIds, setSelectedRouteTimeSectionIds] =
    useState<Set<string>>(() => new Set());
  const [isRoutingDebugMode, setIsRoutingDebugMode] = useState(false);
  const [routingDebugLayers, setRoutingDebugLayers] = useState<
    Record<RoutingDebugLayerKey, boolean>
  >({
    candidates: true,
    nodeObstacles: true,
    labelObstacles: true,
    portGateKeepoutObstacles: true,
    softRouteObstacles: true,
    trackOverlapObstacles: true,
    searchBounds: true,
    searchGraph: false,
    searchVisited: false,
    simplification: false,
    endpointVectors: true,
    density: false,
  });
  const [isVirtualRouteDrawMode, setIsVirtualRouteDrawMode] = useState(false);
  const [virtualRouteWaypoints, setVirtualRouteWaypoints] = useState<Point[]>(
    []
  );
  const [isManualRouteDrawMode, setIsManualRouteDrawMode] = useState(false);
  const [manualRouteWaypoints, setManualRouteWaypoints] = useState<Point[]>(
    []
  );
  const [manualRouteWaypointPast, setManualRouteWaypointPast] = useState<
    Point[][]
  >([]);
  const [manualRouteWaypointFuture, setManualRouteWaypointFuture] = useState<
    Point[][]
  >([]);
  const [manualRoutePausedEdgeId, setManualRoutePausedEdgeId] = useState("");
  const [routingDebugLogEntries, setRoutingDebugLogEntries] = useState<
    RoutingDebugLogEntry[]
  >(loadRoutingDebugLogEntries);
  const [connectionTypeMenuOpen, setConnectionTypeMenuOpen] = useState(false);
  const [connectionTypePreview, setConnectionTypePreview] = useState<{
    nodeId: string;
    connectionType: ConnectionType;
  } | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [canvasPanState, setCanvasPanState] = useState<CanvasPanState | null>(
    null
  );
  const [floatingPanelPosition, setFloatingPanelPosition] = useState({
    x: 16,
    y: 72,
  });
  const [openedFloatingPanelSection, setOpenedFloatingPanelSection] =
    useState<FloatingPanelSectionKey | null>(null);
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
  const [
    selectedRouteTimeSpeedClassIndex,
    setSelectedRouteTimeSpeedClassIndex,
  ] = useState(0);
  const [routeTimeMessage, setRouteTimeMessage] = useState("");
  const [isRouteTemplateMode, setIsRouteTemplateMode] = useState(false);
  const [routeTemplateDraft, setRouteTemplateDraft] =
    useState<RouteTemplateDraft | null>(null);
  const [routeTemplatePendingStart, setRouteTemplatePendingStart] =
    useState<RoutePlatformRef | null>(null);
  const [routeTemplateMessage, setRouteTemplateMessage] = useState("");
  const [hoveredRouteTemplatePlatform, setHoveredRouteTemplatePlatform] =
    useState<RoutePlatformRef | null>(null);
  const [canvasViewportHeight, setCanvasViewportHeight] = useState(
    getCompactCanvasViewportHeight
  );
  const [canvasZoom, setCanvasZoom] = useState(getInitialCanvasZoom);
  const [newNodeStationId, setNewNodeStationId] = useState("");
  const [newNodeType, setNewNodeType] = useState<RouteNodeType>("station");
  const [newNodePlatformNumber, setNewNodePlatformNumber] = useState("");
  const [newNodePlatformCount, setNewNodePlatformCount] = useState(1);
  const [newNodeVerticalPlatformCount, setNewNodeVerticalPlatformCount] =
    useState(1);
  const isRoutingDebugAllowed = useMemo(isRoutingDebugHostAllowed, []);
  const routingDebugEnabled = isRoutingDebugAllowed && isRoutingDebugMode;

  useEffect(() => {
    canvasZoomRef.current = canvasZoom;
  }, [canvasZoom]);

  const applyCanvasZoomAtClientPoint = (
    nextZoom: number,
    clientX: number,
    clientY: number
  ) => {
    const viewport = canvasViewportRef.current;
    const svg = svgRef.current;
    if (!viewport || !svg) return;
    const currentZoom = canvasZoomRef.current;
    if (Math.abs(nextZoom - currentZoom) < 0.001) return;
    const svgRect = svg.getBoundingClientRect();
    const anchorX = (clientX - svgRect.left) / currentZoom;
    const anchorY = (clientY - svgRect.top) / currentZoom;
    const applyScrollCorrection = () => {
      const nextSvgRect = svg.getBoundingClientRect();
      viewport.scrollLeft = Math.max(
        0,
        viewport.scrollLeft + nextSvgRect.left + anchorX * nextZoom - clientX
      );
      viewport.scrollTop = Math.max(
        0,
        viewport.scrollTop + nextSvgRect.top + anchorY * nextZoom - clientY
      );
    };

    canvasZoomRef.current = nextZoom;
    flushSync(() => {
      setCanvasZoom(nextZoom);
    });
    applyScrollCorrection();
  };

  useEffect(() => {
    if (isRoutingDebugAllowed) return;
    setIsRoutingDebugMode(false);
    setIsVirtualRouteDrawMode(false);
    setVirtualRouteWaypoints([]);
  }, [isRoutingDebugAllowed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      routingDebugLogStorageKey,
      JSON.stringify(routingDebugLogEntries)
    );
  }, [routingDebugLogEntries]);

  useEffect(() => {
    if (routingDebugEnabled && selectedEdgeId) return;
    setIsVirtualRouteDrawMode(false);
    setVirtualRouteWaypoints([]);
  }, [routingDebugEnabled, selectedEdgeId]);

  useEffect(() => {
    const selectedRouteEdge = selectedEdgeId
      ? state.routeEdges.find((routeEdge) => routeEdge.id === selectedEdgeId)
      : null;
    if (!selectedRouteEdge) {
      setIsManualRouteDrawMode(false);
      setManualRouteWaypoints([]);
      setManualRouteWaypointPast([]);
      setManualRouteWaypointFuture([]);
      return;
    }
    if (isManualRouteDrawMode) {
      setManualRouteWaypoints(
        selectedRouteEdge.manualWaypoints?.map((point) => ({ ...point })) ?? []
      );
      setManualRouteWaypointPast([]);
      setManualRouteWaypointFuture([]);
    }
  }, [isManualRouteDrawMode, selectedEdgeId, state.routeEdges]);

  const selectedTrainRun = state.trainRuns.find(
    (trainRun) => trainRun.id === selectedTrainRunId
  );
  const routeTimeSpeedClassCount = Math.max(
    state.routeTimeSpeedClasses?.length ?? 0,
    getRouteTimeSpeedClassCount(
      state.routeTimeSections,
      state.routeTimeSpeedClassCount
    )
  );
  const routeTimeSpeedClasses = useMemo(
    () =>
      Array.from({ length: routeTimeSpeedClassCount }, (_, index) => ({
        baseIndex: state.routeTimeSpeedClasses?.[index]?.baseIndex ?? 0,
        multiplier: state.routeTimeSpeedClasses?.[index]?.multiplier ?? 1,
      })),
    [routeTimeSpeedClassCount, state.routeTimeSpeedClasses]
  );
  const routeTimeManualInputDisabled =
    state.routeTimeSpeedMultiplierEnabled &&
    selectedRouteTimeSpeedClassIndex > 0;
  const routeTimeSectionsForSelectedSpeed = useMemo(
    () =>
      getRouteTimeSectionsForSpeedClass(
        state.routeTimeSections,
        selectedRouteTimeSpeedClassIndex
      ),
    [selectedRouteTimeSpeedClassIndex, state.routeTimeSections]
  );
  const routeTimeSectionByIdForSelectedSpeed = useMemo(
    () =>
      new Map(
        routeTimeSectionsForSelectedSpeed.map((section) => [
          section.id,
          section,
        ])
      ),
    [routeTimeSectionsForSelectedSpeed]
  );
  const routeTimeSectionColorById = useMemo(() => {
    const pairColorByKey = new Map<string, string>();
    const colorById = new Map<string, string>();
    routeTimeSectionsForSelectedSpeed.forEach((section) => {
      const pairKey = getRouteTimeSectionNodePairKey(section);
      if (!pairColorByKey.has(pairKey)) {
        pairColorByKey.set(
          pairKey,
          routeTimeSectionPalette[
            pairColorByKey.size % routeTimeSectionPalette.length
          ]
        );
      }
      colorById.set(section.id, pairColorByKey.get(pairKey) ?? "#16a34a");
    });
    return colorById;
  }, [routeTimeSectionsForSelectedSpeed]);
  const getDisplayRouteTimeSectionColor = (
    section: State["routeTimeSections"][number]
  ) =>
    routeTimeSectionColorById.get(section.id) ??
    getRouteTimeSectionColor(section);
  const selectedRouteTemplate =
    state.routeTemplates.find(
      (routeTemplate) => routeTemplate.id === selectedRouteTemplateId
    ) ?? state.routeTemplates[0];
  const activeRouteTemplateDraft =
    isRouteTemplateMode &&
    selectedRouteTemplate &&
    routeTemplateDraft?.templateId === selectedRouteTemplate.id
      ? routeTemplateDraft
      : null;
  const routeTemplateRouteSections =
    activeRouteTemplateDraft?.[routeTemplateEditKey] ??
    selectedRouteTemplate?.[routeTemplateEditKey] ??
    [];
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
    if (!isRouteTemplateMode) return;
    if (!selectedRouteTemplate) {
      setRouteTemplateDraft(null);
      return;
    }
    setRouteTemplateDraft((current) =>
      current?.templateId === selectedRouteTemplate.id
        ? current
        : createRouteTemplateDraft(selectedRouteTemplate)
    );
  }, [isRouteTemplateMode, selectedRouteTemplate]);

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
  const selectedRouteTimeBranchLabelsByNodeId = useMemo(() => {
    const labels = new Map<string, number[]>();
    if (!selectedRouteTimeSection) return labels;
    const breakGroups = getRouteTimeSectionBreakGroups(
      selectedRouteTimeSection,
      state.routeNodes
    );
    const displayBreakGroups = shouldDisplayRouteTimeSectionReversed(
      selectedRouteTimeSection
    )
      ? [...breakGroups].reverse()
      : breakGroups;
    displayBreakGroups.forEach((group, index) => {
      const nodeId = group[0]?.nodeId;
      const routeNode = nodeId ? routeNodeById.get(nodeId) : null;
      if (!nodeId || routeNode?.type !== "connection") return;
      labels.set(nodeId, [...(labels.get(nodeId) ?? []), index + 1]);
    });
    return labels;
  }, [routeNodeById, selectedRouteTimeSection, state.routeNodes]);
  const routeEdgeById = useMemo(
    () =>
      new Map(state.routeEdges.map((routeEdge) => [routeEdge.id, routeEdge])),
    [state.routeEdges]
  );
  const routeEdgeGeometry = useMemo<RouteEdgeGeometry[]>(
    () => {
      const sameSideLaneRankByRouteEdgeId = new Map<string, number>();
      const sameSideLaneGroups = new Map<string, RouteEdge[]>();
      const routeEdgeOrderIndexById = new Map(
        state.routeEdges.map((routeEdge, index) => [routeEdge.id, index])
      );
      state.routeEdges.forEach((routeEdge) => {
        const groupKey = getRouteEdgeSameSideLaneGroupKey(routeEdge);
        if (!groupKey) return;
        sameSideLaneGroups.set(groupKey, [
          ...(sameSideLaneGroups.get(groupKey) ?? []),
          routeEdge,
        ]);
      });
      sameSideLaneGroups.forEach((routeEdges) => {
        [...routeEdges]
          .sort((a, b) =>
            getRouteEdgeSameSideLaneSortKey(a, routeNodeById).localeCompare(
              getRouteEdgeSameSideLaneSortKey(b, routeNodeById)
            )
          )
          .forEach((routeEdge, index) => {
            sameSideLaneRankByRouteEdgeId.set(routeEdge.id, index);
          });
      });

      const routingOrder = [...state.routeEdges].sort((a, b) => {
        const aGroupKey = getRouteEdgeSameSideLaneGroupKey(a);
        const bGroupKey = getRouteEdgeSameSideLaneGroupKey(b);
        if (aGroupKey && aGroupKey === bGroupKey) {
          return (
            (sameSideLaneRankByRouteEdgeId.get(a.id) ?? 0) -
              (sameSideLaneRankByRouteEdgeId.get(b.id) ?? 0) ||
            (routeEdgeOrderIndexById.get(a.id) ?? 0) -
              (routeEdgeOrderIndexById.get(b.id) ?? 0)
          );
        }
        return (
          (routeEdgeOrderIndexById.get(a.id) ?? 0) -
          (routeEdgeOrderIndexById.get(b.id) ?? 0)
        );
      });

      const buildGeometry = (
        routeEdge: RouteEdge,
        comparisonGeometries: RouteEdgeGeometry[]
      ): RouteEdgeGeometry | null => {
        const fromNode = routeNodeById.get(routeEdge.fromNodeId);
        const toNode = routeNodeById.get(routeEdge.toNodeId);
        if (!fromNode || !toNode) return null;
        const manualRoutePoints = getManualRoutePoints(
          routeEdge,
          fromNode,
          toNode
        );
        if (manualRoutePoints) {
          return {
            routeEdgeId: routeEdge.id,
            fromNodeId: routeEdge.fromNodeId,
            toNodeId: routeEdge.toNodeId,
            bidirectional: routeEdge.bidirectional,
            travelMinutes: routeEdge.travelMinutes,
            routePoints: manualRoutePoints,
            labelPoint: getRouteLabelPoint(manualRoutePoints),
          };
        }
        const comparisonItems = comparisonGeometries.map((geometry) => ({
          geometry,
          routeEdge: routeEdgeById.get(geometry.routeEdgeId),
        }));
        const softRouteObstacles = comparisonItems
          .filter(
            ({ geometry, routeEdge: otherRouteEdge }) =>
              geometry.routeEdgeId !== routeEdge.id &&
              otherRouteEdge &&
              getRouteEdgeRelationDetail(routeEdge, otherRouteEdge)
                .relation === "independent"
          )
          .flatMap(({ geometry }) => getRouteGeometryObstacleRects(geometry, 8));
        const routeCrossingSegments = getRoutePathSegments(
          comparisonGeometries.filter(
            (geometry) => geometry.routeEdgeId !== routeEdge.id
          )
        );
        const routePoints = buildAutoRoutePoints(
          fromNode,
          toNode,
          routeEdge.fromPortSide,
          routeEdge.toPortSide,
          routeEdge.fromPortIndex,
          routeEdge.toPortIndex,
          state.routeNodes,
          softRouteObstacles,
          [],
          routeCrossingSegments,
          sameSideLaneRankByRouteEdgeId.get(routeEdge.id)
        );
        return {
          routeEdgeId: routeEdge.id,
          fromNodeId: routeEdge.fromNodeId,
          toNodeId: routeEdge.toNodeId,
          bidirectional: routeEdge.bidirectional,
          travelMinutes: routeEdge.travelMinutes,
          routePoints,
          labelPoint: getRouteLabelPoint(routePoints),
        };
      };

      const geometries: RouteEdgeGeometry[] = [];
      routingOrder.forEach((routeEdge) => {
        const geometry = buildGeometry(routeEdge, geometries);
        if (geometry) geometries.push(geometry);
      });

      let refinedGeometries = geometries;
      for (let pass = 0; pass < 2; pass += 1) {
        refinedGeometries = routingOrder.flatMap((routeEdge) => {
          const geometry = buildGeometry(routeEdge, refinedGeometries);
          return geometry ? [geometry] : [];
        });
      }

      const geometryById = new Map(
        refinedGeometries.map((geometry) => [geometry.routeEdgeId, geometry])
      );
      return state.routeEdges.flatMap((routeEdge) => {
        const geometry = geometryById.get(routeEdge.id);
        return geometry ? [geometry] : [];
      });
    },
    [routeEdgeById, routeNodeById, state.routeEdges, state.routeNodes]
  );
  const routeEdgeGeometryById = useMemo(
    () =>
      new Map(
        routeEdgeGeometry.map((geometry) => [geometry.routeEdgeId, geometry])
      ),
    [routeEdgeGeometry]
  );
  const routingDebugResult = useMemo<RoutingDebugResult | null>(() => {
    if (!routingDebugEnabled || !selectedEdgeId) return null;
    const selectedRouteEdge = routeEdgeById.get(selectedEdgeId);
    if (!selectedRouteEdge) return null;
    const sameSideLaneRankByRouteEdgeId = new Map<string, number>();
    const sameSideLaneGroups = new Map<string, RouteEdge[]>();
    state.routeEdges.forEach((routeEdge) => {
      const groupKey = getRouteEdgeSameSideLaneGroupKey(routeEdge);
      if (!groupKey) return;
      sameSideLaneGroups.set(groupKey, [
        ...(sameSideLaneGroups.get(groupKey) ?? []),
        routeEdge,
      ]);
    });
    sameSideLaneGroups.forEach((routeEdges) => {
      [...routeEdges]
        .sort((a, b) =>
          getRouteEdgeSameSideLaneSortKey(a, routeNodeById).localeCompare(
            getRouteEdgeSameSideLaneSortKey(b, routeNodeById)
          )
        )
        .forEach((routeEdge, index) => {
          sameSideLaneRankByRouteEdgeId.set(routeEdge.id, index);
        });
    });

    const geometries: RouteEdgeGeometry[] = [];
    let result: RoutingDebugResult | null = null;
    for (const [orderIndex, routeEdge] of state.routeEdges.entries()) {
      const fromNode = routeNodeById.get(routeEdge.fromNodeId);
      const toNode = routeNodeById.get(routeEdge.toNodeId);
      if (!fromNode || !toNode) continue;
      const previousGeometries = geometries.map((geometry) => ({
        geometry,
        routeEdge: routeEdgeById.get(geometry.routeEdgeId),
      }));
      const previousSoftGeometries = previousGeometries.filter(
        ({ routeEdge: previousRouteEdge }) =>
          previousRouteEdge &&
          getRouteEdgeRelationDetail(routeEdge, previousRouteEdge).relation ===
            "independent"
      );
      const previousTrackGeometries: typeof previousGeometries = [];
      const softRouteObstacles = previousSoftGeometries.flatMap(({ geometry }) =>
        getRouteGeometryObstacleRects(geometry, 8)
      );
      const trackOverlapObstacles: SourceObstacleRect[] = [];
      const routeCrossingSegments = getRoutePathSegments(geometries);
      const debug = routeEdge.id === selectedEdgeId
        ? createRoutingDebugCollector(routeEdge.id)
        : null;
      const routePoints = buildAutoRoutePoints(
        fromNode,
        toNode,
        routeEdge.fromPortSide,
        routeEdge.toPortSide,
        routeEdge.fromPortIndex,
        routeEdge.toPortIndex,
        state.routeNodes,
        softRouteObstacles,
        trackOverlapObstacles,
        routeCrossingSegments,
        sameSideLaneRankByRouteEdgeId.get(routeEdge.id),
        debug?.collector
      );
      geometries.push({
        routeEdgeId: routeEdge.id,
        fromNodeId: routeEdge.fromNodeId,
        toNodeId: routeEdge.toNodeId,
        bidirectional: routeEdge.bidirectional,
        travelMinutes: routeEdge.travelMinutes,
        routePoints,
        labelPoint: getRouteLabelPoint(routePoints),
      });
      if (debug && routeEdge.id === selectedEdgeId) {
        const sameSideLaneGroupKey =
          getRouteEdgeSameSideLaneGroupKey(routeEdge) ?? undefined;
        const sameSideLaneRank = sameSideLaneRankByRouteEdgeId.get(routeEdge.id);
        const relationAnalysis = getRouteEdgeRelationAnalysis(
          routeEdge,
          state.routeEdges
        );
        const previousRouteEdgeIds = previousGeometries
          .map(({ routeEdge: previousRouteEdge }) => previousRouteEdge?.id)
          .filter((id): id is string => Boolean(id));
        const previousRouteEdgesUsedAsSoftObstacles = previousSoftGeometries
          .map(({ routeEdge: previousRouteEdge }) => previousRouteEdge?.id)
          .filter((id): id is string => Boolean(id));
        const previousRouteEdgesUsedAsTrackOverlapObstacles =
          previousTrackGeometries
            .map(({ routeEdge: previousRouteEdge }) => previousRouteEdge?.id)
            .filter((id): id is string => Boolean(id));
        const relationToPreviousEdges = previousGeometries.flatMap(
          ({ geometry, routeEdge: previousRouteEdge }) => {
            if (!previousRouteEdge) return [];
            const detail = getRouteEdgeRelationDetail(
              routeEdge,
              previousRouteEdge
            );
            const usedAsTrackOverlapObstacle =
              previousRouteEdgesUsedAsTrackOverlapObstacles.includes(
                previousRouteEdge.id
              );
            const usedAsSoftObstacle =
              previousRouteEdgesUsedAsSoftObstacles.includes(
                previousRouteEdge.id
              );
            const penaltyContribution = getRouteSoftObstacleScore(
              routePoints,
              getRouteGeometryObstacleRects(
                geometry,
                usedAsTrackOverlapObstacle ? 4 : 8
              )
            );
            return [
              {
                ...detail,
                usedAsSoftObstacle,
                usedAsTrackOverlapObstacle,
                causedPenalty: penaltyContribution > 0,
                penaltyContribution,
              },
            ];
          }
        );
        const orderingAnalysis: RouteOrderingAnalysis = {
          routeEdgeOrderIndex: orderIndex,
          totalRouteEdges: state.routeEdges.length,
          sameSideLaneGroupKey,
          sameSideLaneRank,
          relationGroupId: relationAnalysis.relationGroupId,
          previousRouteEdgeIds,
          previousRouteEdgesUsedAsSoftObstacles,
          previousRouteEdgesUsedAsTrackOverlapObstacles,
          blockingPreviousRouteEdgeIds: relationToPreviousEdges
            .filter((relation) => relation.causedPenalty)
            .map((relation) => relation.routeEdgeId),
          relationToPreviousEdges,
          blockedByEarlierGeometry: relationToPreviousEdges.some(
            (relation) => relation.causedPenalty
          ),
          routeOrderSensitive: false,
        };
        const endpointInfo = debug.info.endpointInfo;
        if (endpointInfo) {
          endpointInfo.failures = getRouteEndpointDirectionFailures(
            routePoints,
            endpointInfo.from,
            endpointInfo.fromSide,
            endpointInfo.to,
            endpointInfo.toSide,
            endpointInfo.fromRule,
            endpointInfo.toRule
          );
        }
        const connectionMatrix: RoutingDebugResult["connectionMatrix"] = [];
        const routeTimeSections = selectedRouteTimeSection
          ? [selectedRouteTimeSection]
          : routeTimeSectionsForSelectedSpeed.filter((section) =>
              section.routeEdgeIds.includes(routeEdge.id)
            );
        routeTimeSections.forEach((section) => {
          for (
            let index = 0;
            index < section.routePorts.length - 1;
            index += 1
          ) {
            const entry = section.routePorts[index];
            const exit = section.routePorts[index + 1];
            if (entry.nodeId !== exit.nodeId) continue;
            const routeNode = routeNodeById.get(entry.nodeId);
            if (!routeNode || routeNode.type !== "connection") continue;
            connectionMatrix.push({
              nodeId: routeNode.id,
              nodeLabel: getRouteNodeLabel(state.stations, routeNode),
              entry,
              exit,
              scope: "routeSection",
              ok: canTraverseConnection(
                routeNode,
                entry.side,
                entry.index,
                exit.side,
                exit.index
              ),
            });
          }
        });
        [fromNode, toNode].forEach((routeNode) => {
          if (routeNode.type !== "connection") return;
          const entry =
            routeNode.id === routeEdge.fromNodeId
              ? getRouteEdgeFromPortRef(routeEdge)
              : getRouteEdgeToPortRef(routeEdge);
          getRouteNodePortRefs(routeNode).forEach((exit) => {
            if (portRefsEqual(entry, exit)) return;
            connectionMatrix.push({
              nodeId: routeNode.id,
              nodeLabel: getRouteNodeLabel(state.stations, routeNode),
              entry,
              exit,
              scope: "endpointProbe",
              ok: canTraverseConnection(
                routeNode,
                entry.side,
                entry.index,
                exit.side,
                exit.index
              ),
            });
          });
        });
        result = {
          ...debug.info,
          routeEdge,
          orderIndex,
          routePoints,
          lintWarnings: getRoutingDebugLintWarnings(debug.info, routePoints),
          orderingAnalysis,
          relationAnalysis,
          connectionMatrix,
        };
        break;
      }
    }
    return result;
  }, [
    routingDebugEnabled,
    routeEdgeById,
    routeNodeById,
    routeTimeSectionsForSelectedSpeed,
    selectedEdgeId,
    selectedRouteTimeSection,
    state.routeEdges,
    state.routeNodes,
    state.stations,
  ]);
  const selectedManualRouteEndpointInfo = useMemo(() => {
    const routeEdge = selectedEdgeId ? routeEdgeById.get(selectedEdgeId) : null;
    if (!routeEdge) return null;
    const fromNode = routeNodeById.get(routeEdge.fromNodeId);
    const toNode = routeNodeById.get(routeEdge.toNodeId);
    if (!fromNode || !toNode) return null;
    return {
      routeEdge,
      from: getPortPosition(
        fromNode,
        routeEdge.fromPortSide,
        routeEdge.fromPortIndex
      ),
      to: getPortPosition(toNode, routeEdge.toPortSide, routeEdge.toPortIndex),
    };
  }, [routeEdgeById, routeNodeById, selectedEdgeId]);
  const manualRouteDraftPoints = useMemo(
    () =>
      selectedManualRouteEndpointInfo
        ? compactPoints([
            selectedManualRouteEndpointInfo.from,
            ...manualRouteWaypoints,
            selectedManualRouteEndpointInfo.to,
          ])
        : [],
    [manualRouteWaypoints, selectedManualRouteEndpointInfo]
  );
  useEffect(() => {
    if (openedFloatingPanelSection !== "routeEditing") {
      if (isManualRouteDrawMode) {
        setIsManualRouteDrawMode(false);
        setManualRouteWaypoints(
          selectedManualRouteEndpointInfo?.routeEdge.manualWaypoints?.map(
            (point) => ({ ...point })
          ) ?? []
        );
        setManualRouteWaypointPast([]);
        setManualRouteWaypointFuture([]);
      }
      return;
    }
    if (!selectedManualRouteEndpointInfo || isManualRouteDrawMode) return;
    if (manualRoutePausedEdgeId === selectedManualRouteEndpointInfo.routeEdge.id) {
      return;
    }
    setIsVirtualRouteDrawMode(false);
    setManualRouteWaypoints(
      selectedManualRouteEndpointInfo.routeEdge.manualWaypoints?.map(
        (point) => ({ ...point })
      ) ?? []
    );
    setManualRouteWaypointPast([]);
    setManualRouteWaypointFuture([]);
    setIsManualRouteDrawMode(true);
  }, [
    isManualRouteDrawMode,
    manualRoutePausedEdgeId,
    openedFloatingPanelSection,
    selectedManualRouteEndpointInfo,
  ]);
  const virtualRoutePoints = useMemo(() => {
    const endpointInfo = routingDebugResult?.endpointInfo;
    if (!routingDebugEnabled || !endpointInfo) return [];
    return compactPoints([
      endpointInfo.from,
      ...virtualRouteWaypoints,
      endpointInfo.to,
    ]);
  }, [routingDebugEnabled, routingDebugResult, virtualRouteWaypoints]);
  const virtualRouteDiagnosis = useMemo(
    () =>
      routingDebugResult && virtualRoutePoints.length >= 2
        ? diagnoseVirtualRoute(routingDebugResult, virtualRoutePoints)
        : null,
    [routingDebugResult, virtualRoutePoints]
  );
  const routingDebugLogSummary = useMemo(() => {
    const increment = (map: Map<string, number>, key: string, value = 1) => {
      map.set(key, (map.get(key) ?? 0) + value);
    };
    const feasibilityCounts = new Map<string, number>();
    const primaryCauseCounts = new Map<string, number>();
    const obstacleKindCounts = new Map<string, number>();
    const routeEdgeCounts = new Map<string, number>();
    const relationTypeCounts = new Map<string, number>();
    let ownEndpointAllowed = 0;
    let ownEndpointSuspicious = 0;
    let ownEndpointBlocked = 0;
    let virtualScoreBetter = 0;
    let candidateGenerationGap = 0;
    let routeOrderSensitive = 0;
    let blockedByEarlierGeometry = 0;
    let corridorTooNarrow = 0;
    let virtualWouldWinIfCandidate = 0;
    let nodeCollision = 0;
    let labelCollision = 0;
    routingDebugLogEntries.forEach((entry) => {
      if ("schemaVersion" in entry && entry.schemaVersion === 2) {
        increment(feasibilityCounts, entry.diagnosis.feasibility);
        increment(primaryCauseCounts, entry.diagnosis.primaryCause);
        increment(routeEdgeCounts, entry.routeEdge.id);
        ownEndpointAllowed +=
          entry.collisions.allowedOwnEndpointKeepoutCollisionCount;
        ownEndpointSuspicious +=
          entry.collisions.suspiciousOwnEndpointKeepoutCollisionCount ?? 0;
        ownEndpointBlocked +=
          entry.collisions.blockedOwnEndpointKeepoutCollisionCount;
        if (entry.comparison.virtualScoreBetter) virtualScoreBetter += 1;
        if (entry.diagnosis.feasibility === "candidateGenerationGap") {
          candidateGenerationGap += 1;
        }
        if (entry.routeOrderingAnalysis?.routeOrderSensitive) {
          routeOrderSensitive += 1;
        }
        if (entry.routeOrderingAnalysis?.blockedByEarlierGeometry) {
          blockedByEarlierGeometry += 1;
        }
        if (entry.corridorAnalysis?.corridorTooNarrow) {
          corridorTooNarrow += 1;
        }
        if (entry.candidateGenerationAnalysis?.virtualWouldWinIfCandidate) {
          virtualWouldWinIfCandidate += 1;
        }
        if (entry.routeEdgeRelationAnalysis?.relationType) {
          increment(
            relationTypeCounts,
            entry.routeEdgeRelationAnalysis.relationType
          );
        }
        nodeCollision += entry.collisions.nodeCollisionCount;
        labelCollision += entry.collisions.labelCollisionCount;
        entry.collisions.collidedObstacles.forEach((obstacle) =>
          increment(obstacleKindCounts, obstacle.kind)
        );
        return;
      }
      const legacyEntry = entry as RoutingDebugLogEntryV1;
      increment(feasibilityCounts, legacyEntry.feasibility);
      increment(primaryCauseCounts, "v1");
      increment(routeEdgeCounts, legacyEntry.routeEdgeId);
      legacyEntry.collidedObstacles.forEach((obstacle) =>
        increment(obstacleKindCounts, obstacle.kind)
      );
    });
    const toEntries = (map: Map<string, number>) =>
      [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return {
      total: routingDebugLogEntries.length,
      feasibilityCounts: toEntries(feasibilityCounts),
      primaryCauseCounts: toEntries(primaryCauseCounts),
      obstacleKindCounts: toEntries(obstacleKindCounts),
      relationTypeCounts: toEntries(relationTypeCounts),
      ownEndpointAllowed,
      ownEndpointSuspicious,
      ownEndpointBlocked,
      virtualScoreBetter,
      candidateGenerationGap,
      routeOrderSensitive,
      blockedByEarlierGeometry,
      corridorTooNarrow,
      virtualWouldWinIfCandidate,
      nodeCollision,
      labelCollision,
      routeEdgeTop: toEntries(routeEdgeCounts).slice(0, 5),
    };
  }, [routingDebugLogEntries]);
  const routingDebugDensityCells = useMemo(() => {
    if (
      !routingDebugEnabled ||
      !routingDebugLayers.density ||
      routeEdgeGeometry.length === 0
    ) {
      return [];
    }
    const gridSize = layoutGridSize * 4;
    const cellCounts = new Map<string, { x: number; y: number; count: number }>();
    const markCell = (x: number, y: number) => {
      const cellX = Math.floor(x / gridSize) * gridSize;
      const cellY = Math.floor(y / gridSize) * gridSize;
      const key = `${cellX}:${cellY}`;
      const current = cellCounts.get(key) ?? { x: cellX, y: cellY, count: 0 };
      current.count += 1;
      cellCounts.set(key, current);
    };
    routeEdgeGeometry.forEach((geometry) => {
      getRouteSegmentsFromPoints(geometry.routePoints).forEach((segment) => {
        const steps = Math.max(
          1,
          Math.ceil(segment.length / Math.max(1, gridSize / 2))
        );
        for (let step = 0; step <= steps; step += 1) {
          const ratio = step / steps;
          markCell(
            segment.from.x + (segment.to.x - segment.from.x) * ratio,
            segment.from.y + (segment.to.y - segment.from.y) * ratio
          );
        }
      });
    });
    const maxCount = Math.max(
      1,
      ...[...cellCounts.values()].map((cell) => cell.count)
    );
    return [...cellCounts.values()].map((cell) => ({
      ...cell,
      opacity: Math.min(0.68, 0.12 + (cell.count / maxCount) * 0.56),
      gridSize,
    }));
  }, [routingDebugEnabled, routeEdgeGeometry, routingDebugLayers.density]);
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

  const trainRouteGeometryHighlights = useMemo(() => {
    if (highlightedRouteSections.length === 0) return [];
    return highlightedRouteSections.flatMap((routeSection, sectionIndex) => {
      const section =
        routeTimeSectionByIdForSelectedSpeed.get(
          routeSection.routeTimeSectionId
        ) ??
        state.routeTimeSections.find(
          (candidate) => candidate.id === routeSection.routeTimeSectionId
        );
      if (!section) return [];
      const color = getDisplayRouteTimeSectionColor(section);
      return section.routeEdgeIds.flatMap((routeEdgeId) => {
        const geometry = routeEdgeGeometryById.get(routeEdgeId);
        return geometry
          ? [
              {
                key: `${section.id}:${sectionIndex}:${routeEdgeId}`,
                geometry,
                color,
              },
            ]
          : [];
      });
    });
  }, [
    highlightedRouteSections,
    routeEdgeGeometryById,
    routeTimeSectionByIdForSelectedSpeed,
    routeTimeSectionColorById,
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
        getRoutePathSegments(
          sectionGeometriesById.get(section.id) ?? [],
          section.id
        )
    );
    const routeLineObstacles = allRouteTimeSegments.map((segment) =>
      getRouteSegmentObstacleRect(segment)
    );
    const nodeObstacles = [
      ...state.routeNodes.flatMap(getNodeObstacleRects),
      ...state.routeNodes.flatMap((routeNode) =>
        getPlatformLabelObstacleRects(routeNode)
      ),
    ];
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
        routeLineObstacles,
        placedLabelRects
      );
      if (!placement) return;
      placementById.set(section.id, placement);
      placedLabelRects.push({
        ...getRouteTimeLabelRect(placement, 6),
        id: `route-time-label:${section.id}`,
      });
    });

    return resolveRouteTimeLabelOverlaps(
      placementById,
      nodeObstacles,
      routeLineObstacles
    );
  }, [
    routeEdgeGeometryById,
    routeTimeSectionsForSelectedSpeed,
    state.routeNodes,
  ]);
  const highlightedRouteTimeEndpointColorByKey = useMemo(() => {
    const selectedSectionIds = new Set<string>();
    if (selectedRouteTimeSectionId)
      selectedSectionIds.add(selectedRouteTimeSectionId);
    const rangeSelectedSectionIds = new Set(selectedRouteTimeSectionIds);
    const colorByKey = new Map<string, string>();
    routeTimeSectionsForSelectedSpeed.forEach((section) => {
      const isRangeSelected = rangeSelectedSectionIds.has(section.id);
      const isSelected = selectedSectionIds.has(section.id);
      if (!isRangeSelected && !isSelected) return;
      const sectionColor = "#dc2626";
      colorByKey.set(
        getPortKey(
          section.startNodeId,
          section.startPortSide,
          section.startPortIndex
        ),
        sectionColor
      );
      colorByKey.set(
        getPortKey(
          section.endNodeId,
          section.endPortSide,
          section.endPortIndex
        ),
        sectionColor
      );
    });
    return colorByKey;
  }, [
    selectedRouteTimeSectionId,
    selectedRouteTimeSectionIds,
    routeTimeSectionColorById,
    routeTimeSectionsForSelectedSpeed,
  ]);
  const activeSelectedNodeIds =
    selectedNodeIds.size > 0
      ? [...selectedNodeIds]
      : selectedNodeId
      ? [selectedNodeId]
      : [];
  const clearRangeSelections = () => {
    setSelectedRouteEdgeIds(new Set());
    setSelectedRouteTimeSectionIds(new Set());
  };
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

  const getSvgPointFromClient = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  const getSvgPoint = (event: MouseEvent<Element>) =>
    getSvgPointFromClient(event.clientX, event.clientY);

  const startSelection = (point: Point) => {
    const nextSelection = { start: point, current: point };
    selectionStateRef.current = nextSelection;
    setSelectionState(nextSelection);
  };

  const updateSelectionCurrent = (point: Point) => {
    const currentSelection = selectionStateRef.current;
    if (!currentSelection) return;
    const nextSelection = { ...currentSelection, current: point };
    selectionStateRef.current = nextSelection;
    setSelectionState(nextSelection);
  };

  const clearSelection = () => {
    selectionStateRef.current = null;
    setSelectionState(null);
  };

  const clonePoints = (points: Point[]) =>
    points.map((point) => ({ ...point }));

  const addVirtualRouteWaypoint = (
    rawPoint: Point,
    shouldAlignOrthogonally: boolean
  ) => {
    const endpointInfo = routingDebugResult?.endpointInfo;
    if (!endpointInfo) return;
    const previous =
      virtualRouteWaypoints[virtualRouteWaypoints.length - 1] ??
      endpointInfo.from;
    const snapped = snapPointToGrid(rawPoint);
    const nextPoint = shouldAlignOrthogonally
      ? Math.abs(snapped.x - previous.x) >= Math.abs(snapped.y - previous.y)
        ? { x: snapped.x, y: previous.y }
        : { x: previous.x, y: snapped.y }
      : snapped;
    setVirtualRouteWaypoints((current) => [...current, nextPoint]);
  };

  const addManualRouteWaypoint = (
    rawPoint: Point,
    shouldAlignOrthogonally: boolean
  ) => {
    const endpointInfo = selectedManualRouteEndpointInfo;
    if (!endpointInfo) return;
    const previous =
      manualRouteWaypoints[manualRouteWaypoints.length - 1] ??
      endpointInfo.from;
    const snapped = snapPointToGrid(rawPoint);
    const nextPoint = shouldAlignOrthogonally
      ? Math.abs(snapped.x - previous.x) >= Math.abs(snapped.y - previous.y)
        ? { x: snapped.x, y: previous.y }
        : { x: previous.x, y: snapped.y }
      : snapped;
    setManualRouteWaypointPast((current) => [
      ...current,
      clonePoints(manualRouteWaypoints),
    ]);
    setManualRouteWaypointFuture([]);
    setManualRouteWaypoints([...manualRouteWaypoints, nextPoint]);
  };

  const undoManualRouteWaypointEdit = () => {
    const previous =
      manualRouteWaypointPast[manualRouteWaypointPast.length - 1];
    if (!previous) return;
    setManualRouteWaypointPast((current) => current.slice(0, -1));
    setManualRouteWaypointFuture((current) => [
      clonePoints(manualRouteWaypoints),
      ...current,
    ]);
    setManualRouteWaypoints(clonePoints(previous));
  };

  const redoManualRouteWaypointEdit = () => {
    const next = manualRouteWaypointFuture[0];
    if (!next) return;
    setManualRouteWaypointPast((current) => [
      ...current,
      clonePoints(manualRouteWaypoints),
    ]);
    setManualRouteWaypointFuture((current) => current.slice(1));
    setManualRouteWaypoints(clonePoints(next));
  };

  const clearManualRouteDraftWaypoints = () => {
    if (manualRouteWaypoints.length === 0) return;
    setManualRouteWaypointPast((current) => [
      ...current,
      clonePoints(manualRouteWaypoints),
    ]);
    setManualRouteWaypointFuture([]);
    setManualRouteWaypoints([]);
  };

  const cancelManualRouteEditing = () => {
    setManualRoutePausedEdgeId(selectedManualRouteEndpointInfo?.routeEdge.id ?? "");
    setIsManualRouteDrawMode(false);
    setManualRouteWaypoints(
      selectedManualRouteEndpointInfo?.routeEdge.manualWaypoints?.map(
        (point) => ({ ...point })
      ) ?? []
    );
    setManualRouteWaypointPast([]);
    setManualRouteWaypointFuture([]);
  };

  const saveManualRouteWaypoints = () => {
    if (!selectedManualRouteEndpointInfo) return;
    dispatch({
      type: "updateRouteEdge",
      payload: {
        id: selectedManualRouteEndpointInfo.routeEdge.id,
        manualWaypoints: manualRouteWaypoints,
      },
    });
    setIsManualRouteDrawMode(false);
    setManualRouteWaypointPast([]);
    setManualRouteWaypointFuture([]);
  };

  const clearManualRouteWaypoints = () => {
    if (!selectedManualRouteEndpointInfo) return;
    dispatch({
      type: "updateRouteEdge",
      payload: {
        id: selectedManualRouteEndpointInfo.routeEdge.id,
        manualWaypoints: null,
      },
    });
    setManualRouteWaypoints([]);
    setManualRouteWaypointPast([]);
    setManualRouteWaypointFuture([]);
    setIsManualRouteDrawMode(false);
  };

  const onVirtualRouteMouseDownCapture = (
    event: MouseEvent<SVGSVGElement>
  ) => {
    if (
      !routingDebugEnabled ||
      !isVirtualRouteDrawMode ||
      !routingDebugResult ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    movedRef.current = true;
    addVirtualRouteWaypoint(getSvgPoint(event), event.shiftKey);
  };

  const onManualRouteMouseDownCapture = (
    event: MouseEvent<SVGSVGElement>
  ) => {
    if (
      !isManualRouteDrawMode ||
      !selectedManualRouteEndpointInfo ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    movedRef.current = true;
    addManualRouteWaypoint(getSvgPoint(event), event.shiftKey);
  };

  const onRouteCanvasMouseDownCapture = (
    event: MouseEvent<SVGSVGElement>
  ) => {
    onManualRouteMouseDownCapture(event);
    if (event.isDefaultPrevented()) return;
    onVirtualRouteMouseDownCapture(event);
  };

  const recordVirtualRouteDiagnosis = () => {
    if (!routingDebugResult || !virtualRouteDiagnosis) return;
    const routeEdge = routingDebugResult.routeEdge;
    const fromNode = routeNodeById.get(routeEdge.fromNodeId);
    const toNode = routeNodeById.get(routeEdge.toNodeId);
    const getNodeSnapshot = (
      routeNode: RouteNode | undefined
    ): DebugNodeSnapshot | undefined =>
      routeNode
        ? {
            id: routeNode.id,
            label: getRouteNodeLabel(state.stations, routeNode),
            type: routeNode.type,
            x: routeNode.x,
            y: routeNode.y,
            width: getNodeWidth(routeNode),
            height: getNodeHeight(routeNode),
            rotation: routeNode.rotation,
            isFlipped: routeNode.isFlipped,
            platformCount: routeNode.platformCount,
            verticalPlatformCount: routeNode.verticalPlatformCount,
          }
        : undefined;
    const nearbyNodes = state.routeNodes
      .filter((routeNode) => {
        if (routeNode.id === fromNode?.id || routeNode.id === toNode?.id) {
          return false;
        }
        return (
          getPointDistanceToRoute(getNodeCenter(routeNode), virtualRoutePoints) <=
          routeClearance * 8
        );
      })
      .slice(0, 16)
      .flatMap((routeNode) => {
        const snapshot = getNodeSnapshot(routeNode);
        return snapshot ? [snapshot] : [];
      });
    const getDensityMetricsForRoute = (points: Point[]) => {
      const gridSize = layoutGridSize * 4;
      const cellCounts = new Map<string, number>();
      const markCell = (x: number, y: number) => {
        const cellX = Math.floor(x / gridSize) * gridSize;
        const cellY = Math.floor(y / gridSize) * gridSize;
        const key = `${cellX}:${cellY}`;
        cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1);
      };
      routeEdgeGeometry.forEach((geometry) => {
        getRouteSegmentsFromPoints(geometry.routePoints).forEach((segment) => {
          const steps = Math.max(
            1,
            Math.ceil(segment.length / Math.max(1, gridSize / 2))
          );
          for (let step = 0; step <= steps; step += 1) {
            const ratio = step / steps;
            markCell(
              segment.from.x + (segment.to.x - segment.from.x) * ratio,
              segment.from.y + (segment.to.y - segment.from.y) * ratio
            );
          }
        });
      });
      const routeCounts = getRouteSegmentsFromPoints(points).flatMap((segment) => {
        const steps = Math.max(
          1,
          Math.ceil(segment.length / Math.max(1, gridSize / 2))
        );
        return Array.from({ length: steps + 1 }, (_, step) => {
          const ratio = step / steps;
          const x = segment.from.x + (segment.to.x - segment.from.x) * ratio;
          const y = segment.from.y + (segment.to.y - segment.from.y) * ratio;
          const key = `${Math.floor(x / gridSize) * gridSize}:${
            Math.floor(y / gridSize) * gridSize
          }`;
          return cellCounts.get(key) ?? 0;
        });
      });
      return {
        max: routeCounts.length > 0 ? Math.max(...routeCounts) : 0,
        average:
          routeCounts.length > 0
            ? routeCounts.reduce((sum, count) => sum + count, 0) /
              routeCounts.length
            : 0,
      };
    };
    const currentDensity = getDensityMetricsForRoute(
      routingDebugResult.routePoints
    );
    const virtualDensity = getDensityMetricsForRoute(virtualRoutePoints);
    const currentScore = virtualRouteDiagnosis.currentScoreBreakdown;
    const virtualScore = virtualRouteDiagnosis.scoreBreakdown;
    const entry: RoutingDebugLogEntryV2 = {
      schemaVersion: 2,
      timestamp: new Date().toISOString(),
      appContext: {
        workspaceName,
        debugToolVersion: "2",
        userAgent:
          typeof window === "undefined" ? undefined : window.navigator.userAgent,
        viewport:
          typeof window === "undefined"
            ? undefined
            : {
                width: window.innerWidth,
                height: window.innerHeight,
                zoom: canvasZoom,
              },
      },
      routeEdge: {
        id: routeEdge.id,
        orderIndex: routingDebugResult.orderIndex,
        totalRouteEdges: state.routeEdges.length,
        fromNodeId: routeEdge.fromNodeId,
        toNodeId: routeEdge.toNodeId,
        fromNodeLabel: fromNode
          ? getRouteNodeLabel(state.stations, fromNode)
          : undefined,
        toNodeLabel: toNode ? getRouteNodeLabel(state.stations, toNode) : undefined,
        fromPortSide: routeEdge.fromPortSide,
        toPortSide: routeEdge.toPortSide,
        fromPortIndex: routeEdge.fromPortIndex,
        toPortIndex: routeEdge.toPortIndex,
        bidirectional: routeEdge.bidirectional,
        travelMinutes: routeEdge.travelMinutes,
      },
      nodes: {
        fromNode: getNodeSnapshot(fromNode),
        toNode: getNodeSnapshot(toNode),
        nearbyNodes,
      },
      routingFlags: {
        fromFacing: routingDebugResult.endpointInfo?.fromFacing ?? false,
        toFacing: routingDebugResult.endpointInfo?.toFacing ?? false,
        requiresSharedSameSideLane:
          routingDebugResult.endpointInfo?.requiresSharedSameSideLane ?? false,
        requiresLaneRoute:
          routingDebugResult.endpointInfo?.requiresLaneRoute ?? false,
        endpointDirectionOk:
          virtualRouteDiagnosis.endpointDirectionResult.ok,
        endpointDirectionReasons:
          virtualRouteDiagnosis.endpointDirectionResult.reasons,
      },
      currentRoute: {
        points: routingDebugResult.routePoints,
        length: virtualRouteDiagnosis.currentLength,
        bendCount: virtualRouteDiagnosis.currentBendCount,
        selectedBy: routingDebugResult.selectedBy,
        scoreBreakdown: currentScore,
      },
      virtualRoute: {
        points: virtualRoutePoints,
        waypointCount: virtualRouteWaypoints.length,
        length: virtualRouteDiagnosis.virtualLength,
        bendCount: virtualRouteDiagnosis.virtualBendCount,
        scoreBreakdown: virtualScore,
      },
      comparison: {
        lengthDelta:
          virtualRouteDiagnosis.virtualLength -
          virtualRouteDiagnosis.currentLength,
        bendDelta:
          virtualRouteDiagnosis.virtualBendCount -
          virtualRouteDiagnosis.currentBendCount,
        scoreDelta: currentScore ? virtualScore.total - currentScore.total : undefined,
        virtualIsShorter:
          virtualRouteDiagnosis.virtualLength <
          virtualRouteDiagnosis.currentLength,
        virtualHasFewerBends:
          virtualRouteDiagnosis.virtualBendCount <
          virtualRouteDiagnosis.currentBendCount,
        virtualScoreBetter: currentScore
          ? virtualScore.total < currentScore.total
          : undefined,
      },
      diagnosis: {
        feasibility: virtualRouteDiagnosis.feasibility,
        primaryCause: virtualRouteDiagnosis.primaryCause,
        blockingReasons: virtualRouteDiagnosis.blockingReasons,
        missingRequirements: virtualRouteDiagnosis.missingRequirements,
        secondaryNotes: virtualRouteDiagnosis.secondaryNotes,
      },
      collisions: {
        hardCollisionCount:
          virtualRouteDiagnosis.collisionCounts.hardCollisionCount,
        nodeCollisionCount:
          virtualRouteDiagnosis.collisionCounts.nodeCollisionCount,
        labelCollisionCount:
          virtualRouteDiagnosis.collisionCounts.labelCollisionCount,
        ownEndpointKeepoutCollisionCount:
          virtualRouteDiagnosis.collisionCounts
            .ownEndpointKeepoutCollisionCount,
        allowedOwnEndpointKeepoutCollisionCount:
          virtualRouteDiagnosis.collisionCounts
            .allowedOwnEndpointKeepoutCollisionCount,
        suspiciousOwnEndpointKeepoutCollisionCount:
          virtualRouteDiagnosis.collisionCounts
            .suspiciousOwnEndpointKeepoutCollisionCount,
        blockedOwnEndpointKeepoutCollisionCount:
          virtualRouteDiagnosis.collisionCounts
            .blockedOwnEndpointKeepoutCollisionCount,
        foreignPortKeepoutCollisionCount:
          virtualRouteDiagnosis.collisionCounts
            .foreignPortKeepoutCollisionCount,
        softRouteCollisionScore:
          virtualRouteDiagnosis.collisionCounts.softRouteCollisionScore,
        trackOverlapScore:
          virtualRouteDiagnosis.collisionCounts.trackOverlapScore,
        collidedObstacles: virtualRouteDiagnosis.collidedObstacleDetails.map(
          (detail) => ({
            id: detail.obstacle.id,
            kind: detail.obstacle.kind,
            sourceNodeId: detail.obstacle.sourceNodeId,
            sourceRouteEdgeId: detail.obstacle.sourceRouteEdgeId,
            sourceLabel: detail.obstacle.sourceLabel,
            portSide: detail.obstacle.portSide,
            portIndex: detail.obstacle.portIndex,
            segmentIndex: detail.segmentIndex,
            allowed: detail.allowed,
            reason: detail.reason,
          })
        ),
      },
      candidateAnalysis: virtualRouteDiagnosis.candidateAnalysis,
      searchGraphAnalysis: {
        searchBounds: routingDebugResult.searchGraph?.bounds,
        virtualInsideSearchBounds:
          virtualRouteDiagnosis.virtualInsideSearchBounds,
        missingXValues: virtualRouteDiagnosis.missingXValues,
        missingYValues: virtualRouteDiagnosis.missingYValues,
        segmentsNotInSearchGraph:
          virtualRouteDiagnosis.graphMissingSegments,
        finalPathExists: Boolean(routingDebugResult.searchGraph?.finalPath),
      },
      connectionTraversal:
        routingDebugResult.connectionMatrix.some(
          (row) => row.scope === "routeSection"
        )
          ? {
              involvedConnectionNodeIds: [
                ...new Set(
                  routingDebugResult.connectionMatrix
                    .filter((row) => row.scope === "routeSection")
                    .map((row) => row.nodeId)
                ),
              ],
              blockedPairs: routingDebugResult.connectionMatrix
                .filter((row) => row.scope === "routeSection" && !row.ok)
                .map((row) => ({
                  nodeId: row.nodeId,
                  entrySide: row.entry.side,
                  entryIndex: row.entry.index,
                  exitSide: row.exit.side,
                  exitIndex: row.exit.index,
                  reason: "canTraverseConnection returned false",
                })),
            }
          : undefined,
      density: {
        maxDensityOnCurrentRoute: currentDensity.max,
        maxDensityOnVirtualRoute: virtualDensity.max,
        averageDensityOnVirtualRoute: virtualDensity.average,
      },
      routeOrderingAnalysis: {
        routeEdgeOrderIndex:
          virtualRouteDiagnosis.routeOrderingAnalysis.routeEdgeOrderIndex,
        totalRouteEdges:
          virtualRouteDiagnosis.routeOrderingAnalysis.totalRouteEdges,
        sameSideLaneGroupKey:
          virtualRouteDiagnosis.routeOrderingAnalysis.sameSideLaneGroupKey,
        sameSideLaneRank:
          virtualRouteDiagnosis.routeOrderingAnalysis.sameSideLaneRank,
        relationGroupId:
          virtualRouteDiagnosis.routeOrderingAnalysis.relationGroupId,
        previousRouteEdgeIds:
          virtualRouteDiagnosis.routeOrderingAnalysis.previousRouteEdgeIds,
        previousRouteEdgesUsedAsSoftObstacles:
          virtualRouteDiagnosis.routeOrderingAnalysis
            .previousRouteEdgesUsedAsSoftObstacles,
        previousRouteEdgesUsedAsTrackOverlapObstacles:
          virtualRouteDiagnosis.routeOrderingAnalysis
            .previousRouteEdgesUsedAsTrackOverlapObstacles,
        blockingPreviousRouteEdgeIds:
          virtualRouteDiagnosis.routeOrderingAnalysis
            .blockingPreviousRouteEdgeIds,
        relationToPreviousEdges:
          virtualRouteDiagnosis.routeOrderingAnalysis.relationToPreviousEdges,
        blockedByEarlierGeometry:
          virtualRouteDiagnosis.routeOrderingAnalysis.blockedByEarlierGeometry,
        routeOrderSensitive:
          virtualRouteDiagnosis.routeOrderingAnalysis.routeOrderSensitive,
      },
      routeEdgeRelationAnalysis:
        virtualRouteDiagnosis.routeEdgeRelationAnalysis,
      corridorAnalysis: virtualRouteDiagnosis.corridorAnalysis,
      candidateGenerationAnalysis:
        virtualRouteDiagnosis.candidateGenerationAnalysis,
      tags: virtualRouteDiagnosis.tags,
    };
    setRoutingDebugLogEntries((current) => [...current, entry]);
  };

  const downloadRoutingDebugLog = (format: "jsonl" | "json") => {
    if (typeof document === "undefined") return;
    const content =
      format === "json"
        ? JSON.stringify(routingDebugLogEntries, null, 2)
        : routingDebugLogEntries
            .map((entry) => JSON.stringify(entry))
            .join("\n");
    const blob = new Blob([content], {
      type:
        format === "json"
          ? "application/json;charset=utf-8"
          : "application/x-ndjson;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `routing-debug-log-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.${format === "json" ? "json" : "jsonl"}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const clearRoutingDebugLog = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("ルーティングDebugログをすべて削除しますか？")
    ) {
      return;
    }
    setRoutingDebugLogEntries([]);
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

  const getConnectionRotationForDragDirection = (
    segment: { from: Point; to: Point; projected: Point },
    directionPoint: Point
  ) => {
    const isHorizontal =
      Math.abs(segment.to.x - segment.from.x) >=
      Math.abs(segment.to.y - segment.from.y);
    return isHorizontal
      ? directionPoint.x >= segment.projected.x
        ? 0
        : 180
      : directionPoint.y >= segment.projected.y
      ? 90
      : 270;
  };

  const getConnectionTrackIndexForPoint = (
    rotation: number,
    projected: Point,
    point: Point
  ) => {
    const normalizedRotation = normalizeRotation(rotation, true);
    if (normalizedRotation === 90) {
      return point.x >= projected.x ? 1 : 0;
    }
    if (normalizedRotation === 270) {
      return point.x >= projected.x ? 0 : 1;
    }
    if (normalizedRotation === 180) {
      return point.y >= projected.y ? 1 : 0;
    }
    return point.y >= projected.y ? 0 : 1;
  };

  const getCrossoverTypeForParallelDirection = (
    segment: { from: Point; to: Point; projected: Point },
    directionPoint: Point
  ): ConnectionType => {
    const isHorizontal =
      Math.abs(segment.to.x - segment.from.x) >=
      Math.abs(segment.to.y - segment.from.y);
    const positive = isHorizontal
      ? directionPoint.x >= segment.projected.x
      : directionPoint.y >= segment.projected.y;
    return positive ? "singleCrossoverReverseZ" : "singleCrossoverZ";
  };

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

  const getSplitActualSidesForSegment = (segment: {
    from: Point;
    to: Point;
  }) => {
    if (
      Math.abs(segment.to.x - segment.from.x) >=
      Math.abs(segment.to.y - segment.from.y)
    ) {
      const movesRight = segment.to.x >= segment.from.x;
      return {
        entrySide: movesRight
          ? ("left" as RoutePortSide)
          : ("right" as RoutePortSide),
        exitSide: movesRight
          ? ("right" as RoutePortSide)
          : ("left" as RoutePortSide),
      };
    }
    const movesDown = segment.to.y >= segment.from.y;
    return {
      entrySide: movesDown
        ? ("top" as RoutePortSide)
        : ("bottom" as RoutePortSide),
      exitSide: movesDown
        ? ("bottom" as RoutePortSide)
        : ("top" as RoutePortSide),
    };
  };

  const getConnectionSplitPorts = (
    connectionType: ConnectionType,
    rotation: number,
    segment: { from: Point; to: Point },
    trackIndex: number
  ) => {
    const { entrySide, exitSide } = getSplitActualSidesForSegment(segment);
    const entryCanonicalSide = rotatePortSideByDegrees(entrySide, -rotation);
    const exitCanonicalSide = rotatePortSideByDegrees(exitSide, -rotation);
    const getPortIndex = (canonicalSide: RoutePortSide) =>
      connectionType === "turnout" && canonicalSide === "left" ? 0 : trackIndex;

    return {
      entryPortSide: entrySide,
      entryPortIndex: getPortIndex(entryCanonicalSide),
      exitPortSide: exitSide,
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
      isFlipped: false,
      isTerminal: false,
      isHorizontalTerminal: false,
      isVerticalTerminal: false,
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
    const baseRotation = getConnectionRotationForSegment(
      primarySegment.from,
      primarySegment.to
    );
    const rotation =
      secondarySegment && secondaryGeometry
        ? baseRotation
        : getConnectionRotationForDragDirection(primarySegment, directionPoint);
    const trackIndexes =
      secondarySegment && secondaryGeometry
        ? getConnectionTrackIndexesForParallelEdges(
            baseRotation,
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
        ? getCrossoverTypeForParallelDirection(primarySegment, directionPoint)
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
        setBranchInsertDragState({
          routeEdgeIds: edgeIds,
          placementPoint: point,
          currentPoint: point,
        });
        setDragState(null);
        clearSelection();
        setConnectState(null);
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

  const flipConnectionNodeShape = (routeNode: RouteNode) => {
    if (routeNode.type !== "connection") return;
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
  };

  const getCanvasViewportCenter = () => {
    const viewport = canvasViewportRef.current;
    const svg = svgRef.current;
    if (viewport && svg) {
      const matrix = svg.getScreenCTM();
      if (matrix) {
        const rect = viewport.getBoundingClientRect();
        const point = svg.createSVGPoint();
        point.x = rect.left + rect.width / 2;
        point.y = rect.top + rect.height / 2;
        const transformed = point.matrixTransform(matrix.inverse());
        return {
          x: Math.max(0, Math.min(canvasWidth, transformed.x)),
          y: Math.max(0, Math.min(canvasHeight, transformed.y)),
        };
      }
    }
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
    const label = newNodeStationId
      ? getStationName(state.stations, newNodeStationId)
      : "";
    const nodeId = createId("rn");
    const draftNode: RouteNode = {
      id: nodeId,
      stationId: newNodeStationId,
      label,
      type: newNodeType,
      x: 0,
      y: 0,
      rotation: 0,
      isFlipped: false,
      isTerminal: false,
      isHorizontalTerminal: false,
      isVerticalTerminal: false,
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
    setNewNodePlatformNumber("");
    setNewNodePlatformCount(1);
    setNewNodeVerticalPlatformCount(1);
    setSelectedNodeId(nodeId);
    setSelectedNodeIds(new Set([nodeId]));
    setSelectedEdgeId("");
    setSelectedRouteTimeSectionId("");
    clearRangeSelections();
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
      setSelectedRouteTimeSectionId("");
      clearRangeSelections();
      setConnectState(null);
      return;
    }

    if (selectedEdgeId) {
      dispatch({
        type: "removeRouteEdge",
        payload: { id: selectedEdgeId },
      });
      setSelectedEdgeId("");
      clearRangeSelections();
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
          manualWaypoints: routeEdge.manualWaypoints?.map((point) => ({
            x: point.x + layoutGridSize * 4,
            y: point.y + layoutGridSize * 4,
          })),
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
    clearRangeSelections();
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
    if (isRouteTemplateMode) {
      setRouteTemplateDraft((current) => {
        const base =
          current?.templateId === selectedRouteTemplate.id
            ? current
            : createRouteTemplateDraft(selectedRouteTemplate);
        return {
          ...base,
          [routeTemplateEditKey]: cloneTrainRouteSections(routeSections),
        };
      });
      return;
    }
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

  const saveSelectedRouteTemplateDraft = () => {
    if (!selectedRouteTemplate || !activeRouteTemplateDraft) return;
    dispatch({
      type: "updateRouteTemplate",
      payload: {
        id: selectedRouteTemplate.id,
        serviceRouteSections: cloneTrainRouteSections(
          activeRouteTemplateDraft.serviceRouteSections
        ),
        deadheadRouteSections: cloneTrainRouteSections(
          activeRouteTemplateDraft.deadheadRouteSections
        ),
      },
    });
    setIsRouteTemplateMode(false);
    setRouteTemplateDraft(null);
    setRouteTemplatePendingStart(null);
    setRouteTemplateMessage("経路設定を保存しました。");
  };

  const selectRouteTemplatePlatform = (platform: RoutePlatformRef) => {
    if (!selectedRouteTemplate) {
      setRouteTemplateMessage("経路セットを選択してください。");
      return;
    }

    const routeSections = routeTemplateRouteSections;
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
    updateSelectedRouteTemplateRoute(routeTemplateRouteSections.slice(0, -1));
    setRouteTemplatePendingStart(null);
    setRouteTemplateMessage("");
  };

  const startFloatingPanelDrag = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    floatingPanelDragRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      startX: floatingPanelPosition.x,
      startY: floatingPanelPosition.y,
    };
  };

  const getFloatingPanelBounds = () => {
    const viewport = canvasViewportRef.current;
    const panel = routeMapPanelRef.current;
    const viewportWidth =
      viewport?.clientWidth ??
      (typeof window !== "undefined" ? window.innerWidth : 0);
    const viewportHeight =
      viewport?.clientHeight ??
      (typeof window !== "undefined" ? window.innerHeight : 0);
    const windowWidth = typeof window !== "undefined" ? window.innerWidth : 360;
    const fallbackPanelWidth = Math.min(
      360,
      Math.max(0, Math.min(viewportWidth || windowWidth, windowWidth) - 16)
    );
    const panelWidth =
      panel && panel.offsetWidth > 0 ? panel.offsetWidth : fallbackPanelWidth;
    const fallbackPanelHeight = Math.min(520, Math.max(0, viewportHeight - 16));
    const panelHeight =
      panel && panel.offsetHeight > 0
        ? Math.min(panel.offsetHeight, Math.max(0, viewportHeight - 16))
        : fallbackPanelHeight;
    return {
      maxX: Math.max(8, viewportWidth - panelWidth - 8),
      maxY: Math.max(8, viewportHeight - panelHeight - 8),
    };
  };

  const clampFloatingPanelPosition = (position: { x: number; y: number }) => {
    const { maxX, maxY } = getFloatingPanelBounds();
    return {
      x: Math.max(8, Math.min(maxX, position.x)),
      y: Math.max(8, Math.min(maxY, position.y)),
    };
  };

  const dockFloatingPanelToRight = () => {
    const { maxX, maxY } = getFloatingPanelBounds();
    setFloatingPanelPosition((current) => ({
      x: maxX,
      y: Math.max(8, Math.min(maxY, current.y)),
    }));
  };

  const openFloatingPanelSection = (section: FloatingPanelSectionKey) => {
    const nextSection = openedFloatingPanelSection === section ? null : section;
    setOpenedFloatingPanelSection(nextSection);
    if (!nextSection) {
      if (isManualRouteDrawMode) cancelManualRouteEditing();
      setIsRouteTemplateMode(false);
      setRouteTemplateDraft(null);
      setRouteTemplatePendingStart(null);
      setRouteTemplateMessage("");
      setIsRouteTimeMode(false);
      clearRouteTimeDraft();
      return;
    }
    if (nextSection) {
      if (nextSection === "routeEditing") setManualRoutePausedEdgeId("");
      if (nextSection !== "routeEditing" && isManualRouteDrawMode) {
        cancelManualRouteEditing();
      }
      if (nextSection !== "routeSetting") {
        setIsRouteTemplateMode(false);
        setRouteTemplateDraft(null);
        setRouteTemplatePendingStart(null);
        setRouteTemplateMessage("");
      }
      if (nextSection !== "duration") {
        setIsRouteTimeMode(false);
        clearRouteTimeDraft();
      }
      dockFloatingPanelToRight();
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(dockFloatingPanelToRight);
      }
    }
  };

  const closeFloatingPanelAndEditModes = () => {
    if (isManualRouteDrawMode) {
      cancelManualRouteEditing();
    }
    setOpenedFloatingPanelSection(null);
    setIsRouteTemplateMode(false);
    setRouteTemplateDraft(null);
    setRouteTemplatePendingStart(null);
    setRouteTemplateMessage("");
    setIsRouteTimeMode(false);
    clearRouteTimeDraft();
  };

  const handleFloatingPanelSectionToggle = (
    section: FloatingPanelSectionKey,
    event: SyntheticEvent<HTMLDetailsElement>
  ) => {
    const isOpen = event.currentTarget.open;
    setOpenedFloatingPanelSection((current) =>
      isOpen ? section : current === section ? null : current
    );
  };

  const selectRouteEdge = (routeEdgeId: string) => {
    setManualRoutePausedEdgeId("");
    setSelectedEdgeId(routeEdgeId);
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

  const renderRouteTemplateRouteList = (
    title: string,
    key: TrainRouteKey
  ) => {
    const routeSections =
      activeRouteTemplateDraft?.[key] ?? selectedRouteTemplate?.[key] ?? [];
    return (
      <section className="flex min-w-0 flex-col gap-2 rounded border border-gray-200 bg-white p-2">
        <h4 className="text-xs font-bold text-gray-700">{title}</h4>
        {routeSections.length > 0 ? (
          <ol className="max-h-40 space-y-1 overflow-y-auto pr-1">
            {routeSections.map((routeSection, index) => (
              <li
                key={`${selectedRouteTemplate?.id ?? "none"}-${key}-${getTrainRouteSectionKey(
                  routeSection
                )}-${index}`}
                className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1 text-xs"
              >
                <span className="w-6 shrink-0 text-right text-gray-500">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {getTrainRouteSectionLabel(state, routeSection)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-gray-500">未設定</p>
        )}
      </section>
    );
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
    if (selectionStateRef.current) {
      movedRef.current = true;
      updateSelectionCurrent(point);
    }
    if (connectState) {
      setConnectState({ ...connectState, x: point.x, y: point.y });
    }
  };

  const lockCanvasViewportScroll = () => {
    const viewport = canvasViewportRef.current;
    if (!viewport || canvasViewportStyleRef.current) return;
    canvasViewportStyleRef.current = {
      overflow: viewport.style.overflow,
      touchAction: viewport.style.touchAction,
      overscrollBehavior: viewport.style.overscrollBehavior,
    };
    viewport.style.overflow = "hidden";
    viewport.style.touchAction = "none";
    viewport.style.overscrollBehavior = "none";
  };

  const unlockCanvasViewportScroll = () => {
    const viewport = canvasViewportRef.current;
    const saved = canvasViewportStyleRef.current;
    if (!viewport || !saved) return;
    viewport.style.overflow = saved.overflow;
    viewport.style.touchAction = saved.touchAction;
    viewport.style.overscrollBehavior = saved.overscrollBehavior;
    canvasViewportStyleRef.current = null;
  };

  const lockPageScroll = () => {
    if (typeof document === "undefined" || pageScrollStyleRef.current) return;
    const html = document.documentElement;
    const body = document.body;
    pageScrollStyleRef.current = {
      htmlOverflow: html.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyTouchAction: body.style.touchAction,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    body.style.overscrollBehavior = "none";
  };

  const unlockPageScroll = () => {
    if (typeof document === "undefined") return;
    const saved = pageScrollStyleRef.current;
    if (!saved) return;
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = saved.htmlOverflow;
    html.style.overscrollBehavior = saved.htmlOverscrollBehavior;
    body.style.overflow = saved.bodyOverflow;
    body.style.touchAction = saved.bodyTouchAction;
    body.style.overscrollBehavior = saved.bodyOverscrollBehavior;
    pageScrollStyleRef.current = null;
  };

  const onSvgTouchStart = (event: ReactTouchEvent<SVGSVGElement>) => {
    if (event.touches.length === 0) return;
    lockCanvasViewportScroll();
    lockPageScroll();
    if (event.touches.length !== 1) return;
    if (event.target !== svgRef.current) return;
    const touch = event.touches[0];
    const viewport = canvasViewportRef.current;
    if (!touch || !viewport) return;
    event.preventDefault();
    event.stopPropagation();
    movedRef.current = false;
    setCanvasPanState({
      clientX: touch.clientX,
      clientY: touch.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    });
    clearSelection();
    setDragState(null);
    setConnectState(null);
  };

  const onSvgTouchMove = (event: ReactTouchEvent<SVGSVGElement>) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (!touch) return;
    if (isTouchDraggingRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (canvasPanState) {
      event.preventDefault();
      movedRef.current = true;
      const viewport = canvasViewportRef.current;
      if (viewport) {
        viewport.scrollLeft =
          canvasPanState.scrollLeft - (touch.clientX - canvasPanState.clientX);
        viewport.scrollTop =
          canvasPanState.scrollTop - (touch.clientY - canvasPanState.clientY);
      }
      return;
    }

    const point = getSvgPointFromClient(touch.clientX, touch.clientY);
    if (branchInsertDragState) {
      event.preventDefault();
      movedRef.current = true;
      setBranchInsertDragState({
        ...branchInsertDragState,
        currentPoint: point,
      });
    }
    const activeDragState = dragStateTouchRef.current ?? dragState;
    if (activeDragState) {
      event.preventDefault();
      movedRef.current = true;
      activeDragState.nodes.forEach((node) => {
        const routeNode = routeNodeById.get(node.nodeId);
        if (!routeNode) return;
        const position = snapNodePosition(routeNode, {
          x: point.x - node.offsetX,
          y: point.y - node.offsetY,
        });
        dispatch({
          type: "updateRouteNode",
          historyGroup: activeDragState.historyGroup,
          payload: {
            id: node.nodeId,
            x: position.x,
            y: position.y,
          },
        });
      });
    }
    if (selectionStateRef.current) {
      event.preventDefault();
      movedRef.current = true;
      updateSelectionCurrent(point);
    }
    if (connectState) {
      event.preventDefault();
      setConnectState({ ...connectState, x: point.x, y: point.y });
    }
  };

  const onSvgTouchEnd = (event: ReactTouchEvent<SVGSVGElement>) => {
    if (event.touches.length > 0) return;
    isTouchDraggingRef.current = false;
    dragStateTouchRef.current = null;
    unlockCanvasViewportScroll();
    unlockPageScroll();
    setDragState(null);
    setCanvasPanState(null);
    clearSelection();
    setBranchInsertDragState(null);
    setConnectState(null);
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
      clearSelection();
      setSelectedNodeIds(new Set());
      setSelectedNodeId("");
      setSelectedRouteEdgeIds(new Set());
      setSelectedEdgeId("");
      setSelectedBranchEdgeIds([]);
      setSelectedRouteTimeSectionIds(new Set());
      setSelectedRouteTimeSectionId("");
      setDragState(null);
      setConnectState(null);
      return;
    }

    if (isRouteTimeMode || isRouteTemplateMode) return;
    if (!event.shiftKey || event.button !== 0) return;
    const point = getSvgPoint(event);
    movedRef.current = false;
    startSelection(point);
    setDragState(null);
    setConnectState(null);
  };

  const applySelection = useCallback(
    (selection: SelectionState) => {
      movedRef.current = true;
      const selectionRect = getRectFromPoints(
        selection.start,
        selection.current
      );
      const nextSelectedNodeIds = new Set(
        state.routeNodes
          .filter((routeNode) =>
            rectsIntersect(selectionRect, getNodeRect(routeNode))
          )
          .map((routeNode) => routeNode.id)
      );
      const nextSelectedRouteEdgeIds = new Set(
        routeEdgeGeometry
          .filter((geometry) =>
            routePointsIntersectRect(geometry.routePoints, selectionRect)
          )
          .map((geometry) => geometry.routeEdgeId)
      );
      const nextSelectedRouteTimeSectionIds = new Set(
        routeTimeSectionsForSelectedSpeed
          .filter((section) => {
            const labelPlacement = routeTimeLabelPlacementById.get(section.id);
            const labelSelected = labelPlacement
              ? rectsIntersect(
                  selectionRect,
                  getRouteTimeLabelRect(labelPlacement, 6)
                )
              : false;
            return (
              labelSelected ||
              section.routeEdgeIds.some((routeEdgeId) =>
                nextSelectedRouteEdgeIds.has(routeEdgeId)
              )
            );
          })
          .map((section) => section.id)
      );
      setSelectedNodeIds(nextSelectedNodeIds);
      setSelectedNodeId([...nextSelectedNodeIds][0] ?? "");
      setSelectedRouteEdgeIds(nextSelectedRouteEdgeIds);
      setSelectedRouteTimeSectionIds(nextSelectedRouteTimeSectionIds);
      setSelectedEdgeId("");
      setSelectedBranchEdgeIds([]);
      setSelectedRouteTimeSectionId("");
      clearSelection();
    },
    [
      routeEdgeGeometry,
      routeTimeLabelPlacementById,
      routeTimeSectionsForSelectedSpeed,
      state.routeNodes,
    ]
  );

  const onSvgMouseUp = (event: MouseEvent<SVGSVGElement>) => {
    if (canvasPanState) {
      setCanvasPanState(null);
      return;
    }

    if (branchInsertDragState) {
      const point = getSvgPoint(event);
      const primaryRouteEdgeId = branchInsertDragState.routeEdgeIds[0];
      const geometry = primaryRouteEdgeId
        ? routeEdgeGeometryById.get(primaryRouteEdgeId)
        : null;
      if (geometry) {
        const plan = getConnectionInsertPlan(
          branchInsertDragState.placementPoint,
          point,
          geometry,
          branchInsertDragState.routeEdgeIds
        );
        if (plan) commitConnectionInsertPlan(plan);
      }
      setBranchInsertDragState(null);
      setDragState(null);
      clearSelection();
      setConnectState(null);
      return;
    }
    const activeSelection = selectionStateRef.current;
    if (activeSelection) {
      applySelection(activeSelection);
    }
    setDragState(null);
    setCanvasPanState(null);
    setConnectState(null);
  };

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (!selectionStateRef.current) return;
      const svg = svgRef.current;
      if (
        svg &&
        event.target instanceof Node &&
        svg.contains(event.target)
      ) {
        return;
      }
      movedRef.current = true;
      updateSelectionCurrent(
        getSvgPointFromClient(event.clientX, event.clientY)
      );
    };

    const finishActiveSelection = () => {
      const activeSelection = selectionStateRef.current;
      if (!activeSelection) return;
      applySelection(activeSelection);
      setDragState(null);
      setCanvasPanState(null);
      setConnectState(null);
    };

    const handleMouseUp = () => {
      finishActiveSelection();
    };

    window.addEventListener("mousemove", handleMouseMove, true);
    window.addEventListener("mouseup", handleMouseUp, true);
    window.addEventListener("blur", finishActiveSelection);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove, true);
      window.removeEventListener("mouseup", handleMouseUp, true);
      window.removeEventListener("blur", finishActiveSelection);
    };
  }, [applySelection]);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      const currentZoom = canvasZoomRef.current;
      const nextZoom = Math.max(
        minCanvasZoom,
        Math.min(maxCanvasZoom, currentZoom * zoomFactor)
      );
      applyCanvasZoomAtClientPoint(nextZoom, event.clientX, event.clientY);
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, []);

  useEffect(() => {
    const viewport = canvasViewportRef.current;
    if (!viewport) return;

    const getTouchMetrics = (touches: TouchList) => {
      const first = touches[0];
      const second = touches[1];
      return {
        midpointX: (first.clientX + second.clientX) / 2,
        midpointY: (first.clientY + second.clientY) / 2,
        distance: Math.hypot(
          first.clientX - second.clientX,
          first.clientY - second.clientY
        ),
      };
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      const { distance } = getTouchMetrics(event.touches);
      if (distance <= 0) return;
      canvasPinchStateRef.current = {
        lastDistance: distance,
      };
      setCanvasPanState(null);
      lockCanvasViewportScroll();
      lockPageScroll();
    };

    const handleTouchMove = (event: TouchEvent) => {
      const pinchState = canvasPinchStateRef.current;
      if (!pinchState || event.touches.length !== 2) return;
      const { midpointX, midpointY, distance } = getTouchMetrics(event.touches);
      if (distance <= 0 || pinchState.lastDistance <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (Math.abs(distance - pinchState.lastDistance) < 0.8) return;
      const currentZoom = canvasZoomRef.current;
      const nextZoom = Math.max(
        minCanvasZoom,
        Math.min(
          maxCanvasZoom,
          currentZoom * (distance / pinchState.lastDistance)
        )
      );
      canvasPinchStateRef.current = {
        lastDistance: distance,
      };
      applyCanvasZoomAtClientPoint(nextZoom, midpointX, midpointY);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!canvasPinchStateRef.current) return;
      if (event.touches.length >= 2) return;
      canvasPinchStateRef.current = null;
      setCanvasZoom(canvasZoomRef.current);
      if (event.touches.length === 0) {
        unlockCanvasViewportScroll();
        unlockPageScroll();
      }
    };

    viewport.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    viewport.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    viewport.addEventListener("touchend", handleTouchEnd, {
      passive: false,
    });
    viewport.addEventListener("touchcancel", handleTouchEnd, {
      passive: false,
    });
    return () => {
      viewport.removeEventListener("touchstart", handleTouchStart);
      viewport.removeEventListener("touchmove", handleTouchMove);
      viewport.removeEventListener("touchend", handleTouchEnd);
      viewport.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, []);

  useEffect(() => {
    const updateCanvasViewportHeight = () => {
      if (window.matchMedia(desktopCanvasPanelMediaQuery).matches) {
        setCanvasViewportHeight(desktopCanvasViewportHeight);
        return;
      }
      setCanvasViewportHeight(getCompactCanvasViewportHeight());
    };

    updateCanvasViewportHeight();
    window.addEventListener("resize", updateCanvasViewportHeight);
    return () => window.removeEventListener("resize", updateCanvasViewportHeight);
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const drag = floatingPanelDragRef.current;
      if (!drag) return;
      setFloatingPanelPosition(
        clampFloatingPanelPosition({
          x: drag.startX + event.clientX - drag.clientX,
          y: drag.startY + event.clientY - drag.clientY,
        })
      );
    };
    const handleMouseUp = () => {
      floatingPanelDragRef.current = null;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (isVirtualRouteDrawMode) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          setIsVirtualRouteDrawMode(false);
          setVirtualRouteWaypoints([]);
          return;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          event.stopImmediatePropagation();
          setVirtualRouteWaypoints((current) => current.slice(0, -1));
          return;
        }
      }

      if (isManualRouteDrawMode) {
        const isModifierPressed = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (isModifierPressed && key === "z" && !event.shiftKey) {
          event.preventDefault();
          event.stopImmediatePropagation();
          undoManualRouteWaypointEdit();
          return;
        }
        if (
          isModifierPressed &&
          (key === "y" || (key === "z" && event.shiftKey))
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          redoManualRouteWaypointEdit();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          cancelManualRouteEditing();
          return;
        }
        if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }

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
      startSelection(point);
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

  const onNodeTouchStart = (
    event: ReactTouchEvent<SVGGElement>,
    routeNode: RouteNode
  ) => {
    if (event.touches.length !== 1) return;
    event.stopPropagation();
    if (isRouteTimeMode || isRouteTemplateMode) return;
    event.preventDefault();
    movedRef.current = false;
    const touch = event.touches[0];
    if (!touch) return;
    const point = getSvgPointFromClient(touch.clientX, touch.clientY);
    const nodeIds =
      selectedNodeIds.has(routeNode.id) && selectedNodeIds.size > 1
        ? [...selectedNodeIds]
        : [routeNode.id];
    const nextDragState: DragState = {
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
    };
    isTouchDraggingRef.current = true;
    lockCanvasViewportScroll();
    lockPageScroll();
    dragStateTouchRef.current = nextDragState;
    setDragState(nextDragState);
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

  const flipRouteNode = (routeNode: RouteNode) => {
    if (routeNode.type === "connection") {
      flipConnectionNodeShape(routeNode);
      return;
    }
    dispatch({
      type: "flipRouteNode",
      payload: { id: routeNode.id },
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

  const onFlipNode = (event: MouseEvent<SVGGElement>, routeNode: RouteNode) => {
    event.preventDefault();
    event.stopPropagation();
    if (isRouteTimeMode || isRouteTemplateMode) return;
    flipRouteNode(routeNode);
  };

  const removeRouteNode = (routeNodeId: string) => {
    dispatch({
      type: "removeRouteNode",
      payload: { id: routeNodeId },
    });
    setSelectedNodeId("");
    setSelectedNodeIds(new Set());
    setSelectedEdgeId("");
    setSelectedRouteTimeSectionId("");
    clearRangeSelections();
    setConnectState(null);
  };

  const onDeleteNode = (event: MouseEvent<SVGGElement>, routeNode: RouteNode) => {
    event.preventDefault();
    event.stopPropagation();
    if (selectedNodeIds.size > 1 && selectedNodeIds.has(routeNode.id)) {
      deleteSelection();
      return;
    }
    removeRouteNode(routeNode.id);
  };

  const removeRouteEdge = (routeEdgeId: string) => {
    dispatch({
      type: "removeRouteEdge",
      payload: { id: routeEdgeId },
    });
    setSelectedEdgeId("");
    clearRangeSelections();
    setSelectedBranchEdgeIds((current) =>
      current.filter(
        (selectedRouteEdgeId) => selectedRouteEdgeId !== routeEdgeId
      )
    );
  };

  const selectRouteTimeSectionFromRouteEdge = (
    routeEdgeId: string,
    preferredSectionId = "",
    options: { keepSelectedEdgeId?: boolean } = {}
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
    if (!options.keepSelectedEdgeId) setSelectedEdgeId("");
    clearRangeSelections();
    setSelectedBranchEdgeIds([]);
    return true;
  };

  const onNodeContextMenu = (
    event: MouseEvent<SVGGElement>,
    routeNode: RouteNode
  ) => {
    if (isManualRouteDrawMode) {
      event.preventDefault();
      event.stopPropagation();
      cancelManualRouteEditing();
      return;
    }
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    if (selectedNodeIds.size > 1 && selectedNodeIds.has(routeNode.id)) {
      deleteSelection();
      return;
    }
    removeRouteNode(routeNode.id);
  };

  const onEdgeContextMenu = (
    event: MouseEvent<SVGPathElement>,
    routeEdgeId: string
  ) => {
    if (isManualRouteDrawMode) {
      event.preventDefault();
      event.stopPropagation();
      cancelManualRouteEditing();
      return;
    }
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
      setSelectedRouteTimeSectionId("");
      clearRangeSelections();
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
    clearRangeSelections();
  };

  const selectedTrainRouteNodeIds = new Set(
    selectedTrainRun?.stops.map((stop) => stop.routeNodeId) ?? []
  );
  const portColorByKey = useMemo(() => {
    const colorMap = new Map<string, string>();
    state.routeEdges.forEach((routeEdge) => {
      const color = selectedRouteEdgeIds.has(routeEdge.id)
        ? "#dc2626"
        : getEdgeStrokeColor(routeEdge.id, selectedEdgeId);
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
  }, [selectedEdgeId, selectedRouteEdgeIds, state.routeEdges]);
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
  const isFloatingPanelVisible = Boolean(openedFloatingPanelSection || selectedNode);

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-b-lg border border-t-0 border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="relative min-w-0">
        <div className="relative min-w-0">
          <div
            ref={canvasViewportRef}
            className="route-map-viewport min-h-[630px] overflow-auto overscroll-contain rounded-lg bg-white p-1 sm:min-h-[780px] sm:p-2 2xl:min-h-[1050px]"
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
              onMouseDownCapture={onRouteCanvasMouseDownCapture}
              onMouseDown={onSvgMouseDown}
              onMouseMove={onSvgMouseMove}
              onMouseUp={onSvgMouseUp}
              onMouseLeave={onSvgMouseUp}
              onTouchStart={onSvgTouchStart}
              onTouchMove={onSvgTouchMove}
              onTouchEnd={onSvgTouchEnd}
              onTouchCancel={onSvgTouchEnd}
              onContextMenu={(event) => {
                event.preventDefault();
                if (isManualRouteDrawMode) {
                  event.stopPropagation();
                  closeFloatingPanelAndEditModes();
                  return;
                }
                if (event.ctrlKey && activeSelectedNodeIds.length > 0) {
                  event.stopPropagation();
                  deleteSelection();
                  return;
                }
                if (
                  openedFloatingPanelSection ||
                  isRouteTemplateMode ||
                  isRouteTimeMode
                ) {
                  event.stopPropagation();
                  closeFloatingPanelAndEditModes();
                }
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
                setSelectedRouteTimeSectionId("");
                clearRangeSelections();
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
                    className="canvas-grid-line-minor"
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
                    className="canvas-grid-pattern"
                  />
                  <path
                    d={`M ${layoutGridSize * 4} 0 L 0 0 0 ${
                      layoutGridSize * 4
                    }`}
                    fill="none"
                    stroke="#cbd5e1"
                    strokeWidth={0.8}
                    className="canvas-grid-line-major"
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
                <marker
                  id="routing-debug-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#facc15" />
                </marker>
              </defs>
              <rect
                width={canvasWidth}
                height={canvasHeight}
                fill="url(#route-layout-grid-major)"
                pointerEvents="none"
                className="canvas-grid-pattern"
              />

              {routingDebugEnabled && routingDebugLayers.density
                ? routingDebugDensityCells.map((cell) => (
                    <rect
                      key={`routing-density-${cell.x}-${cell.y}`}
                      x={cell.x}
                      y={cell.y}
                      width={cell.gridSize}
                      height={cell.gridSize}
                      fill="#f97316"
                      opacity={cell.opacity}
                      pointerEvents="none"
                    />
                  ))
                : null}

              {routingDebugEnabled &&
              routingDebugResult
                ? routingDebugResult.obstacles.map((obstacle) => {
                    const color = routingDebugObstacleColors[obstacle.kind];
                    if (
                      !routingDebugLayers[
                        routingDebugObstacleLayerByKind[obstacle.kind]
                      ]
                    ) {
                      return null;
                    }
                    return (
                      <rect
                        key={`routing-debug-obstacle-${obstacle.id}-${obstacle.kind}`}
                        x={obstacle.rect.x}
                        y={obstacle.rect.y}
                        width={obstacle.rect.width}
                        height={obstacle.rect.height}
                        fill={color}
                        fillOpacity={obstacle.kind === "searchBounds" ? 0.04 : 0.12}
                        stroke={color}
                        strokeWidth={1.4}
                        strokeDasharray={
                          obstacle.kind === "searchBounds" ? "8 5" : "4 4"
                        }
                        pointerEvents="none"
                      />
                    );
                  })
                : null}

              {routeEdgeGeometry.map((geometry) => {
                const isSelected = geometry.routeEdgeId === selectedEdgeId;
                const isRangeSelected = selectedRouteEdgeIds.has(
                  geometry.routeEdgeId
                );
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
                      stroke={
                        isRangeSelected
                          ? "#dc2626"
                          : isBranchSelected
                          ? "#f59e0b"
                          : edgeStrokeColor
                      }
                      strokeWidth={
                        isSelected || isBranchSelected || isRangeSelected
                          ? 5
                          : 3
                      }
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
                        selectRouteEdge(geometry.routeEdgeId);
                        setSelectedNodeId("");
                        setSelectedNodeIds(new Set());
                        if (routingDebugEnabled) {
                          setSelectedRouteTimeSectionId("");
                          clearRangeSelections();
                          return;
                        }
                        if (
                          selectRouteTimeSectionFromRouteEdge(
                            geometry.routeEdgeId,
                            "",
                            { keepSelectedEdgeId: true }
                          )
                        ) {
                          return;
                        }
                        setSelectedRouteTimeSectionId("");
                        clearRangeSelections();
                      }}
                      onMouseDown={(event) => {
                        maybeHandleBranchEdgeMouseDown(event, geometry);
                      }}
                      onContextMenu={(event) =>
                        onEdgeContextMenu(event, geometry.routeEdgeId)
                      }
                      className={`cursor-pointer ${
                        isSelected || isRangeSelected
                          ? "canvas-selected-stroke"
                          : "canvas-invert"
                      }`}
                    />
                    <path
                      d={pointsToPath(geometry.routePoints)}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={18}
                      pointerEvents="stroke"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (isRouteTimeMode || isRouteTemplateMode) return;
                        if (movedRef.current) {
                          movedRef.current = false;
                          return;
                        }
                        if (connectState) return;
                        selectRouteEdge(geometry.routeEdgeId);
                        setSelectedNodeId("");
                        setSelectedNodeIds(new Set());
                        if (routingDebugEnabled) {
                          setSelectedRouteTimeSectionId("");
                          clearRangeSelections();
                          return;
                        }
                        if (
                          selectRouteTimeSectionFromRouteEdge(
                            geometry.routeEdgeId,
                            "",
                            { keepSelectedEdgeId: true }
                          )
                        ) {
                          return;
                        }
                        setSelectedRouteTimeSectionId("");
                        clearRangeSelections();
                      }}
                      onMouseDown={(event) => {
                        maybeHandleBranchEdgeMouseDown(event, geometry);
                      }}
                      onContextMenu={(event) =>
                        onEdgeContextMenu(event, geometry.routeEdgeId)
                      }
                      className="canvas-invert cursor-pointer"
                    />
                  </g>
                );
              })}

              {isManualRouteDrawMode &&
              selectedManualRouteEndpointInfo &&
              manualRouteDraftPoints.length >= 2 ? (
                <g pointerEvents="none">
                  <path
                    d={pointsToPath(manualRouteDraftPoints)}
                    fill="none"
                    stroke="#ec4899"
                    strokeWidth={5}
                    strokeOpacity={0.9}
                    strokeDasharray="12 6"
                  />
                  {manualRouteWaypoints.map((point, index) => (
                    <circle
                      key={`manual-route-waypoint-${index}-${point.x}-${point.y}`}
                      cx={point.x}
                      cy={point.y}
                      r={7}
                      fill="#ec4899"
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  ))}
                </g>
              ) : null}

              {routingDebugEnabled &&
              routingDebugResult &&
              routingDebugLayers.searchGraph &&
              routingDebugResult.searchGraph
                ? routingDebugResult.searchGraph.edges.map((edge, index) => (
                    <line
                      key={`routing-debug-search-edge-${index}`}
                      x1={edge.from.x}
                      y1={edge.from.y}
                      x2={edge.to.x}
                      y2={edge.to.y}
                      stroke="#14b8a6"
                      strokeWidth={1}
                      strokeOpacity={0.22}
                      pointerEvents="none"
                    />
                  ))
                : null}

              {routingDebugEnabled &&
              routingDebugResult &&
              routingDebugLayers.searchVisited &&
              routingDebugResult.searchGraph
                ? routingDebugResult.searchGraph.visited.map((visited, index) => (
                    <circle
                      key={`routing-debug-search-visited-${index}`}
                      cx={visited.point.x}
                      cy={visited.point.y}
                      r={2.4}
                      fill="#2dd4bf"
                      fillOpacity={0.62}
                      pointerEvents="none"
                    />
                  ))
                : null}

              {routingDebugEnabled &&
              routingDebugResult &&
              routingDebugLayers.simplification
                ? [
                    routingDebugResult.simplification.beforeSimplify
                      ? {
                          key: "before",
                          points:
                            routingDebugResult.simplification.beforeSimplify,
                          color: "#f97316",
                          dash: "6 5",
                        }
                      : null,
                    routingDebugResult.simplification.afterSimplify
                      ? {
                          key: "after",
                          points:
                            routingDebugResult.simplification.afterSimplify,
                          color: "#22c55e",
                          dash: "2 6",
                        }
                      : null,
                    routingDebugResult.simplification.finalCompacted
                      ? {
                          key: "final",
                          points:
                            routingDebugResult.simplification.finalCompacted,
                          color: "#ef4444",
                          dash: "",
                        }
                      : null,
                  ].flatMap((item) =>
                    item ? (
                      <path
                        key={`routing-debug-simplify-${item.key}`}
                        d={pointsToPath(item.points)}
                        fill="none"
                        stroke={item.color}
                        strokeWidth={item.key === "final" ? 4 : 3}
                        strokeOpacity={0.72}
                        strokeDasharray={item.dash}
                        pointerEvents="none"
                      />
                    ) : (
                      []
                    )
                  )
                : null}

              {routingDebugEnabled &&
              routingDebugResult &&
              routingDebugLayers.candidates
                ? routingDebugResult.candidates.map((candidate) => (
                    <path
                      key={`routing-debug-candidate-${candidate.id}`}
                      d={pointsToPath(candidate.points)}
                      fill="none"
                      stroke={routingDebugCandidateColors[candidate.source]}
                      strokeWidth={candidate.accepted ? 5 : 3}
                      strokeOpacity={candidate.accepted ? 0.82 : 0.24}
                      strokeDasharray={candidate.accepted ? "" : "8 6"}
                      pointerEvents="none"
                    />
                  ))
                : null}

              {routingDebugEnabled &&
              routingDebugResult?.endpointInfo &&
              routingDebugLayers.endpointVectors
                ? ([
                    {
                      id: "from",
                      point: routingDebugResult.endpointInfo.from,
                      vector: routingDebugResult.endpointInfo.fromDirection,
                    },
                    {
                      id: "to",
                      point: routingDebugResult.endpointInfo.to,
                      vector: routingDebugResult.endpointInfo.toDirection,
                    },
                  ] as const).map((item) => (
                    <line
                      key={`routing-debug-endpoint-${item.id}`}
                      x1={item.point.x}
                      y1={item.point.y}
                      x2={item.point.x + item.vector.x * 42}
                      y2={item.point.y + item.vector.y * 42}
                      stroke="#facc15"
                      strokeWidth={3}
                      markerEnd="url(#routing-debug-arrow)"
                      pointerEvents="none"
                    />
                  ))
                : null}

              {routingDebugEnabled && routingDebugResult && virtualRouteDiagnosis
                ? (
                    <g pointerEvents="none">
                      <path
                        d={pointsToPath(routingDebugResult.routePoints)}
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth={5}
                        strokeOpacity={0.56}
                        strokeDasharray="10 8"
                      />
                      {virtualRouteDiagnosis.collidedObstacles.map(
                        (obstacle) => (
                          <rect
                            key={`virtual-collision-${obstacle.kind}-${obstacle.id}`}
                            x={obstacle.rect.x}
                            y={obstacle.rect.y}
                            width={obstacle.rect.width}
                            height={obstacle.rect.height}
                            fill="#ef4444"
                            fillOpacity={0.22}
                            stroke="#ef4444"
                            strokeWidth={2.4}
                            strokeDasharray="5 4"
                          />
                        )
                      )}
                      {virtualRouteDiagnosis.graphMissingSegments.map(
                        (segment, index) => (
                          <path
                            key={`virtual-missing-segment-${index}`}
                            d={pointsToPath([segment.from, segment.to])}
                            fill="none"
                            stroke="#dc2626"
                            strokeWidth={8}
                            strokeOpacity={0.74}
                            strokeDasharray="4 7"
                          />
                        )
                      )}
                      <path
                        d={pointsToPath(virtualRoutePoints)}
                        fill="none"
                        stroke="#ec4899"
                        strokeWidth={5}
                        strokeOpacity={0.92}
                        strokeDasharray="12 5"
                      />
                      {virtualRouteWaypoints.map((point, index) => (
                        <circle
                          key={`virtual-waypoint-${index}-${point.x}-${point.y}`}
                          cx={point.x}
                          cy={point.y}
                          r={7}
                          fill="#ec4899"
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      ))}
                      {virtualRouteDiagnosis.endpointViolationPoints.map(
                        (point, index) => (
                          <circle
                            key={`virtual-endpoint-violation-${index}-${point.x}-${point.y}`}
                            cx={point.x}
                            cy={point.y}
                            r={13}
                            fill="none"
                            stroke="#f97316"
                            strokeWidth={3}
                            strokeDasharray="3 4"
                          />
                        )
                      )}
                      {routingDebugResult.searchGraph ? (
                        <rect
                          x={routingDebugResult.searchGraph.bounds.minX}
                          y={routingDebugResult.searchGraph.bounds.minY}
                          width={
                            routingDebugResult.searchGraph.bounds.maxX -
                            routingDebugResult.searchGraph.bounds.minX
                          }
                          height={
                            routingDebugResult.searchGraph.bounds.maxY -
                            routingDebugResult.searchGraph.bounds.minY
                          }
                          fill="none"
                          stroke="#ec4899"
                          strokeWidth={1.6}
                          strokeDasharray="10 6"
                        />
                      ) : null}
                    </g>
                  )
                : null}

              {routeTimeSectionsForSelectedSpeed.map((section) => {
                const sectionColor = getDisplayRouteTimeSectionColor(section);
                const geometries = section.routeEdgeIds.flatMap(
                  (routeEdgeId) => {
                    const geometry = routeEdgeGeometryById.get(routeEdgeId);
                    return geometry ? [geometry] : [];
                  }
                );
                const isSelected = section.id === selectedRouteTimeSectionId;
                const isRangeSelected = selectedRouteTimeSectionIds.has(
                  section.id
                );
                const displaySectionColor =
                  isSelected || isRangeSelected ? "#dc2626" : sectionColor;
                const labelText = `${section.travelMinutes}分`;
                const labelPlacement =
                  section.travelMinutes > 0
                    ? routeTimeLabelPlacementById.get(section.id) ?? null
                    : null;
                return (
                  <g key={section.id}>
                    {geometries.map((geometry) => (
                      <g key={`${section.id}-${geometry.routeEdgeId}`}>
                        <path
                          d={pointsToPath(geometry.routePoints)}
                          fill="none"
                          stroke={displaySectionColor}
                          strokeOpacity={
                            isSelected || isRangeSelected ? 0.92 : 0.66
                          }
                          strokeWidth={isSelected || isRangeSelected ? 9 : 7}
                          strokeLinecap="round"
                          pointerEvents="stroke"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isRouteTemplateMode || isRouteTimeMode) return;
                            if (movedRef.current) {
                              movedRef.current = false;
                              return;
                            }
                            selectRouteEdge(geometry.routeEdgeId);
                            setSelectedNodeId("");
                            setSelectedNodeIds(new Set());
                            if (routingDebugEnabled) {
                              setSelectedRouteTimeSectionId(section.id);
                              clearRangeSelections();
                              return;
                            }
                            selectRouteTimeSectionFromRouteEdge(
                              geometry.routeEdgeId,
                              section.id,
                              { keepSelectedEdgeId: true }
                            );
                          }}
                          onMouseDown={(event) => {
                            maybeHandleBranchEdgeMouseDown(event, geometry);
                          }}
                          onContextMenu={(event) =>
                            onEdgeContextMenu(event, geometry.routeEdgeId)
                          }
                          className={`cursor-pointer ${
                            isSelected || isRangeSelected
                              ? "canvas-selected-stroke"
                              : "canvas-invert"
                          }`}
                        />
                        {(() => {
                          const routeEdge = routeEdgeById.get(
                            geometry.routeEdgeId
                          );
                          if (!routeEdge) return null;
                          return getRouteTimeFlowRoutePoints(
                            section,
                            routeEdge,
                            geometry
                          ).map((routePoints, flowIndex) => (
                            <path
                              key={`flow-${flowIndex}`}
                              d={pointsToPath(routePoints)}
                              fill="none"
                              stroke="#ffffff"
                              strokeOpacity={
                                isSelected || isRangeSelected ? 0.82 : 0.62
                              }
                              strokeWidth={2.2}
                              strokeLinecap="round"
                              strokeDasharray={routeTimeFlowDasharray}
                              pointerEvents="none"
                              className="canvas-flow-effect-stroke"
                            >
                              <animate
                                attributeName="stroke-dashoffset"
                                values={routeTimeFlowDashoffsetValues}
                                dur={
                                  isSelected || isRangeSelected
                                    ? "0.9s"
                                    : "1.3s"
                                }
                                repeatCount="indefinite"
                              />
                            </path>
                          ));
                        })()}
                        <path
                          d={pointsToPath(geometry.routePoints)}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={20}
                          strokeLinecap="round"
                          pointerEvents="stroke"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isRouteTemplateMode || isRouteTimeMode) return;
                            if (movedRef.current) {
                              movedRef.current = false;
                              return;
                            }
                            selectRouteEdge(geometry.routeEdgeId);
                            setSelectedNodeId("");
                            setSelectedNodeIds(new Set());
                            if (routingDebugEnabled) {
                              setSelectedRouteTimeSectionId(section.id);
                              clearRangeSelections();
                              return;
                            }
                            selectRouteTimeSectionFromRouteEdge(
                              geometry.routeEdgeId,
                              section.id,
                              { keepSelectedEdgeId: true }
                            );
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
                          fillOpacity={isSelected ? 0.98 : 0.86}
                          stroke={
                            isSelected || isRangeSelected
                              ? displaySectionColor
                              : "transparent"
                          }
                          strokeWidth={isSelected || isRangeSelected ? 2 : 0}
                          className={`canvas-label-bg ${
                            isSelected || isRangeSelected
                              ? "canvas-selected-label-box"
                              : "canvas-invert"
                          }`}
                        />
                        <text
                          x={labelPlacement.x}
                          y={labelPlacement.y + 5}
                          textAnchor="middle"
                          fill={displaySectionColor}
                          className={`font-bold ${
                            isSelected || isRangeSelected
                              ? "text-[14px]"
                              : "text-[13px]"
                          } ${
                            isSelected || isRangeSelected
                              ? "canvas-selected-fill"
                              : "canvas-invert"
                          }`}
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
                            className="canvas-invert"
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
                        className="canvas-invert"
                      />
                    );
                  })}
                </g>
              ) : null}

              {trainRouteGeometryHighlights.map((highlight) => (
                <path
                  key={`train-route-${highlight.key}`}
                  d={pointsToPath(highlight.geometry.routePoints)}
                  fill="none"
                  stroke={highlight.color}
                  strokeWidth={7}
                  strokeOpacity={0.35}
                  strokeLinecap="round"
                  pointerEvents="none"
                  className="canvas-invert"
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
                  className="canvas-invert"
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
                        className="canvas-invert"
                      />,
                    ]
                  : [];
              })}

              {branchInsertDragState
                ? (() => {
                    const primaryRouteEdgeId =
                      branchInsertDragState.routeEdgeIds[0];
                    const geometry = primaryRouteEdgeId
                      ? routeEdgeGeometryById.get(primaryRouteEdgeId)
                      : null;
                    if (!geometry) return null;
                    const plan = getConnectionInsertPlan(
                      branchInsertDragState.placementPoint,
                      branchInsertDragState.currentPoint,
                      geometry,
                      branchInsertDragState.routeEdgeIds
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
                      isFlipped: false,
                      isTerminal: false,
                      isHorizontalTerminal: false,
                      isVerticalTerminal: false,
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
                              className="canvas-invert"
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
                              className="canvas-invert"
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
                const previewedConnectionType =
                  routeNode.type === "connection" &&
                  connectionTypePreview?.nodeId === routeNode.id
                    ? connectionTypePreview.connectionType
                    : null;
                const displayRouteNode =
                  previewedConnectionType && routeNode.type === "connection"
                    ? { ...routeNode, connectionType: previewedConnectionType }
                    : routeNode;
                const isSelected =
                  routeNode.id === selectedNodeId ||
                  selectedNodeIds.has(routeNode.id);
                const isInSelectedTrain = selectedTrainRouteNodeIds.has(
                  routeNode.id
                );
                const isCandidate =
                  isRouteTemplateMode &&
                  connectedCandidateIds.has(routeNode.id);
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
                const routeNodeWidth = getNodeWidth(displayRouteNode);
                const routeNodeHeight = getNodeHeight(displayRouteNode);
                const portRefs = getRouteNodePortRefs(displayRouteNode);
                const layout = getNodeLayoutInfo(displayRouteNode);
                const shouldRotateNodeText =
                  routeNode.type !== "connection" &&
                  isVerticalNode(displayRouteNode);
                const nodeLabelText = getRouteNodeLabel(
                  state.stations,
                  displayRouteNode
                );
                const nodeSubLabelText = `${
                  routeNodeTypeLabels[routeNode.type]
                }${
                  displayRouteNode.rotation
                    ? ` / ${displayRouteNode.rotation}°`
                    : ""
                }`;
                const nodeTextMaxLength = Math.max(
                  24,
                  shouldRotateNodeText
                    ? routeNodeHeight - 28
                    : layout.labelBoxWidth - 22
                );
                const nodeTextTransform = shouldRotateNodeText
                  ? `matrix(0 1 -1 0 ${Math.max(24, routeNodeWidth - 16)} 18)`
                  : undefined;
                const routeTemplatePlatformRegions =
                  getRouteTemplatePlatformRegions(routeNode);
                const nodeFillClassName = `canvas-invert canvas-node-fill canvas-node-fill-${
                  routeNode.type
                }${isCandidate ? " canvas-node-fill-candidate" : ""}`;
                const nodeBorderClassName = isSelected
                  ? "canvas-selected-stroke"
                  : isInSelectedTrain
                  ? "canvas-selected-train-stroke"
                  : "canvas-fixed-light-stroke";
                const rotateButtonPosition = rotateButtonPositionByNodeId.get(
                  routeNode.id
                ) ?? {
                  x: routeNodeWidth / 2,
                  y: -24,
                };
                const actionButtonOffset = rotateButtonRadius + 5;
                const actionButtonTriadOffset = rotateButtonRadius * 2 + 6;
                const showDeleteButton = isSelected;
                const actionButtonSpacing = showDeleteButton
                  ? actionButtonTriadOffset
                  : actionButtonOffset;
                const placeActionButtonsVertically =
                  rotateButtonPosition.x < 0 ||
                  rotateButtonPosition.x > routeNodeWidth;
                const getActionButtonPosition = (offset: number) =>
                  placeActionButtonsVertically
                    ? {
                        x: rotateButtonPosition.x,
                        y: rotateButtonPosition.y + offset,
                      }
                    : {
                        x: rotateButtonPosition.x + offset,
                        y: rotateButtonPosition.y,
                      };
                const rotateActionButtonPosition = getActionButtonPosition(
                  -actionButtonSpacing
                );
                const flipButtonPosition = getActionButtonPosition(
                  showDeleteButton ? 0 : actionButtonSpacing
                );
                const deleteButtonPosition = showDeleteButton
                  ? getActionButtonPosition(actionButtonSpacing)
                  : null;
                const branchTimeLabels =
                  selectedRouteTimeBranchLabelsByNodeId.get(routeNode.id) ?? [];
                return (
                  <g
                    key={routeNode.id}
                    transform={`translate(${routeNode.x}, ${routeNode.y})`}
                    onMouseDown={(event) => onNodeMouseDown(event, routeNode)}
                    onTouchStart={(event) =>
                      onNodeTouchStart(event, routeNode)
                    }
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
                          getConnectionDrawableSegments(displayRouteNode);
                        return (
                          <>
                            <rect
                              width={routeNodeWidth}
                              height={routeNodeHeight}
                              fill="transparent"
                              pointerEvents="all"
                            />
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
                                  className={
                                    isSelected
                                      ? "canvas-selected-stroke"
                                      : "canvas-invert"
                                  }
                                />
                              );
                            })}
                            {routeTimeSectionsForSelectedSpeed.flatMap(
                              (section) => {
                                const isSectionSelected =
                                  section.id === selectedRouteTimeSectionId;
                                const isSectionRangeSelected =
                                  selectedRouteTimeSectionIds.has(section.id);
                                const sectionColor =
                                  getDisplayRouteTimeSectionColor(section);
                                const displaySectionColor =
                                  isSectionSelected || isSectionRangeSelected
                                    ? "#dc2626"
                                    : sectionColor;
                                const toLocalSegment = (segment: {
                                  from: Point;
                                  to: Point;
                                }) => ({
                                  from: {
                                    x: segment.from.x - routeNode.x,
                                    y: segment.from.y - routeNode.y,
                                  },
                                  to: {
                                    x: segment.to.x - routeNode.x,
                                    y: segment.to.y - routeNode.y,
                                  },
                                });
                                const baseSegments =
                                  getConnectionInternalSegmentsFromPorts(
                                    displayRouteNode,
                                    section.routePorts
                                  );
                                const flowSegments =
                                  getRouteTimeConnectionFlowSegments(
                                    displayRouteNode,
                                    section
                                  );
                                return [
                                  ...baseSegments.map(
                                    (segment, segmentIndex) => {
                                      const localSegment =
                                        toLocalSegment(segment);
                                      return (
                                        <path
                                          key={`${section.id}-${segmentIndex}`}
                                          d={`M ${localSegment.from.x} ${localSegment.from.y} L ${localSegment.to.x} ${localSegment.to.y}`}
                                          fill="none"
                                          stroke={displaySectionColor}
                                          strokeOpacity={
                                            isSectionSelected ||
                                            isSectionRangeSelected
                                              ? 0.92
                                              : 0.72
                                          }
                                          strokeWidth={
                                            isSectionSelected ||
                                            isSectionRangeSelected
                                              ? 9
                                              : 7
                                          }
                                          strokeLinecap="round"
                                          className={
                                            isSectionSelected ||
                                            isSectionRangeSelected
                                              ? "canvas-selected-stroke"
                                              : "canvas-invert"
                                          }
                                        />
                                      );
                                    }
                                  ),
                                  ...flowSegments.map(
                                    (segment, segmentIndex) => {
                                      const localSegment =
                                        toLocalSegment(segment);
                                      return (
                                        <path
                                          key={`${section.id}-flow-${segmentIndex}`}
                                          d={`M ${localSegment.from.x} ${localSegment.from.y} L ${localSegment.to.x} ${localSegment.to.y}`}
                                          fill="none"
                                          stroke="#ffffff"
                                          strokeOpacity={
                                            isSectionSelected ||
                                            isSectionRangeSelected
                                              ? 0.82
                                              : 0.62
                                          }
                                          strokeWidth={2.2}
                                          strokeLinecap="round"
                                          strokeDasharray={
                                            routeTimeFlowDasharray
                                          }
                                          pointerEvents="none"
                                          className="canvas-flow-effect-stroke"
                                        >
                                          <animate
                                            attributeName="stroke-dashoffset"
                                            values={
                                              routeTimeFlowDashoffsetValues
                                            }
                                            dur={
                                              isSectionSelected ||
                                              isSectionRangeSelected
                                                ? "0.9s"
                                                : "1.3s"
                                            }
                                            repeatCount="indefinite"
                                          />
                                        </path>
                                      );
                                    }
                                  ),
                                ];
                              }
                            )}
                            {highlightedRouteSections.flatMap(
                              (routeSection) => {
                                const section =
                                  routeTimeSectionByIdForSelectedSpeed.get(
                                    routeSection.routeTimeSectionId
                                  ) ??
                                  state.routeTimeSections.find(
                                    (candidate) =>
                                      candidate.id ===
                                      routeSection.routeTimeSectionId
                                  );
                                if (!section) return [];
                                const routePorts = routeSection.reversed
                                  ? [...section.routePorts].reverse()
                                  : section.routePorts;
                                return getConnectionInternalSegmentsFromPorts(
                                  displayRouteNode,
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
                                      stroke={getDisplayRouteTimeSectionColor(
                                        section
                                      )}
                                      strokeOpacity={0.5}
                                      strokeWidth={7}
                                      strokeLinecap="round"
                                      className="canvas-invert"
                                    />
                                  );
                                });
                              }
                            )}
                            {routeTimeDraft
                              ? getConnectionInternalSegmentsFromPorts(
                                  displayRouteNode,
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
                            {isSelected
                              ? segments.map((segment, segmentIndex) => {
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
                                      key={`selected-connection-${segmentIndex}`}
                                      d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
                                      fill="none"
                                      stroke="#dc2626"
                                      strokeWidth={5}
                                      strokeLinecap="round"
                                      pointerEvents="none"
                                      className="canvas-selected-stroke"
                                    />
                                  );
                                })
                              : null}
                            {branchTimeLabels.map((branchIndex, labelIndex) => {
                              const labelText = `分岐${branchIndex}`;
                              const labelWidth =
                                34 + String(branchIndex).length * 7;
                              const labelHeight = 18;
                              const stackOffset =
                                (labelIndex -
                                  (branchTimeLabels.length - 1) / 2) *
                                (labelWidth + 4);
                              const labelX = routeNodeWidth / 2 + stackOffset;
                              const labelY = -14;
                              return (
                                <g
                                  key={`branch-time-label-${branchIndex}`}
                                  pointerEvents="none"
                                >
                                  <rect
                                    x={labelX - labelWidth / 2}
                                    y={labelY - labelHeight / 2}
                                    width={labelWidth}
                                    height={labelHeight}
                                    rx={5}
                                    fill="#7c3aed"
                                    stroke="#c4b5fd"
                                    strokeWidth={1.5}
                                    className="canvas-branch-break-label-bg"
                                  />
                                  <text
                                    x={labelX}
                                    y={labelY + 4}
                                    textAnchor="middle"
                                    fill="#ffffff"
                                    className="canvas-branch-break-label-text text-[10px] font-bold"
                                  >
                                    {labelText}
                                  </text>
                                </g>
                              );
                            })}
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
                          className={nodeFillClassName}
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
                          className={nodeFillClassName}
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
                          className={nodeBorderClassName}
                        />
                      </>
                    ) : (
                      <>
                        <rect
                          width={routeNodeWidth}
                          height={routeNodeHeight}
                          rx={3}
                          fill={
                            isCandidate ? "#dbeafe" : nodeColors[routeNode.type]
                          }
                          stroke="none"
                          className={nodeFillClassName}
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
                          className={nodeBorderClassName}
                        />
                      </>
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
                        className="canvas-invert"
                      />
                    ) : null}
                    {routeNode.type !== "connection" ? (
                      <g>
                        <text
                          x={shouldRotateNodeText ? 0 : layout.labelX}
                          y={shouldRotateNodeText ? 0 : layout.labelY}
                          transform={nodeTextTransform}
                          fill="#111827"
                          className="canvas-fixed-light-fill pointer-events-none text-[13px]"
                          {...getTextFitProps(
                            nodeLabelText,
                            13,
                            nodeTextMaxLength
                          )}
                        >
                          {nodeLabelText}
                        </text>
                        <text
                          x={shouldRotateNodeText ? 0 : layout.labelX}
                          y={shouldRotateNodeText ? 17 : layout.subLabelY}
                          transform={nodeTextTransform}
                          fill="#6b7280"
                          className="canvas-fixed-light-fill pointer-events-none text-[11px]"
                          {...getTextFitProps(
                            nodeSubLabelText,
                            11,
                            nodeTextMaxLength
                          )}
                        >
                          {nodeSubLabelText}
                        </text>
                      </g>
                    ) : null}
                    {routeNode.type !== "connection" ? (
                      <>
                        <g
                          transform={`translate(${rotateActionButtonPosition.x}, ${rotateActionButtonPosition.y})`}
                          onMouseDown={(event) =>
                            onRotateNode(event, routeNode)
                          }
                          className="cursor-pointer"
                        >
                          <circle
                            cx={0}
                            cy={0}
                            r={rotateButtonRadius}
                            fill="transparent"
                            stroke="transparent"
                            pointerEvents="all"
                          />
                          <NodeActionIcon kind="rotate" />
                        </g>
                        <g
                          transform={`translate(${flipButtonPosition.x}, ${flipButtonPosition.y})`}
                          onMouseDown={(event) => onFlipNode(event, routeNode)}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={0}
                            cy={0}
                            r={rotateButtonRadius}
                            fill="transparent"
                            stroke="transparent"
                            pointerEvents="all"
                          />
                          <NodeActionIcon kind="flip" />
                        </g>
                        {deleteButtonPosition ? (
                          <g
                            transform={`translate(${deleteButtonPosition.x}, ${deleteButtonPosition.y})`}
                            onMouseDown={(event) =>
                              onDeleteNode(event, routeNode)
                            }
                            className="cursor-pointer"
                          >
                            <circle
                              cx={0}
                              cy={0}
                              r={rotateButtonRadius}
                              fill="transparent"
                              stroke="transparent"
                              pointerEvents="all"
                            />
                            <NodeActionIcon kind="delete" />
                          </g>
                        ) : null}
                      </>
                    ) : null}
                    {portRefs.map((portRef) => {
                      const port = getPortPosition(
                        displayRouteNode,
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
                      const highlightedRouteTimeEndpointColor =
                        highlightedRouteTimeEndpointColorByKey.get(portKey);
                      const isHighlightedRouteTimeEndpoint = Boolean(
                        highlightedRouteTimeEndpointColor
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
                      const visiblePortFill = isHighlightedRouteTimeEndpoint
                        ? highlightedRouteTimeEndpointColor
                        : isRouteTimeMode
                        ? routeTimePortFill
                        : isOccupied
                        ? portColor
                        : "#ffffff";
                      const visiblePortStroke = isHighlightedRouteTimeEndpoint
                        ? highlightedRouteTimeEndpointColor
                        : isRouteTimeMode
                        ? routeTimePortStroke
                        : portColor;
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
                      const platformLabelRectY = labelY - 13;
                      const platformLabelRectHeight = 17;
                      const platformLabelTextX =
                        platformLabelRectX + platformLabelWidth / 2;
                      const platformLabelTextY =
                        platformLabelRectY + platformLabelRectHeight / 2;
                      return (
                        <g key={`${portRef.side}-${portRef.index}`}>
                          <circle
                            cx={localX}
                            cy={localY}
                            r={currentPortRadius}
                            fill={portVisible ? visiblePortFill : "transparent"}
                            stroke={
                              portVisible ? visiblePortStroke : "transparent"
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
                            className={
                              isHighlightedRouteTimeEndpoint
                                ? "canvas-selected-port cursor-crosshair"
                                : portVisible &&
                                  !isOccupied &&
                                  !isDraftPort &&
                                  !isSectionEndpoint
                                ? "canvas-open-port cursor-crosshair"
                                : portVisible
                                ? "canvas-fixed-white-port cursor-crosshair"
                                : "cursor-crosshair"
                            }
                          />
                          {routeNode.type !== "connection" ? (
                            <>
                              <rect
                                x={platformLabelRectX}
                                y={platformLabelRectY}
                                width={platformLabelWidth}
                                height={platformLabelRectHeight}
                                rx={3}
                                fill="#ffffff"
                                fillOpacity={
                                  isHighlightedRouteTimeEndpoint ? 0.98 : 0.86
                                }
                                stroke={
                                  highlightedRouteTimeEndpointColor ??
                                  "transparent"
                                }
                                strokeWidth={
                                  isHighlightedRouteTimeEndpoint ? 1.8 : 0
                                }
                                pointerEvents="none"
                                className={`canvas-label-bg ${
                                  isHighlightedRouteTimeEndpoint
                                    ? "canvas-selected-label-box"
                                    : "canvas-invert"
                                }`}
                              />
                              <text
                                x={platformLabelTextX}
                                y={platformLabelTextY}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill="#334155"
                                className="canvas-fixed-light-fill pointer-events-none text-[13px] font-bold"
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
                            className="canvas-invert canvas-label-bg"
                          />
                          {headerText ? (
                            <text
                              x={0}
                              y={0}
                              textAnchor={position.textAnchor}
                              fill="#111827"
                              className="canvas-timetable-text text-[11px] font-bold"
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
                              fill="#111827"
                              className="canvas-timetable-text text-[11px]"
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
        </div>
        <div
          className="route-editor-tool-rail absolute left-3 top-3 z-40 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
          data-floating-panel-no-drag="true"
        >
          {floatingPanelTools.map((tool) => {
            const isActive = openedFloatingPanelSection === tool.key;
            return (
              <button
                key={tool.key}
                type="button"
                title={tool.label}
                aria-label={tool.label}
                aria-pressed={isActive}
                onClick={() => openFloatingPanelSection(tool.key)}
                className={`route-editor-tool-button grid h-11 w-11 place-items-center rounded-lg border transition ${
                  isActive
                    ? "border-blue-600 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-950"
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-500 dark:hover:bg-slate-700"
                }`}
              >
                <img
                  src={tool.iconUrl}
                  alt=""
                  aria-hidden="true"
                  className="route-editor-tool-icon"
                />
              </button>
            );
          })}
        </div>
        <aside
          ref={routeMapPanelRef}
          className={`${
            isFloatingPanelVisible ? "absolute z-30 flex" : "hidden"
          } max-h-[calc(100%-1rem)] w-[min(360px,calc(100vw-2rem))] min-w-0 flex-col gap-0 overflow-auto rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:p-4`}
          style={{
            left: floatingPanelPosition.x,
            top: floatingPanelPosition.y,
          }}
          onMouseDownCapture={(event) => {
            if (isFloatingPanelDragControl(event.target)) return;
            startFloatingPanelDrag(event);
          }}
        >
          <details
            className="route-panel-accordion route-floating-panel-section text-sm dark:text-slate-100"
            hidden={openedFloatingPanelSection !== "routeEditing"}
            open={openedFloatingPanelSection === "routeEditing"}
            onToggle={(event) =>
              handleFloatingPanelSectionToggle("routeEditing", event)
            }
          >
            <summary>
              <span className="route-panel-accordion-icon" aria-hidden="true">
                ›
              </span>
              <span className="min-w-0 flex-1">ルート修正</span>
              <span className="rounded bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                {selectedManualRouteEndpointInfo
                  ? selectedManualRouteEndpointInfo.routeEdge.manualWaypoints
                      ?.length
                    ? "修正済み"
                    : "自動"
                  : "未選択"}
              </span>
            </summary>
            <div className="route-panel-accordion-body">
            {selectedManualRouteEndpointInfo ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded bg-slate-600 px-3 py-1 text-white disabled:bg-slate-300"
                    disabled={
                      !isManualRouteDrawMode ||
                      manualRouteWaypointPast.length === 0
                    }
                    onClick={undoManualRouteWaypointEdit}
                  >
                    戻る
                  </button>
                  <button
                    type="button"
                    className="rounded bg-slate-600 px-3 py-1 text-white disabled:bg-slate-300"
                    disabled={
                      !isManualRouteDrawMode ||
                      manualRouteWaypointFuture.length === 0
                    }
                    onClick={redoManualRouteWaypointEdit}
                  >
                    やり直し
                  </button>
                  <button
                    type="button"
                    className="rounded bg-slate-600 px-3 py-1 text-white disabled:bg-slate-300"
                    disabled={!isManualRouteDrawMode || manualRouteWaypoints.length === 0}
                    onClick={clearManualRouteDraftWaypoints}
                  >
                    クリア
                  </button>
                  <button
                    type="button"
                    className="rounded bg-emerald-600 px-3 py-1 text-white disabled:bg-slate-300"
                    disabled={!isManualRouteDrawMode || manualRouteWaypoints.length === 0}
                    onClick={saveManualRouteWaypoints}
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    className="rounded bg-red-600 px-3 py-1 text-white disabled:bg-slate-300"
                    disabled={
                      !selectedManualRouteEndpointInfo.routeEdge.manualWaypoints
                        ?.length
                    }
                    onClick={clearManualRouteWaypoints}
                  >
                    自動に戻す
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                接続線をクリックすると、ルート修正で中継点を設定できます。
              </p>
            )}
            </div>
          </details>
          {routingDebugEnabled ? (
            <details
              hidden
              className="route-panel-accordion text-sm dark:text-slate-100"
            >
              <summary>
                <span className="route-panel-accordion-icon" aria-hidden="true">
                  ›
                </span>
                <span className="min-w-0 flex-1">ルーティングDebug</span>
                <span className="rounded bg-amber-200 px-2 py-1 text-xs font-bold text-amber-950 dark:bg-amber-700 dark:text-white">
                  {routingDebugResult ? "ON" : "edge未選択"}
                </span>
              </summary>
              <div className="route-panel-accordion-body">
              <p className="text-xs text-gray-600 dark:text-slate-300">
                Debug ON 中は接続線クリックで対象 edge を選択します。
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(routingDebugLayerLabels) as RoutingDebugLayerKey[]).map(
                  (layerKey) => (
                    <label
                      key={layerKey}
                      className="flex items-center gap-2 rounded border border-amber-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={routingDebugLayers[layerKey]}
                        onChange={(event) =>
                          setRoutingDebugLayers((current) => ({
                            ...current,
                            [layerKey]: event.target.checked,
                          }))
                        }
                      />
                      {routingDebugLayerLabels[layerKey]}
                    </label>
                  )
                )}
              </div>
              {routingDebugResult ? (
                <>
                  <div className="rounded border border-amber-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                    <div>
                      <span className="font-bold">routeEdge:</span>{" "}
                      {routingDebugResult.routeEdge.id}
                    </div>
                    <div>
                      <span className="font-bold">from/to:</span>{" "}
                      {(() => {
                        const routeNode = routeNodeById.get(
                          routingDebugResult.routeEdge.fromNodeId
                        );
                        return routeNode
                          ? getRouteNodeLabel(state.stations, routeNode)
                          : routingDebugResult.routeEdge.fromNodeId;
                      })()}{" "}
                      →{" "}
                      {(() => {
                        const routeNode = routeNodeById.get(
                          routingDebugResult.routeEdge.toNodeId
                        );
                        return routeNode
                          ? getRouteNodeLabel(state.stations, routeNode)
                          : routingDebugResult.routeEdge.toNodeId;
                      })()}
                    </div>
                    <div>
                      <span className="font-bold">処理順:</span>{" "}
                      {routingDebugResult.orderIndex + 1} /{" "}
                      {state.routeEdges.length}
                    </div>
                    <div>
                      <span className="font-bold">採用理由:</span>{" "}
                      {routingDebugResult.selectedBy}
                    </div>
                  </div>
                  <div className="rounded border border-pink-200 bg-white p-2 text-xs dark:border-pink-800 dark:bg-slate-800">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="font-bold text-pink-700 dark:text-pink-200">
                        仮想ルート診断
                      </div>
                      <span className="rounded bg-pink-100 px-2 py-0.5 font-bold text-pink-800 dark:bg-pink-950 dark:text-pink-100">
                        {virtualRouteDiagnosis?.feasibility ?? "未診断"}
                      </span>
                    </div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={`rounded px-2 py-1 text-white ${
                          isVirtualRouteDrawMode
                            ? "bg-pink-600"
                            : "bg-slate-700"
                        } disabled:bg-slate-300`}
                        disabled={!routingDebugResult.endpointInfo}
                        onClick={() =>
                          setIsVirtualRouteDrawMode((current) => !current)
                        }
                      >
                        仮想ルートを描く
                      </button>
                      <button
                        type="button"
                        className="rounded bg-slate-600 px-2 py-1 text-white disabled:bg-slate-300"
                        disabled={virtualRouteWaypoints.length === 0}
                        onClick={() =>
                          setVirtualRouteWaypoints((current) =>
                            current.slice(0, -1)
                          )
                        }
                      >
                        waypoint削除
                      </button>
                      <button
                        type="button"
                        className="rounded bg-slate-600 px-2 py-1 text-white disabled:bg-slate-300"
                        disabled={virtualRouteWaypoints.length === 0}
                        onClick={() => setVirtualRouteWaypoints([])}
                      >
                        仮想ルートクリア
                      </button>
                    </div>
                    <p className="mb-2 text-[11px] text-gray-600 dark:text-slate-300">
                      描画中はクリックで waypoint を追加、Shift+クリックで直交補助。Escで中断、Backspaceで1つ戻します。
                    </p>
                    {virtualRouteDiagnosis ? (
                      <>
                        <div className="rounded border border-pink-100 bg-pink-50 p-2 dark:border-slate-700 dark:bg-slate-900">
                          <div className="mb-1 font-bold">判定サマリ</div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <span>feasibility</span>
                            <span>{virtualRouteDiagnosis.feasibility}</span>
                            <span>primaryCause</span>
                            <span>{virtualRouteDiagnosis.primaryCause}</span>
                            <span>current selectedBy</span>
                            <span>{virtualRouteDiagnosis.currentSelectedBy}</span>
                            <span>virtual vs current score</span>
                            <span>
                              {Math.round(
                                virtualRouteDiagnosis.scoreBreakdown.total
                              )}{" "}
                              /{" "}
                              {Math.round(
                                virtualRouteDiagnosis.currentScoreBreakdown
                                  ?.total ?? 0
                              )}
                            </span>
                            <span>score delta</span>
                            <span>
                              {Math.round(
                                virtualRouteDiagnosis.scoreBreakdown.total -
                                  (virtualRouteDiagnosis.currentScoreBreakdown
                                    ?.total ?? 0)
                              )}
                            </span>
                            <span>virtual collision</span>
                            <span>
                              {virtualRouteDiagnosis.virtualCollisionCount}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                          <div className="font-bold">
                            主原因: {virtualRouteDiagnosis.primaryCause}
                          </div>
                          {(() => {
                            const primaryReasons =
                              getPrimaryCauseRelatedReasons(
                                virtualRouteDiagnosis
                              );
                            const otherReasons =
                              virtualRouteDiagnosis.blockingReasons.filter(
                                (reason) => !primaryReasons.includes(reason)
                              );
                            return primaryReasons.length > 0 ? (
                              <>
                                <ul className="mt-1 list-disc pl-5">
                                  {primaryReasons.map((reason) => (
                                    <li key={reason}>{reason}</li>
                                  ))}
                                </ul>
                                {otherReasons.length > 0 ? (
                                  <div className="mt-1 text-[11px] opacity-80">
                                    他のblockingReasons:{" "}
                                    {otherReasons.join(" / ")}
                                  </div>
                                ) : null}
                              </>
                            ) : (
                              <div className="mt-1">
                                hard block はありません。
                              </div>
                            );
                          })()}
                        </div>
                        {virtualRouteDiagnosis.secondaryNotes.length > 0 ? (
                          <div className="mt-2 rounded border border-sky-200 bg-sky-50 p-2 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
                            <div className="font-bold">補足</div>
                            <ul className="mt-1 list-disc pl-5">
                              {virtualRouteDiagnosis.secondaryNotes.map(
                                (note) => (
                                  <li key={note}>{note}</li>
                                )
                              )}
                            </ul>
                          </div>
                        ) : null}
                        {virtualRouteDiagnosis.missingRequirements.length > 0 ? (
                          <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                            <div className="font-bold">不足条件</div>
                            <ul className="mt-1 list-disc pl-5">
                              {virtualRouteDiagnosis.missingRequirements.map(
                                (requirement) => (
                                  <li key={requirement}>{requirement}</li>
                                )
                              )}
                            </ul>
                          </div>
                        ) : null}
                        <div className="mt-2 rounded border border-pink-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                          <div className="font-bold">衝突詳細</div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <span>node / label</span>
                            <span>
                              {
                                virtualRouteDiagnosis.collisionCounts
                                  .nodeCollisionCount
                              }{" "}
                              /{" "}
                              {
                                virtualRouteDiagnosis.collisionCounts
                                  .labelCollisionCount
                              }
                            </span>
                            <span>own allowed / suspicious / blocked</span>
                            <span>
                              {
                                virtualRouteDiagnosis.collisionCounts
                                  .allowedOwnEndpointKeepoutCollisionCount
                              }{" "}
                              /{" "}
                              {
                                virtualRouteDiagnosis.collisionCounts
                                  .suspiciousOwnEndpointKeepoutCollisionCount ?? 0
                              }{" "}
                              /{" "}
                              {
                                virtualRouteDiagnosis.collisionCounts
                                  .blockedOwnEndpointKeepoutCollisionCount
                              }
                            </span>
                            <span>foreign keepout</span>
                            <span>
                              {
                                virtualRouteDiagnosis.collisionCounts
                                  .foreignPortKeepoutCollisionCount
                              }
                            </span>
                            <span>soft / track</span>
                            <span>
                              {
                                virtualRouteDiagnosis.collisionCounts
                                  .softRouteCollisionScore
                              }{" "}
                              /{" "}
                              {
                                virtualRouteDiagnosis.collisionCounts
                                  .trackOverlapScore
                              }
                            </span>
                          </div>
                          {virtualRouteDiagnosis.collidedObstacleDetails.length >
                          0 ? (
                            <div className="mt-1 max-h-24 overflow-auto">
                              {virtualRouteDiagnosis.collidedObstacleDetails
                                .slice(0, 12)
                                .map((detail, index) => (
                                  <div
                                    key={`${detail.obstacle.id}-${detail.segmentIndex}-${index}`}
                                  >
                                    {detail.obstacle.kind} /{" "}
                                    {detail.obstacle.sourceLabel ??
                                      detail.obstacle.sourceNodeId ??
                                      "-"}{" "}
                                    {detail.obstacle.portSide
                                      ? `${detail.obstacle.portSide}:${
                                          (detail.obstacle.portIndex ?? 0) + 1
                                        }`
                                      : ""}
                                    {" / "}
                                    {detail.allowed ? "allowed" : "blocked"} /{" "}
                                    {detail.reason}
                                  </div>
                                ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 rounded border border-pink-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                          <div className="font-bold">比較</div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <span>current / virtual length</span>
                            <span>
                              {virtualRouteDiagnosis.currentLength} /{" "}
                              {virtualRouteDiagnosis.virtualLength}
                            </span>
                            <span>current / virtual bend</span>
                            <span>
                              {virtualRouteDiagnosis.currentBendCount} /{" "}
                              {virtualRouteDiagnosis.virtualBendCount}
                            </span>
                            <span>current / virtual score</span>
                            <span>
                              {Math.round(
                                virtualRouteDiagnosis.currentScoreBreakdown
                                  ?.total ?? 0
                              )}{" "}
                              /{" "}
                              {Math.round(
                                virtualRouteDiagnosis.scoreBreakdown.total
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 rounded border border-pink-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                          <div className="font-bold">経路順序情報</div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <span>orderIndex</span>
                            <span>
                              {virtualRouteDiagnosis.routeOrderingAnalysis
                                .routeEdgeOrderIndex != null
                                ? virtualRouteDiagnosis.routeOrderingAnalysis
                                    .routeEdgeOrderIndex + 1
                                : "-"}{" "}
                              /{" "}
                              {virtualRouteDiagnosis.routeOrderingAnalysis
                                .totalRouteEdges ?? "-"}
                            </span>
                            <span>previous edges</span>
                            <span>
                              {
                                virtualRouteDiagnosis.routeOrderingAnalysis
                                  .previousRouteEdgeIds.length
                              }
                            </span>
                            <span>soft / track previous</span>
                            <span>
                              {
                                virtualRouteDiagnosis.routeOrderingAnalysis
                                  .previousRouteEdgesUsedAsSoftObstacles.length
                              }{" "}
                              /{" "}
                              {
                                virtualRouteDiagnosis.routeOrderingAnalysis
                                  .previousRouteEdgesUsedAsTrackOverlapObstacles
                                  .length
                              }
                            </span>
                            <span>blockedByEarlierGeometry</span>
                            <span>
                              {String(
                                virtualRouteDiagnosis.routeOrderingAnalysis
                                  .blockedByEarlierGeometry
                              )}
                            </span>
                            <span>routeOrderSensitive</span>
                            <span>
                              {String(
                                virtualRouteDiagnosis.routeOrderingAnalysis
                                  .routeOrderSensitive
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 rounded border border-pink-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                          <div className="font-bold">関係分類</div>
                          <div>
                            relationType:{" "}
                            {virtualRouteDiagnosis.routeEdgeRelationAnalysis
                              .relationType ?? "independent"}
                          </div>
                          <div>
                            relationGroupId:{" "}
                            {virtualRouteDiagnosis.routeEdgeRelationAnalysis
                              .relationGroupId ?? "-"}
                          </div>
                          {virtualRouteDiagnosis.routeEdgeRelationAnalysis
                            .relatedEdges.length > 0 ? (
                            <div className="mt-1 max-h-24 overflow-auto">
                              {virtualRouteDiagnosis.routeEdgeRelationAnalysis
                                .relatedEdges.slice(0, 10)
                                .map((detail) => (
                                  <div key={detail.routeEdgeId}>
                                    {detail.routeEdgeId}: {detail.relation} /{" "}
                                    {detail.reason}
                                  </div>
                                ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 rounded border border-pink-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                          <div className="font-bold">corridor</div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <span>type</span>
                            <span>
                              {virtualRouteDiagnosis.corridorAnalysis
                                .endpointCorridorType ?? "-"}
                            </span>
                            <span>own allowed / blocked</span>
                            <span>
                              {
                                virtualRouteDiagnosis.corridorAnalysis
                                  .ownEndpointKeepoutAllowedCount
                              }{" "}
                              /{" "}
                              {
                                virtualRouteDiagnosis.corridorAnalysis
                                  .ownEndpointKeepoutBlockedCount
                              }
                            </span>
                            <span>foreign blocked</span>
                            <span>
                              {
                                virtualRouteDiagnosis.corridorAnalysis
                                  .foreignKeepoutBlockedCount
                              }
                            </span>
                            <span>corridorTooNarrow</span>
                            <span>
                              {String(
                                virtualRouteDiagnosis.corridorAnalysis
                                  .corridorTooNarrow
                              )}
                            </span>
                            <span>nodeBacksideRisk</span>
                            <span>
                              {String(
                                virtualRouteDiagnosis.corridorAnalysis
                                  .nodeBacksideRisk
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 rounded border border-pink-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                          <div className="font-bold">候補生成</div>
                          <div>
                            virtualMatchesExistingCandidate:{" "}
                            {String(
                              virtualRouteDiagnosis.candidateAnalysis
                                .virtualMatchesExistingCandidate
                            )}
                          </div>
                          <div>
                            nearestCandidate:{" "}
                            {virtualRouteDiagnosis.candidateAnalysis
                              .nearestCandidateSource ?? "-"}{" "}
                            /{" "}
                            {Math.round(
                              virtualRouteDiagnosis.candidateAnalysis
                                .nearestCandidateDistance ??
                                Number.POSITIVE_INFINITY
                            )}
                          </div>
                          <div>
                            sources:{" "}
                            {virtualRouteDiagnosis.candidateAnalysis
                              .candidateSourcesPresent.length > 0
                              ? virtualRouteDiagnosis.candidateAnalysis
                                  .candidateSourcesPresent.join(", ")
                              : "-"}
                          </div>
                          <div>
                            virtualWouldWinIfCandidate:{" "}
                            {String(
                              virtualRouteDiagnosis.candidateGenerationAnalysis
                                .virtualWouldWinIfCandidate
                            )}
                          </div>
                          <div>
                            virtualWouldWinWithoutPreviousGeometry:{" "}
                            {String(
                              virtualRouteDiagnosis.candidateGenerationAnalysis
                                .virtualWouldWinWithoutPreviousGeometry
                            )}
                          </div>
                          <div className="mt-1 border-t border-pink-100 pt-1 dark:border-slate-700">
                            比較score 通常/先生成/sameCorridor:{" "}
                            {Math.round(
                              virtualRouteDiagnosis.candidateGenerationAnalysis
                                .scoreWithPreviousGeometry ?? 0
                            )}{" "}
                            /{" "}
                            {Math.round(
                              virtualRouteDiagnosis.candidateGenerationAnalysis
                                .scoreWithoutPreviousGeometry ?? 0
                            )}{" "}
                            /{" "}
                            {Math.round(
                              virtualRouteDiagnosis.candidateGenerationAnalysis
                                .sameCorridorGroupScore ?? 0
                            )}
                          </div>
                          <div>
                            先生成なら勝つ/sameCorridorなら勝つ:{" "}
                            {String(
                              virtualRouteDiagnosis.candidateGenerationAnalysis
                                .selectedFirstWouldWin
                            )}{" "}
                            /{" "}
                            {String(
                              virtualRouteDiagnosis.candidateGenerationAnalysis
                                .sameCorridorGroupWouldWin
                            )}
                          </div>
                          {virtualRouteDiagnosis.candidateAnalysis
                            .candidateSourcesRejected.length > 0 ? (
                            <div className="mt-1 max-h-24 overflow-auto">
                              {virtualRouteDiagnosis.candidateAnalysis
                                .candidateSourcesRejected.slice(0, 8)
                                .map((candidate, index) => (
                                  <div
                                    key={`${candidate.source}-${candidate.score ?? index}-${index}`}
                                  >
                                    {candidate.source}:{" "}
                                    {candidate.reasons.join(" / ") || "-"}
                                  </div>
                                ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-2 rounded border border-pink-100 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                          <div className="font-bold">探索グラフ</div>
                          <div>
                            bounds内:{" "}
                            {String(
                              virtualRouteDiagnosis.virtualInsideSearchBounds
                            )}
                          </div>
                          <div>
                            missingX:{" "}
                            {virtualRouteDiagnosis.missingXValues.join(", ") ||
                              "-"}
                          </div>
                          <div>
                            missingY:{" "}
                            {virtualRouteDiagnosis.missingYValues.join(", ") ||
                              "-"}
                          </div>
                          <div>
                            segmentsNotInSearchGraph:{" "}
                            {virtualRouteDiagnosis.graphMissingSegments.length}
                          </div>
                          {virtualRouteDiagnosis.graphMissingSegments.length > 0 ? (
                            <div className="mt-1 max-h-24 overflow-auto">
                              {virtualRouteDiagnosis.graphMissingSegments
                                .slice(0, 8)
                                .map((segment, index) => (
                                  <div
                                    key={`${segment.from.x}:${segment.from.y}-${segment.to.x}:${segment.to.y}-${index}`}
                                  >
                                    ({Math.round(segment.from.x)},{" "}
                                    {Math.round(segment.from.y)}) → (
                                    {Math.round(segment.to.x)},{" "}
                                    {Math.round(segment.to.y)}): {segment.reason}
                                  </div>
                                ))}
                            </div>
                          ) : null}
                        </div>
                        {virtualRouteDiagnosis.rejectedReasons.length > 0 ? (
                          <div className="mt-2 text-gray-600 dark:text-slate-300">
                            rejected:{" "}
                            {virtualRouteDiagnosis.rejectedReasons.join(" / ")}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="text-gray-600 dark:text-slate-300">
                        選択 edge の endpoint 情報がないため診断できません。
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-pink-100 pt-2 dark:border-slate-700">
                      <button
                        type="button"
                        className="rounded bg-pink-600 px-2 py-1 text-white disabled:bg-slate-300"
                        disabled={!virtualRouteDiagnosis}
                        onClick={recordVirtualRouteDiagnosis}
                      >
                        原因を記録
                      </button>
                      <span>ログ {routingDebugLogEntries.length}件</span>
                      <button
                        type="button"
                        className="rounded bg-slate-700 px-2 py-1 text-white disabled:bg-slate-300"
                        disabled={routingDebugLogEntries.length === 0}
                        onClick={() => downloadRoutingDebugLog("jsonl")}
                      >
                        JSONL
                      </button>
                      <button
                        type="button"
                        className="rounded bg-slate-700 px-2 py-1 text-white disabled:bg-slate-300"
                        disabled={routingDebugLogEntries.length === 0}
                        onClick={() => downloadRoutingDebugLog("json")}
                      >
                        JSON
                      </button>
                      <button
                        type="button"
                        className="rounded bg-red-600 px-2 py-1 text-white disabled:bg-slate-300"
                        disabled={routingDebugLogEntries.length === 0}
                        onClick={clearRoutingDebugLog}
                      >
                        ログをクリア
                      </button>
                    </div>
                    {routingDebugLogSummary.total > 0 ? (
                      <div className="mt-2 rounded border border-pink-100 bg-pink-50 p-2 text-[11px] dark:border-slate-700 dark:bg-slate-900">
                        <div className="font-bold">ログ集計</div>
                        <div>total: {routingDebugLogSummary.total}</div>
                        <div>
                          feasibility:{" "}
                          {routingDebugLogSummary.feasibilityCounts
                            .map(([key, count]) => `${key}:${count}`)
                            .join(" / ")}
                        </div>
                        <div>
                          primaryCause:{" "}
                          {routingDebugLogSummary.primaryCauseCounts
                            .map(([key, count]) => `${key}:${count}`)
                            .join(" / ")}
                        </div>
                        <div>
                          obstacle:{" "}
                          {routingDebugLogSummary.obstacleKindCounts
                            .map(([key, count]) => `${key}:${count}`)
                            .join(" / ")}
                        </div>
                        <div>
                          relation:{" "}
                          {routingDebugLogSummary.relationTypeCounts
                            .map(([key, count]) => `${key}:${count}`)
                            .join(" / ") || "-"}
                        </div>
                        <div>
                          ownEndpoint allowed/suspicious/block:{" "}
                          {routingDebugLogSummary.ownEndpointAllowed} /{" "}
                          {routingDebugLogSummary.ownEndpointSuspicious} /{" "}
                          {routingDebugLogSummary.ownEndpointBlocked}
                        </div>
                        <div>
                          better/gap/node/label:{" "}
                          {routingDebugLogSummary.virtualScoreBetter} /{" "}
                          {routingDebugLogSummary.candidateGenerationGap} /{" "}
                          {routingDebugLogSummary.nodeCollision} /{" "}
                          {routingDebugLogSummary.labelCollision}
                        </div>
                        <div>
                          order/earlier/corridor/winIfCandidate:{" "}
                          {routingDebugLogSummary.routeOrderSensitive} /{" "}
                          {routingDebugLogSummary.blockedByEarlierGeometry} /{" "}
                          {routingDebugLogSummary.corridorTooNarrow} /{" "}
                          {routingDebugLogSummary.virtualWouldWinIfCandidate}
                        </div>
                        <div>
                          routeEdge top:{" "}
                          {routingDebugLogSummary.routeEdgeTop
                            .map(([key, count]) => `${key}:${count}`)
                            .join(" / ")}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {routingDebugResult.endpointInfo ? (
                    <div className="rounded border border-amber-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                      <div className="font-bold">ポート方向 / endpoint rule</div>
                      <div>
                        fromSide: {routingDebugResult.endpointInfo.fromSide} /{" "}
                        toSide: {routingDebugResult.endpointInfo.toSide}
                      </div>
                      <div>
                        fromFacing:{" "}
                        {String(routingDebugResult.endpointInfo.fromFacing)} /{" "}
                        toFacing:{" "}
                        {String(routingDebugResult.endpointInfo.toFacing)}
                      </div>
                      <div>
                        requiresSharedSameSideLane:{" "}
                        {String(
                          routingDebugResult.endpointInfo
                            .requiresSharedSameSideLane
                        )}
                      </div>
                      <div>
                        requiresLaneRoute:{" "}
                        {String(
                          routingDebugResult.endpointInfo.requiresLaneRoute
                        )}
                      </div>
                      <div>
                        rule: {routingDebugResult.endpointInfo.fromRule} /{" "}
                        {routingDebugResult.endpointInfo.toRule}
                      </div>
                      {routingDebugResult.endpointInfo.failures.length > 0 ? (
                        <ul className="mt-1 list-disc pl-5 text-red-600 dark:text-red-300">
                          {routingDebugResult.endpointInfo.failures.map(
                            (failure) => (
                              <li key={failure}>{failure}</li>
                            )
                          )}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  {(() => {
                    const acceptedCandidate =
                      [...routingDebugResult.candidates]
                        .reverse()
                        .find((candidate) => candidate.accepted) ?? null;
                    const score = acceptedCandidate?.scoreBreakdown;
                    return score ? (
                      <div className="rounded border border-amber-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                        <div className="mb-1 font-bold">スコア内訳</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                          <span>hardCollision</span>
                          <span>{score.hardCollisionCount}</span>
                          <span>softObstacle</span>
                          <span>{score.softObstacleScore}</span>
                          <span>trackOverlap</span>
                          <span>{score.trackOverlapScore}</span>
                          <span>detour</span>
                          <span>{score.detourScore}</span>
                          <span>bend</span>
                          <span>{score.bendCount}</span>
                          <span>length</span>
                          <span>{score.length}</span>
                          <span className="font-bold">total</span>
                          <span className="font-bold">
                            {Math.round(score.total)}
                          </span>
                        </div>
                      </div>
                    ) : null;
                  })()}
                  <div className="max-h-52 overflow-auto rounded border border-amber-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-800">
                    <table className="w-full border-collapse">
                      <thead className="sticky top-0 bg-amber-100 dark:bg-slate-700">
                        <tr>
                          <th className="p-1 text-left">候補</th>
                          <th className="p-1 text-left">source</th>
                          <th className="p-1 text-right">score</th>
                          <th className="p-1 text-left">棄却理由</th>
                        </tr>
                      </thead>
                      <tbody>
                        {routingDebugResult.candidates.map((candidate) => (
                          <tr
                            key={candidate.id}
                            className={
                              candidate.accepted
                                ? "bg-red-50 dark:bg-red-950/40"
                                : ""
                            }
                          >
                            <td className="border-t border-amber-100 p-1 dark:border-slate-700">
                              {candidate.id}
                            </td>
                            <td className="border-t border-amber-100 p-1 dark:border-slate-700">
                              {candidate.source}
                            </td>
                            <td className="border-t border-amber-100 p-1 text-right dark:border-slate-700">
                              {Math.round(candidate.score)}
                            </td>
                            <td className="border-t border-amber-100 p-1 text-gray-600 dark:border-slate-700 dark:text-slate-300">
                              {candidate.accepted
                                ? "採用"
                                : candidate.rejectionReasons.join(" / ") ||
                                  "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {routingDebugResult.lintWarnings.length > 0 ? (
                    <div className="rounded border border-red-200 bg-white p-2 text-xs dark:border-red-800 dark:bg-slate-800">
                      <div className="font-bold text-red-700 dark:text-red-300">
                        routing lint
                      </div>
                      <ul className="mt-1 list-disc pl-5">
                        {routingDebugResult.lintWarnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="max-h-36 overflow-auto rounded border border-amber-200 bg-white p-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                    <div className="mb-1 font-bold">routeEdges処理順</div>
                    {state.routeEdges.map((routeEdge, index) => (
                      <div
                        key={`debug-order-${routeEdge.id}`}
                        className={
                          routeEdge.id === routingDebugResult.routeEdge.id
                            ? "font-bold text-red-700 dark:text-red-300"
                            : ""
                        }
                      >
                        {index + 1}. {routeEdge.id}
                      </div>
                    ))}
                  </div>
                  {routingDebugResult.connectionMatrix.length > 0 ? (
                    <div className="max-h-40 overflow-auto rounded border border-amber-200 bg-white text-xs dark:border-slate-700 dark:bg-slate-800">
                      <table className="w-full border-collapse">
                        <thead className="sticky top-0 bg-amber-100 dark:bg-slate-700">
                          <tr>
                            <th className="p-1 text-left">分岐</th>
                            <th className="p-1 text-left">scope</th>
                            <th className="p-1 text-left">entry</th>
                            <th className="p-1 text-left">exit</th>
                            <th className="p-1 text-left">結果</th>
                          </tr>
                        </thead>
                        <tbody>
                          {routingDebugResult.connectionMatrix.map(
                            (row, index) => (
                              <tr key={`${row.nodeId}-${index}`}>
                                <td className="border-t border-amber-100 p-1 dark:border-slate-700">
                                  {row.nodeLabel}
                                </td>
                                <td className="border-t border-amber-100 p-1 dark:border-slate-700">
                                  {row.scope}
                                </td>
                                <td className="border-t border-amber-100 p-1 dark:border-slate-700">
                                  {row.entry.side}:{row.entry.index + 1}
                                </td>
                                <td className="border-t border-amber-100 p-1 dark:border-slate-700">
                                  {row.exit.side}:{row.exit.index + 1}
                                </td>
                                <td className="border-t border-amber-100 p-1 dark:border-slate-700">
                                  {row.ok ? "OK" : "NG"}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </>
              ) : null}
              </div>
            </details>
          ) : null}
          <details
            className="route-panel-accordion route-floating-panel-section text-sm"
            hidden={openedFloatingPanelSection !== "addNode"}
            open={openedFloatingPanelSection === "addNode"}
            onToggle={(event) =>
              handleFloatingPanelSectionToggle("addNode", event)
            }
          >
            <summary>
              <span className="route-panel-accordion-icon" aria-hidden="true">
                ›
              </span>
              <span className="min-w-0 flex-1">ノード追加</span>
            </summary>
            <div className="route-panel-accordion-body">
            <div className="flex flex-col gap-2 rounded border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-gray-700 dark:text-slate-100">
                  ノード
                </h4>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {state.stations.length}件
                </span>
              </div>
              <TextInput
                placeholder="ノード名を追加"
                addButtonLabel="追加"
                onEnterPress={(name) =>
                  dispatch({ type: "addStation", payload: { name } })
                }
              />
              {state.stations.length > 0 ? (
                <div className="flex max-h-48 flex-col gap-2 overflow-auto pr-1">
                  {state.stations.map((station) => {
                    const isUsed = state.routeNodes.some(
                      (routeNode) => routeNode.stationId === station.id
                    );
                    return (
                      <div
                        key={station.id}
                        className="grid grid-cols-[minmax(0,1fr)_max-content] items-center gap-2"
                      >
                        <input
                          type="text"
                          value={station.name}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            dispatch({
                              type: "updateStation",
                              payload: {
                                id: station.id,
                                name: event.target.value,
                              },
                            })
                          }
                          className="min-w-0 rounded border border-gray-300 p-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          disabled={isUsed}
                          title={
                            isUsed
                              ? "このノード名を参照するノードがあります"
                              : "ノード名を削除"
                          }
                          onClick={() =>
                            dispatch({
                              type: "removeStation",
                              payload: { id: station.id },
                            })
                          }
                          className="rounded bg-red-600 px-2 py-1 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                        >
                          削除
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ノード名を追加すると、ノード追加時に選択できます。
                </p>
              )}
            </div>
            <label className="flex flex-col gap-1 text-xs text-gray-600 dark:text-slate-300">
              ノードに使う名称
              <select
                value={newNodeStationId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setNewNodeStationId(event.target.value)
                }
                className="rounded border border-gray-300 p-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">ノード名未指定</option>
                {state.stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
            </label>
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
            {newNodeType === "crossing" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                  方向1番線数
                  <input
                    type="number"
                    min="1"
                    value={newNodePlatformCount}
                    aria-label="方向1番線数"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setNewNodePlatformCount(
                        Math.max(1, Number(event.target.value))
                      )
                    }
                    className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-600">
                  方向2番線数
                  <input
                    type="number"
                    min="1"
                    value={newNodeVerticalPlatformCount}
                    aria-label="方向2番線数"
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setNewNodeVerticalPlatformCount(
                        Math.max(1, Number(event.target.value))
                      )
                    }
                    className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                  />
                </label>
              </div>
            ) : (
              <label className="flex flex-col gap-1 text-xs text-gray-600">
                番線数
                <input
                  type="number"
                  min="1"
                  value={newNodePlatformCount}
                  aria-label="番線数"
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setNewNodePlatformCount(
                      Math.max(1, Number(event.target.value))
                    )
                  }
                  className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                />
              </label>
            )}
            <button
              type="button"
              onClick={addRouteNode}
              className="rounded bg-blue-700 px-3 py-2 text-sm text-white"
            >
              ノードを追加
            </button>
            </div>
          </details>

          <details
            className="route-panel-accordion route-floating-panel-section text-sm"
            hidden={openedFloatingPanelSection !== "routeSetting"}
            open={openedFloatingPanelSection === "routeSetting"}
            onToggle={(event) =>
              handleFloatingPanelSectionToggle("routeSetting", event)
            }
          >
            <summary>
              <span className="route-panel-accordion-icon" aria-hidden="true">
                ›
              </span>
              <span className="min-w-0 flex-1">経路設定</span>
            </summary>
            <div className="route-panel-accordion-body">
              <TextInput
                placeholder="経路セットを追加"
                addButtonLabel="追加"
                onEnterPress={addRouteTemplate}
              />
              {state.routeTemplates.length > 0 ? (
                <>
                  <label className="flex flex-col gap-1 text-xs text-gray-600">
                    編集する経路セット
                    <select
                      value={selectedRouteTemplate?.id ?? ""}
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
                  {selectedRouteTemplate ? (
                    <>
                      <label className="flex flex-col gap-1 text-xs text-gray-600">
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
                          className="rounded border border-gray-300 p-2 text-sm text-gray-900"
                        />
                      </label>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <label className="flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={selectedRouteTemplate.deadheadEnabled}
                            onChange={(
                              event: ChangeEvent<HTMLInputElement>
                            ) =>
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
                          className="rounded bg-red-600 px-3 py-2 text-xs text-white"
                        >
                          削除
                        </button>
                      </div>
                    </>
                  ) : null}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={!selectedRouteTemplate}
                      onClick={() => {
                        const nextEnabled = !isRouteTemplateMode;
                        setIsRouteTemplateMode(nextEnabled);
                        setRouteTemplateDraft(
                          nextEnabled && selectedRouteTemplate
                            ? createRouteTemplateDraft(selectedRouteTemplate)
                            : null
                        );
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
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={saveSelectedRouteTemplateDraft}
                          className="rounded bg-emerald-600 px-3 py-2 text-sm text-white"
                        >
                          保存
                        </button>
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
                  <div className="grid gap-2">
                    {renderRouteTemplateRouteList(
                      routeTemplateEditKey === "deadheadRouteSections"
                        ? "回送経路"
                        : "営業経路",
                      routeTemplateEditKey
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  経路セットを追加してください。
                </p>
              )}
            </div>
          </details>

          <details
            className="route-panel-accordion route-floating-panel-section text-sm"
            hidden={openedFloatingPanelSection !== "speedClassification"}
            open={openedFloatingPanelSection === "speedClassification"}
            onToggle={(event) =>
              handleFloatingPanelSectionToggle("speedClassification", event)
            }
          >
            <summary>
              <span className="route-panel-accordion-icon" aria-hidden="true">
                ›
              </span>
              <span className="min-w-0 flex-1">車速区分</span>
            </summary>
            <div className="route-panel-accordion-body">
            <div className="flex items-center justify-end gap-2">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  <input
                    type="checkbox"
                    checked={state.routeTimeSpeedMultiplierEnabled}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const enabled = event.target.checked;
                      if (
                        enabled &&
                        !window.confirm(
                          "この変更を行うとダイヤグラムの正確性が著しく低下する恐れがあります．初期設定として全ての所要時間は現在の車速１の設定値を１倍として上書きされます．OKを押す前に必ず現在の進行状況を保存してください．"
                        )
                      ) {
                        return;
                      }
                      dispatch({
                        type: "setRouteTimeSpeedMultiplierEnabled",
                        payload: { enabled },
                      });
                      if (enabled) setSelectedRouteTimeSpeedClassIndex(0);
                    }}
                  />
                  倍率
                </label>
                <button
                  type="button"
                  onClick={() => {
                    dispatch({
                      type: "addRouteTimeSpeedClass",
                      payload: {
                        copyFromIndex: selectedRouteTimeSpeedClassIndex,
                      },
                    });
                    setSelectedRouteTimeSpeedClassIndex(
                      routeTimeSpeedClassCount
                    );
                  }}
                  className="rounded bg-blue-700 px-3 py-2 text-sm text-white"
                >
                  追加
                </button>
              </div>
            </div>
            <div className="flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
              {routeTimeSpeedClasses.map((speedClass, index) => {
                const isSelected = index === selectedRouteTimeSpeedClassIndex;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setSelectedRouteTimeSpeedClassIndex(index)}
                    className={`grid items-center gap-2 rounded border px-3 py-2 text-left text-sm ${
                      state.routeTimeSpeedMultiplierEnabled
                        ? "grid-cols-[minmax(0,1fr)_88px]"
                        : "grid-cols-1"
                    } ${
                      isSelected
                        ? "border-blue-700 bg-blue-50 text-blue-950 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-50"
                        : "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    }`}
                  >
                    <span className="min-w-0">
                      車速{index + 1}
                      {index === 0 ? "（基準）" : ""}
                    </span>
                    {state.routeTimeSpeedMultiplierEnabled ? (
                      <input
                        type="number"
                        min="0.05"
                        max="20"
                        step="0.05"
                        value={index === 0 ? 1 : speedClass.multiplier}
                        disabled={index === 0}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          dispatch({
                            type: "updateRouteTimeSpeedClass",
                            payload: {
                              index,
                              multiplier: Number(event.target.value),
                            },
                          })
                        }
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-right text-sm text-gray-900 disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
            {selectedRouteTimeSpeedClassIndex > 0 ? (
              <button
                type="button"
                disabled={routeTimeSpeedClassCount <= 1}
                onClick={() => {
                  dispatch({
                    type: "removeRouteTimeSpeedClass",
                    payload: { index: selectedRouteTimeSpeedClassIndex },
                  });
                  setSelectedRouteTimeSpeedClassIndex((current) =>
                    Math.max(
                      0,
                      Math.min(current - 1, routeTimeSpeedClassCount - 2)
                    )
                  );
                }}
                className="rounded bg-red-600 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
              >
                車速区分を削除
              </button>
            ) : null}
            </div>
          </details>

          <details
            className="route-panel-accordion route-floating-panel-section text-sm"
            hidden={openedFloatingPanelSection !== "duration"}
            open={openedFloatingPanelSection === "duration"}
            onToggle={(event) =>
              handleFloatingPanelSectionToggle("duration", event)
            }
          >
            <summary>
              <span className="route-panel-accordion-icon" aria-hidden="true">
                ›
              </span>
              <span className="min-w-0 flex-1">所要時間</span>
            </summary>
            <div className="route-panel-accordion-body">
            <div className="flex items-center justify-end gap-2">
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
                    disabled={routeTimeManualInputDisabled}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      setRouteTimeMinutes(
                        Math.max(0, Number(event.target.value))
                      )
                    }
                    className="rounded border border-gray-300 p-2 text-sm text-gray-900 disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </label>
                <button
                  type="button"
                  disabled={
                    !routeTimeDraftComplete ||
                    routeTimeDraftDuplicate ||
                    routeTimeManualInputDisabled
                  }
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
                <div className="flex items-baseline gap-3">
                  <h4 className="text-sm font-bold text-gray-700">
                    設定済み区間
                  </h4>
                  <span className="text-xs text-gray-500 dark:text-slate-400">
                    右クリックで進行方向を変更
                  </span>
                </div>
                <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                  {routeTimeSectionsForSelectedSpeed.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => {
                        setSelectedRouteTimeSectionId(section.id);
                        clearRangeSelections();
                      }}
                      onContextMenu={(event: MouseEvent<HTMLButtonElement>) => {
                        event.preventDefault();
                        setSelectedRouteTimeSectionId(section.id);
                        clearRangeSelections();
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
                          backgroundColor:
                            getDisplayRouteTimeSectionColor(section),
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        {getRouteTimeSectionLabel(state, section)}
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
                      <label className="flex flex-col gap-1 text-xs text-gray-600">
                        選択区間の所要時間（分）
                        <input
                          type="number"
                          min="0"
                          value={selectedRouteTimeSection.travelMinutes}
                          disabled={routeTimeManualInputDisabled}
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
                          className="rounded border border-gray-300 p-2 text-sm text-gray-900 disabled:bg-slate-100 disabled:text-slate-500"
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
                              disabled={routeTimeManualInputDisabled}
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
                              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
                                disabled={routeTimeManualInputDisabled}
                                onChange={(
                                  event: ChangeEvent<HTMLInputElement>
                                ) =>
                                  updateRouteTimeSectionBreakpoint(
                                    selectedRouteTimeSection,
                                    index,
                                    Number(event.target.value)
                                  )
                                }
                                className="accent-green-700 disabled:opacity-50"
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
            </div>
          </details>

          {selectedNode ? (
            <details className="route-panel-accordion text-sm">
              <summary>
                <span className="route-panel-accordion-icon" aria-hidden="true">
                  ›
                </span>
                <span className="min-w-0 flex-1">ノード編集</span>
              </summary>
              <div className="route-panel-accordion-body">
              {selectedNode.type === "connection" ? (
                <>
                  <p className="text-sm text-gray-500">
                    分岐ノードです。形状ごとに通過可能なルートを判定します。
                  </p>
                  <div
                    className="relative flex flex-col gap-1 text-xs text-gray-600"
                    onMouseLeave={() => setConnectionTypePreview(null)}
                    onBlur={(event) => {
                      if (
                        event.currentTarget.contains(
                          event.relatedTarget as Node | null
                        )
                      ) {
                        return;
                      }
                      setConnectionTypeMenuOpen(false);
                      setConnectionTypePreview(null);
                    }}
                  >
                    <span>分岐形状</span>
                    <button
                      type="button"
                      onClick={() =>
                        setConnectionTypeMenuOpen((current) => !current)
                      }
                      className="flex items-center justify-between rounded border border-gray-300 bg-white p-2 text-left text-sm text-gray-900"
                    >
                      <span>
                        {connectionTypeLabels[selectedNode.connectionType]}
                      </span>
                      <span className="text-xs text-gray-500">▼</span>
                    </button>
                    {connectionTypeMenuOpen ? (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded border border-gray-300 bg-white shadow-lg">
                      {connectionTypes.map((connectionType) => (
                        <button
                          key={connectionType}
                          type="button"
                          onMouseEnter={() =>
                            setConnectionTypePreview({
                              nodeId: selectedNode.id,
                              connectionType,
                            })
                          }
                          onFocus={() =>
                            setConnectionTypePreview({
                              nodeId: selectedNode.id,
                              connectionType,
                            })
                          }
                          onClick={() => {
                            dispatch({
                              type: "updateRouteNode",
                              payload: {
                                id: selectedNode.id,
                                connectionType,
                              },
                            });
                            setConnectionTypeMenuOpen(false);
                            setConnectionTypePreview(null);
                          }}
                          className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                            connectionType === selectedNode.connectionType
                              ? "bg-blue-600 text-white hover:bg-blue-600"
                              : "text-gray-900"
                          }`}
                        >
                          {connectionTypeLabels[connectionType]}
                        </button>
                      ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => rotateRouteNodeClockwise(selectedNode)}
                      className="rounded bg-slate-700 px-3 py-2 text-sm text-white"
                    >
                      時計回り
                    </button>
                    <button
                      type="button"
                      onClick={() => flipRouteNode(selectedNode)}
                      className="rounded bg-slate-700 px-3 py-2 text-sm text-white"
                    >
                      反転
                    </button>
                  </div>
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
                    <option value="">ノード名未指定</option>
                    {state.stations.map((station) => (
                      <option key={station.id} value={station.id}>
                        {station.name}
                      </option>
                    ))}
                  </select>
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
                  {selectedNode.type === "crossing" ? (
                    <div className="grid grid-cols-2 gap-2 rounded border border-gray-200 p-2 text-xs text-gray-700">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedNode.isHorizontalTerminal)}
                          onChange={(event) =>
                            dispatch({
                              type: "updateRouteNode",
                              payload: {
                                id: selectedNode.id,
                                isHorizontalTerminal: event.target.checked,
                              },
                            })
                          }
                        />
                        方向1終端
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedNode.isVerticalTerminal)}
                          onChange={(event) =>
                            dispatch({
                              type: "updateRouteNode",
                              payload: {
                                id: selectedNode.id,
                                isVerticalTerminal: event.target.checked,
                              },
                            })
                          }
                        />
                        方向2終端
                      </label>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 rounded border border-gray-200 p-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedNode.isTerminal)}
                        onChange={(event) =>
                          dispatch({
                            type: "updateRouteNode",
                            payload: {
                              id: selectedNode.id,
                              isTerminal: event.target.checked,
                            },
                          })
                        }
                      />
                      終端
                    </label>
                  )}
                  {selectedNode.type === "crossing" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-xs text-gray-600">
                        方向1番線数
                        <input
                          type="number"
                          min="1"
                          value={getPlatformCount(selectedNode)}
                          aria-label="方向1番線数"
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
                      <label className="flex flex-col gap-1 text-xs text-gray-600">
                        方向2番線数
                        <input
                          type="number"
                          min="1"
                          value={getVerticalPlatformCount(selectedNode)}
                          aria-label="方向2番線数"
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
                    </div>
                  ) : (
                    <label className="flex flex-col gap-1 text-xs text-gray-600">
                      番線数
                      <input
                        type="number"
                        min="1"
                        value={getPlatformCount(selectedNode)}
                        aria-label="番線数"
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
                  )}
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-bold text-gray-600">
                      {selectedNode.type === "crossing"
                        ? "方向1番線名"
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
                      <div className="flex flex-col gap-2">
                        <h4 className="text-xs font-bold text-gray-600">
                          方向2番線名
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
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => rotateRouteNodeClockwise(selectedNode)}
                      className="rounded bg-slate-700 px-3 py-2 text-sm text-white"
                    >
                      時計回り
                    </button>
                    <button
                      type="button"
                      onClick={() => flipRouteNode(selectedNode)}
                      className="rounded bg-slate-700 px-3 py-2 text-sm text-white"
                    >
                      裏返し
                    </button>
                  </div>
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
              </div>
            </details>
          ) : null}

        </aside>
      </div>
      <details className="route-editor-command-list rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <span className="route-panel-accordion-icon" aria-hidden="true">
            ›
          </span>
          操作方法
        </summary>
        <div className="grid gap-2 border-t border-slate-200 p-3 md:grid-cols-2 xl:grid-cols-3 dark:border-slate-700">
          {routeEditorCommandGroups.map((group) => (
            <div
              key={group.title}
              className="rounded border border-slate-200 bg-white/80 p-2 dark:border-slate-700 dark:bg-slate-800/80"
            >
              <div className="mb-1 font-bold text-slate-800 dark:text-slate-100">
                {group.title}
              </div>
              <ul className="space-y-1">
                {group.commands.map((command) => (
                  <li key={command}>{command}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
};
