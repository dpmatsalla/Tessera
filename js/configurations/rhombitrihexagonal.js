import { createPeriodicMotifConfiguration } from "./helpers.js?v=20260615-76";

const RHOMBITRIHEX_COLUMN_VECTOR = Object.freeze([Math.sqrt(3) + 1, 0]);
const RHOMBITRIHEX_ROW_VECTOR = Object.freeze([
  (Math.sqrt(3) + 1) / 2,
  (Math.sqrt(3) + 1) * Math.sqrt(3) / 2,
]);
const RHOMBITRIHEX_HEX = Object.freeze([
  [0, -1],
  [Math.sqrt(3) / 2, -0.5],
  [Math.sqrt(3) / 2, 0.5],
  [0, 1],
  [-Math.sqrt(3) / 2, 0.5],
  [-Math.sqrt(3) / 2, -0.5],
]);
const RHOMBITRIHEX_SQUARE_A = Object.freeze([
  [-0.5, -0.5],
  [0.5, -0.5],
  [0.5, 0.5],
  [-0.5, 0.5],
]);
const RHOMBITRIHEX_SQUARE_B = Object.freeze([
  [-0.683013, 0.183013],
  [0.183013, 0.683013],
  [0.683013, -0.183013],
  [-0.183013, -0.683013],
]);
const RHOMBITRIHEX_SQUARE_C = Object.freeze([
  [-0.183013, 0.683013],
  [0.683013, 0.183013],
  [0.183013, -0.683013],
  [-0.683013, -0.183013],
]);
const RHOMBITRIHEX_TRIANGLE_A = Object.freeze([
  [-0.5, -0.288675],
  [0.5, -0.288675],
  [0, 0.57735],
]);
const RHOMBITRIHEX_TRIANGLE_B = Object.freeze([
  [-0.5, 0.288675],
  [0, -0.57735],
  [0.5, 0.288675],
]);

export function createRhombitrihexagonalConfiguration(deps) {
  const {
    RHOMBITRIHEXAGONAL,
    rhombitrihexStartingCells,
  } = deps;
  return createPeriodicMotifConfiguration({
    id: RHOMBITRIHEXAGONAL,
    label: "Rhombitrihexagonal (3.4.6.4)",
    settingsKey: "rhombitrihexSize",
    defaultSize: 5,
    minimumSize: 2,
    maximumSize: 10,
    sizeLabel: (size) => `${size} × ${size} motifs`,
    formatCoordinate: (x, y) => `${x + 1},${y + 1}`,
    startingCells: rhombitrihexStartingCells,
    centerRock: true,
    centerRockCell(size) {
      const centerColumn = Math.floor((size - 1) / 2);
      const centerRow = Math.floor((size - 1) / 2);
      return { x: centerColumn * 3, y: centerRow * 2 };
    },
    motifWidth: 3,
    motifHeight: 2,
    columnVector: RHOMBITRIHEX_COLUMN_VECTOR,
    rowVector: RHOMBITRIHEX_ROW_VECTOR,
    pieceRadiusScale: 0.4,
    motifTiles: [
      {
        id: "hex",
        slot: [0, 0],
        center: [0, 0],
        points: RHOMBITRIHEX_HEX,
        pieceScale: 0.552,
        copy: [[-2, 0], [1, 0], [2, 0], [0, 1], [-1, 2], [0, 3]],
        jump: [[1, -1], [-2, 1], [-1, 1], [1, 1], [2, 1], [-1, 3]],
      },
      {
        id: "square-a",
        slot: [1, 0],
        center: [1.366025, 0],
        points: RHOMBITRIHEX_SQUARE_A,
        pieceScale: 0.357,
        copy: [[-1, 0], [2, 0], [0, 1], [1, 1]],
        jump: [[1, 0], [2, 1], [1, 2], [-1, 3]],
      },
      {
        id: "square-b",
        slot: [2, 0],
        center: [0.683013, -1.183013],
        points: RHOMBITRIHEX_SQUARE_B,
        pieceScale: 0.34,
        copy: [[1, -2], [-1, -1], [-2, 0], [0, 1]],
        jump: [[-1, -2], [-1, 0], [-2, 1], [1, 1]],
      },
      {
        id: "square-c",
        slot: [0, 1],
        center: [-0.683013, -1.183013],
        points: RHOMBITRIHEX_SQUARE_C,
        pieceScale: 0.34,
        copy: [[0, -3], [1, -2], [0, -1], [-1, 0]],
        jump: [[1, -3], [-2, -1], [-1, -1], [2, -1]],
      },
      {
        id: "triangle-a",
        slot: [1, 1],
        center: [1.366025, 0.788675],
        points: RHOMBITRIHEX_TRIANGLE_A,
        pieceScale: 0.234,
        copy: [[0, -1], [1, 1], [-1, 2]],
        jump: [[-1, -1], [2, -1], [-1, 1]],
      },
      {
        id: "triangle-b",
        slot: [2, 1],
        center: [1.366025, -0.788675],
        points: RHOMBITRIHEX_TRIANGLE_B,
        pieceScale: 0.234,
        copy: [[-1, -1], [0, -1], [1, 0]],
        jump: [[1, -3], [-2, -1], [1, -1]],
      },
    ],
  });
}
