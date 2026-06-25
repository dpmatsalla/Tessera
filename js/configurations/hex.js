import { sharedConfiguration } from "./helpers.js?v=20260615-76";

function hexStartingCells(size, startPosition, PLAYER_ONE, PLAYER_TWO) {
  if (startPosition === "center") {
    return [
      { x: 1, y: 0, player: PLAYER_ONE },
      { x: 0, y: -1, player: PLAYER_ONE },
      { x: -1, y: 1, player: PLAYER_ONE },
      { x: 0, y: 1, player: PLAYER_TWO },
      { x: -1, y: 0, player: PLAYER_TWO },
      { x: 1, y: -1, player: PLAYER_TWO },
    ];
  }
  return [
    { x: size, y: 0, player: PLAYER_ONE },
    { x: 0, y: -size, player: PLAYER_ONE },
    { x: -size, y: size, player: PLAYER_ONE },
    { x: 0, y: size, player: PLAYER_TWO },
    { x: -size, y: 0, player: PLAYER_TWO },
    { x: size, y: -size, player: PLAYER_TWO },
  ];
}

export function createHexConfiguration(deps) {
  const {
    HEX,
    HEX_ADJACENT,
    HEX_JUMPS,
    PLAYER_ONE,
    PLAYER_TWO,
    hexDistance,
    vbCInt,
  } = deps;
  return sharedConfiguration({
    id: HEX,
    label: "Hexagonal",
    settingsKey: "radius",
    defaultSize: 4,
    minimumSize: 2,
    maximumSize: 16,
    sizeLabel: String,
    coordinates(size) {
      const result = [];
      for (let y = -size; y <= size; y += 1) {
        for (let x = -size; x <= size; x += 1) {
          if (Math.abs(x) + Math.abs(y) + Math.abs(x + y) <= size * 2) {
            result.push({ x, y });
          }
        }
      }
      return result;
    },
    cellCount: (size) => 3 * (size + 1) ** 2 - 3 * (size + 1) + 1,
    isOnBoard: (x, y, size) => Math.abs(x) + Math.abs(y) + Math.abs(x + y) <= size * 2,
    tileTypeId: () => "default",
    sampleTiles: Object.freeze({ default: { x: 0, y: 0 } }),
    rulesetTileTypes: {
      default: { copy: HEX_ADJACENT, jump: HEX_JUMPS },
    },
    startingCells: (size, startPosition) => hexStartingCells(size, startPosition, PLAYER_ONE, PLAYER_TWO),
    protectedCell(x, y, size, startPosition) {
      return startPosition === "center"
        ? hexDistance(0, 0, x, y) <= 1
        : x * x + y * y + (x + y) ** 2 === 2 * size ** 2;
    },
    randomCoordinate: (size, random) => ({
      x: vbCInt((random() * 2 - 1) * size),
      y: vbCInt((random() * 2 - 1) * size),
    }),
    centerRock: true,
    coordinateDistance: hexDistance,
    formatCoordinate: (x, y) => `${x},${y},${x + y}`,
    edgeBonus(x, y, size) {
      let bonus = 0;
      if (x * x + y * y + (x + y) ** 2 === 2 * size ** 2) bonus += 0.125;
      if (Math.abs(x) + Math.abs(y) + Math.abs(x + y) === 2 * size) bonus += 0.125;
      return bonus;
    },
    presentation(x, y, size, cellRadius, scale = 1) {
      const gridScale = cellRadius * 1.96;
      return {
        px: (x / 2 + y) * gridScale,
        py: x * gridScale * Math.sqrt(3) / 2,
        pieceRadius: cellRadius * 0.74,
        margin: cellRadius * 1.35,
        shape: { type: "circle", radius: cellRadius * scale },
      };
    },
  });
}
