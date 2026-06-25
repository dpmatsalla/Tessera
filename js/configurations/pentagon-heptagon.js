import {
  distanceToSegment,
  polygonCenter,
  polygonShape,
  sharedConfiguration,
} from "./helpers.js?v=20260615-76";

export function createPentagonHeptagonConfiguration(deps) {
  const {
    PENTAGON_HEPTAGON,
    pentagonHeptagonOffsets,
    pentagonHeptagonRenderPoint,
    pentagonHeptagonStartingCells,
    pentagonHeptagonTileInfo,
    pentagonHeptagonVertices,
  } = deps;
  return sharedConfiguration({
    id: PENTAGON_HEPTAGON,
    label: "Pentagon-heptagon mosaic",
    settingsKey: "pentagonHeptagonSize",
    defaultSize: 6,
    minimumSize: 3,
    maximumSize: 12,
    sizeLabel: (size) => `${size} × ${size} motifs`,
    coordinates: (size) => {
      const result = [];
      for (let y = 0; y < size * 2; y += 1) {
        for (let x = 0; x < size * 2; x += 1) result.push({ x, y });
      }
      return result;
    },
    cellCount: (size) => size * size * 4,
    isOnBoard: (x, y, size) => (
      x >= 0 && y >= 0 && x < size * 2 && y < size * 2
    ),
    tileTypeId: (x, y) => {
      const tile = pentagonHeptagonTileInfo(x, y);
      return tile ? `motif${tile.motif}` : "default";
    },
    sampleTiles: Object.freeze({
      motif0: { x: 0, y: 0 },
      motif1: { x: 1, y: 0 },
      motif2: { x: 0, y: 1 },
      motif3: { x: 1, y: 1 },
    }),
    rulesetTileTypes: {
      motif0: {
        copy: pentagonHeptagonOffsets(0, 0).adjacent,
        jump: pentagonHeptagonOffsets(0, 0).jumps,
      },
      motif1: {
        copy: pentagonHeptagonOffsets(1, 0).adjacent,
        jump: pentagonHeptagonOffsets(1, 0).jumps,
      },
      motif2: {
        copy: pentagonHeptagonOffsets(0, 1).adjacent,
        jump: pentagonHeptagonOffsets(0, 1).jumps,
      },
      motif3: {
        copy: pentagonHeptagonOffsets(1, 1).adjacent,
        jump: pentagonHeptagonOffsets(1, 1).jumps,
      },
    },
    startingCells: pentagonHeptagonStartingCells,
    randomCoordinate: (size, random) => ({
      x: Math.floor(random() * size * 2),
      y: Math.floor(random() * size * 2),
    }),
    coordinateDistance(ax, ay, bx, by) {
      const first = pentagonHeptagonRenderPoint(ax, ay);
      const second = pentagonHeptagonRenderPoint(bx, by);
      return Math.hypot(first.x - second.x, first.y - second.y);
    },
    formatCoordinate: (x, y) => `${x + 1},${y + 1}`,
    centerBoard: true,
    presentation(x, y, size, cellRadius, scale = 1) {
      const vertices = pentagonHeptagonVertices(x, y);
      const shapeCenter = polygonCenter(vertices);
      const renderCenter = pentagonHeptagonRenderPoint(x, y);
      const gridScale = cellRadius * 1.72;
      const centeredVertices = vertices.map(([vertexX, vertexY]) => [
        (vertexX - shapeCenter.x) * gridScale * scale,
        (vertexY - shapeCenter.y) * gridScale * scale,
      ]);
      const inradius = Math.min(...vertices.map((vertex, index) => (
        distanceToSegment(shapeCenter, vertex, vertices[(index + 1) % vertices.length])
      )));
      return {
        px: renderCenter.x * gridScale,
        py: renderCenter.y * gridScale,
        pieceRadius: inradius * gridScale * 0.7,
        margin: cellRadius * 1.4,
        shape: polygonShape(centeredVertices),
      };
    },
  });
}
