export function mod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function rectangularCoordinates(width, height = width) {
  const result = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) result.push({ x, y });
  }
  return result;
}

function cloneOffsetList(offsets) {
  return offsets.map(([dx, dy]) => [dx, dy]);
}

function createTileTypeRules(copy, jump, capture = copy) {
  return Object.freeze({
    copy: cloneOffsetList(copy),
    jump: cloneOffsetList(jump),
    capture: cloneOffsetList(capture),
  });
}

function resolveTileTypeOffsets(configuration, tileTypes, kind, x, y) {
  const tileTypeId = configuration.tileTypeId?.(x, y) ?? "default";
  const tileType = tileTypes[tileTypeId] ?? tileTypes.default;
  if (!tileType) return [];
  return cloneOffsetList(tileType[kind] ?? (kind === "capture" ? tileType.copy ?? [] : []));
}

function freezeTileTypes(tileTypes) {
  return Object.freeze(Object.fromEntries(
    Object.entries(tileTypes).map(([tileTypeId, rules]) => [
      tileTypeId,
      createTileTypeRules(rules.copy ?? [], rules.jump ?? [], rules.capture),
    ]),
  ));
}

export function polygonShape(points) {
  return { type: "polygon", points };
}

export function averagePolygonPoint(points) {
  return points.reduce((center, [x, y]) => ({
    x: center.x + x / points.length,
    y: center.y + y / points.length,
  }), { x: 0, y: 0 });
}

export function relativePolygon(points) {
  const center = averagePolygonPoint(points);
  return points.map(([x, y]) => [x - center.x, y - center.y]);
}

export function polygonCenter(vertices) {
  let twiceArea = 0;
  let centerX = 0;
  let centerY = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const [x1, y1] = vertices[index];
    const [x2, y2] = vertices[(index + 1) % vertices.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    centerX += (x1 + x2) * cross;
    centerY += (y1 + y2) * cross;
  }
  return {
    x: centerX / (3 * twiceArea),
    y: centerY / (3 * twiceArea),
  };
}

export function distanceToSegment(point, first, second) {
  const edgeX = second[0] - first[0];
  const edgeY = second[1] - first[1];
  const lengthSquared = edgeX ** 2 + edgeY ** 2;
  const fraction = Math.max(0, Math.min(1, (
    (point.x - first[0]) * edgeX + (point.y - first[1]) * edgeY
  ) / lengthSquared));
  return Math.hypot(
    point.x - (first[0] + edgeX * fraction),
    point.y - (first[1] + edgeY * fraction),
  );
}

export function createPeriodicMotifConfiguration(definition) {
  const {
    motifWidth,
    motifHeight,
    motifTiles,
    columnVector,
    rowVector,
    pieceRadiusScale = 0.42,
    shapeScale = 0.92,
    ...configuration
  } = definition;
  const tileMap = new Map(motifTiles.map((tile) => [`${tile.slot[0]},${tile.slot[1]}`, tile]));
  const coordinates = (size) => rectangularCoordinates(size * motifWidth, size * motifHeight);
  const cellCount = (size) => size * size * motifTiles.length;
  const isOnBoard = (x, y, size) => x >= 0 && y >= 0 && x < size * motifWidth && y < size * motifHeight;
  const tileInfo = (x, y) => {
    if (x < 0 || y < 0) return null;
    const slotX = mod(x, motifWidth);
    const slotY = mod(y, motifHeight);
    const tile = tileMap.get(`${slotX},${slotY}`);
    if (!tile) return null;
    return {
      tile,
      motifColumn: Math.floor(x / motifWidth),
      motifRow: Math.floor(y / motifHeight),
    };
  };
  const sampleTiles = Object.freeze(Object.fromEntries(
    motifTiles.map((tile) => [tile.id, { x: tile.slot[0], y: tile.slot[1] }]),
  ));
  const rulesetTileTypes = Object.fromEntries(motifTiles.map((tile) => [
    tile.id,
    { copy: tile.copy, jump: tile.jump, capture: tile.capture ?? tile.copy },
  ]));

  return sharedConfiguration({
    centerBoard: true,
    coordinates,
    cellCount,
    isOnBoard,
    tileTypeId: (x, y) => tileInfo(x, y)?.tile.id ?? "default",
    sampleTiles,
    rulesetTileTypes,
    randomCoordinate: (size, random) => ({
      x: Math.floor(random() * size * motifWidth),
      y: Math.floor(random() * size * motifHeight),
    }),
    coordinateDistance(ax, ay, bx, by) {
      const first = tileInfo(ax, ay);
      const second = tileInfo(bx, by);
      if (!first || !second) return Infinity;
      const firstPoint = {
        x: first.motifColumn * columnVector[0] + first.motifRow * rowVector[0] + first.tile.center[0],
        y: first.motifColumn * columnVector[1] + first.motifRow * rowVector[1] + first.tile.center[1],
      };
      const secondPoint = {
        x: second.motifColumn * columnVector[0] + second.motifRow * rowVector[0] + second.tile.center[0],
        y: second.motifColumn * columnVector[1] + second.motifRow * rowVector[1] + second.tile.center[1],
      };
      return Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y);
    },
    edgeBonus: () => 0,
    presentation(x, y, size, cellRadius, scale = 1) {
      const info = tileInfo(x, y);
      if (!info) {
        return {
          px: 0,
          py: 0,
          pieceRadius: cellRadius * pieceRadiusScale * scale,
          margin: cellRadius * 1.4,
          shape: { type: "circle", radius: cellRadius * shapeScale * scale },
        };
      }
      const px = (
        info.motifColumn * columnVector[0]
        + info.motifRow * rowVector[0]
        + info.tile.center[0]
      ) * cellRadius * shapeScale * scale;
      const py = (
        info.motifColumn * columnVector[1]
        + info.motifRow * rowVector[1]
        + info.tile.center[1]
      ) * cellRadius * shapeScale * scale;
      return {
        px,
        py,
        pieceRadius: cellRadius * (info.tile.pieceScale ?? pieceRadiusScale) * scale,
        margin: cellRadius * 1.45,
        shape: polygonShape(
          info.tile.points.map(([pxPoint, pyPoint]) => [
            pxPoint * cellRadius * shapeScale * scale,
            pyPoint * cellRadius * shapeScale * scale,
          ]),
        ),
      };
    },
    ...configuration,
  });
}

export function sharedConfiguration(definition) {
  const {
    rulesetId,
    rulesetLabel,
    rulesetTileTypes,
    copyOffsets,
    jumpOffsets,
    captureOffsets,
    ...configuration
  } = definition;
  const builtConfiguration = {
    defaultSize: 8,
    edgeBonus: () => 0,
    centerBoard: false,
    applyRuleOffset: (x, y, [dx, dy]) => ({ x: x + dx, y: y + dy }),
    ...configuration,
  };
  const tileTypes = rulesetTileTypes ? freezeTileTypes(rulesetTileTypes) : null;
  const ruleset = Object.freeze({
    id: rulesetId ?? "classic",
    label: rulesetLabel ?? "Classic",
    tileTypes,
    copyOffsets: tileTypes
      ? (x, y) => resolveTileTypeOffsets(builtConfiguration, tileTypes, "copy", x, y)
      : copyOffsets,
    jumpOffsets: tileTypes
      ? (x, y) => resolveTileTypeOffsets(builtConfiguration, tileTypes, "jump", x, y)
      : jumpOffsets,
    captureOffsets: tileTypes
      ? (x, y) => resolveTileTypeOffsets(builtConfiguration, tileTypes, "capture", x, y)
      : (captureOffsets ?? copyOffsets),
  });
  return {
    ...builtConfiguration,
    defaultRulesetId: ruleset.id,
    rulesets: Object.freeze({ [ruleset.id]: ruleset }),
  };
}
