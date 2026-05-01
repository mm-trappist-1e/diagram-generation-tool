import {
  ConnectionType,
  RouteNode,
  RoutePortSide,
  RouteTimeSection,
  RouteTimeSectionPort,
} from "./domain";

type RouteTimeBreakGroup = {
  ports: RouteTimeSectionPort[];
  startIndex: number;
  endIndex: number;
};

export type ResolvedRouteTimeSegments = {
  segmentMinutes: number[];
  fixed: boolean[];
  conflicts: string[];
  segmentKeys: string[];
};

const portKey = (port: RouteTimeSectionPort) =>
  `${port.nodeId}:${port.side}:${port.index}`;

const segmentKey = (
  fromPort: RouteTimeSectionPort,
  toPort: RouteTimeSectionPort
) => [portKey(fromPort), portKey(toPort)].sort().join("~");

const rotatePortSide = (
  side: RoutePortSide,
  degrees: number
): RoutePortSide => {
  const sides: RoutePortSide[] = ["top", "right", "bottom", "left"];
  const index = sides.indexOf(side);
  const offset = Math.round(degrees / 90);
  return sides[(index + offset + sides.length * 4) % sides.length];
};

const getCanonicalConnectionSide = (
  routeNode: RouteNode,
  side: RoutePortSide
) => rotatePortSide(side, -routeNode.rotation);

const getConnectionRoutePairs = (connectionType: ConnectionType) => {
  switch (connectionType) {
    case "turnout":
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

const getRouteNodeById = (routeNodes?: RouteNode[]) =>
  new Map((routeNodes ?? []).map((routeNode) => [routeNode.id, routeNode]));

const connectionHasBranch = (connectionType: ConnectionType) =>
  getConnectionRoutePairs(connectionType).length > 1;

const getSideBasedPossibleExitIndexes = (
  connectionType: ConnectionType,
  entrySide: RoutePortSide,
  entryIndex: number
) =>
  entrySide === "left"
    ? getConnectionRoutePairs(connectionType)
        .filter(([leftIndex]) => leftIndex === entryIndex)
        .map(([, rightIndex]) => rightIndex)
    : entrySide === "right"
    ? getConnectionRoutePairs(connectionType)
        .filter(([, rightIndex]) => rightIndex === entryIndex)
        .map(([leftIndex]) => leftIndex)
    : null;

const isIndexBasedBranch = (
  connectionType: ConnectionType,
  entryIndex: number,
  exitIndex: number
) => {
  switch (connectionType) {
    case "turnout":
    case "passing12":
      if (entryIndex === 0 && exitIndex !== 0) return true;
      if (entryIndex !== 0 && exitIndex === 0) return false;
      return false;
    case "passing21":
      if (entryIndex === 1 && exitIndex !== 1) return true;
      if (entryIndex !== 1 && exitIndex === 1) return false;
      return false;
    case "singleCrossoverZ":
      return (
        (entryIndex === 0 && exitIndex === 1) ||
        (entryIndex === 1 && exitIndex === 0)
      );
    case "singleCrossoverReverseZ":
      return (
        (entryIndex === 1 && exitIndex === 0) ||
        (entryIndex === 0 && exitIndex === 1)
      );
    case "doubleCrossover":
      return entryIndex === exitIndex || entryIndex !== exitIndex;
  }
};

const isRelevantTimingBreakGroup = (
  group: RouteTimeBreakGroup,
  routeNodeById: Map<string, RouteNode>,
  reverseDirection = false
) => {
  const entryPort = reverseDirection
    ? group.ports[group.ports.length - 1]
    : group.ports[0];
  const exitPort = reverseDirection
    ? group.ports[0]
    : group.ports[group.ports.length - 1];
  if (!entryPort || !exitPort || entryPort.nodeId !== exitPort.nodeId) {
    return true;
  }

  const routeNode = routeNodeById.get(entryPort.nodeId);
  if (!routeNode || routeNode.type !== "connection") return true;

  const entrySide = getCanonicalConnectionSide(routeNode, entryPort.side);
  const exitSide = getCanonicalConnectionSide(routeNode, exitPort.side);
  if (entrySide === exitSide) return true;

  const possibleExitIndexes = getSideBasedPossibleExitIndexes(
    routeNode.connectionType,
    entrySide,
    entryPort.index
  );
  if (possibleExitIndexes) {
    return new Set(possibleExitIndexes).size > 1;
  }

  return isIndexBasedBranch(
    routeNode.connectionType,
    entryPort.index,
    exitPort.index
  );
};

const isRelevantTimingBreakGroupForSection = (
  group: RouteTimeBreakGroup,
  section: RouteTimeSection,
  routeNodeById: Map<string, RouteNode>
) => {
  const routeNode = routeNodeById.get(group.ports[0]?.nodeId ?? "");
  if (
    section.internalDirection === "bidirectional" &&
    routeNode?.type === "connection" &&
    connectionHasBranch(routeNode.connectionType)
  ) {
    return true;
  }

  switch (section.internalDirection) {
    case "reverse":
      return isRelevantTimingBreakGroup(group, routeNodeById, true);
    case "bidirectional":
      return (
        isRelevantTimingBreakGroup(group, routeNodeById) ||
        isRelevantTimingBreakGroup(group, routeNodeById, true)
      );
    case "forward":
    default:
      return isRelevantTimingBreakGroup(group, routeNodeById);
  }
};

export const getRouteTimeSectionBreakGroups = (
  section: RouteTimeSection,
  routeNodes?: RouteNode[]
) =>
  getRouteTimeSectionBreakGroupDetails(section, routeNodes).map(
    (group) => group.ports
  );

const getRouteTimeSectionBreakGroupDetails = (
  section: RouteTimeSection,
  routeNodes?: RouteNode[]
) => {
  const routeNodeById = getRouteNodeById(routeNodes);
  return section.routePorts
    .slice(1, -1)
    .reduce<RouteTimeBreakGroup[]>((groups, port, sliceIndex) => {
      const index = sliceIndex + 1;
      const lastGroup = groups[groups.length - 1];
      if (lastGroup?.ports[0]?.nodeId === port.nodeId) {
        lastGroup.ports.push(port);
        lastGroup.endIndex = index;
        return groups;
      }
      return [
        ...groups,
        {
          ports: [port],
          startIndex: index,
          endIndex: index,
        },
      ];
    }, [])
    .filter((group) =>
      routeNodes
        ? isRelevantTimingBreakGroupForSection(group, section, routeNodeById)
        : true
    );
};

export const distributeRouteTimeSectionMinutes = (
  travelMinutes: number,
  segmentCount: number
) => {
  if (segmentCount <= 1) return [];
  const normalizedTravelMinutes = Math.max(0, Math.floor(travelMinutes));
  const base = Math.floor(normalizedTravelMinutes / segmentCount);
  let remainder = normalizedTravelMinutes - base * segmentCount;
  return Array.from({ length: segmentCount }).map(() => {
    const value = base + (remainder > 0 ? 1 : 0);
    remainder -= 1;
    return value;
  });
};

export const normalizeRouteTimeSectionSegmentMinutesForTotal = (
  travelMinutes: number,
  segmentMinutes: number[] | undefined,
  segmentCount: number
) => {
  const normalizedTravelMinutes = Math.max(0, Math.floor(travelMinutes));
  if (segmentCount <= 1) return [];
  if (!segmentMinutes || segmentMinutes.length !== segmentCount) {
    return distributeRouteTimeSectionMinutes(
      normalizedTravelMinutes,
      segmentCount
    );
  }
  const nextSegmentMinutes = segmentMinutes.map((minutes) =>
    Math.max(0, Math.floor(minutes))
  );
  const subtotal = nextSegmentMinutes
    .slice(0, -1)
    .reduce((total, minutes) => total + minutes, 0);
  nextSegmentMinutes[segmentCount - 1] = Math.max(
    0,
    normalizedTravelMinutes - subtotal
  );
  return nextSegmentMinutes;
};

export const getRouteTimeSectionSegmentRefs = (
  section: RouteTimeSection,
  routeNodes?: RouteNode[]
) => {
  const routePorts =
    section.routePorts.length > 1
      ? section.routePorts
      : [
          {
            nodeId: section.startNodeId,
            side: section.startPortSide,
            index: section.startPortIndex,
          },
          {
            nodeId: section.endNodeId,
            side: section.endPortSide,
            index: section.endPortIndex,
          },
        ];
  const breakGroups = getRouteTimeSectionBreakGroupDetails(
    {
      ...section,
      routePorts,
    },
    routeNodes
  );
  const segmentCount = breakGroups.length + 1;

  return Array.from({ length: segmentCount }).map((_, index) => {
    const fromPort =
      index === 0
        ? routePorts[0]
        : routePorts[breakGroups[index - 1].endIndex];
    const toPort =
      index === breakGroups.length
        ? routePorts[routePorts.length - 1]
        : routePorts[breakGroups[index].startIndex];
    return {
      fromPort,
      toPort,
      key: segmentKey(fromPort, toPort),
    };
  });
};

export const normalizeRouteTimeSectionSegmentMinutes = (
  section: RouteTimeSection,
  routeNodes?: RouteNode[]
) =>
  normalizeRouteTimeSectionSegmentMinutesForTotal(
    section.travelMinutes,
    section.segmentMinutes,
    getRouteTimeSectionSegmentRefs(section, routeNodes).length
  );

export const getRouteTimeSectionBreakpoints = (segmentMinutes: number[]) => {
  let total = 0;
  return segmentMinutes.slice(0, -1).map((minutes) => {
    total += minutes;
    return total;
  });
};

const distributeRemainingMinutes = (
  remainingMinutes: number,
  fallbackMinutes: number[]
) => {
  const normalizedRemainingMinutes = Math.max(0, Math.floor(remainingMinutes));
  if (fallbackMinutes.length === 0) return [];
  if (normalizedRemainingMinutes === 0) {
    return fallbackMinutes.map(() => 0);
  }

  const fallbackTotal = fallbackMinutes.reduce(
    (total, minutes) => total + Math.max(0, minutes),
    0
  );
  const weights =
    fallbackTotal > 0
      ? fallbackMinutes.map((minutes) => Math.max(0, minutes) / fallbackTotal)
      : fallbackMinutes.map(() => 1 / fallbackMinutes.length);
  const rawValues = weights.map((weight) => weight * normalizedRemainingMinutes);
  const nextValues = rawValues.map(Math.floor);
  let remainder =
    normalizedRemainingMinutes -
    nextValues.reduce((total, minutes) => total + minutes, 0);
  rawValues
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => {
      if (remainder <= 0) return;
      nextValues[index] += 1;
      remainder -= 1;
    });
  return nextValues;
};

const sameMinutes = (a: number[], b: number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const getExplicitSegmentMinutes = (
  section: RouteTimeSection,
  routeNodes?: RouteNode[]
) => {
  const segmentCount = getRouteTimeSectionSegmentRefs(
    section,
    routeNodes
  ).length;
  if (segmentCount <= 1 || section.segmentMinutes.length !== segmentCount) {
    return null;
  }
  const normalizedSegmentMinutes = normalizeRouteTimeSectionSegmentMinutes(
    section,
    routeNodes
  );
  const distributedSegmentMinutes = distributeRouteTimeSectionMinutes(
    section.travelMinutes,
    segmentCount
  );
  return sameMinutes(normalizedSegmentMinutes, distributedSegmentMinutes)
    ? null
    : normalizedSegmentMinutes;
};

const solveKnownSegmentMinutes = (
  equations: Array<{ keys: string[]; total: number }>,
  seedKnownMinutesByKey: Map<string, number>
) => {
  const variableKeys = [...new Set(equations.flatMap((equation) => equation.keys))];
  const variableIndexByKey = new Map(
    variableKeys.map((key, index) => [key, index])
  );
  const conflictKeys = new Set<string>();
  const matrix = equations.map((equation) => {
    const row = Array.from({ length: variableKeys.length + 1 }, () => 0);
    let knownTotal = 0;
    equation.keys.forEach((key) => {
      const knownMinutes = seedKnownMinutesByKey.get(key);
      if (knownMinutes !== undefined) {
        knownTotal += knownMinutes;
        return;
      }
      const index = variableIndexByKey.get(key);
      if (index !== undefined) row[index] += 1;
    });
    row[variableKeys.length] = equation.total - knownTotal;
    return row;
  });
  const epsilon = 1e-9;
  let rowIndex = 0;

  for (
    let columnIndex = 0;
    columnIndex < variableKeys.length && rowIndex < matrix.length;
    columnIndex += 1
  ) {
    let pivotIndex = rowIndex;
    while (
      pivotIndex < matrix.length &&
      Math.abs(matrix[pivotIndex][columnIndex]) <= epsilon
    ) {
      pivotIndex += 1;
    }
    if (pivotIndex >= matrix.length) continue;

    [matrix[rowIndex], matrix[pivotIndex]] = [
      matrix[pivotIndex],
      matrix[rowIndex],
    ];
    const pivot = matrix[rowIndex][columnIndex];
    matrix[rowIndex] = matrix[rowIndex].map((value) => value / pivot);

    matrix.forEach((row, index) => {
      if (index === rowIndex) return;
      const factor = row[columnIndex];
      if (Math.abs(factor) <= epsilon) return;
      row.forEach((value, valueIndex) => {
        row[valueIndex] = value - factor * matrix[rowIndex][valueIndex];
      });
    });
    rowIndex += 1;
  }

  const knownMinutesByKey = new Map(seedKnownMinutesByKey);
  matrix.forEach((row) => {
    const nonZeroIndexes = row
      .slice(0, variableKeys.length)
      .map((value, index) => (Math.abs(value) > epsilon ? index : null))
      .filter((index): index is number => index !== null);
    const total = row[variableKeys.length];
    if (nonZeroIndexes.length === 0) {
      return;
    }
    if (nonZeroIndexes.length !== 1) return;

    const index = nonZeroIndexes[0];
    const value = total / row[index];
    const roundedValue = Math.round(value);
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      Math.abs(value - roundedValue) > epsilon
    ) {
      conflictKeys.add(variableKeys[index]);
      return;
    }
    knownMinutesByKey.set(variableKeys[index], Math.max(0, roundedValue));
  });

  return {
    knownMinutesByKey,
    conflictKeys,
  };
};

export const resolveRouteTimeSectionSegments = (
  sections: RouteTimeSection[],
  targetSection: RouteTimeSection,
  routeNodes?: RouteNode[]
): ResolvedRouteTimeSegments => {
  const equations = sections
    .map((section) => ({
      section,
      keys: getRouteTimeSectionSegmentRefs(section, routeNodes).map(
        (segment) => segment.key
      ),
      total: Math.max(0, Math.floor(section.travelMinutes)),
    }))
    .filter((equation) => equation.keys.length > 0);
  const seedKnownMinutesByKey = new Map<string, number>();
  const seedSourceIdsByKey = new Map<string, Set<string>>();
  const seedConflictKeys = new Set<string>();

  equations.forEach((equation) => {
    const explicitSegmentMinutes = getExplicitSegmentMinutes(
      equation.section,
      routeNodes
    );
    if (!explicitSegmentMinutes) return;
    equation.keys.forEach((key, index) => {
      const minutes = explicitSegmentMinutes[index];
      const existingMinutes = seedKnownMinutesByKey.get(key);
      if (existingMinutes !== undefined && existingMinutes !== minutes) {
        seedConflictKeys.add(key);
        return;
      }
      seedKnownMinutesByKey.set(key, minutes);
      const sourceIds = seedSourceIdsByKey.get(key) ?? new Set<string>();
      sourceIds.add(equation.section.id);
      seedSourceIdsByKey.set(key, sourceIds);
    });
  });

  const targetSegmentKeys = getRouteTimeSectionSegmentRefs(
    targetSection,
    routeNodes
  ).map((segment) => segment.key);
  const targetExplicitSegmentMinutes =
    getExplicitSegmentMinutes(targetSection, routeNodes);

  if (targetExplicitSegmentMinutes) {
    targetSegmentKeys.forEach((key, index) => {
      const minutes = targetExplicitSegmentMinutes[index];
      const existingMinutes = seedKnownMinutesByKey.get(key);
      if (existingMinutes !== undefined && existingMinutes !== minutes) {
        seedConflictKeys.add(key);
      }
      seedKnownMinutesByKey.set(key, minutes);
      const sourceIds = seedSourceIdsByKey.get(key) ?? new Set<string>();
      sourceIds.add(targetSection.id);
      seedSourceIdsByKey.set(key, sourceIds);
    });
  }

  const { knownMinutesByKey, conflictKeys } =
    solveKnownSegmentMinutes(equations, seedKnownMinutesByKey);
  seedConflictKeys.forEach((key) => conflictKeys.add(key));

  const fallbackMinutes = normalizeRouteTimeSectionSegmentMinutes(
    targetSection,
    routeNodes
  );
  if (targetExplicitSegmentMinutes) {
    return {
      segmentMinutes: targetExplicitSegmentMinutes,
      fixed: targetSegmentKeys.map((key) => {
        const seedSourceIds = seedSourceIdsByKey.get(key);
        return Boolean(
          seedSourceIds &&
            [...seedSourceIds].some((sourceId) => sourceId !== targetSection.id)
        );
      }),
      conflicts: targetSegmentKeys.filter((key) => conflictKeys.has(key)),
      segmentKeys: targetSegmentKeys,
    };
  }

  const knownTotal = targetSegmentKeys.reduce(
    (total, key) => total + (knownMinutesByKey.get(key) ?? 0),
    0
  );
  const unresolvedIndexes = targetSegmentKeys
    .map((key, index) => (knownMinutesByKey.has(key) ? null : index))
    .filter((index): index is number => index !== null);
  const hasImpossibleTargetConstraints =
    knownTotal > targetSection.travelMinutes ||
    (unresolvedIndexes.length === 0 && knownTotal !== targetSection.travelMinutes);

  if (hasImpossibleTargetConstraints) {
    return {
      segmentMinutes: fallbackMinutes,
      fixed: targetSegmentKeys.map(() => false),
      conflicts: targetSegmentKeys.filter((key) => knownMinutesByKey.has(key)),
      segmentKeys: targetSegmentKeys,
    };
  }

  const unresolvedMinutes = distributeRemainingMinutes(
    targetSection.travelMinutes - knownTotal,
    unresolvedIndexes.map((index) => fallbackMinutes[index] ?? 0)
  );
  const segmentMinutes = targetSegmentKeys.map((key, index) => {
    const knownMinutes = knownMinutesByKey.get(key);
    if (knownMinutes !== undefined) return knownMinutes;
    const unresolvedIndex = unresolvedIndexes.indexOf(index);
    return unresolvedMinutes[unresolvedIndex] ?? 0;
  });

  return {
    segmentMinutes,
    fixed: targetSegmentKeys.map((key) => {
      if (!knownMinutesByKey.has(key)) return false;
      const seedSourceIds = seedSourceIdsByKey.get(key);
      return !(
        seedSourceIds?.size === 1 && seedSourceIds.has(targetSection.id)
      );
    }),
    conflicts: targetSegmentKeys.filter((key) => conflictKeys.has(key)),
    segmentKeys: targetSegmentKeys,
  };
};
