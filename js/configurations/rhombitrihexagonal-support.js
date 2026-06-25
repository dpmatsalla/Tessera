export function createRhombitrihexagonalSupport(deps) {
  const {
    PLAYER_ONE,
    PLAYER_TWO,
    RHOMBITRIHEXAGONAL,
    boardCoordinates,
    nearestStartingCells,
  } = deps;

  function rhombitrihexStartingCells(size, startPosition) {
    const coordinates = boardCoordinates(size, RHOMBITRIHEXAGONAL);
    const width = size * 3;
    const height = size * 2;
    const centerColumn = Math.floor((size - 1) / 2);
    const centerRow = Math.floor((size - 1) / 2);
    const centerHexX = centerColumn * 3;
    const centerHexY = centerRow * 2;
    const targets = startPosition === "corners"
      ? [
        { x: 0, y: 0, player: PLAYER_ONE },
        { x: width - 1, y: height - 1, player: PLAYER_ONE },
        { x: width - 1, y: 0, player: PLAYER_TWO },
        { x: 0, y: height - 1, player: PLAYER_TWO },
      ]
      : [
        { x: centerHexX, y: centerHexY + 1, player: PLAYER_ONE },
        { x: centerHexX, y: centerHexY + 3, player: PLAYER_ONE },
        { x: centerHexX + 2, y: centerHexY, player: PLAYER_TWO },
        { x: centerHexX - 1, y: centerHexY + 2, player: PLAYER_TWO },
      ];
    return nearestStartingCells(coordinates, targets);
  }

  return { rhombitrihexStartingCells };
}
