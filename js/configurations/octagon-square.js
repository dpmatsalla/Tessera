import { sharedConfiguration } from "./helpers.js?v=20260615-76";

export function createOctagonSquareConfiguration(deps) {
  const {
    OCTAGON_SQUARE,
    octagonSquareOffsets,
    octagonSquareStartingCells,
    octagonSquareTileInfo,
    randomListedCoordinate,
  } = deps;
  return sharedConfiguration({
    id: OCTAGON_SQUARE,
    label: "Octagon and square",
    settingsKey: "octagonSquareSize",
    minimumSize: 4,
    maximumSize: 20,
    sizeLabel: (size) => `${size} × ${size} octagons`,
    coordinates(size) {
      const result = [];
      for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
          result.push({ x: column * 2, y: row * 2 });
          if (column < size - 1 && row < size - 1) {
            result.push({ x: column * 2 + 1, y: row * 2 + 1 });
          }
        }
      }
      return result;
    },
    cellCount: (size) => size * size + (size - 1) ** 2,
    isOnBoard(x, y, size) {
      const tile = octagonSquareTileInfo(x, y);
      if (!tile) return false;
      const limit = tile.type === "octagon" ? size : size - 1;
      return tile.column >= 0 && tile.row >= 0
        && tile.column < limit && tile.row < limit;
    },
    tileTypeId: (x, y) => octagonSquareTileInfo(x, y)?.type ?? "default",
    sampleTiles: Object.freeze({
      octagon: { x: 0, y: 0 },
      square: { x: 1, y: 1 },
    }),
    rulesetTileTypes: {
      octagon: {
        copy: octagonSquareOffsets(0, 0).adjacent,
        jump: octagonSquareOffsets(0, 0).jumps,
      },
      square: {
        copy: octagonSquareOffsets(1, 1).adjacent,
        jump: octagonSquareOffsets(1, 1).jumps,
      },
    },
    startingCells: octagonSquareStartingCells,
    protectedCell(x, y, size, startPosition) {
      if (startPosition !== "center") return false;
      const leftColumn = Math.floor((size - 2) / 2);
      const firstRow = Math.floor((size - 2) / 2);
      return x === leftColumn * 2 + 1 && y === firstRow * 2 + 1;
    },
    randomCoordinate: (size, random) => randomListedCoordinate(OCTAGON_SQUARE, size, random),
    centerRock: true,
    centerRockCell(size) {
      const leftColumn = Math.floor((size - 2) / 2);
      const firstRow = Math.floor((size - 2) / 2);
      return { x: leftColumn * 2 + 1, y: firstRow * 2 + 1 };
    },
    coordinateDistance: (ax, ay, bx, by) => (
      Math.max(Math.abs(ax - bx), Math.abs(ay - by)) / 2
    ),
    formatCoordinate: (x, y) => `${x},${y}`,
    centerBoard: true,
    presentation(x, y, size, cellRadius, scale = 1) {
      const tile = octagonSquareTileInfo(x, y);
      const gridScale = cellRadius * Math.cos(Math.PI / 8);
      const shape = tile.type === "square"
        ? {
          type: "polygon",
          points: [
            [0, -cellRadius * (Math.cos(Math.PI / 8) - Math.sin(Math.PI / 8)) * scale],
            [cellRadius * (Math.cos(Math.PI / 8) - Math.sin(Math.PI / 8)) * scale, 0],
            [0, cellRadius * (Math.cos(Math.PI / 8) - Math.sin(Math.PI / 8)) * scale],
            [-cellRadius * (Math.cos(Math.PI / 8) - Math.sin(Math.PI / 8)) * scale, 0],
          ],
        }
        : {
          type: "polygon",
          points: Array.from({ length: 8 }, (_, index) => {
            const angle = Math.PI / 8 + index * Math.PI / 4;
            return [
              Math.cos(angle) * cellRadius * scale,
              Math.sin(angle) * cellRadius * scale,
            ];
          }),
        };
      return {
        px: (x - (size - 1)) * gridScale,
        py: (y - (size - 1)) * gridScale,
        pieceRadius: cellRadius * (tile.type === "octagon" ? 0.68 : 0.32),
        margin: cellRadius * 1.35,
        shape,
      };
    },
  });
}
