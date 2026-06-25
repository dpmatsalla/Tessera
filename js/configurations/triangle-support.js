export function createTriangleSupport(deps) {
  const { key } = deps;
  const offsetCache = new Map();

  function triangleVertices(x, y) {
    const column = Math.floor(x / 2);
    if (x % 2 === 0) {
      return [[column, y], [column + 1, y], [column, y + 1]];
    }
    return [[column + 1, y], [column, y + 1], [column + 1, y + 1]];
  }

  function triangleOffsets(x, y) {
    const orientation = Math.abs(x % 2);
    if (offsetCache.has(orientation)) return offsetCache.get(orientation);
    const sourceVertices = triangleVertices(x, y).map(([vx, vy]) => key(vx, vy));
    const adjacent = [];
    const jumps = [];
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const shared = triangleVertices(x + dx, y + dy)
          .filter(([vx, vy]) => sourceVertices.includes(key(vx, vy))).length;
        if (shared === 2) adjacent.push([dx, dy]);
        else if (shared === 1) jumps.push([dx, dy]);
      }
    }
    const offsets = { adjacent, jumps };
    offsetCache.set(orientation, offsets);
    return offsets;
  }

  function triangleCenterPoint(x, y, cellRadius) {
    const side = Math.sqrt(3) * cellRadius;
    const height = Math.sqrt(3) / 2 * side;
    return triangleVertices(x, y).reduce((center, [vx, vy]) => ({
      x: center.x + (vx + vy / 2) * side / 3,
      y: center.y + vy * height / 3,
    }), { x: 0, y: 0 });
  }

  return {
    triangleCenterPoint,
    triangleOffsets,
    triangleVertices,
  };
}
