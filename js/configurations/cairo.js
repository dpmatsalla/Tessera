import { sharedConfiguration } from "./helpers.js?v=20260615-76";

export function createCairoConfiguration(deps) {
  const {
    CAIRO,
    cairoCenter,
    cairoOffsets,
    cairoStartingCells,
    cairoTileInfo,
    cairoVertices,
    randomListedCoordinate,
  } = deps;
  return sharedConfiguration({
    id: CAIRO,
    label: "Cairo pentagonal",
    settingsKey: "cairoSize",
    minimumSize: 4,
    maximumSize: 20,
    sizeLabel: (size) => `${size} × ${size} units`,
    coordinates(size) {
      const result = [];
      for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
          if ((column + row) % 2 === 0) {
            result.push({ x: column * 4 + 2, y: row * 4 + 1 });
            result.push({ x: column * 4 + 2, y: row * 4 + 3 });
          } else {
            result.push({ x: column * 4 + 1, y: row * 4 + 2 });
            result.push({ x: column * 4 + 3, y: row * 4 + 2 });
          }
        }
      }
      return result;
    },
    cellCount: (size) => size * size * 2,
    isOnBoard(x, y, size) {
      const tile = cairoTileInfo(x, y);
      return Boolean(tile && tile.column >= 0 && tile.row >= 0
        && tile.column < size && tile.row < size);
    },
    tileTypeId: (x, y) => cairoTileInfo(x, y)?.orientation ?? "default",
    sampleTiles: Object.freeze({
      up: { x: 2, y: 1 },
      down: { x: 2, y: 3 },
      left: { x: 5, y: 2 },
      right: { x: 7, y: 2 },
    }),
    rulesetTileTypes: {
      up: {
        copy: cairoOffsets(2, 1).adjacent,
        jump: cairoOffsets(2, 1).jumps,
      },
      down: {
        copy: cairoOffsets(2, 3).adjacent,
        jump: cairoOffsets(2, 3).jumps,
      },
      left: {
        copy: cairoOffsets(5, 2).adjacent,
        jump: cairoOffsets(5, 2).jumps,
      },
      right: {
        copy: cairoOffsets(7, 2).adjacent,
        jump: cairoOffsets(7, 2).jumps,
      },
    },
    startingCells: cairoStartingCells,
    randomCoordinate: (size, random) => randomListedCoordinate(CAIRO, size, random),
    coordinateDistance(ax, ay, bx, by) {
      const dx = Math.abs(ax - bx);
      const dy = Math.abs(ay - by);
      return Math.round((3 * Math.max(dx, dy) + Math.min(dx, dy)) / 8);
    },
    formatCoordinate: (x, y) => `${x},${y}`,
    centerBoard: true,
    presentation(x, y, size, cellRadius, scale = 1) {
      const center = cairoCenter(x, y);
      const unit = cellRadius / 3;
      return {
        px: (center.x - size * 2) * unit,
        py: (center.y - size * 2) * unit,
        pieceRadius: cellRadius * 0.29,
        margin: cellRadius * 1.35,
        shape: {
          type: "polygon",
          points: cairoVertices(x, y)
            .map(([vx, vy]) => [(vx - center.x) * unit * scale, (vy - center.y) * unit * scale]),
        },
      };
    },
  });
}
