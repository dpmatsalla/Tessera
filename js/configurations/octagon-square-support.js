import { mod } from "./helpers.js?v=20260615-76";

export function createOctagonSquareSupport(deps) {
  const {
    OCTAGON_SQUARE,
    PLAYER_ONE,
    PLAYER_TWO,
    boardCoordinates,
    nearestStartingCells,
  } = deps;

  function octagonSquareTileInfo(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    if (mod(x, 2) === 0 && mod(y, 2) === 0) {
      return { type: "octagon", column: x / 2, row: y / 2 };
    }
    if (mod(x, 2) === 1 && mod(y, 2) === 1) {
      return {
        type: "square",
        column: Math.floor(x / 2),
        row: Math.floor(y / 2),
      };
    }
    return null;
  }

  function octagonSquareOffsets(x, y) {
    if (octagonSquareTileInfo(x, y)?.type === "square") {
      return {
        adjacent: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
        jumps: [[-2, 0], [2, 0], [0, -2], [0, 2]],
      };
    }
    return {
      adjacent: [
        [-2, 0], [2, 0], [0, -2], [0, 2],
        [-1, -1], [1, -1], [-1, 1], [1, 1],
      ],
      jumps: [[-2, -2], [2, -2], [-2, 2], [2, 2]],
    };
  }

  function octagonSquareStartingCells(size, startPosition) {
    const coordinates = boardCoordinates(size, OCTAGON_SQUARE);
    const maximum = (size - 1) * 2;
    if (startPosition === "corners") {
      return nearestStartingCells(coordinates, [
        { x: 0, y: 0, player: PLAYER_ONE },
        { x: maximum, y: maximum, player: PLAYER_ONE },
        { x: maximum, y: 0, player: PLAYER_TWO },
        { x: 0, y: maximum, player: PLAYER_TWO },
      ]);
    }

    const leftColumn = Math.floor((size - 2) / 2);
    const rightColumn = leftColumn + 1;
    const firstRow = Math.floor((size - 2) / 2);
    const secondRow = firstRow + 1;
    return [
      { x: leftColumn * 2, y: firstRow * 2, player: PLAYER_ONE },
      { x: rightColumn * 2, y: secondRow * 2, player: PLAYER_ONE },
      { x: leftColumn * 2, y: secondRow * 2, player: PLAYER_TWO },
      { x: rightColumn * 2, y: firstRow * 2, player: PLAYER_TWO },
    ];
  }

  return {
    octagonSquareOffsets,
    octagonSquareStartingCells,
    octagonSquareTileInfo,
  };
}
