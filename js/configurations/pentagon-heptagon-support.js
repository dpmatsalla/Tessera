import { mod } from "./helpers.js?v=20260615-76";

const motifVertices = Object.freeze({
  motif0: Object.freeze([
    [-0.5, 1.038261],
    [0.5, 1.038261],
    [1.12349, 0.256429],
    [0.900969, -0.718499],
    [0, -1.152382],
    [-0.900969, -0.718499],
    [-1.12349, 0.256429],
  ]),
  motif1: Object.freeze([
    [-0.53569, 0.671733],
    [0.46431, 0.671733],
    [0.686831, -0.303194],
    [0.142758, -0.737078],
    [-0.758211, -0.303194],
  ]),
  motif2: Object.freeze([
    [-0.46431, -0.671733],
    [0.53569, -0.671733],
    [0.758211, 0.303194],
    [-0.142758, 0.737078],
    [-0.686831, 0.303194],
  ]),
  motif3: Object.freeze([
    [-0.5, -1.038261],
    [0.5, -1.038261],
    [1.12349, -0.256429],
    [0.900969, 0.718499],
    [0, 1.152382],
    [-0.900969, 0.718499],
    [-1.12349, -0.256429],
  ]),
});

const motifCenters = Object.freeze({
  motif0: Object.freeze([0, 0]),
  motif1: Object.freeze([1.659179, -0.415304]),
  motif2: Object.freeze([-0.03569, 1.709994]),
  motif3: Object.freeze([1.62349, 1.29469]),
});

const rowVector = Object.freeze([3.24698, 0]);
const columnVector = Object.freeze([0.722521, 3.165571]);

function polygonVertexKey([x, y]) {
  return `${x.toFixed(9)},${y.toFixed(9)}`;
}

export function createPentagonHeptagonSupport(deps) {
  const {
    PENTAGON_HEPTAGON,
    PLAYER_ONE,
    PLAYER_TWO,
    HEX_ADJACENT,
    boardCoordinates,
    nearestStartingCells,
    key,
  } = deps;

  const offsetCache = new Map();

  function pentagonHeptagonTileInfo(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    const horizontalParity = mod(x, 2);
    const verticalParity = mod(y, 2);
    return {
      type: horizontalParity === verticalParity ? "heptagon" : "pentagon",
      motif: verticalParity * 2 + horizontalParity,
    };
  }

  function pentagonHeptagonAdjacentOffsets(x, y) {
    const horizontalParity = mod(x, 2);
    const verticalParity = mod(y, 2);
    let offsets = HEX_ADJACENT;
    if (horizontalParity === 0 && verticalParity === 0) {
      return [...offsets, [1, 1]];
    }
    if (horizontalParity === 1 && verticalParity === 1) {
      return [...offsets, [-1, -1]];
    }
    if (horizontalParity === 1) {
      offsets = offsets.filter(([dx, dy]) => dx !== -1 || dy !== 1);
    } else {
      offsets = offsets.filter(([dx, dy]) => dx !== 1 || dy !== -1);
    }
    return offsets;
  }

  function pentagonHeptagonPoint(x, y) {
    return {
      x: x + y / 2,
      y: y * Math.sqrt(3) / 2,
    };
  }

  function pentagonHeptagonRenderPoint(x, y) {
    const tile = pentagonHeptagonTileInfo(x, y);
    if (!tile) return { x: 0, y: 0 };
    const motifKey = `motif${tile.motif}`;
    const [offsetX, offsetY] = motifCenters[motifKey];
    const column = Math.floor(x / 2);
    const row = Math.floor(y / 2);
    return {
      x: column * rowVector[0] + row * columnVector[0] + offsetX,
      y: column * rowVector[1] + row * columnVector[1] + offsetY,
    };
  }

  function pentagonHeptagonTriangles(column, row) {
    const a = [column, row];
    const b = [column + 1, row];
    const c = [column, row + 1];
    const d = [column + 1, row + 1];
    return mod(column, 2) === 0 && mod(row, 2) === 0
      ? [[a, b, d], [a, c, d]]
      : [[a, b, c], [b, c, d]];
  }

  function pentagonHeptagonTopologyVertices(x, y) {
    if (!pentagonHeptagonTileInfo(x, y)) return [];
    const center = pentagonHeptagonPoint(x, y);
    const vertices = [];
    for (let row = y - 1; row <= y; row += 1) {
      for (let column = x - 1; column <= x; column += 1) {
        for (const triangle of pentagonHeptagonTriangles(column, row)) {
          if (!triangle.some(([vertexX, vertexY]) => vertexX === x && vertexY === y)) {
            continue;
          }
          const points = triangle.map(([vertexX, vertexY]) => (
            pentagonHeptagonPoint(vertexX, vertexY)
          ));
          vertices.push({
            x: points.reduce((sum, point) => sum + point.x, 0) / 3,
            y: points.reduce((sum, point) => sum + point.y, 0) / 3,
          });
        }
      }
    }
    return vertices
      .sort((first, second) => (
        Math.atan2(first.y - center.y, first.x - center.x)
        - Math.atan2(second.y - center.y, second.x - center.x)
      ))
      .map(({ x: vertexX, y: vertexY }) => [vertexX, vertexY]);
  }

  function pentagonHeptagonOffsets(x, y) {
    const cacheKey = `${mod(x, 2)},${mod(y, 2)}`;
    if (offsetCache.has(cacheKey)) {
      return offsetCache.get(cacheKey);
    }
    const adjacent = pentagonHeptagonAdjacentOffsets(x, y);
    const neighbors = adjacent.map(([dx, dy]) => ({
      x: x + dx,
      y: y + dy,
      vertices: pentagonHeptagonTopologyVertices(x + dx, y + dy),
    }));
    const adjacentKeys = new Set(neighbors.map((neighbor) => key(neighbor.x, neighbor.y)));
    const candidates = new Map();
    for (const neighbor of neighbors) {
      for (const [nextDx, nextDy] of pentagonHeptagonAdjacentOffsets(neighbor.x, neighbor.y)) {
        const destinationX = neighbor.x + nextDx;
        const destinationY = neighbor.y + nextDy;
        const destinationKey = key(destinationX, destinationY);
        if (
          (destinationX === x && destinationY === y)
          || adjacentKeys.has(destinationKey)
          || candidates.has(destinationKey)
          || !pentagonHeptagonTileInfo(destinationX, destinationY)
        ) {
          continue;
        }
        candidates.set(destinationKey, {
          x: destinationX,
          y: destinationY,
          vertices: pentagonHeptagonTopologyVertices(destinationX, destinationY),
        });
      }
    }
    const jumps = pentagonHeptagonTopologyVertices(x, y).map((homeVertex) => {
      const homeVertexKey = polygonVertexKey(homeVertex);
      const intermediateTiles = neighbors.filter((neighbor) => (
        neighbor.vertices.some((neighborVertex) => (
          polygonVertexKey(neighborVertex) === homeVertexKey
        ))
      ));
      const nextVertex = intermediateTiles[0].vertices.find((neighborVertex) => {
        const neighborVertexKey = polygonVertexKey(neighborVertex);
        return neighborVertexKey !== homeVertexKey
          && intermediateTiles[1].vertices.some((otherVertex) => (
            polygonVertexKey(otherVertex) === neighborVertexKey
          ));
      });
      const nextVertexKey = polygonVertexKey(nextVertex);
      const destination = [...candidates.values()].find((candidate) => (
        candidate.vertices.some((candidateVertex) => (
          polygonVertexKey(candidateVertex) === nextVertexKey
        ))
      ));
      return [destination.x - x, destination.y - y];
    });
    const offsets = { adjacent, jumps };
    offsetCache.set(cacheKey, offsets);
    return offsets;
  }

  function pentagonHeptagonVertices(x, y) {
    const tile = pentagonHeptagonTileInfo(x, y);
    if (!tile) return [];
    const center = pentagonHeptagonRenderPoint(x, y);
    return motifVertices[`motif${tile.motif}`]
      .map(([dx, dy]) => [center.x + dx, center.y + dy]);
  }

  function pentagonHeptagonStartingCells(size, startPosition) {
    const coordinates = boardCoordinates(size, PENTAGON_HEPTAGON);
    const maximum = size * 2 - 1;
    const targets = startPosition === "corners"
      ? [
        { x: 0, y: 0, player: PLAYER_ONE },
        { x: maximum, y: maximum, player: PLAYER_ONE },
        { x: maximum, y: 0, player: PLAYER_TWO },
        { x: 0, y: maximum, player: PLAYER_TWO },
      ]
      : [
        { x: size - 1, y: size - 1, player: PLAYER_ONE },
        { x: size, y: size, player: PLAYER_ONE },
        { x: size, y: size - 1, player: PLAYER_TWO },
        { x: size - 1, y: size, player: PLAYER_TWO },
      ];
    return nearestStartingCells(coordinates, targets);
  }

  return {
    pentagonHeptagonOffsets,
    pentagonHeptagonRenderPoint,
    pentagonHeptagonStartingCells,
    pentagonHeptagonTileInfo,
    pentagonHeptagonVertices,
  };
}
