import {
  getConfiguration as lookupConfiguration,
  hasConfiguration,
  listConfigurations,
  registerConfiguration,
} from "./configurations/registry.js?v=20260615-76";
import {
  clampInt,
  getActiveRuleset,
  playerLabel,
  randomListedCoordinate,
  sanitizeTileTypes,
} from "./engine-support.js?v=20260615-76";
import { createCairoConfiguration } from "./configurations/cairo.js?v=20260615-76";
import { createCairoSupport } from "./configurations/cairo-support.js?v=20260615-76";
import { createHexConfiguration } from "./configurations/hex.js?v=20260615-76";
import { createOctagonSquareConfiguration } from "./configurations/octagon-square.js?v=20260615-76";
import { createOctagonSquareSupport } from "./configurations/octagon-square-support.js?v=20260615-76";
import { createPentagonHeptagonConfiguration } from "./configurations/pentagon-heptagon.js?v=20260615-76";
import { createPentagonHeptagonSupport } from "./configurations/pentagon-heptagon-support.js?v=20260615-76";
import { createRhombitrihexagonalConfiguration } from "./configurations/rhombitrihexagonal.js?v=20260615-76";
import { createRhombitrihexagonalSupport } from "./configurations/rhombitrihexagonal-support.js?v=20260615-76";
import { createSquareConfiguration } from "./configurations/square.js?v=20260615-76";
import { createTriangleConfiguration } from "./configurations/triangle.js?v=20260615-76";
import { createTriangleSupport } from "./configurations/triangle-support.js?v=20260615-76";

export const EMPTY = 0;
export const PLAYER_ONE = 1;
export const PLAYER_TWO = 2;
export const ROCK = 3;
export const HEX = "hex";
export const SQUARE = "square";
export const TRIANGLE = "triangle";
export const CAIRO = "cairo";
export const OCTAGON_SQUARE = "octagon-square";
export const PENTAGON_HEPTAGON = "pentagon-heptagon";
export const RHOMBITRIHEXAGONAL = "rhombitrihexagonal";

export const HEX_ADJACENT = [
  [-1, 0], [-1, 1], [0, -1],
  [0, 1], [1, -1], [1, 0],
];

export const HEX_JUMPS = [];
for (let x = -2; x <= 2; x += 1) {
  for (let y = -2; y <= 2; y += 1) {
    if (hexDistance(0, 0, x, y) === 2) HEX_JUMPS.push([x, y]);
  }
}

export const SQUARE_ADJACENT = [];
export const SQUARE_JUMPS = [];
for (let x = -2; x <= 2; x += 1) {
  for (let y = -2; y <= 2; y += 1) {
    if (x === 0 && y === 0) continue;
    if (Math.max(Math.abs(x), Math.abs(y)) === 1) SQUARE_ADJACENT.push([x, y]);
    else if (
      Math.max(Math.abs(x), Math.abs(y)) === 2
      && Math.abs(x) + Math.abs(y) <= 3
    ) SQUARE_JUMPS.push([x, y]);
  }
}

export const ADJACENT = HEX_ADJACENT;
export const JUMPS = HEX_JUMPS;

export function key(x, y) {
  return `${x},${y}`;
}

export function isOnBoard(x, y, size, shape = HEX) {
  return getConfiguration(shape).isOnBoard(x, y, size);
}

export function hexDistance(ax, ay, bx, by) {
  return (
    Math.abs(ax - bx)
    + Math.abs(ay - by)
    + Math.abs((ax + ay) - (bx + by))
  ) / 2;
}

export function boardCoordinates(size, shape = HEX) {
  return getConfiguration(shape).coordinates(size);
}

export function boardCellCount(size, shape = HEX) {
  return getConfiguration(shape).cellCount(size);
}

export function createGame(options = {}, random = Math.random) {
  const shape = hasConfiguration(options.shape) ? options.shape : HEX;
  const configuration = getConfiguration(shape);
  const rulesetId = configuration.rulesets[options.rulesetId]
    ? options.rulesetId
    : configuration.defaultRulesetId;
  const radius = clampInt(
    options[configuration.settingsKey] ?? options.radius ?? configuration.defaultSize,
    configuration.minimumSize,
    configuration.maximumSize,
  );
  const rockPercent = clampInt(options.rockPercent ?? 10, 0, 50);
  const startPosition = options.startPosition === "corners" ? "corners" : "center";
  const board = new Map();

  for (const { x, y } of boardCoordinates(radius, shape)) board.set(key(x, y), EMPTY);

  const shapedStartingCells = configuration.startingCells(radius, startPosition);
  const protectedCell = (x, y) => {
    return shapedStartingCells.some((cell) => cell.x === x && cell.y === y)
      || configuration.protectedCell?.(x, y, radius, startPosition);
  };

  const attempts = Math.round((boardCellCount(radius, shape) - 6) * rockPercent / 100);
  for (let i = 0; i < attempts; i += 1) {
    let coordinate;
    do {
      coordinate = configuration.randomCoordinate(radius, random);
    } while (
      !configuration.isOnBoard(coordinate.x, coordinate.y, radius)
      || protectedCell(coordinate.x, coordinate.y)
    );
    board.set(key(coordinate.x, coordinate.y), ROCK);
  }

  if (configuration.centerRock && startPosition === "center") {
    const centerRock = configuration.centerRockCell?.(radius, startPosition) ?? { x: 0, y: 0 };
    board.set(key(centerRock.x, centerRock.y), ROCK);
  }
  for (const cell of shapedStartingCells) {
    board.set(key(cell.x, cell.y), cell.player);
  }

  return {
    shape,
    rulesetId,
    customRulesetTileTypes: sanitizeTileTypes(options.customRulesets?.[shape]),
    radius,
    board,
    currentPlayer: PLAYER_ONE,
    finished: false,
    winner: null,
    selected: null,
    lastMoves: { 1: "", 2: "" },
    message: "Player 1's Move",
    consecutivePasses: 0,
  };
}

function nearestStartingCells(coordinates, targets) {
  const used = new Set();
  return targets.map((target) => {
    const coordinate = coordinates
      .filter(({ x, y }) => !used.has(key(x, y)))
      .sort((first, second) => (
        Math.hypot(first.x - target.x, first.y - target.y)
        - Math.hypot(second.x - target.x, second.y - target.y)
      ))[0];
    used.add(key(coordinate.x, coordinate.y));
    return { ...coordinate, player: target.player };
  });
}

const {
  cairoCenter,
  cairoOffsets,
  cairoStartingCells,
  cairoTileInfo,
  cairoVertices,
} = createCairoSupport({
  CAIRO,
  PLAYER_ONE,
  PLAYER_TWO,
  boardCoordinates,
  nearestStartingCells,
  key,
});

const {
  octagonSquareOffsets,
  octagonSquareStartingCells,
  octagonSquareTileInfo,
} = createOctagonSquareSupport({
  OCTAGON_SQUARE,
  PLAYER_ONE,
  PLAYER_TWO,
  boardCoordinates,
  nearestStartingCells,
});

const {
  pentagonHeptagonOffsets,
  pentagonHeptagonRenderPoint,
  pentagonHeptagonStartingCells,
  pentagonHeptagonTileInfo,
  pentagonHeptagonVertices,
} = createPentagonHeptagonSupport({
  PENTAGON_HEPTAGON,
  PLAYER_ONE,
  PLAYER_TWO,
  HEX_ADJACENT,
  boardCoordinates,
  nearestStartingCells,
  key,
});

const {
  rhombitrihexStartingCells,
} = createRhombitrihexagonalSupport({
  PLAYER_ONE,
  PLAYER_TWO,
  RHOMBITRIHEXAGONAL,
  boardCoordinates,
  nearestStartingCells,
});

const {
  triangleCenterPoint,
  triangleOffsets,
  triangleVertices,
} = createTriangleSupport({ key });

export {
  cairoCenter,
  cairoVertices,
  octagonSquareTileInfo,
  pentagonHeptagonTileInfo,
  pentagonHeptagonVertices,
  playerLabel,
  triangleVertices,
};

export function adjacentOffsets(gameOrShape = HEX, x = 0, y = 0) {
  return getRuleset(gameOrShape).copyOffsets(x, y);
}

export function jumpOffsets(gameOrShape = HEX, x = 0, y = 0) {
  return getRuleset(gameOrShape).jumpOffsets(x, y);
}

function applyRuleOffset(configuration, x, y, [dx, dy]) {
  if (typeof configuration.applyRuleOffset === "function") {
    return configuration.applyRuleOffset(x, y, [dx, dy]);
  }
  return { x: x + dx, y: y + dy };
}

export function moveDistance(game, ax, ay, bx, by) {
  const configuration = getConfiguration(game.shape);
  if (adjacentOffsets(game, ax, ay).some((offset) => {
    const destination = applyRuleOffset(configuration, ax, ay, offset);
    return destination.x === bx && destination.y === by;
  })) return 1;
  if (jumpOffsets(game, ax, ay).some((offset) => {
    const destination = applyRuleOffset(configuration, ax, ay, offset);
    return destination.x === bx && destination.y === by;
  })) return 2;
  return Infinity;
}

export function coordinateDistance(game, ax, ay, bx, by) {
  return getConfiguration(game.shape).coordinateDistance(ax, ay, bx, by);
}

function setStartingPieces(board, distance) {
  board.set(key(distance, 0), PLAYER_ONE);
  board.set(key(0, -distance), PLAYER_ONE);
  board.set(key(-distance, distance), PLAYER_ONE);
  board.set(key(0, distance), PLAYER_TWO);
  board.set(key(-distance, 0), PLAYER_TWO);
  board.set(key(distance, -distance), PLAYER_TWO);
}

export function getCell(game, x, y) {
  if (!isOnBoard(x, y, game.radius, game.shape)) return ROCK;
  return game.board.get(key(x, y)) ?? ROCK;
}

export function counts(game) {
  const result = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const value of game.board.values()) result[value] += 1;
  return result;
}

function* playerCoordinates(game, player) {
  for (const [cellKey, value] of game.board.entries()) {
    if (value !== player) continue;
    const commaIndex = cellKey.indexOf(",");
    yield {
      x: Number(cellKey.slice(0, commaIndex)),
      y: Number(cellKey.slice(commaIndex + 1)),
    };
  }
}

function hasLegalDestination(game, x, y, player = game.currentPlayer) {
  if (getCell(game, x, y) !== player) return false;
  const configuration = getConfiguration(game.shape);
  for (const offset of adjacentOffsets(game, x, y)) {
    const destination = applyRuleOffset(configuration, x, y, offset);
    if (getCell(game, destination.x, destination.y) === EMPTY) return true;
  }
  for (const offset of jumpOffsets(game, x, y)) {
    const destination = applyRuleOffset(configuration, x, y, offset);
    if (getCell(game, destination.x, destination.y) === EMPTY) return true;
  }
  return false;
}

function hasAnyLegalMove(game, player = game.currentPlayer) {
  for (const { x, y } of playerCoordinates(game, player)) {
    if (hasLegalDestination(game, x, y, player)) return true;
  }
  return false;
}

export function legalMovesFrom(game, x, y, player = game.currentPlayer) {
  if (getCell(game, x, y) !== player) return [];
  const configuration = getConfiguration(game.shape);
  return [...adjacentOffsets(game, x, y), ...jumpOffsets(game, x, y)]
    .map((offset) => {
      const destination = applyRuleOffset(configuration, x, y, offset);
      return {
      fromX: x,
      fromY: y,
        toX: destination.x,
        toY: destination.y,
        type: moveDistance(game, x, y, destination.x, destination.y) === 1 ? "copy" : "jump",
      };
    })
    .filter((move) => getCell(game, move.toX, move.toY) === EMPTY);
}

export function allLegalMoves(game, player = game.currentPlayer) {
  const result = [];
  for (const { x, y } of playerCoordinates(game, player)) {
    result.push(...legalMovesFrom(game, x, y, player));
  }
  return result;
}

export function applyMove(game, move) {
  if (game.finished) return { ok: false, reason: "The game is finished." };
  const { fromX, fromY, toX, toY } = move;
  const player = game.currentPlayer;
  const distance = moveDistance(game, fromX, fromY, toX, toY);

  if (getCell(game, fromX, fromY) !== player) {
    return { ok: false, reason: "Select one of the current player's pieces." };
  }
  if (getCell(game, toX, toY) !== EMPTY || (distance !== 1 && distance !== 2)) {
    return { ok: false, reason: "Choose an empty space one or two steps away." };
  }

  game.board.set(key(toX, toY), player);
  if (distance === 2) game.board.set(key(fromX, fromY), EMPTY);

  let captured = 0;
  const configuration = getConfiguration(game.shape);
  for (const offset of getRuleset(game).captureOffsets(toX, toY)) {
    const capture = applyRuleOffset(configuration, toX, toY, offset);
    if (getCell(game, capture.x, capture.y) === 3 - player) {
      game.board.set(key(capture.x, capture.y), player);
      captured += 1;
    }
  }

  game.lastMoves[player] = formatMove(move, game.shape);
  game.message = `${playerLabel(game, player)} took ${captured} ${captured === 1 ? "piece" : "pieces"}`;
  game.selected = null;
  game.consecutivePasses = 0;
  settleGame(game);
  if (!game.finished) {
    game.currentPlayer = 3 - player;
    resolveCurrentPlayerNoMove(game);
  }
  return { ok: true, captured, distance };
}

export function passTurn(game) {
  if (game.finished) return;
  if (!hasAnyLegalMove(game, game.currentPlayer)) {
    resolveNoLegalMove(game);
    return;
  }
  const player = game.currentPlayer;
  game.lastMoves[player] = "Pass";
  game.message = `${playerLabel(game, player)} passes`;
  game.selected = null;
  game.consecutivePasses += 1;
  game.currentPlayer = 3 - player;
  settleGame(game);
  if (!game.finished) resolveCurrentPlayerNoMove(game);
}

export function resolveNoLegalMove(game) {
  if (game.finished) return;
  const blockedPlayer = game.currentPlayer;
  const opponent = 3 - blockedPlayer;

  for (const { x, y } of boardCoordinates(game.radius, game.shape)) {
    if (getCell(game, x, y) === EMPTY) game.board.set(key(x, y), opponent);
  }

  game.lastMoves[blockedPlayer] = "No moves";
  game.selected = null;
  game.consecutivePasses = 0;
  game.currentPlayer = opponent;
  settleGame(game);
}

export function resolveCurrentPlayerNoMove(game) {
  if (game.finished || hasAnyLegalMove(game, game.currentPlayer)) return false;
  resolveNoLegalMove(game);
  return true;
}

export function settleGame(game) {
  const score = counts(game);
  const boardFull = score[EMPTY] === 0;
  const eliminated = score[PLAYER_ONE] === 0 || score[PLAYER_TWO] === 0;
  const noMoves = !hasAnyLegalMove(game, PLAYER_ONE)
    && !hasAnyLegalMove(game, PLAYER_TWO);

  if (!boardFull && !eliminated && !noMoves && game.consecutivePasses < 2) return false;

  game.finished = true;
  if (score[PLAYER_ONE] > score[PLAYER_TWO]) game.winner = PLAYER_ONE;
  else if (score[PLAYER_TWO] > score[PLAYER_ONE]) game.winner = PLAYER_TWO;
  else game.winner = 0;
  game.message = game.winner === 0 ? "Draw!" : `${playerLabel(game, game.winner)} Wins!`;
  return true;
}

export function cloneGame(game) {
  return {
    ...game,
    board: new Map(game.board),
    selected: game.selected ? { ...game.selected } : null,
    lastMoves: { ...game.lastMoves },
  };
}

export function serializeGame(game) {
  return {
    configurationId: game.shape,
    shape: game.shape,
    rulesetId: game.rulesetId,
    customRulesetTileTypes: game.customRulesetTileTypes ?? null,
    radius: game.radius,
    board: [...game.board.entries()],
    currentPlayer: game.currentPlayer,
    finished: game.finished,
    winner: game.winner,
    selected: game.selected ? { ...game.selected } : null,
    lastMoves: { ...game.lastMoves },
    message: game.message,
    consecutivePasses: game.consecutivePasses,
    playerLabels: { ...game.playerLabels },
  };
}

export function deserializeGame(saved) {
  if (!saved || !Number.isInteger(saved.radius) || !Array.isArray(saved.board)) {
    throw new TypeError("Invalid saved game.");
  }

  const savedConfigurationId = saved.configurationId ?? saved.shape;
  const game = {
    shape: hasConfiguration(savedConfigurationId) ? savedConfigurationId : HEX,
    rulesetId: "",
    customRulesetTileTypes: sanitizeTileTypes(saved.customRulesetTileTypes),
    radius: saved.radius,
    board: new Map(saved.board),
    currentPlayer: saved.currentPlayer,
    finished: Boolean(saved.finished),
    winner: saved.winner,
    selected: saved.selected ? { ...saved.selected } : null,
    lastMoves: { 1: "", 2: "", ...saved.lastMoves },
    message: String(saved.message ?? ""),
    consecutivePasses: Number(saved.consecutivePasses ?? 0),
    playerLabels: { 1: "Player 1", 2: "Player 2", ...saved.playerLabels },
  };
  const configuration = getConfiguration(game.shape);
  game.rulesetId = configuration.rulesets[saved.rulesetId]
    ? saved.rulesetId
    : configuration.defaultRulesetId;

  if (
    game.board.size !== boardCellCount(game.radius, game.shape)
    || ![PLAYER_ONE, PLAYER_TWO].includes(game.currentPlayer)
    || [...game.board.values()].some((value) => ![EMPTY, PLAYER_ONE, PLAYER_TWO, ROCK].includes(value))
  ) {
    throw new TypeError("Invalid saved game.");
  }
  return game;
}

export function formatMove({ fromX, fromY, toX, toY }, shape = HEX) {
  const configuration = getConfiguration(shape);
  return `${configuration.formatCoordinate(fromX, fromY)} -> ${configuration.formatCoordinate(toX, toY)}`;
}

export function getConfiguration(id = HEX) {
  return lookupConfiguration(id);
}

export { listConfigurations };

export function getRuleset(gameOrShape = HEX) {
  return getActiveRuleset(getConfiguration, gameOrShape);
}

export function normalizeRulesetTileTypes(tileTypes) {
  return sanitizeTileTypes(tileTypes);
}


registerConfiguration(createTriangleConfiguration({
  TRIANGLE,
  PLAYER_ONE,
  PLAYER_TWO,
  triangleCenterPoint,
  triangleOffsets,
}));

registerConfiguration(createSquareConfiguration({
  SQUARE,
  SQUARE_ADJACENT,
  SQUARE_JUMPS,
  PLAYER_ONE,
  PLAYER_TWO,
}));

registerConfiguration(createCairoConfiguration({
  CAIRO,
  cairoCenter,
  cairoOffsets,
  cairoStartingCells,
  cairoTileInfo,
  cairoVertices,
  randomListedCoordinate: (configurationId, size, random) => (
    randomListedCoordinate(getConfiguration, configurationId, size, random)
  ),
}));

registerConfiguration(createHexConfiguration({
  HEX,
  HEX_ADJACENT,
  HEX_JUMPS,
  PLAYER_ONE,
  PLAYER_TWO,
  hexDistance,
  vbCInt,
}));

registerConfiguration(createRhombitrihexagonalConfiguration({
  RHOMBITRIHEXAGONAL,
  rhombitrihexStartingCells,
}));

registerConfiguration(createPentagonHeptagonConfiguration({
  PENTAGON_HEPTAGON,
  pentagonHeptagonOffsets,
  pentagonHeptagonRenderPoint,
  pentagonHeptagonStartingCells,
  pentagonHeptagonTileInfo,
  pentagonHeptagonVertices,
}));

registerConfiguration(createOctagonSquareConfiguration({
  OCTAGON_SQUARE,
  PLAYER_ONE,
  PLAYER_TWO,
  octagonSquareOffsets,
  octagonSquareStartingCells,
  octagonSquareTileInfo,
  randomListedCoordinate: (configurationId, size, random) => (
    randomListedCoordinate(getConfiguration, configurationId, size, random)
  ),
}));

export function vbCInt(value) {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
}
