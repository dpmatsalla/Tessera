import { sharedConfiguration } from "./helpers.js?v=20260615-76";

function squareStartingCells(size, startPosition, PLAYER_ONE, PLAYER_TWO) {
  if (startPosition === "corners") {
    return [
      { x: 0, y: 0, player: PLAYER_ONE },
      { x: size - 1, y: size - 1, player: PLAYER_ONE },
      { x: size - 1, y: 0, player: PLAYER_TWO },
      { x: 0, y: size - 1, player: PLAYER_TWO },
    ];
  }
  const center = Math.floor(size / 2) - 1;
  return [
    { x: center, y: center, player: PLAYER_ONE },
    { x: center + 1, y: center + 1, player: PLAYER_ONE },
    { x: center + 2, y: center - 1, player: PLAYER_ONE },
    { x: center - 1, y: center + 2, player: PLAYER_ONE },
    { x: center, y: center + 1, player: PLAYER_TWO },
    { x: center + 1, y: center, player: PLAYER_TWO },
    { x: center - 1, y: center - 1, player: PLAYER_TWO },
    { x: center + 2, y: center + 2, player: PLAYER_TWO },
  ];
}

export function createSquareConfiguration(deps) {
  const {
    SQUARE,
    SQUARE_ADJACENT,
    SQUARE_JUMPS,
    PLAYER_ONE,
    PLAYER_TWO,
  } = deps;
  return sharedConfiguration({
    id: SQUARE,
    label: "Square (1996)",
    settingsKey: "squareSize",
    minimumSize: 5,
    maximumSize: 32,
    sizeLabel: (size) => `${size} × ${size}`,
    coordinates(size) {
      const result = [];
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) result.push({ x, y });
      }
      return result;
    },
    cellCount: (size) => size * size,
    isOnBoard: (x, y, size) => x >= 0 && y >= 0 && x < size && y < size,
    tileTypeId: () => "default",
    sampleTiles: Object.freeze({ default: { x: 0, y: 0 } }),
    rulesetTileTypes: {
      default: { copy: SQUARE_ADJACENT, jump: SQUARE_JUMPS },
    },
    startingCells: (size, startPosition) => squareStartingCells(size, startPosition, PLAYER_ONE, PLAYER_TWO),
    randomCoordinate: (size, random) => ({
      x: Math.floor(random() * size),
      y: Math.floor(random() * size),
    }),
    coordinateDistance: (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)),
    formatCoordinate: (x, y) => `${x + 1},${y + 1}`,
    edgeBonus(x, y, size) {
      const onEdge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      const inCorner = (x === 0 || x === size - 1) && (y === 0 || y === size - 1);
      return (onEdge ? 0.125 : 0) + (inCorner ? 0.125 : 0);
    },
    presentation(x, y, size, cellRadius, scale = 1) {
      const half = cellRadius * scale;
      return {
        px: (x - (size - 1) / 2) * cellRadius * 2.08,
        py: (y - (size - 1) / 2) * cellRadius * 2.08,
        pieceRadius: cellRadius * 0.74,
        margin: cellRadius * 1.1,
        shape: { type: "rect", half, radius: cellRadius * 0.16 },
      };
    },
  });
}
