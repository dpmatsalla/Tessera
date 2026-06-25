const configurations = new Map();

export function registerConfiguration(configuration) {
  validateConfiguration(configuration);
  configurations.set(configuration.id, Object.freeze(configuration));
  return configuration;
}

export function getConfiguration(id) {
  return configurations.get(id) ?? configurations.get("hex");
}

export function listConfigurations() {
  return [...configurations.values()];
}

export function hasConfiguration(id) {
  return configurations.has(id);
}

function validateConfiguration(configuration) {
  const requiredFunctions = [
    "coordinates",
    "cellCount",
    "isOnBoard",
    "startingCells",
    "coordinateDistance",
    "formatCoordinate",
    "presentation",
  ];
  if (
    !configuration
    || typeof configuration.id !== "string"
    || typeof configuration.label !== "string"
    || typeof configuration.settingsKey !== "string"
    || typeof configuration.defaultRulesetId !== "string"
    || !configuration.rulesets?.[configuration.defaultRulesetId]
    || !Number.isInteger(configuration.minimumSize)
    || !Number.isInteger(configuration.maximumSize)
    || typeof configuration.sizeLabel !== "function"
    || requiredFunctions.some((name) => typeof configuration[name] !== "function")
  ) {
    throw new TypeError("Invalid configuration contract.");
  }
  for (const ruleset of Object.values(configuration.rulesets)) {
    if (ruleset.tileTypes) {
      if (typeof configuration.tileTypeId !== "function") {
        throw new TypeError("Data-driven rulesets require configuration.tileTypeId.");
      }
      for (const tileType of Object.values(ruleset.tileTypes)) {
        if (
          tileType?.copy && !Array.isArray(tileType.copy)
          || tileType?.jump && !Array.isArray(tileType.jump)
          || tileType?.capture && !Array.isArray(tileType.capture)
        ) {
          throw new TypeError("Invalid tile-type ruleset contract.");
        }
      }
    }
    if (
      typeof ruleset.id !== "string"
      || typeof ruleset.copyOffsets !== "function"
      || typeof ruleset.jumpOffsets !== "function"
      || typeof ruleset.captureOffsets !== "function"
    ) {
      throw new TypeError("Invalid ruleset contract.");
    }
  }
}
