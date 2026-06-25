import {
  EMPTY,
  PLAYER_ONE,
  PLAYER_TWO,
  ROCK,
  applyMove,
  boardCoordinates,
  cloneGame,
  coordinateDistance,
  counts,
  createGame,
  deserializeGame,
  getConfiguration,
  getRuleset,
  legalMovesFrom,
  listConfigurations,
  moveDistance,
  normalizeRulesetTileTypes,
  passTurn,
  playerLabel,
  resolveCurrentPlayerNoMove,
  resolveNoLegalMove,
  serializeGame,
} from "./game.js?v=20260615-76";
import { chooseComputerMove } from "./ai.js?v=20260615-76";
import { containSize } from "./layout.js?v=20260615-76";
import {
  clearSession,
  hasSeenIntro,
  limitHistory,
  loadSession,
  loadSettings,
  markIntroSeen,
  saveSession,
  saveSettings,
  shouldTrackHistory,
} from "./storage.js?v=20260615-76";
import { clampPan, clampZoom, zoomedViewBox } from "./viewport.js?v=20260615-76";
import { batchShouldContinue, useFastComputerBatch } from "./scheduler.js?v=20260615-76";

const SVG_NS = "http://www.w3.org/2000/svg";
const COMPUTER_ANIMATION_THRESHOLD_MS = 300;
const boardElement = document.querySelector("#board");
const boardWrap = document.querySelector(".board-wrap");
const turnHeading = document.querySelector("#turn-heading");
const comment = document.querySelector("#comment");
const gameState = document.querySelector("#game-state");
const rulesPreviewBoard = document.querySelector("#rules-preview-board");

let settings = loadSettings();
let game;
let paused = false;
let computerTimer = null;
let computerTurnGeneration = 0;
let suggestion = null;
let pointerSource = null;
let pointerStartedSelected = false;
let boardAspectRatio = 1;
let baseBoardViewBox = { x: 0, y: 0, width: 1, height: 1 };
let fittedBoardSize = { width: 0, height: 0 };
let boardView = { zoom: 1, panX: 0, panY: 0 };
let boardGesture = null;
let history = [];
let replaying = false;
let replayIndex = -1;
let liveGame = null;
let livePaused = false;
let dialogAutoPaused = false;
let gameOverShown = false;
let pendingAnimation = null;
let animationTimer = null;
let animationBusyUntil = 0;
let selectedRulesTileType = "";
let rulesEditorMode = "copy";
let rulesDraft = null;
let rulesDirty = false;
let rulesStatusMessage = "";
let playerPopupAutoPaused = false;
let pendingBoardRefitFrame = 0;
const activePointers = new Map();
const AUTO_PAUSE_DIALOG_SELECTORS = ["#options-dialog", "#help-dialog", "#about-dialog"];

initializeControls();
if (!restoreSharedGame() && !restoreSession()) newGame();
new ResizeObserver(fitBoardToViewport).observe(boardWrap);
showIntroIfFirstVisit();

function newGame() {
  cancelComputerTurn();
  cancelBoardAnimation();
  clearSession();
  game = createGame(settings);
  game.playerLabels = getPlayerLabels();
  paused = false;
  replaying = false;
  replayIndex = -1;
  liveGame = null;
  history = [];
  gameOverShown = false;
  suggestion = null;
  resetBoardView();
  updatePauseButtons();
  resolveBlockedTurn();
  if (historyEnabled()) {
    recordHistory("Game started");
    persistSession();
  }
  render();
  scheduleComputer();
}

function restoreSession() {
  try {
    if (!historyEnabled()) {
      clearSession();
      return false;
    }
    const saved = loadSession();
    if (!saved?.game || !Array.isArray(saved.history) || saved.history.length === 0) return false;
    game = deserializeGame(saved.game);
    history = limitHistory(saved.history.map((entry) => ({
      label: String(entry.label ?? "Move"),
      game: serializeGame(deserializeGame(entry.game)),
    })), settings.undoTurns);
    paused = false;
    suggestion = null;
    gameOverShown = false;
    resetBoardView();
    updatePauseButtons();
    render();
    if (game.finished) showGameOver();
    else scheduleComputer();
    return true;
  } catch {
    clearSession();
    return false;
  }
}

function encodeSharePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeSharePayload(encoded) {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function mergeSharedSettings(sharedSettings = {}) {
  settings = {
    ...settings,
    ...sharedSettings,
    players: {
      1: { ...settings.players[1], ...sharedSettings?.players?.[1] },
      2: { ...settings.players[2], ...sharedSettings?.players?.[2] },
    },
    customRulesets: sharedSettings?.customRulesets && typeof sharedSettings.customRulesets === "object"
      ? sharedSettings.customRulesets
      : settings.customRulesets,
  };
  saveSettings(settings);
}

function restoreSharedGame() {
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("play");
    if (!encoded) return false;
    const shared = decodeSharePayload(encoded);
    if (!shared?.game || !shared?.settings) return false;
    mergeSharedSettings(shared.settings);
    game = deserializeGame(shared.game);
    game.playerLabels = getPlayerLabels();
    clearSession();
    history = [];
    paused = false;
    replaying = false;
    replayIndex = -1;
    liveGame = null;
    suggestion = null;
    gameOverShown = false;
    resetBoardView();
    updatePauseButtons();
    resolveBlockedTurn();
    if (historyEnabled()) {
      recordHistory("Shared position");
      persistSession();
    }
    render();
    if (game.finished) showGameOver();
    else scheduleComputer();
    return true;
  } catch {
    return false;
  }
}

function getPlayerLabels() {
  const first = settings.players[1].type;
  const second = settings.players[2].type;
  if (first === "human" && second === "human") return { 1: "Player 1", 2: "Player 2" };
  if (first === "computer" && second === "computer") return { 1: "Computer 1", 2: "Computer 2" };
  return {
    1: first === "human" ? "Human" : "Computer",
    2: second === "human" ? "Human" : "Computer",
  };
}

function historyEnabled() {
  return shouldTrackHistory(settings.players);
}

function recordHistory(label) {
  if (!historyEnabled()) return;
  history.push({ label, game: serializeGame(game) });
  history = limitHistory(history, settings.undoTurns);
}

function persistSession() {
  if (replaying || !historyEnabled()) return;
  saveSession({
    version: 1,
    game: serializeGame(game),
    history,
  });
}

async function shareCurrentPosition() {
  const payload = {
    settings,
    game: serializeGame(game),
  };
  const url = new URL(window.location.href);
  url.searchParams.set("play", encodeSharePayload(payload));
  const shareUrl = url.toString();
  try {
    if (navigator.share) {
      await navigator.share({
        title: "Tessera",
        text: "Play this Tessera position:",
        url: shareUrl,
      });
      game.message = "Share sheet opened";
      renderStatus();
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    game.message = "Share link copied to clipboard";
  } catch {
    window.prompt("Copy this Tessera link:", shareUrl);
    game.message = "Share link ready to copy";
  }
  renderStatus();
}

function completeTurn(label) {
  if (historyEnabled()) {
    recordHistory(label);
    persistSession();
  }
  render();
  if (game.finished && !pendingAnimation && animationBusyUntil <= performance.now()) showGameOver();
}

function executeComputerTurn(animate) {
  const playerSettings = settings.players[game.currentPlayer];
  const move = chooseComputerMove(
    game,
    playerSettings.skill,
    playerSettings.aggression,
    playerSettings.difficulty,
  );
  const player = game.currentPlayer;
  const before = animate ? cloneGame(game) : null;
  if (move) {
    applyMove(game, move);
    pendingAnimation = animate ? createBoardAnimation(before, game, move, player) : null;
  } else {
    resolveNoLegalMove(game);
    pendingAnimation = animate ? createBoardAnimation(before, game, null, 3 - player) : null;
  }
  suggestion = null;
  return { player, label: `${playerLabel(game, player)}: ${game.lastMoves[player]}` };
}

function createBoardAnimation(before, after, move, player, enabled = true) {
  if (!enabled) return null;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const captured = [];
  const filled = [];
  for (const { x, y } of boardCoordinates(after.radius, after.shape)) {
    const previous = before.board.get(`${x},${y}`);
    const current = after.board.get(`${x},${y}`);
    if (previous === 3 - player && current === player) captured.push({ x, y });
    else if (
      previous === EMPTY
      && current === player
      && (!move || x !== move.toX || y !== move.toY)
    ) filled.push({ x, y });
  }
  if (!move && captured.length === 0 && filled.length === 0) return null;
  return {
    type: move ? (moveDistance(after, move.fromX, move.fromY, move.toX, move.toY) === 1 ? "copy" : "jump") : "fill",
    player,
    move,
    captured: captured.sort((first, second) => (
      coordinateDistance(after, move?.toX ?? 0, move?.toY ?? 0, first.x, first.y)
      - coordinateDistance(after, move?.toX ?? 0, move?.toY ?? 0, second.x, second.y)
    )),
    filled: filled.sort((first, second) => (
      coordinateDistance(after, move?.toX ?? 0, move?.toY ?? 0, first.x, first.y)
      - coordinateDistance(after, move?.toX ?? 0, move?.toY ?? 0, second.x, second.y)
    )),
  };
}

function cancelBoardAnimation() {
  clearTimeout(animationTimer);
  animationTimer = null;
  pendingAnimation = null;
  animationBusyUntil = 0;
}

function beginBoardAnimation(animation) {
  if (!animation) return;
  const fillDelay = Math.min(animation.filled.length * 22, 500);
  const duration = animation.filled.length ? 520 + fillDelay : 720;
  animationBusyUntil = performance.now() + duration;
  animationTimer = setTimeout(() => {
    animationTimer = null;
    animationBusyUntil = 0;
    if (game.finished) showGameOver();
  }, duration);
}

function undoMove() {
  if (!historyEnabled() || replaying || history.length <= 1) return;
  cancelComputerTurn();
  cancelBoardAnimation();
  const gameOverDialog = document.querySelector("#game-over-dialog");
  if (gameOverDialog.open) gameOverDialog.close();
  const currentControl = settings.players[game.currentPlayer].type;
  do {
    history.pop();
    game = deserializeGame(history.at(-1).game);
  } while (
    history.length > 1
    && currentControl === "human"
    && settings.players[game.currentPlayer].type === "computer"
  );
  paused = false;
  suggestion = null;
  gameOverShown = false;
  updatePauseButtons();
  persistSession();
  render();
  scheduleComputer();
}

function openHistory(index = history.length - 1) {
  if (!historyEnabled() || !history.length) return;
  cancelBoardAnimation();
  const gameOverDialog = document.querySelector("#game-over-dialog");
  if (gameOverDialog.open) gameOverDialog.close();
  if (!replaying) {
    cancelComputerTurn();
    liveGame = cloneGame(game);
    livePaused = paused;
    replaying = true;
    paused = true;
  }
  showReplayFrame(index);
  const dialog = document.querySelector("#history-dialog");
  if (!dialog.open) dialog.showModal();
}

function showReplayFrame(index) {
  replayIndex = Math.max(0, Math.min(index, history.length - 1));
  game = deserializeGame(history[replayIndex].game);
  suggestion = null;
  renderHistory();
  render();
}

function stepReplay(offset) {
  if (!replaying) openHistory();
  else showReplayFrame(replayIndex + offset);
}

function areBothPlayersComputer() {
  return settings.players[PLAYER_ONE].type === "computer"
    && settings.players[PLAYER_TWO].type === "computer";
}

function anyAutoPauseDialogOpen() {
  return AUTO_PAUSE_DIALOG_SELECTORS.some((selector) => document.querySelector(selector).open);
}

function maybePauseForDialog() {
  if (
    dialogAutoPaused
    || replaying
    || paused
    || game.finished
    || !areBothPlayersComputer()
  ) return;
  dialogAutoPaused = true;
  paused = true;
  cancelComputerTurn();
  updatePauseButtons();
  renderStatus();
}

function maybeResumeAfterDialogClose() {
  if (!dialogAutoPaused || anyAutoPauseDialogOpen() || anyPlayerPopupOpen()) return;
  dialogAutoPaused = false;
  paused = false;
  updatePauseButtons();
  renderStatus();
  scheduleComputer();
}

function requestCloseOptionsDialog() {
  const dialog = document.querySelector("#options-dialog");
  if (!dialog) return;
  if (!rulesDirty) {
    dialog.close();
    return;
  }
  const shouldSave = window.confirm(
    "You have unsaved rule changes.\n\nPress OK to save them now, or Cancel to discard them and close Options.",
  );
  if (shouldSave) saveRulesEditorDraft();
  else resetRulesEditorDraft();
  dialog.close();
}

function getPlayerPanel(player) {
  return document.querySelector(`[data-player-popup-panel="${player}"]`);
}

function getPlayerTrigger(player) {
  return document.querySelector(`[data-player-popup="${player}"]`);
}

function anyPlayerPopupOpen() {
  return Array.from(document.querySelectorAll("[data-player-popup-panel]")).some((panel) => !panel.hidden);
}

function syncPlayerControls(player) {
  const value = settings.players[player];
  const panel = getPlayerPanel(player);
  if (!panel) return;
  panel.querySelector(".player-type").value = value.type;
  panel.querySelector(".player-color").value = value.color;
  panel.querySelector(".player-difficulty").value = value.difficulty;
  panel.querySelector(".player-skill").value = value.skill;
  panel.querySelector(".player-aggression").value = value.aggression;
}

function closePlayerPopups() {
  document.querySelectorAll("[data-player-popup-panel]").forEach((panel) => {
    panel.hidden = true;
  });
  document.querySelectorAll("[data-player-popup]").forEach((trigger) => {
    trigger.setAttribute("aria-expanded", "false");
  });
  if (!playerPopupAutoPaused || anyAutoPauseDialogOpen()) return;
  playerPopupAutoPaused = false;
  if (!paused || replaying || game.finished) return;
  paused = false;
  updatePauseButtons();
  renderStatus();
  scheduleComputer();
}

function togglePlayerPopup(player) {
  const panel = getPlayerPanel(player);
  const trigger = getPlayerTrigger(player);
  if (!panel || !trigger) return;
  const willOpen = panel.hidden;
  closePlayerPopups();
  if (!willOpen) return;
  panel.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  if (
    !playerPopupAutoPaused
    && !paused
    && !replaying
    && !game.finished
    && areBothPlayersComputer()
  ) {
    playerPopupAutoPaused = true;
    paused = true;
    cancelComputerTurn();
    updatePauseButtons();
    renderStatus();
  }
}

function showIntroIfFirstVisit() {
  if (hasSeenIntro()) return;
  markIntroSeen();
  maybePauseForDialog();
  const dialog = document.querySelector("#about-dialog");
  if (!dialog.open) dialog.showModal();
}

function exitReplay() {
  if (!replaying) return;
  game = liveGame;
  liveGame = null;
  replaying = false;
  replayIndex = -1;
  paused = livePaused;
  updatePauseButtons();
  render();
  const dialog = document.querySelector("#history-dialog");
  if (dialog.open) dialog.close();
  scheduleComputer();
}

function renderHistory() {
  const list = document.querySelector("#move-history");
  list.replaceChildren();
  history.forEach((entry, index) => {
    const item = document.createElement("li");
    item.classList.toggle("current", index === replayIndex);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.replayIndex = index;
    button.textContent = `${index}. ${entry.label}`;
    item.append(button);
    list.append(item);
  });
  document.querySelector("#replay-position").textContent =
    `Position ${replayIndex + 1} of ${history.length}`;
  document.querySelector('[data-action="replay-prev"]').disabled = replayIndex <= 0;
  document.querySelector('[data-action="replay-next"]').disabled = replayIndex >= history.length - 1;
}

function showGameOver() {
  if (!game.finished || replaying || gameOverShown) return;
  gameOverShown = true;
  const score = counts(game);
  document.querySelector("#game-over-title").textContent = game.message;
  document.querySelector("#game-over-summary").textContent =
    game.winner === 0 ? "The final scores are level." : `${playerLabel(game, game.winner)} controls the board.`;
  document.querySelector("#final-score-1").textContent = score[PLAYER_ONE];
  document.querySelector("#final-score-2").textContent = score[PLAYER_TWO];
  document.querySelector("#final-name-1").textContent = game.playerLabels[PLAYER_ONE];
  document.querySelector("#final-name-2").textContent = game.playerLabels[PLAYER_TWO];
  const dialog = document.querySelector("#game-over-dialog");
  if (!dialog.open) dialog.showModal();
}

function render() {
  renderBoard();
  renderStatus();
}

function scheduleBoardRefit() {
  if (pendingBoardRefitFrame) cancelAnimationFrame(pendingBoardRefitFrame);
  pendingBoardRefitFrame = requestAnimationFrame(() => {
    pendingBoardRefitFrame = requestAnimationFrame(() => {
      pendingBoardRefitFrame = 0;
      fitBoardToViewport();
    });
  });
}

function renderBoard() {
  boardElement.replaceChildren();
  const animation = pendingAnimation;
  pendingAnimation = null;
  const radius = game.radius;
  const cellRadius = 42;
  const configuration = getConfiguration(game.shape);
  const coords = boardCoordinates(radius, game.shape);
  let points = coords.map(({ x, y }) => ({
    x,
    y,
    ...configuration.presentation(x, y, radius, cellRadius),
  }));
  if (configuration.centerBoard) {
    const centerX = (Math.min(...points.map((point) => point.px))
      + Math.max(...points.map((point) => point.px))) / 2;
    const centerY = (Math.min(...points.map((point) => point.py))
      + Math.max(...points.map((point) => point.py))) / 2;
    points = points.map((point) => ({
      ...point,
      px: point.px - centerX,
      py: point.py - centerY,
    }));
  }
  const pointMap = new Map(points.map((point) => [`${point.x},${point.y}`, point]));
  const margin = points[0]?.margin ?? cellRadius * 1.35;
  const maxX = Math.max(...points.map((point) => Math.abs(point.px))) + margin;
  const maxY = Math.max(...points.map((point) => Math.abs(point.py))) + margin;
  const viewWidth = maxX * 2;
  const viewHeight = maxY * 2;
  boardAspectRatio = viewWidth / viewHeight;
  baseBoardViewBox = { x: -maxX, y: -maxY, width: viewWidth, height: viewHeight };
  boardElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
  fitBoardToViewport();
  scheduleBoardRefit();

  const legal = new Map();
  if (game.selected) {
    for (const move of legalMovesFrom(game, game.selected.x, game.selected.y)) {
      legal.set(
        `${move.toX},${move.toY}`,
        move.type === "copy" ? "move" : "jump",
      );
    }
  }

  if (suggestion) {
    const source = points.find((point) => (
      point.x === suggestion.fromX && point.y === suggestion.fromY
    ));
    const target = points.find((point) => (
      point.x === suggestion.toX && point.y === suggestion.toY
    ));
    if (source && target) appendSuggestionArrow(source, target, cellRadius);
  }

  for (const point of points) {
    const value = game.board.get(`${point.x},${point.y}`);
    const destinationType = legal.get(`${point.x},${point.y}`);
    const captureIndex = animation?.captured.findIndex(({ x, y }) => x === point.x && y === point.y) ?? -1;
    const fillIndex = animation?.filled.findIndex(({ x, y }) => x === point.x && y === point.y) ?? -1;
    const isArrival = animation?.move?.toX === point.x && animation?.move?.toY === point.y;
    const group = svg("g", {
      class: [
        "cell",
        value === ROCK ? "rock" : "",
        value === PLAYER_ONE ? "piece player-1" : "",
        value === PLAYER_TWO ? "piece player-2" : "",
        destinationType ? "legal" : "",
        destinationType === "move" ? "copy-destination" : "",
        destinationType === "jump" ? "jump-destination" : "",
        game.selected?.x === point.x && game.selected?.y === point.y ? "selected" : "",
        suggestion?.fromX === point.x && suggestion?.fromY === point.y ? "suggested source" : "",
        suggestion?.toX === point.x && suggestion?.toY === point.y ? "suggested target" : "",
        captureIndex >= 0 ? "animate-capture" : "",
        fillIndex >= 0 ? "animate-fill" : "",
        isArrival ? `animate-${animation.type}-arrival` : "",
      ].filter(Boolean).join(" "),
      transform: `translate(${point.px} ${point.py})`,
      style: fillIndex >= 0
        ? `--animation-delay:${Math.min(fillIndex * 22, 500)}ms`
        : captureIndex >= 0 ? `--animation-delay:${captureIndex * 45}ms` : "",
      tabindex: value === game.currentPlayer || destinationType ? "0" : "-1",
      role: "button",
      "aria-label": cellLabel(point.x, point.y, value, destinationType),
      "data-x": point.x,
      "data-y": point.y,
    });
    appendCellShape(group, "cell-border", point.shape);
    if (value !== EMPTY) {
      group.append(svg("circle", { class: "cell-fill", r: point.pieceRadius }));
    }
    if (destinationType === "move") {
      group.append(svg("circle", { class: "legal-dot copy-marker", r: cellRadius * 0.14 }));
    } else if (destinationType === "jump") {
      const markerSize = cellRadius * 0.16;
      group.append(svg("rect", {
        class: "legal-dot jump-marker",
        x: -markerSize,
        y: -markerSize,
        width: markerSize * 2,
        height: markerSize * 2,
        transform: "rotate(45)",
      }));
    }
    if (suggestion?.fromX === point.x && suggestion?.fromY === point.y) {
      appendSuggestionBadge(group, "FROM", cellRadius);
    }
    if (suggestion?.toX === point.x && suggestion?.toY === point.y) {
      appendCellShape(
        group,
        "suggestion-target-ring",
        configuration.presentation(point.x, point.y, radius, cellRadius, 0.92).shape,
      );
      appendSuggestionBadge(group, "TO", cellRadius);
    }
    boardElement.append(group);
  }
  appendMoveAnimation(animation, pointMap, cellRadius);
  beginBoardAnimation(animation);
}

function appendCellShape(group, className, shape) {
  if (shape.type === "rect") {
    group.append(svg("rect", {
      class: className,
      x: -shape.half,
      y: -shape.half,
      width: shape.half * 2,
      height: shape.half * 2,
      rx: shape.radius,
    }));
  } else if (shape.type === "polygon") {
    group.append(svg("polygon", {
      class: className,
      points: shape.points.map(([x, y]) => `${x},${y}`).join(" "),
    }));
  } else {
    group.append(svg("circle", { class: className, r: shape.radius }));
  }
}

function appendMoveAnimation(animation, pointMap, cellRadius) {
  if (!animation) return;
  const layer = svg("g", { class: "move-animation-layer", "aria-hidden": "true" });
  for (const [index, captured] of animation.captured.entries()) {
    const point = pointMap.get(`${captured.x},${captured.y}`);
    if (!point) continue;
    layer.append(svg("circle", {
      class: `captured-ghost player-${3 - animation.player}`,
      cx: point.px,
      cy: point.py,
      r: point.pieceRadius,
      style: `--animation-delay:${index * 45}ms`,
    }));
  }
  for (const [index, filled] of animation.filled.entries()) {
    const point = pointMap.get(`${filled.x},${filled.y}`);
    if (!point) continue;
    layer.append(svg("circle", {
      class: `fill-wave player-${animation.player}`,
      cx: point.px,
      cy: point.py,
      r: point.pieceRadius * 1.14,
      style: `--animation-delay:${Math.min(index * 22, 500)}ms`,
    }));
  }
  if (!animation.move) {
    boardElement.append(layer);
    return;
  }
  const source = pointMap.get(`${animation.move.fromX},${animation.move.fromY}`);
  const target = pointMap.get(`${animation.move.toX},${animation.move.toY}`);
  if (!source || !target) return;
  const dx = target.px - source.px;
  const dy = target.py - source.py;
  const trail = svg("line", {
    class: `move-trail ${animation.type} player-${animation.player}`,
    x1: source.px,
    y1: source.py,
    x2: target.px,
    y2: target.py,
  });
  const movingPiece = svg("circle", {
    class: `moving-piece ${animation.type} player-${animation.player}`,
    cx: source.px,
    cy: source.py,
    r: source.pieceRadius,
    style: [
      `--move-x:${dx}px`,
      `--move-y:${dy}px`,
      `--move-mid-x:${dx / 2}px`,
      `--move-mid-y:${dy / 2 - cellRadius * 0.8}px`,
    ].join(";"),
  });
  layer.append(trail, movingPiece);
  boardElement.append(layer);
}

function appendSuggestionArrow(source, target, cellRadius) {
  const definitions = svg("defs", {});
  const marker = svg("marker", {
    id: "suggestion-arrowhead",
    viewBox: "0 0 10 10",
    refX: "8",
    refY: "5",
    markerWidth: "8",
    markerHeight: "8",
    orient: "auto-start-reverse",
  });
  marker.append(svg("path", { class: "suggestion-arrowhead", d: "M 0 0 L 10 5 L 0 10 z" }));
  definitions.append(marker);
  boardElement.append(definitions);

  const dx = target.px - source.px;
  const dy = target.py - source.py;
  const length = Math.hypot(dx, dy);
  const inset = cellRadius * 0.7;
  boardElement.append(svg("line", {
    class: "suggestion-arrow",
    x1: source.px + dx / length * inset,
    y1: source.py + dy / length * inset,
    x2: target.px - dx / length * inset,
    y2: target.py - dy / length * inset,
    "marker-end": "url(#suggestion-arrowhead)",
  }));
}

function appendSuggestionBadge(group, label, cellRadius) {
  const badge = svg("g", {
    class: `suggestion-badge suggestion-${label.toLowerCase()}`,
    transform: `translate(0 ${-cellRadius * 0.72})`,
  });
  badge.append(svg("rect", { x: -22, y: -10, width: 44, height: 20, rx: 8 }));
  const text = svg("text", { x: 0, y: 4 });
  text.textContent = label;
  badge.append(text);
  group.append(badge);
}

function fitBoardToViewport() {
  const style = getComputedStyle(boardWrap);
  const availableWidth = boardWrap.clientWidth
    - parseFloat(style.paddingLeft)
    - parseFloat(style.paddingRight);
  const availableHeight = boardWrap.clientHeight
    - parseFloat(style.paddingTop)
    - parseFloat(style.paddingBottom);
  const fitted = containSize(availableWidth, availableHeight, boardAspectRatio);
  fittedBoardSize = fitted;

  boardElement.style.width = `${fitted.width}px`;
  boardElement.style.height = `${fitted.height}px`;
  constrainBoardPan();
  applyBoardTransform();
}

function applyBoardTransform() {
  const viewBox = zoomedViewBox(
    baseBoardViewBox,
    boardView.zoom,
    boardView.panX,
    boardView.panY,
    fittedBoardSize.width,
    fittedBoardSize.height,
  );
  boardElement.setAttribute(
    "viewBox",
    `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
  );
}

function constrainBoardPan() {
  const style = getComputedStyle(boardWrap);
  const viewportWidth = boardWrap.clientWidth
    - parseFloat(style.paddingLeft)
    - parseFloat(style.paddingRight);
  const viewportHeight = boardWrap.clientHeight
    - parseFloat(style.paddingTop)
    - parseFloat(style.paddingBottom);
  const constrained = clampPan(
    boardView.panX,
    boardView.panY,
    fittedBoardSize.width * boardView.zoom,
    fittedBoardSize.height * boardView.zoom,
    viewportWidth,
    viewportHeight,
  );
  boardView.panX = constrained.x;
  boardView.panY = constrained.y;
}

function setBoardZoom(nextZoom) {
  boardView.zoom = clampZoom(nextZoom);
  constrainBoardPan();
  applyBoardTransform();
}

function resetBoardView() {
  boardView = { zoom: 1, panX: 0, panY: 0 };
  if (boardElement) applyBoardTransform();
}

function renderStatus() {
  const score = counts(game);
  document.querySelector("#score-1").textContent = score[1];
  document.querySelector("#score-2").textContent = score[2];
  document.querySelector("#rock-count").textContent = score[3];
  document.querySelector("#free-count").textContent = score[0];
  document.querySelector("#move-1").textContent = game.lastMoves[1] || "No moves yet";
  document.querySelector("#move-2").textContent = game.lastMoves[2] || "No moves yet";
  document.querySelector("#player-1-name").textContent = game.playerLabels[1];
  document.querySelector("#player-2-name").textContent = game.playerLabels[2];

  if (replaying) turnHeading.textContent = `Replay: ${history[replayIndex].label}`;
  else if (game.finished) turnHeading.textContent = game.message;
  else turnHeading.textContent = `${playerLabel(game, game.currentPlayer)}'s Move`;
  turnHeading.style.color = settings.players[game.winner || game.currentPlayer]?.color ?? settings.rockColor;
  comment.textContent = game.message;
  gameState.textContent = replaying ? "Replay" : game.finished ? "Finished" : paused ? "Paused" : "Playing";
  gameState.classList.toggle("paused", paused && !replaying);
  gameState.classList.toggle("finished", game.finished);
  document.querySelectorAll("[data-player-popup]").forEach((trigger) => {
    const player = Number(trigger.dataset.playerPopup);
    trigger.title = `Change ${game.playerLabels[player]} settings`;
  });
  document.querySelector("#move-legend").hidden = !game.selected;
  document.documentElement.style.setProperty("--player-1", settings.players[1].color);
  document.documentElement.style.setProperty("--player-2", settings.players[2].color);
  document.documentElement.style.setProperty("--rock", settings.rockColor);
  document.querySelectorAll('[data-action="undo"]').forEach((button) => {
    button.disabled = !historyEnabled() || replaying || history.length <= 1;
  });
  document.querySelectorAll('[data-action="history"]').forEach((button) => {
    button.disabled = !historyEnabled() || history.length === 0;
  });
}

function handleCell(x, y) {
  if (
    replaying
    || game.finished
    || paused
    || performance.now() < animationBusyUntil
    || settings.players[game.currentPlayer].type !== "human"
  ) return;
  const value = game.board.get(`${x},${y}`);

  if (!game.selected) {
    if (value === game.currentPlayer) {
      game.selected = { x, y };
      game.message = `Selected ${coordinateLabel(x, y)}`;
      suggestion = null;
      render();
    }
    return;
  }

  if (value === game.currentPlayer) {
    if (game.selected.x === x && game.selected.y === y) game.selected = null;
    else game.selected = { x, y };
    suggestion = null;
    render();
    return;
  }

  const player = game.currentPlayer;
  const before = cloneGame(game);
  const move = {
    fromX: game.selected.x,
    fromY: game.selected.y,
    toX: x,
    toY: y,
  };
  const result = applyMove(game, move);
  if (!result.ok) game.message = result.reason;
  suggestion = null;
  resolveBlockedTurn();
  if (result.ok) {
    pendingAnimation = createBoardAnimation(before, game, move, player);
    completeTurn(`${playerLabel(game, player)}: ${game.lastMoves[player]}`);
    scheduleComputer();
  } else {
    render();
  }
}

function resolveBlockedTurn() {
  if (!resolveCurrentPlayerNoMove(game)) return false;
  suggestion = null;
  return true;
}

function scheduleComputer() {
  cancelComputerTurn();
  if (paused || game.finished || settings.players[game.currentPlayer].type !== "computer") return;
  const generation = computerTurnGeneration;
  if (useFastComputerBatch(settings.players, settings.speed)) {
    computerTimer = setTimeout(() => runComputerBatch(generation), 0);
    return;
  }
  const scheduledPlayer = game.currentPlayer;
  const delay = Math.max(settings.speed, animationBusyUntil - performance.now());
  computerTimer = setTimeout(() => {
    if (
      generation !== computerTurnGeneration
      || paused
      || game.finished
      || game.currentPlayer !== scheduledPlayer
      || settings.players[scheduledPlayer].type !== "computer"
    ) return;
    const animateComputerMove = settings.speed >= COMPUTER_ANIMATION_THRESHOLD_MS;
    const turn = executeComputerTurn(animateComputerMove);
    completeTurn(turn.label);
    scheduleComputer();
  }, delay);
}

function runComputerBatch(generation) {
  if (
    generation !== computerTurnGeneration
    || paused
    || game.finished
    || !useFastComputerBatch(settings.players, settings.speed)
  ) return;

  const startedAt = performance.now();
  let turns = 0;
  do {
    executeComputerTurn(false);
    turns += 1;
  } while (
    !game.finished
    && settings.players[game.currentPlayer].type === "computer"
    && batchShouldContinue(startedAt, performance.now(), turns)
  );

  render();
  if (game.finished) {
    showGameOver();
    return;
  }
  computerTimer = setTimeout(() => runComputerBatch(generation), 0);
}

function cancelComputerTurn() {
  clearTimeout(computerTimer);
  computerTimer = null;
  computerTurnGeneration += 1;
}

function suggestMove() {
  if (game.finished || paused) return;
  const playerSettings = settings.players[game.currentPlayer];
  suggestion = chooseComputerMove(
    game,
    playerSettings.skill,
    playerSettings.aggression,
    playerSettings.difficulty,
  );
  if (!suggestion) {
    game.message = "No legal move is available.";
  } else {
    game.selected = { x: suggestion.fromX, y: suggestion.fromY };
    const moveType = moveDistance(
      game,
      suggestion.fromX,
      suggestion.fromY,
      suggestion.toX,
      suggestion.toY,
    ) === 1 ? "COPY" : "JUMP";
    game.message = `${moveType} suggestion: move FROM the labelled piece TO the pulsing destination`;
  }
  render();
}

function togglePause() {
  if (game.finished) return;
  dialogAutoPaused = false;
  paused = !paused;
  if (paused) cancelComputerTurn();
  else scheduleComputer();
  updatePauseButtons();
  renderStatus();
  persistSession();
}

function skipTurn() {
  if (replaying || game.finished || paused) return;
  const player = game.currentPlayer;
  const before = cloneGame(game);
  passTurn(game);
  suggestion = null;
  resolveBlockedTurn();
  pendingAnimation = createBoardAnimation(before, game, null, 3 - player);
  completeTurn(`${playerLabel(game, player)}: ${game.lastMoves[player]}`);
  scheduleComputer();
}

function updatePauseButtons() {
  document.querySelectorAll('[data-action="pause"]').forEach((button) => {
    const label = button.querySelector("strong");
    if (label) label.textContent = paused ? "Resume" : "Pause";
    else button.childNodes[0].nodeValue = paused ? "Resume " : "Pause ";
  });
}

function initializeControls() {
  const size = document.querySelector("#board-size");
  const rocks = document.querySelector("#rock-percent");
  const shape = document.querySelector("#board-shape");
  shape.replaceChildren(...listConfigurations().map((configuration) => (
    new Option(configuration.label, configuration.id)
  )));
  for (let value = 0; value <= 50; value += 10) rocks.add(new Option(`${value}%`, value));
  const undoTurns = document.querySelector("#undo-turns");
  for (let value = 0; value <= 20; value += 1) {
    undoTurns.add(new Option(value === 0 ? "None" : `${value} turn${value === 1 ? "" : "s"}`, value));
  }

  document.querySelector("#board-shape").value = settings.shape;
  refreshBoardSizeOptions();
  rocks.value = settings.rockPercent;
  document.querySelector(`input[name="start"][value="${settings.startPosition}"]`).checked = true;
  document.querySelector("#speed").value = settings.speed;
  undoTurns.value = settings.undoTurns;
  document.querySelector("#rock-color").value = settings.rockColor;

  [1, 2].forEach(syncPlayerControls);
  refreshOutputs();
  refreshPlayerOptionVisibility();
  refreshRulesPreviewControls();
  document.querySelector("#rules-mode-copy").addEventListener("click", () => setRulesEditorMode("copy"));
  document.querySelector("#rules-mode-jump").addEventListener("click", () => setRulesEditorMode("jump"));
  document.querySelector("#rules-reset-tile").addEventListener("click", resetRulesEditorTile);
  document.querySelector("#rules-reset-shape").addEventListener("click", resetRulesEditorShape);
  document.querySelector("#rules-save").addEventListener("click", saveRulesEditorDraft);
  rulesPreviewBoard.addEventListener("click", handleRulesPreviewClick);

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => runAction(button.dataset.action));
  });
  document.querySelectorAll("[data-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      closePlayerPopups();
      maybePauseForDialog();
      document.querySelector(`#${button.dataset.dialog}`).showModal();
    });
  });
  document.querySelectorAll("[data-player-popup]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      togglePlayerPopup(Number(button.dataset.playerPopup));
    });
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-player-popup-panel], [data-player-popup]")) return;
    closePlayerPopups();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePlayerPopups();
  });

  document.querySelectorAll("select, input").forEach((control) => {
    control.addEventListener("input", readControls);
    control.addEventListener("change", readControls);
  });
}

function readControls(event) {
  settings.shape = document.querySelector("#board-shape").value;
  if (event?.target?.matches("#board-shape")) {
    refreshBoardSizeOptions();
    resetRulesEditorDraft();
    refreshRulesPreviewControls();
  }
  const configuration = getConfiguration(settings.shape);
  settings[configuration.settingsKey] = Number(document.querySelector("#board-size").value);
  settings.rockPercent = Number(document.querySelector("#rock-percent").value);
  settings.startPosition = document.querySelector('input[name="start"]:checked').value;
  settings.speed = Number(document.querySelector("#speed").value);
  settings.undoTurns = Number(document.querySelector("#undo-turns").value);
  if (settings.speed < COMPUTER_ANIMATION_THRESHOLD_MS) cancelBoardAnimation();
  settings.rockColor = document.querySelector("#rock-color").value;
  [1, 2].forEach((player) => {
    const panel = getPlayerPanel(player);
    settings.players[player] = {
      type: panel.querySelector(".player-type").value,
      color: panel.querySelector(".player-color").value,
      difficulty: panel.querySelector(".player-difficulty").value,
      skill: Number(panel.querySelector(".player-skill").value),
      aggression: Number(panel.querySelector(".player-aggression").value),
    };
  });
  saveSettings(settings);
  refreshOutputs();
  refreshPlayerOptionVisibility();
  if (event?.target?.matches("#rules-tile-type")) {
    selectedRulesTileType = event.target.value;
  }
  renderRulesPreview();
  game.playerLabels = getPlayerLabels();
  if (historyEnabled()) {
    if (history.length === 0) recordHistory("Current position");
    history = limitHistory(history, settings.undoTurns);
    persistSession();
  } else {
    history = [];
    clearSession();
  }

  const startsNewGame = event?.target?.matches(
    "#board-shape, #board-size, #rock-percent, input[name='start']",
  );
  if (startsNewGame) newGame();
  else {
    resolveBlockedTurn();
    render();
    scheduleComputer();
  }
}

function refreshBoardSizeOptions() {
  const size = document.querySelector("#board-size");
  const shape = document.querySelector("#board-shape").value;
  const configuration = getConfiguration(shape);
  const selected = settings[configuration.settingsKey] ?? configuration.defaultSize;
  size.replaceChildren();
  for (
    let value = configuration.minimumSize;
    value <= configuration.maximumSize;
    value += 1
  ) {
    size.add(new Option(configuration.sizeLabel(value), value));
  }
  size.value = String(selected);
}

function refreshRulesPreviewControls() {
  const configuration = getConfiguration(settings.shape);
  const select = document.querySelector("#rules-tile-type");
  const sampleEntries = Object.entries(configuration.sampleTiles ?? {});
  select.replaceChildren(...sampleEntries.map(([tileTypeId]) => (
    new Option(formatTileTypeLabel(tileTypeId), tileTypeId)
  )));
  if (!sampleEntries.length) {
    selectedRulesTileType = "";
    renderRulesPreview();
    return;
  }
  if (!configuration.sampleTiles[selectedRulesTileType]) {
    selectedRulesTileType = sampleEntries[0][0];
  }
  select.value = selectedRulesTileType;
  updateRulesEditorButtons();
  renderRulesPreview();
}

function refreshOutputs() {
  const animationState = settings.speed < COMPUTER_ANIMATION_THRESHOLD_MS
    ? " · animations off"
    : "";
  document.querySelector("#speed-output").textContent = `${settings.speed} ms${animationState}`;
  document.querySelectorAll("[data-player-popup-panel]").forEach((panel) => {
    panel.querySelector(".skill-output").textContent = panel.querySelector(".player-skill").value;
    panel.querySelector(".aggression-output").textContent = panel.querySelector(".player-aggression").value;
  });
}

function refreshPlayerOptionVisibility() {
  document.querySelectorAll("[data-player-popup-panel]").forEach((panel) => {
    panel.querySelector(".classic-only").hidden =
      panel.querySelector(".player-difficulty").value !== "classic";
  });
  const enabled = historyEnabled();
  const undoTurns = document.querySelector("#undo-turns");
  undoTurns.disabled = !enabled;
  document.querySelector("#undo-turns-note").textContent = enabled
    ? "Previous turns retained for Undo and replay."
    : "Disabled while both players are computers.";
  document.querySelector("#history-note").textContent = enabled
    ? `${settings.undoTurns} previous turn${settings.undoTurns === 1 ? "" : "s"} retained for Undo and replay.`
    : "History is disabled while both players are computers.";
}

function renderRulesPreview() {
  if (!rulesPreviewBoard) return;
  const configuration = getConfiguration(settings.shape);
  const ruleset = getRuleset({
    shape: configuration.id,
    rulesetId: configuration.defaultRulesetId,
    customRulesetTileTypes: getRulesDraftForShape(settings.shape),
  });
  const sample = resolveRulesPreviewSample(configuration, selectedRulesTileType);
  const note = document.querySelector("#rules-preview-note");
  const summary = document.querySelector("#rules-preview-summary");
  if (!sample || !ruleset.tileTypes) {
    rulesPreviewBoard.replaceChildren();
    note.textContent = "No tile-type preview is available for this configuration.";
    summary.textContent = "";
    return;
  }

  const copyOffsets = ruleset.copyOffsets(sample.x, sample.y);
  const jumpOffsets = ruleset.jumpOffsets(sample.x, sample.y);
  const toCoordinate = (offset) => (
    typeof configuration.applyRuleOffset === "function"
      ? configuration.applyRuleOffset(sample.x, sample.y, offset)
      : { x: sample.x + offset[0], y: sample.y + offset[1] }
  );
  const previewCoordinates = new Map();
  previewCoordinates.set(`${sample.x},${sample.y}`, { x: sample.x, y: sample.y, role: "home" });
  for (const offset of copyOffsets) {
    const coordinate = toCoordinate(offset);
    previewCoordinates.set(`${coordinate.x},${coordinate.y}`, {
      x: coordinate.x,
      y: coordinate.y,
      role: "copy",
    });
  }
  for (const offset of jumpOffsets) {
    const coordinate = toCoordinate(offset);
    const key = `${coordinate.x},${coordinate.y}`;
    previewCoordinates.set(key, {
      x: coordinate.x,
      y: coordinate.y,
      role: previewCoordinates.has(key) ? previewCoordinates.get(key).role : "jump",
    });
  }

  const legalCoordinates = [...previewCoordinates.values()].filter(({ role }) => role !== "home");
  const maxDistance = Math.max(
    1,
    ...legalCoordinates.map(({ x, y }) => Math.ceil(configuration.coordinateDistance(sample.x, sample.y, x, y))),
  );
  for (const coordinate of boardCoordinates(sample.previewSize, configuration.id)) {
    if (configuration.coordinateDistance(sample.x, sample.y, coordinate.x, coordinate.y) <= maxDistance + 1) {
      previewCoordinates.set(`${coordinate.x},${coordinate.y}`, {
        x: coordinate.x,
        y: coordinate.y,
        role: previewCoordinates.get(`${coordinate.x},${coordinate.y}`)?.role ?? "neutral",
      });
    }
  }

  const cellRadius = 30;
  let points = [...previewCoordinates.values()].map(({ x, y, role }) => ({
    x,
    y,
    role,
    ...configuration.presentation(x, y, settings[configuration.settingsKey], cellRadius),
  }));
  if (configuration.centerBoard) {
    const centerX = (Math.min(...points.map((point) => point.px))
      + Math.max(...points.map((point) => point.px))) / 2;
    const centerY = (Math.min(...points.map((point) => point.py))
      + Math.max(...points.map((point) => point.py))) / 2;
    points = points.map((point) => ({
      ...point,
      px: point.px - centerX,
      py: point.py - centerY,
    }));
  }

  const margin = Math.max(cellRadius * 1.2, points[0]?.margin ?? cellRadius * 1.2);
  const maxX = Math.max(...points.map((point) => Math.abs(point.px))) + margin;
  const maxY = Math.max(...points.map((point) => Math.abs(point.py))) + margin;
  rulesPreviewBoard.setAttribute("viewBox", `${-maxX} ${-maxY} ${maxX * 2} ${maxY * 2}`);
  rulesPreviewBoard.replaceChildren();

  for (const point of points) {
    const group = svg("g", {
      class: [
        "cell",
        point.role === "neutral" ? "rules-preview-neutral" : "",
        point.role === "home" ? "piece player-1 rules-preview-home" : "",
        point.role === "copy" ? "legal copy-destination" : "",
        point.role === "jump" ? "legal jump-destination" : "",
      ].filter(Boolean).join(" "),
      transform: `translate(${point.px} ${point.py})`,
      "data-x": point.x,
      "data-y": point.y,
      "data-role": point.role,
    });
    appendCellShape(group, "cell-border", point.shape);
    if (point.role === "home") {
      group.append(svg("circle", { class: "cell-fill", r: point.pieceRadius }));
    } else if (point.role === "copy") {
      group.append(svg("circle", { class: "legal-dot copy-marker", r: cellRadius * 0.14 }));
    } else if (point.role === "jump") {
      const markerSize = cellRadius * 0.16;
      group.append(svg("rect", {
        class: "legal-dot jump-marker",
        x: -markerSize,
        y: -markerSize,
        width: markerSize * 2,
        height: markerSize * 2,
        transform: "rotate(45)",
      }));
    }
    rulesPreviewBoard.append(group);
  }

  note.textContent =
    `Previewing ${configuration.label} tile type ${formatTileTypeLabel(selectedRulesTileType)}. Click tiles to toggle ${rulesEditorMode} destinations.`;
  summary.textContent =
    `${copyOffsets.length} copy destinations and ${jumpOffsets.length} jump destinations.${rulesDirty ? " Unsaved changes." : rulesStatusMessage ? ` ${rulesStatusMessage}` : ""}`;
}

function runAction(action) {
  if (action !== "pause") closePlayerPopups();
  if (action === "new") newGame();
  if (action === "pause") togglePause();
  if (action === "undo") undoMove();
  if (action === "suggest") suggestMove();
  if (action === "skip") skipTurn();
  if (action === "history") openHistory();
  if (action === "share") shareCurrentPosition();
  if (action === "replay-prev") stepReplay(-1);
  if (action === "replay-next") stepReplay(1);
  if (action === "replay-exit") exitReplay();
}

function formatTileTypeLabel(tileTypeId) {
  return tileTypeId
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function resolveRulesPreviewSample(configuration, tileTypeId) {
  const previewSize = Math.max(settings[configuration.settingsKey] ?? configuration.defaultSize, configuration.defaultSize + 2);
  const coordinates = boardCoordinates(previewSize, configuration.id);
  if (!coordinates.length) return null;
  const matching = coordinates.filter(({ x, y }) => configuration.tileTypeId(x, y) === tileTypeId);
  const pool = matching.length ? matching : coordinates;
  const centerX = (Math.min(...coordinates.map(({ x }) => x)) + Math.max(...coordinates.map(({ x }) => x))) / 2;
  const centerY = (Math.min(...coordinates.map(({ y }) => y)) + Math.max(...coordinates.map(({ y }) => y))) / 2;
  const best = pool.reduce((closest, coordinate) => {
    const candidateScore = Math.hypot(coordinate.x - centerX, coordinate.y - centerY);
    if (!closest || candidateScore < closest.score) {
      return { ...coordinate, score: candidateScore };
    }
    return closest;
  }, null);
  return best ? { x: best.x, y: best.y, previewSize } : null;
}

function getSavedCustomRulesForShape(shape) {
  return settings.customRulesets?.[shape] ?? null;
}

function resetRulesEditorDraft() {
  rulesDraft = null;
  rulesDirty = false;
  rulesStatusMessage = "";
  updateRulesEditorButtons();
}

function getRulesDraftForShape(shape) {
  return rulesDraft?.shape === shape
    ? rulesDraft.tileTypes
    : getSavedCustomRulesForShape(shape);
}

function getDefaultTileTypesForShape(shape) {
  const configuration = getConfiguration(shape);
  const ruleset = getRuleset({ shape, rulesetId: configuration.defaultRulesetId });
  return JSON.parse(JSON.stringify(ruleset.tileTypes ?? {}));
}

function ensureRulesDraft() {
  if (rulesDraft?.shape === settings.shape) return rulesDraft.tileTypes;
  rulesDraft = {
    shape: settings.shape,
    tileTypes: JSON.parse(JSON.stringify(
      getSavedCustomRulesForShape(settings.shape) ?? getDefaultTileTypesForShape(settings.shape),
    )),
  };
  return rulesDraft.tileTypes;
}

function setRulesEditorMode(mode) {
  rulesEditorMode = mode;
  updateRulesEditorButtons();
  renderRulesPreview();
}

function updateRulesEditorButtons() {
  document.querySelector("#rules-mode-copy")?.classList.toggle("active", rulesEditorMode === "copy");
  document.querySelector("#rules-mode-jump")?.classList.toggle("active", rulesEditorMode === "jump");
  document.querySelector("#rules-save")?.toggleAttribute("disabled", !rulesDirty);
}

function handleRulesPreviewClick(event) {
  const tile = event.target.closest("[data-x][data-y]");
  if (!tile || tile.dataset.role === "home") return;
  const configuration = getConfiguration(settings.shape);
  const sample = resolveRulesPreviewSample(configuration, selectedRulesTileType);
  if (!sample) return;
  const dx = Number(tile.dataset.x) - sample.x;
  const dy = Number(tile.dataset.y) - sample.y;
  const tileTypes = ensureRulesDraft();
  const rules = tileTypes[selectedRulesTileType]
    ?? (tileTypes[selectedRulesTileType] = { copy: [], jump: [], capture: [] });
  const otherMode = rulesEditorMode === "copy" ? "jump" : "copy";
  rules[otherMode] = (rules[otherMode] ?? []).filter(([x, y]) => !(x === dx && y === dy));
  const exists = (rules[rulesEditorMode] ?? []).some(([x, y]) => x === dx && y === dy);
  rules[rulesEditorMode] = exists
    ? (rules[rulesEditorMode] ?? []).filter(([x, y]) => !(x === dx && y === dy))
    : [...(rules[rulesEditorMode] ?? []), [dx, dy]]
      .sort((first, second) => first[1] - second[1] || first[0] - second[0]);
  if (!Array.isArray(rules.capture) || !rules.capture.length || rulesEditorMode === "copy") {
    rules.capture = JSON.parse(JSON.stringify(rules.copy ?? []));
  }
  rulesDirty = true;
  rulesStatusMessage = "";
  updateRulesEditorButtons();
  renderRulesPreview();
}

function resetRulesEditorTile() {
  const tileTypes = ensureRulesDraft();
  const defaults = getDefaultTileTypesForShape(settings.shape);
  tileTypes[selectedRulesTileType] = JSON.parse(JSON.stringify(defaults[selectedRulesTileType]));
  rulesDirty = true;
  rulesStatusMessage = "";
  updateRulesEditorButtons();
  renderRulesPreview();
}

function resetRulesEditorShape() {
  rulesDraft = {
    shape: settings.shape,
    tileTypes: getDefaultTileTypesForShape(settings.shape),
  };
  rulesDirty = true;
  rulesStatusMessage = "";
  updateRulesEditorButtons();
  renderRulesPreview();
}

function saveRulesEditorDraft() {
  const tileTypes = normalizeRulesetTileTypes(getRulesDraftForShape(settings.shape));
  settings.customRulesets = {
    ...(settings.customRulesets ?? {}),
    [settings.shape]: tileTypes,
  };
  saveSettings(settings);
  rulesDirty = false;
  rulesStatusMessage = "Rules saved.";
  updateRulesEditorButtons();
  renderRulesPreview();
}

boardWrap.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".zoom-controls")) return;
  const cell = event.target.closest(".cell");
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  boardWrap.setPointerCapture(event.pointerId);

  if (event.pointerType === "touch" && activePointers.size === 2) {
    const points = [...activePointers.values()];
    boardGesture = {
      type: "pinch",
      startDistance: pointerDistance(points[0], points[1]),
      startZoom: boardView.zoom,
      lastMidpoint: pointerMidpoint(points[0], points[1]),
    };
    pointerSource = null;
    pointerStartedSelected = false;
    return;
  }

  const ownPiece = cell
    && game.board.get(`${cell.dataset.x},${cell.dataset.y}`) === game.currentPlayer;
  boardGesture = {
    type: ownPiece ? "piece" : "pan",
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    moved: false,
    cell,
  };

  if (!cell) return;
  pointerSource = { x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
  pointerStartedSelected = game.selected?.x === pointerSource.x
    && game.selected?.y === pointerSource.y;
  if (
    !game.finished
    && !paused
    && performance.now() >= animationBusyUntil
    && settings.players[game.currentPlayer].type === "human"
    && ownPiece
  ) {
    game.selected = { ...pointerSource };
    suggestion = null;
    game.message = `Selected ${coordinateLabel(pointerSource.x, pointerSource.y)}`;
    render();
  }
});

boardWrap.addEventListener("pointermove", (event) => {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (boardGesture?.type === "pinch" && activePointers.size >= 2) {
    const points = [...activePointers.values()].slice(0, 2);
    const distance = pointerDistance(points[0], points[1]);
    const midpoint = pointerMidpoint(points[0], points[1]);
    boardView.zoom = clampZoom(
      boardGesture.startZoom * distance / Math.max(1, boardGesture.startDistance),
    );
    boardView.panX += midpoint.x - boardGesture.lastMidpoint.x;
    boardView.panY += midpoint.y - boardGesture.lastMidpoint.y;
    boardGesture.lastMidpoint = midpoint;
    constrainBoardPan();
    applyBoardTransform();
    return;
  }

  if (boardGesture?.type !== "pan") return;
  const totalMovement = Math.hypot(
    event.clientX - boardGesture.startX,
    event.clientY - boardGesture.startY,
  );
  if (totalMovement < 6 && !boardGesture.moved) return;
  boardGesture.moved = true;
  boardView.panX += event.clientX - boardGesture.lastX;
  boardView.panY += event.clientY - boardGesture.lastY;
  boardGesture.lastX = event.clientX;
  boardGesture.lastY = event.clientY;
  constrainBoardPan();
  applyBoardTransform();
});

boardWrap.addEventListener("pointerup", (event) => {
  const gesture = boardGesture;
  activePointers.delete(event.pointerId);
  if (gesture?.type === "pinch") {
    if (activePointers.size === 0) boardGesture = null;
    if (boardWrap.hasPointerCapture(event.pointerId)) boardWrap.releasePointerCapture(event.pointerId);
    return;
  }
  if (gesture?.type === "pan" && gesture.moved) {
    pointerSource = null;
    pointerStartedSelected = false;
    boardGesture = null;
    if (boardWrap.hasPointerCapture(event.pointerId)) boardWrap.releasePointerCapture(event.pointerId);
    return;
  }

  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest(".cell");
  if (!cell) {
    pointerSource = null;
    pointerStartedSelected = false;
    boardGesture = null;
    if (boardWrap.hasPointerCapture(event.pointerId)) boardWrap.releasePointerCapture(event.pointerId);
    return;
  }
  const x = Number(cell.dataset.x);
  const y = Number(cell.dataset.y);
  const releasedOnSource = pointerSource?.x === x && pointerSource?.y === y;
  if (!releasedOnSource || pointerStartedSelected || game.selected?.x !== x || game.selected?.y !== y) {
    handleCell(x, y);
  }
  pointerSource = null;
  pointerStartedSelected = false;
  boardGesture = null;
  if (boardWrap.hasPointerCapture(event.pointerId)) boardWrap.releasePointerCapture(event.pointerId);
});

boardWrap.addEventListener("pointercancel", (event) => {
  activePointers.delete(event.pointerId);
  pointerSource = null;
  pointerStartedSelected = false;
  boardGesture = null;
  if (boardWrap.hasPointerCapture(event.pointerId)) boardWrap.releasePointerCapture(event.pointerId);
});

boardWrap.addEventListener("wheel", (event) => {
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.0015);
  setBoardZoom(boardView.zoom * factor);
}, { passive: false });

window.addEventListener("load", () => {
  fitBoardToViewport();
  scheduleBoardRefit();
});

document.querySelectorAll("[data-zoom]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.zoom === "in") setBoardZoom(boardView.zoom * 1.25);
    else if (button.dataset.zoom === "out") setBoardZoom(boardView.zoom / 1.25);
    else resetBoardView();
  });
});

boardElement.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const cell = event.target.closest(".cell");
  if (!cell) return;
  event.preventDefault();
  handleCell(Number(cell.dataset.x), Number(cell.dataset.y));
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoMove();
    return;
  }
  const actions = { F1: "help", F2: "new", F3: "suggest", F4: "pause", F5: "skip" };
  if (!actions[event.key]) return;
  event.preventDefault();
  if (event.key === "F1") {
    maybePauseForDialog();
    document.querySelector("#help-dialog").showModal();
  }
  else runAction(actions[event.key]);
});

document.querySelector("#move-history").addEventListener("click", (event) => {
  const button = event.target.closest("[data-replay-index]");
  if (button) showReplayFrame(Number(button.dataset.replayIndex));
});

document.querySelector("#history-dialog").addEventListener("close", () => {
  if (replaying) exitReplay();
});

document.querySelector("#options-dialog").addEventListener("cancel", (event) => {
  event.preventDefault();
  requestCloseOptionsDialog();
});

AUTO_PAUSE_DIALOG_SELECTORS.forEach((selector) => {
  document.querySelector(selector).addEventListener("close", () => {
    maybeResumeAfterDialogClose();
  });
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.closeDialog === "options-dialog") requestCloseOptionsDialog();
    else document.querySelector(`#${button.dataset.closeDialog}`).close();
  });
});

function svg(name, attributes) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [attribute, value] of Object.entries(attributes)) element.setAttribute(attribute, value);
  return element;
}

function pointerDistance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function pointerMidpoint(first, second) {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function cellLabel(x, y, value, destinationType) {
  const names = ["empty space", game.playerLabels[1], game.playerLabels[2], "rock"];
  const coordinate = coordinateLabel(x, y);
  if (destinationType === "move") return `Copy destination at ${coordinate}; original piece remains`;
  if (destinationType === "jump") return `Jump destination at ${coordinate}; original piece moves`;
  return `${names[value]} at ${coordinate}`;
}

function coordinateLabel(x, y) {
  return getConfiguration(game.shape).formatCoordinate(x, y).replaceAll(",", ", ");
}
