export function resolveTileTypeOffsets(configuration, tileTypes, kind, x, y) {
  const tileTypeId = configuration.tileTypeId?.(x, y) ?? "default";
  const tileType = tileTypes[tileTypeId] ?? tileTypes.default;
  if (!tileType) return [];
  return (tileType[kind] ?? (kind === "capture" ? tileType.copy ?? [] : []))
    .map(([dx, dy]) => [dx, dy]);
}

export function sanitizeTileTypes(tileTypes) {
  if (!tileTypes || typeof tileTypes !== "object") return null;
  const sanitized = {};
  for (const [tileTypeId, rules] of Object.entries(tileTypes)) {
    if (!rules || typeof rules !== "object") continue;
    const normalize = (offsets) => Array.isArray(offsets)
      ? offsets
        .filter((offset) => Array.isArray(offset) && offset.length === 2)
        .map(([dx, dy]) => [Math.round(Number(dx)), Math.round(Number(dy))])
        .filter(([dx, dy]) => Number.isFinite(dx) && Number.isFinite(dy))
      : [];
    sanitized[tileTypeId] = {
      copy: normalize(rules.copy),
      jump: normalize(rules.jump),
      capture: normalize(rules.capture),
    };
  }
  return Object.keys(sanitized).length ? sanitized : null;
}

export function buildRulesetFromTileTypes(configuration, id, label, tileTypes) {
  const frozenTileTypes = Object.freeze(Object.fromEntries(
    Object.entries(tileTypes).map(([tileTypeId, rules]) => [
      tileTypeId,
      Object.freeze({
        copy: (rules.copy ?? []).map(([dx, dy]) => [dx, dy]),
        jump: (rules.jump ?? []).map(([dx, dy]) => [dx, dy]),
        capture: (rules.capture ?? rules.copy ?? []).map(([dx, dy]) => [dx, dy]),
      }),
    ]),
  ));
  return Object.freeze({
    id,
    label,
    tileTypes: frozenTileTypes,
    copyOffsets: (x, y) => resolveTileTypeOffsets(configuration, frozenTileTypes, "copy", x, y),
    jumpOffsets: (x, y) => resolveTileTypeOffsets(configuration, frozenTileTypes, "jump", x, y),
    captureOffsets: (x, y) => resolveTileTypeOffsets(configuration, frozenTileTypes, "capture", x, y),
  });
}

export function getActiveRuleset(getConfiguration, gameOrShape) {
  const shape = typeof gameOrShape === "string" ? gameOrShape : gameOrShape.shape;
  const configuration = getConfiguration(shape);
  if (
    typeof gameOrShape !== "string"
    && gameOrShape.customRulesetTileTypes
  ) {
    return buildRulesetFromTileTypes(
      configuration,
      gameOrShape.rulesetId ?? "custom",
      "Custom",
      gameOrShape.customRulesetTileTypes,
    );
  }
  const rulesetId = typeof gameOrShape === "string"
    ? configuration.defaultRulesetId
    : gameOrShape.rulesetId;
  return configuration.rulesets[rulesetId] ?? configuration.rulesets[configuration.defaultRulesetId];
}

export function playerLabel(game, player) {
  return game.playerLabels?.[player] ?? `Player ${player}`;
}

export function randomListedCoordinate(getConfiguration, configurationId, size, random) {
  const coordinates = getConfiguration(configurationId).coordinates(size);
  return coordinates[Math.floor(random() * coordinates.length)];
}

export function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value))));
}
