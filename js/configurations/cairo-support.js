import { mod, polygonCenter } from "./helpers.js?v=20260615-76";

export function createCairoSupport(deps) {
  const {
    CAIRO,
    PLAYER_ONE,
    PLAYER_TWO,
    boardCoordinates,
    nearestStartingCells,
    key,
  } = deps;

  const offsetCache = new Map();

  function cairoTileInfo(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    if (mod(x, 4) === 2 && mod(y, 2) === 1) {
      const column = (x - 2) / 4;
      const row = Math.floor(y / 4);
      if (mod(column + row, 2) !== 0) return null;
      return {
        column,
        row,
        orientation: mod(y, 4) === 1 ? "up" : "down",
      };
    }
    if (mod(x, 2) === 1 && mod(y, 4) === 2) {
      const column = Math.floor(x / 4);
      const row = (y - 2) / 4;
      if (mod(column + row, 2) !== 1) return null;
      return {
        column,
        row,
        orientation: mod(x, 4) === 1 ? "left" : "right",
      };
    }
    return null;
  }

  function cairoVertices(x, y) {
    const tile = cairoTileInfo(x, y);
    if (!tile) return [];
    const left = tile.column * 4;
    const top = tile.row * 4;
    const points = {
      up: [[left, top], [left + 2, top - 1], [left + 4, top], [left + 3, top + 2], [left + 1, top + 2]],
      down: [[left + 1, top + 2], [left + 3, top + 2], [left + 4, top + 4], [left + 2, top + 5], [left, top + 4]],
      left: [[left, top], [left + 2, top + 1], [left + 2, top + 3], [left, top + 4], [left - 1, top + 2]],
      right: [[left + 2, top + 1], [left + 4, top], [left + 5, top + 2], [left + 4, top + 4], [left + 2, top + 3]],
    };
    return points[tile.orientation];
  }

  function cairoCenter(x, y) {
    return polygonCenter(cairoVertices(x, y));
  }

  function cairoAdjacentCoordinates(x, y) {
    const result = [];
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        if (
          (dx !== 0 || dy !== 0)
          && Math.abs(dx) + Math.abs(dy) <= 4
          && cairoTileInfo(x + dx, y + dy)
        ) {
          result.push({ x: x + dx, y: y + dy });
        }
      }
    }
    return result;
  }

  function cairoOffsets(x, y) {
    const cacheKey = `${mod(x, 8)},${mod(y, 8)}`;
    if (offsetCache.has(cacheKey)) return offsetCache.get(cacheKey);
    const adjacentCoordinates = cairoAdjacentCoordinates(x, y);
    const adjacent = adjacentCoordinates
      .map((coordinate) => [coordinate.x - x, coordinate.y - y]);
    const adjacentKeys = new Set(adjacentCoordinates.map((coordinate) => key(coordinate.x, coordinate.y)));
    const jumpsByKey = new Map();
    for (const coordinate of adjacentCoordinates) {
      for (const destination of cairoAdjacentCoordinates(coordinate.x, coordinate.y)) {
        const destinationKey = key(destination.x, destination.y);
        if (destinationKey !== key(x, y) && !adjacentKeys.has(destinationKey)) {
          jumpsByKey.set(destinationKey, [destination.x - x, destination.y - y]);
        }
      }
    }
    const offsets = { adjacent, jumps: [...jumpsByKey.values()] };
    offsetCache.set(cacheKey, offsets);
    return offsets;
  }

  function cairoStartingCells(size, startPosition) {
    const coordinates = boardCoordinates(size, CAIRO);
    const targets = startPosition === "corners"
      ? [
        { x: 0, y: 0, player: PLAYER_ONE },
        { x: size * 4, y: size * 4, player: PLAYER_ONE },
        { x: size * 4, y: 0, player: PLAYER_TWO },
        { x: 0, y: size * 4, player: PLAYER_TWO },
      ]
      : [
        { x: size * 2 - 1, y: size * 2 - 1, player: PLAYER_ONE },
        { x: size * 2 + 1, y: size * 2 + 1, player: PLAYER_ONE },
        { x: size * 2 + 1, y: size * 2 - 1, player: PLAYER_TWO },
        { x: size * 2 - 1, y: size * 2 + 1, player: PLAYER_TWO },
      ];
    return nearestStartingCells(coordinates, targets);
  }

  return {
    cairoCenter,
    cairoOffsets,
    cairoStartingCells,
    cairoTileInfo,
    cairoVertices,
  };
}
