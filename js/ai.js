import {
  EMPTY,
  adjacentOffsets,
  applyMove,
  allLegalMoves,
  boardCoordinates,
  cloneGame,
  counts,
  getConfiguration,
  getCell,
  isOnBoard,
  jumpOffsets,
  key,
  moveDistance,
} from "./game.js?v=20260615-76";

export function chooseComputerMove(game, skill = 10, aggression = 10, difficulty = "classic") {
  if (difficulty !== "classic") return chooseModernMove(game, difficulty, aggression);
  return chooseLegacyMove(game, skill, aggression);
}

function chooseLegacyMove(game, skill = 10, aggression = 10) {
  const player = game.currentPlayer;
  const opponent = 3 - player;
  const priorities = new Map();
  let destination = null;
  let high = 0;

  for (const source of boardCoordinates(game.radius, game.shape)) {
    if (getCell(game, source.x, source.y) !== player) continue;

    for (const [dx, dy] of adjacentOffsets(game, source.x, source.y)) {
      const x = source.x + dx;
      const y = source.y + dy;
      if (getCell(game, x, y) !== EMPTY) continue;
      let value = priorities.get(key(x, y)) ?? 0;
      value += adjacentEnemies(game, x, y, opponent) * (1 + aggression / 10);
      value += 4 - skill / 5;
      value += edgeBonus(game, x, y);
      priorities.set(key(x, y), value);
      if (value > high) {
        high = value;
        destination = { x, y };
      }
    }

    for (const [dx, dy] of jumpOffsets(game, source.x, source.y)) {
      const x = source.x + dx;
      const y = source.y + dy;
      if (getCell(game, x, y) !== EMPTY) continue;
      let value = priorities.get(key(x, y)) ?? 0;
      value += adjacentEnemies(game, x, y, opponent) * (aggression / 5);
      value += 0.5 + edgeBonus(game, x, y);
      priorities.set(key(x, y), value);
      if (value > high) {
        high = value;
        destination = { x, y };
      }
    }
  }

  if (!destination) return null;

  let source = null;
  for (const [dx, dy] of adjacentOffsets(game, destination.x, destination.y)) {
    const candidate = { x: destination.x + dx, y: destination.y + dy };
    if (getCell(game, candidate.x, candidate.y) === player) source = candidate;
  }

  if (!source) {
    let sourceScore = -9;
    for (const [dx, dy] of jumpOffsets(game, destination.x, destination.y)) {
      const candidate = { x: destination.x + dx, y: destination.y + dy };
      if (getCell(game, candidate.x, candidate.y) !== player) continue;
      const value = scoreJumpSource(game, candidate.x, candidate.y, skill, player);
      if (value > sourceScore) {
        sourceScore = value;
        source = candidate;
      }
    }
  }

  if (!source) return allLegalMoves(game, player)[0] ?? null;
  return {
    fromX: source.x,
    fromY: source.y,
    toX: destination.x,
    toY: destination.y,
  };
}

function chooseModernMove(game, difficulty, aggression) {
  const player = game.currentPlayer;
  const ranked = allLegalMoves(game, player)
    .map((move, index) => ({
      move,
      index,
      score: immediateMoveScore(game, move, player, aggression),
    }))
    .sort(compareRankedMoves);
  if (!ranked.length) return null;

  if (difficulty === "easy") {
    return ranked[Math.min(2, ranked.length - 1)].move;
  }
  if (difficulty === "medium") return ranked[0].move;

  const searchWidth = difficulty === "expert" ? 10 : 20;
  const searched = ranked.slice(0, searchWidth).map((candidate) => ({
    ...candidate,
    score: strategicMoveScore(game, candidate.move, player, difficulty),
  }));
  searched.sort(compareRankedMoves);
  return searched[0].move;
}

function immediateMoveScore(game, move, player, aggression) {
  const opponent = 3 - player;
  const captureValue = adjacentEnemies(game, move.toX, move.toY, opponent);
  const copyValue = moveDistance(game, move.fromX, move.fromY, move.toX, move.toY) === 1 ? 2 : 0;
  const sourceRisk = adjacentEnemies(game, move.fromX, move.fromY, opponent);
  return captureValue * (4 + aggression / 5)
    + copyValue
    + edgeBonus(game, move.toX, move.toY)
    - sourceRisk * 0.2;
}

function strategicMoveScore(game, move, player, difficulty) {
  const simulation = cloneGame(game);
  applyMove(simulation, move);
  const score = counts(simulation);
  const material = score[player] - score[3 - player];
  const mobility = simulation.finished
    ? 0
    : allLegalMoves(simulation, player).length - allLegalMoves(simulation, 3 - player).length;
  let value = material * 12 + mobility * 0.3;

  if (difficulty === "expert" && !simulation.finished) {
    const replies = allLegalMoves(simulation, simulation.currentPlayer)
      .map((reply, index) => ({
        move: reply,
        index,
        score: immediateMoveScore(simulation, reply, simulation.currentPlayer, 12),
      }))
      .sort(compareRankedMoves)
      .slice(0, 8);
    let worstReply = 0;
    for (const reply of replies) {
      const response = cloneGame(simulation);
      applyMove(response, reply.move);
      const responseScore = counts(response);
      worstReply = Math.max(
        worstReply,
        (responseScore[3 - player] - score[3 - player]) * 10,
      );
    }
    value -= worstReply;
  }
  return value;
}

function compareRankedMoves(first, second) {
  return second.score - first.score || first.index - second.index;
}

function adjacentEnemies(game, x, y, opponent) {
  let count = 0;
  for (const [dx, dy] of adjacentOffsets(game, x, y)) {
    if (getCell(game, x + dx, y + dy) === opponent) count += 1;
  }
  return count;
}

function edgeBonus(game, x, y) {
  return getConfiguration(game.shape).edgeBonus(x, y, game.radius);
}

function scoreJumpSource(game, x, y, skill, player) {
  let canJump = false;
  let canMove = false;
  let score = 0;

  for (const [dx, dy] of jumpOffsets(game, x, y)) {
    const tx = x + dx;
    const ty = y + dy;
    if (isOnBoard(tx, ty, game.radius, game.shape) && getCell(game, tx, ty) === 3 - player) {
      canJump = true;
    }
  }
  for (const [dx, dy] of adjacentOffsets(game, x, y)) {
    const value = getCell(game, x + dx, y + dy);
    if (value === 3 - player) {
      canMove = true;
      score += 0.5;
    } else if (value === player) {
      score -= 1;
    }
  }
  if (!canJump && !canMove) score += 1 + skill / 5 * 4;
  else if (!canMove) score += 1 + skill / 5 * 2;
  return score;
}
