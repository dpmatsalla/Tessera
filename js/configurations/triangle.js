import { sharedConfiguration } from "./helpers.js?v=20260615-76";

function triangleStartingCells(size, startPosition, PLAYER_ONE, PLAYER_TWO) {
  const width = size * 2;
  if (startPosition === "corners") {
    return [
      { x: 0, y: 0, player: PLAYER_ONE },
      { x: width - 1, y: size - 1, player: PLAYER_ONE },
      { x: width - 1, y: 0, player: PLAYER_TWO },
      { x: 0, y: size - 1, player: PLAYER_TWO },
    ];
  }
  const x = size - 1;
  const y = Math.floor(size / 2) - 1;
  return [
    { x, y, player: PLAYER_ONE },
    { x: x + 1, y: y + 1, player: PLAYER_ONE },
    { x: x + 1, y, player: PLAYER_TWO },
    { x, y: y + 1, player: PLAYER_TWO },
  ];
}

export function createTriangleConfiguration(deps) {
  const {
    TRIANGLE,
    PLAYER_ONE,
    PLAYER_TWO,
    triangleCenterPoint,
    triangleOffsets,
  } = deps;
  return sharedConfiguration({
    id: TRIANGLE,
    label: "Triangular",
    settingsKey: "triangleSize",
    minimumSize: 4,
    maximumSize: 20,
    sizeLabel: (size) => `${size} rows`,
    coordinates: (size) => {
      const result = [];
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size * 2; x += 1) result.push({ x, y });
      }
      return result;
    },
    cellCount: (size) => size * size * 2,
    isOnBoard: (x, y, size) => x >= 0 && y >= 0 && x < size * 2 && y < size,
    tileTypeId: (x) => (x % 2 === 0 ? "even" : "odd"),
    sampleTiles: Object.freeze({
      even: { x: 0, y: 0 },
      odd: { x: 1, y: 0 },
    }),
    rulesetTileTypes: {
      even: {
        copy: triangleOffsets(0, 0).adjacent,
        jump: triangleOffsets(0, 0).jumps,
      },
      odd: {
        copy: triangleOffsets(1, 0).adjacent,
        jump: triangleOffsets(1, 0).jumps,
      },
    },
    startingCells: (size, startPosition) => triangleStartingCells(size, startPosition, PLAYER_ONE, PLAYER_TWO),
    randomCoordinate: (size, random) => ({
      x: Math.floor(random() * size * 2),
      y: Math.floor(random() * size),
    }),
    coordinateDistance(ax, ay, bx, by) {
      const first = triangleCenterPoint(ax, ay, 1);
      const second = triangleCenterPoint(bx, by, 1);
      return Math.hypot(first.x - second.x, first.y - second.y);
    },
    formatCoordinate: (x, y) => `${x + 1},${y + 1}`,
    edgeBonus(x, y, size) {
      const width = size * 2;
      const onEdge = x === 0 || y === 0 || x === width - 1 || y === size - 1;
      const inCorner = (x === 0 || x === width - 1) && (y === 0 || y === size - 1);
      return (onEdge ? 0.125 : 0) + (inCorner ? 0.125 : 0);
    },
    centerBoard: true,
    presentation(x, y, size, cellRadius, scale = 1) {
      const center = triangleCenterPoint(x, y, cellRadius);
      const radius = cellRadius * scale;
      const halfWidth = Math.sqrt(3) / 2 * radius;
      const points = x % 2 === 0
        ? [[-halfWidth, -radius / 2], [halfWidth, -radius / 2], [0, radius]]
        : [[0, -radius], [-halfWidth, radius / 2], [halfWidth, radius / 2]];
      return {
        px: center.x,
        py: center.y,
        pieceRadius: cellRadius * 0.44,
        margin: cellRadius * 1.35,
        shape: { type: "polygon", points },
      };
    },
  });
}
