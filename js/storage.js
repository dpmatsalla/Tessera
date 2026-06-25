export const DEFAULT_SETTINGS = {
  shape: "hex",
  radius: 4,
  squareSize: 8,
  triangleSize: 8,
  cairoSize: 8,
  octagonSquareSize: 8,
  pentagonHeptagonSize: 6,
  rhombitrihexSize: 5,
  rockPercent: 10,
  startPosition: "center",
  speed: 800,
  undoTurns: 5,
  players: {
    1: { type: "human", difficulty: "medium", skill: 10, aggression: 10, color: "#0066ff" },
    2: { type: "computer", difficulty: "medium", skill: 10, aggression: 10, color: "#ef3340" },
  },
  rockColor: "#17191f",
  customRulesets: {},
};

const STORAGE_KEY = "tessera-settings-v1";
const LEGACY_STORAGE_KEY = "bugger2-settings-v1";
const SESSION_KEY = "tessera-session-v1";
const LEGACY_SESSION_KEY = "bugger2-session-v1";
const INTRO_SEEN_KEY = "tessera-intro-seen-v1";
export const MAX_UNDO_ACTIONS = 20;

export function loadSettings() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY),
    );
    return mergeSettings(saved);
  } catch {
    return mergeSettings();
  }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function loadSession() {
  try {
    return JSON.parse(
      localStorage.getItem(SESSION_KEY) ?? localStorage.getItem(LEGACY_SESSION_KEY),
    );
  } catch {
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function hasSeenIntro() {
  return localStorage.getItem(INTRO_SEEN_KEY) === "1";
}

export function markIntroSeen() {
  localStorage.setItem(INTRO_SEEN_KEY, "1");
}

export function limitHistory(history, maximumActions = 5) {
  const actions = Math.max(0, Math.min(MAX_UNDO_ACTIONS, Math.round(Number(maximumActions))));
  return history.slice(-(actions + 1));
}

export function shouldTrackHistory(players) {
  return players?.[1]?.type === "human" || players?.[2]?.type === "human";
}

function mergeSettings(saved = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    undoTurns: Math.max(
      0,
      Math.min(MAX_UNDO_ACTIONS, Math.round(Number(saved.undoTurns ?? DEFAULT_SETTINGS.undoTurns))),
    ),
    players: {
      1: { ...DEFAULT_SETTINGS.players[1], ...saved?.players?.[1] },
      2: { ...DEFAULT_SETTINGS.players[2], ...saved?.players?.[2] },
    },
    customRulesets: saved?.customRulesets && typeof saved.customRulesets === "object"
      ? saved.customRulesets
      : {},
  };
}
