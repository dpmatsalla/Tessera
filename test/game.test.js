import test from "node:test";
import assert from "node:assert/strict";
import { chooseComputerMove } from "../js/ai.js";
import { containSize } from "../js/layout.js";
import { clampPan, clampZoom, zoomedViewBox } from "../js/viewport.js";
import { limitHistory, MAX_UNDO_ACTIONS, shouldTrackHistory } from "../js/storage.js";
import {
  batchShouldContinue,
  FAST_BATCH_BUDGET_MS,
  FAST_BATCH_MAX_TURNS,
  useFastComputerBatch,
} from "../js/scheduler.js";
import {
  EMPTY,
  CAIRO,
  OCTAGON_SQUARE,
  PENTAGON_HEPTAGON,
  PLAYER_ONE,
  PLAYER_TWO,
  RHOMBITRIHEXAGONAL,
  ROCK,
  SQUARE,
  SQUARE_ADJACENT,
  SQUARE_JUMPS,
  TRIANGLE,
  adjacentOffsets,
  allLegalMoves,
  applyMove,
  boardCellCount,
  boardCoordinates,
  cairoCenter,
  cairoVertices,
  cloneGame,
  counts,
  createGame,
  deserializeGame,
  hexDistance,
  isOnBoard,
  getConfiguration as lookupConfiguration,
  key,
  legalMovesFrom,
  jumpOffsets,
  moveDistance,
  octagonSquareTileInfo,
  pentagonHeptagonTileInfo,
  pentagonHeptagonVertices,
  passTurn,
  resolveNoLegalMove,
  resolveCurrentPlayerNoMove,
  settleGame,
  serializeGame,
  triangleVertices,
  vbCInt,
} from "../js/game.js";

test("hex board geometry matches the legacy board formula", () => {
  for (let radius = 2; radius <= 16; radius += 1) {
    assert.equal(boardCoordinates(radius).length, boardCellCount(radius));
    assert.equal(isOnBoard(radius, 0, radius), true);
    assert.equal(isOnBoard(radius, 1, radius), false);
  }
});

test("expanded board-size limits create the expected number of cells", () => {
  const triangle = createGame({
    shape: TRIANGLE,
    triangleSize: 4,
    rockPercent: 0,
  });
  const hex = createGame({ radius: 16, rockPercent: 0 });

  assert.equal(triangle.radius, 4);
  assert.equal(boardCellCount(triangle.radius, triangle.shape), 32);
  assert.equal(hex.radius, 16);
  assert.equal(boardCellCount(hex.radius, hex.shape), 817);
});

test("undo history retains only the current position and five prior actions", () => {
  const history = Array.from({ length: 20 }, (_, index) => ({ label: `Turn ${index}` }));
  const retained = limitHistory(history);

  assert.equal(MAX_UNDO_ACTIONS, 20);
  assert.equal(retained.length, 6);
  assert.equal(retained[0].label, "Turn 14");
  assert.equal(retained[5].label, "Turn 19");
});

test("undo retention is adjustable from zero through twenty turns", () => {
  const history = Array.from({ length: 30 }, (_, index) => ({ label: `Turn ${index}` }));
  assert.equal(limitHistory(history, 0).length, 1);
  assert.equal(limitHistory(history, 5).length, 6);
  assert.equal(limitHistory(history, 20).length, 21);
  assert.equal(limitHistory(history, 99).length, 21);
});

test("history is disabled only when both players are computers", () => {
  assert.equal(shouldTrackHistory({
    1: { type: "computer" },
    2: { type: "computer" },
  }), false);
  assert.equal(shouldTrackHistory({
    1: { type: "human" },
    2: { type: "computer" },
  }), true);
  assert.equal(shouldTrackHistory({
    1: { type: "computer" },
    2: { type: "human" },
  }), true);
});

test("fast batching activates only for two computers at exactly one millisecond", () => {
  const computers = {
    1: { type: "computer" },
    2: { type: "computer" },
  };
  assert.equal(useFastComputerBatch(computers, 1), true);
  assert.equal(useFastComputerBatch(computers, 2), false);
  assert.equal(useFastComputerBatch({
    1: { type: "human" },
    2: { type: "computer" },
  }, 1), false);
});

test("fast batches yield at their time or turn limit", () => {
  assert.equal(batchShouldContinue(100, 100 + FAST_BATCH_BUDGET_MS - 0.1, 1), true);
  assert.equal(batchShouldContinue(100, 100 + FAST_BATCH_BUDGET_MS, 1), false);
  assert.equal(batchShouldContinue(100, 100, FAST_BATCH_MAX_TURNS - 1), true);
  assert.equal(batchShouldContinue(100, 100, FAST_BATCH_MAX_TURNS), false);
});

test("maximum Hex board retained history remains compact", () => {
  const game = createGame({ radius: 16, rockPercent: 10 });
  const snapshot = serializeGame(game);
  const history = limitHistory(Array.from({ length: 1000 }, (_, index) => ({
    label: `Turn ${index}`,
    game: snapshot,
  })));
  const bytes = JSON.stringify({ version: 1, game: snapshot, history }).length;

  assert.equal(history.length, 6);
  assert.ok(bytes < 100_000, `Expected under 100 KB, received ${bytes} bytes`);
});

test("square board geometry matches the 1996 matrix", () => {
  const game = createGame({ shape: SQUARE, squareSize: 8, rockPercent: 0 });
  assert.equal(game.shape, SQUARE);
  assert.equal(boardCoordinates(game.radius, game.shape).length, 64);
  assert.equal(boardCellCount(game.radius, game.shape), 64);
  assert.equal(isOnBoard(0, 0, game.radius, game.shape), true);
  assert.equal(isOnBoard(8, 0, game.radius, game.shape), false);
  assert.equal(SQUARE_ADJACENT.length, 8);
  assert.equal(SQUARE_JUMPS.length, 12);
});

test("square corner setup matches BUGGER.BAS", () => {
  const game = createGame({
    shape: SQUARE,
    squareSize: 8,
    rockPercent: 0,
    startPosition: "corners",
  });
  assert.equal(game.board.get(key(0, 0)), PLAYER_ONE);
  assert.equal(game.board.get(key(7, 7)), PLAYER_ONE);
  assert.equal(game.board.get(key(7, 0)), PLAYER_TWO);
  assert.equal(game.board.get(key(0, 7)), PLAYER_TWO);
});

test("square toe-to-toe setup matches BUGGER.BAS", () => {
  const game = createGame({
    shape: SQUARE,
    squareSize: 8,
    rockPercent: 0,
    startPosition: "center",
  });
  assert.equal(counts(game)[PLAYER_ONE], 4);
  assert.equal(counts(game)[PLAYER_TWO], 4);
  assert.equal(game.board.get(key(3, 3)), PLAYER_ONE);
  assert.equal(game.board.get(key(4, 3)), PLAYER_TWO);
  assert.equal(game.board.get(key(5, 2)), PLAYER_ONE);
  assert.equal(game.board.get(key(2, 2)), PLAYER_TWO);
});

test("square copies, jumps, and captures use the original offsets", () => {
  const game = emptySquareGame();
  game.board.set(key(3, 3), PLAYER_ONE);
  game.board.set(key(4, 4), PLAYER_TWO);
  game.board.set(key(2, 4), PLAYER_TWO);

  const moves = legalMovesFrom(game, 3, 3);
  assert.equal(moves.length, 18);
  assert.equal(moveDistance(game, 3, 3, 4, 4), 1);
  assert.equal(moveDistance(game, 3, 3, 5, 4), 2);
  assert.equal(moveDistance(game, 3, 3, 5, 5), Infinity);
  assert.equal(moves.some((item) => item.toX === 5 && item.toY === 5), false);

  const result = applyMove(game, move(3, 3, 3, 4));
  assert.equal(result.distance, 1);
  assert.equal(result.captured, 2);
  assert.equal(game.board.get(key(3, 3)), PLAYER_ONE);
});

test("computer returns a legal square-board move", () => {
  const game = createGame({
    shape: SQUARE,
    squareSize: 8,
    rockPercent: 10,
    startPosition: "corners",
  }, seededRandom(31));
  const selected = chooseComputerMove(game, 10, 10, "hard");
  assert.ok(selected);
  assert.ok(legalMovesFrom(game, selected.fromX, selected.fromY).some((candidate) => (
    candidate.toX === selected.toX && candidate.toY === selected.toY
  )));
});

test("triangular grid has three side neighbours and nine corner jumps", () => {
  const evenAdjacent = adjacentOffsets(TRIANGLE, 8, 5);
  const oddAdjacent = adjacentOffsets(TRIANGLE, 9, 5);
  const evenJumps = jumpOffsets(TRIANGLE, 8, 5);
  const oddJumps = jumpOffsets(TRIANGLE, 9, 5);

  assert.equal(evenAdjacent.length, 3);
  assert.equal(oddAdjacent.length, 3);
  assert.equal(evenJumps.length, 9);
  assert.equal(oddJumps.length, 9);

  const sourceVertices = triangleVertices(8, 5).map((point) => point.join(","));
  for (const [dx, dy] of evenAdjacent) {
    const shared = triangleVertices(8 + dx, 5 + dy)
      .filter((point) => sourceVertices.includes(point.join(",")));
    assert.equal(shared.length, 2);
  }
  for (const [dx, dy] of evenJumps) {
    const shared = triangleVertices(8 + dx, 5 + dy)
      .filter((point) => sourceVertices.includes(point.join(",")));
    assert.equal(shared.length, 1);
  }
});

test("triangular board setup and cell count are geometry-aware", () => {
  const game = createGame({
    shape: TRIANGLE,
    triangleSize: 8,
    rockPercent: 0,
    startPosition: "corners",
  });
  assert.equal(boardCellCount(game.radius, game.shape), 128);
  assert.equal(boardCoordinates(game.radius, game.shape).length, 128);
  assert.equal(game.board.get(key(0, 0)), PLAYER_ONE);
  assert.equal(game.board.get(key(15, 7)), PLAYER_ONE);
  assert.equal(game.board.get(key(15, 0)), PLAYER_TWO);
  assert.equal(game.board.get(key(0, 7)), PLAYER_TWO);
  assert.equal(deserializeGame(serializeGame(game)).shape, TRIANGLE);
});

test("triangular copies, jumps, and captures follow side and corner contact", () => {
  const game = emptyTriangleGame();
  const source = { x: 8, y: 5 };
  game.board.set(key(source.x, source.y), PLAYER_ONE);
  game.board.set(key(0, 0), PLAYER_TWO);
  const moves = legalMovesFrom(game, source.x, source.y);
  assert.equal(moves.filter((item) => item.type === "copy").length, 3);
  assert.equal(moves.filter((item) => item.type === "jump").length, 9);

  const destination = moves.find((item) => item.type === "copy");
  const enemies = adjacentOffsets(game, destination.toX, destination.toY)
    .map(([dx, dy]) => ({ x: destination.toX + dx, y: destination.toY + dy }))
    .filter((cell) => cell.x !== source.x || cell.y !== source.y);
  for (const enemy of enemies) game.board.set(key(enemy.x, enemy.y), PLAYER_TWO);

  const result = applyMove(game, destination);
  assert.equal(result.distance, 1);
  assert.equal(result.captured, 2);
  assert.equal(game.board.get(key(source.x, source.y)), PLAYER_ONE);
});

test("computer returns a legal triangular-board move", () => {
  const game = createGame({
    shape: TRIANGLE,
    triangleSize: 8,
    rockPercent: 10,
    startPosition: "corners",
  }, seededRandom(41));
  const selected = chooseComputerMove(game, 10, 10, "hard");
  assert.ok(selected);
  assert.ok(legalMovesFrom(game, selected.fromX, selected.fromY).some((candidate) => (
    candidate.toX === selected.toX && candidate.toY === selected.toY
  )));
});

test("Cairo grid has five edge neighbours and eleven jump destinations", () => {
  const source = { x: 18, y: 17 };
  const adjacent = adjacentOffsets(CAIRO, source.x, source.y);
  const jumps = jumpOffsets(CAIRO, source.x, source.y);
  const sourceVertices = cairoVertices(source.x, source.y).map((point) => point.join(","));

  assert.equal(adjacent.length, 5);
  assert.equal(jumps.length, 11);
  assert.ok(adjacent.every(([dx, dy]) => (
    cairoVertices(source.x + dx, source.y + dy)
      .filter((point) => sourceVertices.includes(point.join(","))).length === 2
  )));
  assert.equal(jumps.filter(([dx, dy]) => (
    cairoVertices(source.x + dx, source.y + dy)
      .filter((point) => sourceVertices.includes(point.join(","))).length === 1
  )).length, 2);
  assert.equal(jumps.filter(([dx, dy]) => (
    cairoVertices(source.x + dx, source.y + dy)
      .filter((point) => sourceVertices.includes(point.join(","))).length === 0
  )).length, 9);
});

test("Cairo render centers are the area centroids of every pentagon orientation", () => {
  for (const { x, y } of [
    { x: 2, y: 1 },
    { x: 2, y: 3 },
    { x: 5, y: 2 },
    { x: 7, y: 2 },
  ]) {
    const center = cairoCenter(x, y);
    const centered = cairoVertices(x, y)
      .map(([vertexX, vertexY]) => [vertexX - center.x, vertexY - center.y]);
    assert.ok(Math.abs(polygonCentroid(centered).x) < 1e-12);
    assert.ok(Math.abs(polygonCentroid(centered).y) < 1e-12);
  }
});

test("Cairo board setup, moves, capture, serialization, and AI are geometry-aware", () => {
  const game = createGame({
    shape: CAIRO,
    cairoSize: 8,
    rockPercent: 0,
    startPosition: "corners",
  });
  assert.equal(game.shape, CAIRO);
  assert.equal(boardCellCount(game.radius, game.shape), 128);
  assert.equal(boardCoordinates(game.radius, game.shape).length, 128);
  assert.equal(counts(game)[PLAYER_ONE], 2);
  assert.equal(counts(game)[PLAYER_TWO], 2);
  assert.equal(deserializeGame(serializeGame(game)).shape, CAIRO);

  const empty = emptyCairoGame();
  const source = { x: 18, y: 17 };
  empty.board.set(key(source.x, source.y), PLAYER_ONE);
  const moves = legalMovesFrom(empty, source.x, source.y);
  assert.equal(moves.filter((item) => item.type === "copy").length, 5);
  assert.equal(moves.filter((item) => item.type === "jump").length, 11);

  const destination = moves.find((item) => item.type === "copy");
  const enemy = adjacentOffsets(empty, destination.toX, destination.toY)
    .map(([dx, dy]) => ({ x: destination.toX + dx, y: destination.toY + dy }))
    .find((cell) => cell.x !== source.x || cell.y !== source.y);
  empty.board.set(key(enemy.x, enemy.y), PLAYER_TWO);
  const result = applyMove(empty, destination);
  assert.equal(result.distance, 1);
  assert.equal(result.captured, 1);

  const selected = chooseComputerMove(game, 10, 10, "hard");
  assert.ok(selected);
  assert.ok(legalMovesFrom(game, selected.fromX, selected.fromY).some((candidate) => (
    candidate.toX === selected.toX && candidate.toY === selected.toY
  )));
});

test("octagon-and-square tiles use the requested copy and jump neighborhoods", () => {
  const octagonAdjacent = adjacentOffsets(OCTAGON_SQUARE, 4, 4);
  const octagonJumps = jumpOffsets(OCTAGON_SQUARE, 4, 4);
  const squareAdjacent = adjacentOffsets(OCTAGON_SQUARE, 5, 5);
  const squareJumps = jumpOffsets(OCTAGON_SQUARE, 5, 5);

  assert.equal(octagonSquareTileInfo(4, 4).type, "octagon");
  assert.equal(octagonSquareTileInfo(5, 5).type, "square");
  assert.equal(octagonAdjacent.length, 8);
  assert.equal(octagonJumps.length, 4);
  assert.equal(squareAdjacent.length, 4);
  assert.equal(squareJumps.length, 4);
  assert.ok(octagonAdjacent.every(([dx, dy]) => (
    Math.abs(dx) + Math.abs(dy) === 2
  )));
  assert.ok(octagonJumps.every(([dx, dy]) => (
    Math.abs(dx) === 2 && Math.abs(dy) === 2
  )));
  assert.ok(squareAdjacent.every(([dx, dy]) => (
    Math.abs(dx) === 1 && Math.abs(dy) === 1
  )));
});

test("octagon-and-square boards support setup, moves, capture, AI, and serialization", () => {
  const game = createGame({
    shape: OCTAGON_SQUARE,
    octagonSquareSize: 8,
    rockPercent: 0,
    startPosition: "corners",
  });
  assert.equal(game.shape, OCTAGON_SQUARE);
  assert.equal(boardCellCount(game.radius, game.shape), 113);
  assert.equal(boardCoordinates(game.radius, game.shape).length, 113);
  assert.equal(counts(game)[PLAYER_ONE], 2);
  assert.equal(counts(game)[PLAYER_TWO], 2);
  assert.equal(deserializeGame(serializeGame(game)).shape, OCTAGON_SQUARE);

  const empty = emptyOctagonSquareGame();
  empty.board.set(key(4, 4), PLAYER_ONE);
  let moves = legalMovesFrom(empty, 4, 4);
  assert.equal(moves.filter((item) => item.type === "copy").length, 8);
  assert.equal(moves.filter((item) => item.type === "jump").length, 4);
  assert.equal(moveDistance(empty, 4, 4, 6, 6), 2);

  const destination = moves.find((item) => item.type === "copy");
  const enemy = adjacentOffsets(empty, destination.toX, destination.toY)
    .map(([dx, dy]) => ({ x: destination.toX + dx, y: destination.toY + dy }))
    .find((cell) => (
      isOnBoard(cell.x, cell.y, empty.radius, empty.shape)
      && (cell.x !== 4 || cell.y !== 4)
    ));
  empty.board.set(key(enemy.x, enemy.y), PLAYER_TWO);
  const result = applyMove(empty, destination);
  assert.equal(result.distance, 1);
  assert.equal(result.captured, 1);

  const squareGame = emptyOctagonSquareGame();
  squareGame.board.set(key(5, 5), PLAYER_ONE);
  moves = legalMovesFrom(squareGame, 5, 5);
  assert.equal(moves.filter((item) => item.type === "copy").length, 4);
  assert.equal(moves.filter((item) => item.type === "jump").length, 4);

  const selected = chooseComputerMove(game, 10, 10, "hard");
  assert.ok(selected);
  assert.ok(legalMovesFrom(game, selected.fromX, selected.fromY).some((candidate) => (
    candidate.toX === selected.toX && candidate.toY === selected.toY
  )));
});

test("octagon-and-square starts cannot eliminate Player 2 on the opening move", () => {
  for (let size = 4; size <= 20; size += 1) {
    for (const startPosition of ["center", "corners"]) {
      const game = createGame({
        shape: OCTAGON_SQUARE,
        octagonSquareSize: size,
        rockPercent: 0,
        startPosition,
      });
      for (const move of allLegalMoves(game)) {
        const next = cloneGame(game);
        applyMove(next, move);
        assert.ok(
          counts(next)[PLAYER_TWO] > 0,
          `${startPosition} size ${size} permits instant elimination via ${JSON.stringify(move)}`,
        );
      }
    }
  }
});

test("octagon-and-square center setup uses the central four octagons and a blocking square rock", () => {
  const game = createGame({
    shape: OCTAGON_SQUARE,
    octagonSquareSize: 8,
    rockPercent: 0,
    startPosition: "center",
  });

  assert.equal(game.board.get(key(6, 6)), PLAYER_ONE);
  assert.equal(game.board.get(key(8, 8)), PLAYER_ONE);
  assert.equal(game.board.get(key(6, 8)), PLAYER_TWO);
  assert.equal(game.board.get(key(8, 6)), PLAYER_TWO);
  assert.equal(game.board.get(key(7, 7)), ROCK);
});

test("pentagon-heptagon motifs expose five- and seven-sided neighborhoods", () => {
  for (const { x, y, type, sides, expectedJumps, expectedVertices } of [
    {
      x: 4,
      y: 4,
      type: "heptagon",
      sides: 7,
      expectedJumps: [[-1, -1], [0, -2], [2, -1], [2, 0], [0, 2], [-1, 2], [-2, 0]],
      expectedVertices: [
        [-0.5, 1.038261],
        [0.5, 1.038261],
        [1.12349, 0.256429],
        [0.900969, -0.718499],
        [0, -1.152382],
        [-0.900969, -0.718499],
        [-1.12349, 0.256429],
      ],
    },
    {
      x: 5,
      y: 4,
      type: "pentagon",
      sides: 5,
      expectedJumps: [[-1, -1], [1, -2], [2, -1], [1, 1], [-1, 1]],
      expectedVertices: [
        [-0.53569, 0.671733],
        [0.46431, 0.671733],
        [0.686831, -0.303194],
        [0.142758, -0.737078],
        [-0.758211, -0.303194],
      ],
    },
    {
      x: 4,
      y: 5,
      type: "pentagon",
      sides: 5,
      expectedJumps: [[-1, -1], [1, -1], [1, 1], [-1, 2], [-2, 1]],
      expectedVertices: [
        [-0.46431, -0.671733],
        [0.53569, -0.671733],
        [0.758211, 0.303194],
        [-0.142758, 0.737078],
        [-0.686831, 0.303194],
      ],
    },
    {
      x: 5,
      y: 5,
      type: "heptagon",
      sides: 7,
      expectedJumps: [[-2, 0], [0, -2], [1, -2], [2, 0], [1, 1], [0, 2], [-2, 1]],
      expectedVertices: [
        [-0.5, -1.038261],
        [0.5, -1.038261],
        [1.12349, -0.256429],
        [0.900969, 0.718499],
        [0, 1.152382],
        [-0.900969, 0.718499],
        [-1.12349, -0.256429],
      ],
    },
  ]) {
    const adjacent = adjacentOffsets(PENTAGON_HEPTAGON, x, y);
    const jumps = jumpOffsets(PENTAGON_HEPTAGON, x, y);
    const sourceVertices = pentagonHeptagonVertices(x, y);

    assert.equal(pentagonHeptagonTileInfo(x, y).type, type);
    assert.equal(sourceVertices.length, sides);
    assert.deepEqual(relativePolygon(sourceVertices, x, y), expectedVertices);
    assert.equal(adjacent.length, sides);
    assert.equal(jumps.length, sides);
    assert.deepEqual(jumps, expectedJumps);
    assert.equal(new Set(jumps.map(([dx, dy]) => key(dx, dy))).size, sides);

    for (const [dx, dy] of jumps) {
      assert.equal(adjacent.some(([copyX, copyY]) => copyX === dx && copyY === dy), false);
      assert.ok(adjacent.some(([copyX, copyY]) => (
        adjacentOffsets(PENTAGON_HEPTAGON, x + copyX, y + copyY)
          .some(([nextX, nextY]) => copyX + nextX === dx && copyY + nextY === dy)
      )));
    }
  }
});

test("pentagon-heptagon render centroids use the configured motif and repeat vectors", () => {
  const presentation = lookupConfiguration(PENTAGON_HEPTAGON).presentation;
  const center = presentation(0, 0, 6, 100);
  const right = presentation(1, 0, 6, 100);
  const down = presentation(0, 1, 6, 100);
  const diagonal = presentation(1, 1, 6, 100);
  const nextRow = presentation(2, 0, 6, 100);
  const nextColumn = presentation(0, 2, 6, 100);

  assert.deepEqual(
    [Number(((right.px - center.px) / 172).toFixed(6)), Number(((right.py - center.py) / 172).toFixed(6))],
    [1.659179, -0.415304],
  );
  assert.deepEqual(
    [Number(((down.px - center.px) / 172).toFixed(6)), Number(((down.py - center.py) / 172).toFixed(6))],
    [-0.03569, 1.709994],
  );
  assert.deepEqual(
    [Number(((diagonal.px - center.px) / 172).toFixed(6)), Number(((diagonal.py - center.py) / 172).toFixed(6))],
    [1.62349, 1.29469],
  );
  assert.deepEqual(
    [Number(((nextRow.px - center.px) / 172).toFixed(6)), Number(((nextRow.py - center.py) / 172).toFixed(6))],
    [3.24698, 0],
  );
  assert.deepEqual(
    [Number(((nextColumn.px - center.px) / 172).toFixed(6)), Number(((nextColumn.py - center.py) / 172).toFixed(6))],
    [0.722521, 3.165571],
  );
});

test("pentagon-heptagon boards support setup, moves, capture, AI, and serialization", () => {
  const game = createGame({
    shape: PENTAGON_HEPTAGON,
    pentagonHeptagonSize: 6,
    rockPercent: 0,
    startPosition: "corners",
  });
  assert.equal(game.shape, PENTAGON_HEPTAGON);
  assert.equal(boardCellCount(game.radius, game.shape), 144);
  assert.equal(boardCoordinates(game.radius, game.shape).length, 144);
  assert.equal(counts(game)[PLAYER_ONE], 2);
  assert.equal(counts(game)[PLAYER_TWO], 2);
  assert.equal(deserializeGame(serializeGame(game)).shape, PENTAGON_HEPTAGON);

  const empty = createGame({
    shape: PENTAGON_HEPTAGON,
    pentagonHeptagonSize: 6,
    rockPercent: 0,
  });
  for (const coordinate of boardCoordinates(empty.radius, empty.shape)) {
    empty.board.set(key(coordinate.x, coordinate.y), EMPTY);
  }
  empty.currentPlayer = PLAYER_ONE;
  empty.finished = false;
  empty.board.set(key(4, 4), PLAYER_ONE);
  const moves = legalMovesFrom(empty, 4, 4);
  assert.equal(moves.filter((move) => move.type === "copy").length, 7);
  assert.equal(moves.filter((move) => move.type === "jump").length, 7);

  const destination = moves.find((move) => move.type === "copy");
  const enemy = adjacentOffsets(empty, destination.toX, destination.toY)
    .map(([dx, dy]) => ({ x: destination.toX + dx, y: destination.toY + dy }))
    .find((cell) => (
      isOnBoard(cell.x, cell.y, empty.radius, empty.shape)
      && (cell.x !== 4 || cell.y !== 4)
    ));
  empty.board.set(key(enemy.x, enemy.y), PLAYER_TWO);
  const result = applyMove(empty, destination);
  assert.equal(result.distance, 1);
  assert.equal(result.captured, 1);

  const selected = chooseComputerMove(game, 10, 10, "hard");
  assert.ok(selected);
  assert.ok(legalMovesFrom(game, selected.fromX, selected.fromY).some((candidate) => (
    candidate.toX === selected.toX && candidate.toY === selected.toY
  )));
});

test("pentagon-heptagon center setup forms a compact Cairo-style cluster", () => {
  for (let size = 3; size <= 12; size += 1) {
    const game = createGame({
      shape: PENTAGON_HEPTAGON,
      pentagonHeptagonSize: size,
      rockPercent: 0,
      startPosition: "center",
    });
    assert.equal(game.board.get(key(size - 1, size - 1)), PLAYER_ONE);
    assert.equal(game.board.get(key(size, size)), PLAYER_ONE);
    assert.equal(game.board.get(key(size, size - 1)), PLAYER_TWO);
    assert.equal(game.board.get(key(size - 1, size)), PLAYER_TWO);
  }
});

test("pentagon-heptagon starts cannot eliminate Player 2 on the opening move", () => {
  for (let size = 3; size <= 12; size += 1) {
    for (const startPosition of ["center", "corners"]) {
      const game = createGame({
        shape: PENTAGON_HEPTAGON,
        pentagonHeptagonSize: size,
        rockPercent: 0,
        startPosition,
      });
      for (const move of allLegalMoves(game)) {
        const next = cloneGame(game);
        applyMove(next, move);
        assert.ok(
          counts(next)[PLAYER_TWO] > 0,
          `${startPosition} size ${size} permits instant elimination via ${JSON.stringify(move)}`,
        );
      }
    }
  }
});

test("rhombitrihexagonal motifs expose 6-4-4-4-3-3 neighborhoods", () => {
  assert.equal(adjacentOffsets(RHOMBITRIHEXAGONAL, 6, 4).length, 6);
  assert.equal(jumpOffsets(RHOMBITRIHEXAGONAL, 6, 4).length, 6);
  assert.equal(adjacentOffsets(RHOMBITRIHEXAGONAL, 7, 4).length, 4);
  assert.equal(jumpOffsets(RHOMBITRIHEXAGONAL, 7, 4).length, 4);
  assert.equal(adjacentOffsets(RHOMBITRIHEXAGONAL, 8, 5).length, 3);
  assert.equal(jumpOffsets(RHOMBITRIHEXAGONAL, 8, 5).length, 3);
});

test("rhombitrihexagonal boards support setup, moves, capture, AI, and serialization", () => {
  const game = createGame({
    shape: RHOMBITRIHEXAGONAL,
    rhombitrihexSize: 5,
    rockPercent: 0,
    startPosition: "corners",
  });
  assert.equal(game.shape, RHOMBITRIHEXAGONAL);
  assert.equal(boardCellCount(game.radius, game.shape), 150);
  assert.equal(boardCoordinates(game.radius, game.shape).length, 150);
  assert.equal(counts(game)[PLAYER_ONE], 2);
  assert.equal(counts(game)[PLAYER_TWO], 2);
  assert.equal(deserializeGame(serializeGame(game)).shape, RHOMBITRIHEXAGONAL);

  const empty = emptyRhombitrihexGame();
  empty.board.set(key(6, 4), PLAYER_ONE);
  const moves = legalMovesFrom(empty, 6, 4);
  assert.equal(moves.filter((move) => move.type === "copy").length, 6);
  assert.equal(moves.filter((move) => move.type === "jump").length, 6);

  const destination = moves.find((move) => move.type === "copy");
  const enemy = adjacentOffsets(empty, destination.toX, destination.toY)
    .map(([dx, dy]) => ({ x: destination.toX + dx, y: destination.toY + dy }))
    .find((cell) => (
      isOnBoard(cell.x, cell.y, empty.radius, empty.shape)
      && (cell.x !== 6 || cell.y !== 4)
    ));
  empty.board.set(key(enemy.x, enemy.y), PLAYER_TWO);
  const result = applyMove(empty, destination);
  assert.equal(result.distance, 1);
  assert.equal(result.captured, 1);

  const selected = chooseComputerMove(game, 10, 10, "hard");
  assert.ok(selected);
  assert.ok(legalMovesFrom(game, selected.fromX, selected.fromY).some((candidate) => (
    candidate.toX === selected.toX && candidate.toY === selected.toY
  )));
});

test("rhombitrihexagonal center setup uses a central hex rock and four surrounding squares", () => {
  const game = createGame({
    shape: RHOMBITRIHEXAGONAL,
    rhombitrihexSize: 5,
    rockPercent: 0,
    startPosition: "center",
  });

  assert.equal(game.board.get(key(6, 4)), ROCK);
  assert.equal(game.board.get(key(6, 5)), PLAYER_ONE);
  assert.equal(game.board.get(key(6, 7)), PLAYER_ONE);
  assert.equal(game.board.get(key(8, 4)), PLAYER_TWO);
  assert.equal(game.board.get(key(5, 6)), PLAYER_TWO);
});

test("board sizing fits both viewport dimensions without distortion", () => {
  assert.deepEqual(containSize(1200, 500, 1), { width: 500, height: 500 });
  assert.deepEqual(containSize(400, 800, 2), { width: 400, height: 200 });
  assert.deepEqual(containSize(900, 450, 2), { width: 900, height: 450 });
});

test("board viewport bounds zoom and pan", () => {
  assert.equal(clampZoom(0.2), 1);
  assert.equal(clampZoom(5), 4);
  assert.deepEqual(clampPan(300, -300, 1000, 800, 600, 400), { x: 200, y: -200 });
  assert.deepEqual(clampPan(50, 50, 500, 300, 600, 400), { x: 0, y: 0 });
});

test("SVG-native zoom changes the viewBox without distorting its aspect ratio", () => {
  const base = { x: -500, y: -400, width: 1000, height: 800 };
  assert.deepEqual(zoomedViewBox(base, 2, 0, 0, 1000, 800), {
    x: -250,
    y: -200,
    width: 500,
    height: 400,
  });
  assert.deepEqual(zoomedViewBox(base, 2, 100, -80, 1000, 800), {
    x: -300,
    y: -160,
    width: 500,
    height: 400,
  });
});

test("center setup places three pieces per player and a center rock", () => {
  const game = createGame({ radius: 4, rockPercent: 0, startPosition: "center" });
  const score = counts(game);
  assert.equal(score[PLAYER_ONE], 3);
  assert.equal(score[PLAYER_TWO], 3);
  assert.equal(score[ROCK], 1);
  assert.equal(game.board.get(key(0, 0)), ROCK);
});

test("random rock coordinates use Visual Basic banker's rounding", () => {
  assert.equal(vbCInt(1.5), 2);
  assert.equal(vbCInt(2.5), 2);
  assert.equal(vbCInt(-1.5), -2);
  assert.equal(vbCInt(-2.5), -2);
  assert.equal(vbCInt(1.49), 1);
  assert.equal(vbCInt(-1.49), -1);
});

test("legacy rock generation preserves duplicate placement attempts", () => {
  const game = createGame(
    { radius: 4, rockPercent: 50, startPosition: "corners" },
    () => 0.5,
  );
  assert.equal(counts(game)[ROCK], 1);
});

test("corner setup places pieces in all six corners", () => {
  const game = createGame({ radius: 3, rockPercent: 0, startPosition: "corners" });
  assert.equal(game.board.get(key(3, 0)), PLAYER_ONE);
  assert.equal(game.board.get(key(0, -3)), PLAYER_ONE);
  assert.equal(game.board.get(key(-3, 3)), PLAYER_ONE);
  assert.equal(game.board.get(key(0, 3)), PLAYER_TWO);
  assert.equal(game.board.get(key(-3, 0)), PLAYER_TWO);
  assert.equal(game.board.get(key(3, -3)), PLAYER_TWO);
});

test("adjacent moves duplicate while jumps vacate the source", () => {
  const adjacentGame = emptyGame();
  adjacentGame.board.set(key(0, 0), PLAYER_ONE);
  assert.equal(applyMove(adjacentGame, move(0, 0, 1, 0)).ok, true);
  assert.equal(adjacentGame.board.get(key(0, 0)), PLAYER_ONE);
  assert.equal(adjacentGame.board.get(key(1, 0)), PLAYER_ONE);

  const jumpGame = emptyGame();
  jumpGame.board.set(key(0, 0), PLAYER_ONE);
  assert.equal(applyMove(jumpGame, move(0, 0, 2, 0)).ok, true);
  assert.equal(jumpGame.board.get(key(0, 0)), EMPTY);
  assert.equal(jumpGame.board.get(key(2, 0)), PLAYER_ONE);
});

test("a move converts every adjacent enemy", () => {
  const game = emptyGame();
  game.board.set(key(0, 0), PLAYER_ONE);
  game.board.set(key(2, 0), PLAYER_TWO);
  game.board.set(key(1, 1), PLAYER_TWO);
  const result = applyMove(game, move(0, 0, 1, 0));
  assert.equal(result.captured, 2);
  assert.equal(game.board.get(key(2, 0)), PLAYER_ONE);
  assert.equal(game.board.get(key(1, 1)), PLAYER_ONE);
});

test("legal moves contain distances one and two only", () => {
  const game = emptyGame();
  game.board.set(key(0, 0), PLAYER_ONE);
  const moves = legalMovesFrom(game, 0, 0);
  assert.equal(moves.length, 18);
  assert.ok(moves.every((item) => {
    const distance = hexDistance(item.fromX, item.fromY, item.toX, item.toY);
    return distance === 1 || distance === 2;
  }));
});

test("legal destinations distinguish copies from jumps", () => {
  const game = emptyGame();
  game.board.set(key(0, 0), PLAYER_ONE);
  const moves = legalMovesFrom(game, 0, 0);
  const copies = moves.filter((item) => item.type === "copy");
  const jumps = moves.filter((item) => item.type === "jump");

  assert.equal(copies.length, 6);
  assert.equal(jumps.length, 12);
  assert.ok(copies.every((item) => (
    hexDistance(item.fromX, item.fromY, item.toX, item.toY) === 1
  )));
  assert.ok(jumps.every((item) => (
    hexDistance(item.fromX, item.fromY, item.toX, item.toY) === 2
  )));
});

test("two consecutive passes finish a blocked game", () => {
  const game = createGame({ radius: 2, rockPercent: 0 });
  passTurn(game);
  passTurn(game);
  assert.equal(game.finished, true);
});

test("eliminating a player ends the game immediately", () => {
  const game = emptyGame();
  game.board.set(key(0, 0), PLAYER_ONE);
  game.board.set(key(2, 0), PLAYER_TWO);
  game.board.set(key(1, 1), PLAYER_TWO);

  applyMove(game, move(0, 0, 1, 0));

  assert.equal(counts(game)[PLAYER_TWO], 0);
  assert.equal(game.finished, true);
  assert.equal(game.winner, PLAYER_ONE);
});

test("a full board declares the higher score or a draw", () => {
  const winningGame = emptyGame();
  for (const coordinate of boardCoordinates(winningGame.radius)) {
    winningGame.board.set(key(coordinate.x, coordinate.y), PLAYER_ONE);
  }
  winningGame.board.set(key(0, 0), PLAYER_TWO);
  assert.equal(settleGame(winningGame), true);
  assert.equal(winningGame.winner, PLAYER_ONE);

  const drawGame = emptyGame();
  let player = PLAYER_ONE;
  for (const coordinate of boardCoordinates(drawGame.radius)) {
    drawGame.board.set(key(coordinate.x, coordinate.y), player);
    player = 3 - player;
  }
  drawGame.board.set(key(0, 0), ROCK);
  const score = counts(drawGame);
  if (score[PLAYER_ONE] !== score[PLAYER_TWO]) {
    const larger = score[PLAYER_ONE] > score[PLAYER_TWO] ? PLAYER_ONE : PLAYER_TWO;
    const smaller = 3 - larger;
    const coordinate = boardCoordinates(drawGame.radius).find(({ x, y }) => (
      drawGame.board.get(key(x, y)) === larger
    ));
    drawGame.board.set(key(coordinate.x, coordinate.y), smaller);
  }
  assert.equal(settleGame(drawGame), true);
  assert.equal(drawGame.winner, 0);
});

test("one blocked player does not end a game while the opponent can move", () => {
  const game = emptyGame();
  game.board.set(key(0, 0), PLAYER_ONE);
  game.board.set(key(3, 0), PLAYER_TWO);
  for (const moveItem of legalMovesFrom(game, 0, 0, PLAYER_ONE)) {
    game.board.set(key(moveItem.toX, moveItem.toY), ROCK);
  }

  assert.equal(legalMovesFrom(game, 0, 0, PLAYER_ONE).length, 0);
  assert.ok(legalMovesFrom(game, 3, 0, PLAYER_TWO).length > 0);
  assert.equal(settleGame(game), false);
  assert.equal(game.finished, false);
});

test("a blocked player awards every empty cell to the opponent and ends", () => {
  const game = emptyGame();
  game.board.set(key(0, 0), PLAYER_ONE);
  game.board.set(key(3, 0), PLAYER_TWO);
  for (const moveItem of legalMovesFrom(game, 0, 0, PLAYER_ONE)) {
    game.board.set(key(moveItem.toX, moveItem.toY), ROCK);
  }
  const emptyBefore = counts(game)[EMPTY];
  const opponentBefore = counts(game)[PLAYER_TWO];

  resolveNoLegalMove(game);

  assert.equal(counts(game)[EMPTY], 0);
  assert.equal(counts(game)[PLAYER_TWO], opponentBefore + emptyBefore);
  assert.equal(game.lastMoves[PLAYER_ONE], "No moves");
  assert.equal(game.finished, true);
  assert.equal(game.winner, PLAYER_TWO);
});

test("manual skip resolves the skipping human when no legal move exists", () => {
  const game = emptyGame();
  for (const coordinate of boardCoordinates(game.radius)) {
    game.board.set(key(coordinate.x, coordinate.y), ROCK);
  }
  game.board.set(key(0, 0), PLAYER_ONE);
  game.board.set(key(4, 0), PLAYER_TWO);
  game.board.set(key(3, 1), EMPTY);

  passTurn(game);

  assert.equal(game.lastMoves[PLAYER_ONE], "No moves");
  assert.equal(game.board.get(key(3, 1)), PLAYER_TWO);
  assert.equal(game.finished, true);
  assert.equal(game.winner, PLAYER_TWO);
});

test("a move automatically resolves a newly blocked human turn", () => {
  const game = emptyGame();
  for (const coordinate of boardCoordinates(game.radius)) {
    game.board.set(key(coordinate.x, coordinate.y), ROCK);
  }
  game.currentPlayer = PLAYER_TWO;
  game.board.set(key(0, 0), PLAYER_ONE);
  game.board.set(key(3, 0), PLAYER_TWO);
  game.board.set(key(2, 0), EMPTY);
  game.board.set(key(4, 0), EMPTY);
  game.board.set(key(3, 1), EMPTY);

  const result = applyMove(game, move(3, 0, 2, 0));

  assert.equal(result.ok, true);
  assert.equal(game.lastMoves[PLAYER_ONE], "No moves");
  assert.equal(counts(game)[EMPTY], 0);
  assert.equal(game.board.get(key(4, 0)), PLAYER_TWO);
  assert.equal(game.board.get(key(3, 1)), PLAYER_TWO);
  assert.equal(game.finished, true);
  assert.equal(game.winner, PLAYER_TWO);
});

test("blocked-turn detection is independent of player control type", () => {
  const game = emptyGame();
  for (const coordinate of boardCoordinates(game.radius)) {
    game.board.set(key(coordinate.x, coordinate.y), ROCK);
  }
  game.board.set(key(0, 0), PLAYER_ONE);
  game.board.set(key(4, 0), PLAYER_TWO);
  game.board.set(key(3, 1), EMPTY);

  assert.equal(resolveCurrentPlayerNoMove(game), true);
  assert.equal(game.board.get(key(3, 1)), PLAYER_TWO);
  assert.equal(game.finished, true);
});

test("the computer always returns a legal move when one exists", () => {
  const game = createGame({ radius: 4, rockPercent: 10 }, seededRandom(12));
  const selected = chooseComputerMove(game, 10, 10);
  assert.ok(selected);
  assert.equal(game.board.get(key(selected.fromX, selected.fromY)), PLAYER_ONE);
  assert.equal(game.board.get(key(selected.toX, selected.toY)), EMPTY);
  assert.ok([1, 2].includes(hexDistance(
    selected.fromX,
    selected.fromY,
    selected.toX,
    selected.toY,
  )));
});

test("computer tie selection is deterministic", () => {
  const game = createGame({ radius: 2, rockPercent: 0, startPosition: "center" });
  const first = chooseComputerMove(game, 10, 10);
  const second = chooseComputerMove(game, 10, 10);
  assert.deepEqual(second, first);
});

test("named computer difficulties always return legal deterministic moves", () => {
  const game = createGame({ radius: 4, rockPercent: 10 }, seededRandom(22));
  for (const difficulty of ["easy", "medium", "hard", "expert"]) {
    const first = chooseComputerMove(game, 10, 10, difficulty);
    const second = chooseComputerMove(game, 10, 10, difficulty);
    assert.deepEqual(second, first);
    assert.ok(legalMovesFrom(
      game,
      first.fromX,
      first.fromY,
      game.currentPlayer,
    ).some((candidate) => candidate.toX === first.toX && candidate.toY === first.toY));
  }
});

test("serialized games restore maps and turn metadata independently", () => {
  const original = createGame({ radius: 3, rockPercent: 0 });
  applyMove(original, allLegalMove(original));
  const restored = deserializeGame(serializeGame(original));

  assert.deepEqual([...restored.board], [...original.board]);
  assert.equal(restored.currentPlayer, original.currentPlayer);
  assert.deepEqual(restored.lastMoves, original.lastMoves);
  restored.board.set(key(0, 0), PLAYER_ONE);
  assert.notEqual(restored.board.get(key(0, 0)), original.board.get(key(0, 0)));
});

function emptyGame() {
  const game = createGame({ radius: 4, rockPercent: 0 });
  for (const coordinate of boardCoordinates(game.radius)) {
    game.board.set(key(coordinate.x, coordinate.y), EMPTY);
  }
  game.currentPlayer = PLAYER_ONE;
  game.finished = false;
  game.playerLabels = { 1: "Player 1", 2: "Player 2" };
  return game;
}

function roundedPoint([x, y]) {
  return `${x.toFixed(9)},${y.toFixed(9)}`;
}

function relativePolygon(vertices, x, y) {
  const center = pentagonHeptagonTileInfo(x, y)
    ? {
      x: lookupConfiguration(PENTAGON_HEPTAGON).presentation(x, y, 6, 100).px / 172,
      y: lookupConfiguration(PENTAGON_HEPTAGON).presentation(x, y, 6, 100).py / 172,
    }
    : polygonCentroid(vertices);
  return vertices.map(([vertexX, vertexY]) => [
    normalizeZero(vertexX - center.x),
    normalizeZero(vertexY - center.y),
  ]);
}

function normalizeZero(value) {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}


function emptySquareGame() {
  const game = createGame({ shape: SQUARE, squareSize: 8, rockPercent: 0 });
  for (const coordinate of boardCoordinates(game.radius, game.shape)) {
    game.board.set(key(coordinate.x, coordinate.y), EMPTY);
  }
  game.currentPlayer = PLAYER_ONE;
  game.finished = false;
  game.playerLabels = { 1: "Player 1", 2: "Player 2" };
  return game;
}

function emptyTriangleGame() {
  const game = createGame({ shape: TRIANGLE, triangleSize: 8, rockPercent: 0 });
  for (const coordinate of boardCoordinates(game.radius, game.shape)) {
    game.board.set(key(coordinate.x, coordinate.y), EMPTY);
  }
  game.currentPlayer = PLAYER_ONE;
  game.finished = false;
  game.playerLabels = { 1: "Player 1", 2: "Player 2" };
  return game;
}

function emptyCairoGame() {
  const game = createGame({ shape: CAIRO, cairoSize: 10, rockPercent: 0 });
  for (const coordinate of boardCoordinates(game.radius, game.shape)) {
    game.board.set(key(coordinate.x, coordinate.y), EMPTY);
  }
  game.currentPlayer = PLAYER_ONE;
  game.finished = false;
  game.playerLabels = { 1: "Player 1", 2: "Player 2" };
  return game;
}

function emptyOctagonSquareGame() {
  const game = createGame({
    shape: OCTAGON_SQUARE,
    octagonSquareSize: 8,
    rockPercent: 0,
  });
  for (const coordinate of boardCoordinates(game.radius, game.shape)) {
    game.board.set(key(coordinate.x, coordinate.y), EMPTY);
  }
  game.currentPlayer = PLAYER_ONE;
  game.finished = false;
  game.playerLabels = { 1: "Player 1", 2: "Player 2" };
  return game;
}

function emptyRhombitrihexGame() {
  const game = createGame({
    shape: RHOMBITRIHEXAGONAL,
    rhombitrihexSize: 5,
    rockPercent: 0,
  });
  for (const coordinate of boardCoordinates(game.radius, game.shape)) {
    game.board.set(key(coordinate.x, coordinate.y), EMPTY);
  }
  game.currentPlayer = PLAYER_ONE;
  game.finished = false;
  game.playerLabels = { 1: "Player 1", 2: "Player 2" };
  return game;
}

function polygonCentroid(vertices) {
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const [x1, y1] = vertices[index];
    const [x2, y2] = vertices[(index + 1) % vertices.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    x += (x1 + x2) * cross;
    y += (y1 + y2) * cross;
  }
  return { x: x / (3 * twiceArea), y: y / (3 * twiceArea) };
}

function allLegalMove(game) {
  const source = boardCoordinates(game.radius).find(({ x, y }) => (
    game.board.get(key(x, y)) === game.currentPlayer
    && legalMovesFrom(game, x, y).length
  ));
  return legalMovesFrom(game, source.x, source.y)[0];
}

function move(fromX, fromY, toX, toY) {
  return { fromX, fromY, toX, toY };
}

function seededRandom(seed) {
  let value = seed;
  return () => {
    value = value * 16807 % 2147483647;
    return (value - 1) / 2147483646;
  };
}
