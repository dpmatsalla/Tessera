import test from "node:test";
import assert from "node:assert/strict";
import {
  boardCellCount,
  boardCoordinates,
  createGame,
  deserializeGame,
  getRuleset,
  isOnBoard,
  key,
  listConfigurations,
  serializeGame,
} from "../js/game.js";
import { DEFAULT_SETTINGS } from "../js/storage.js";

const EXPECTED_CONFIGURATIONS = [
  "triangle",
  "square",
  "cairo",
  "hex",
  "rhombitrihexagonal",
  "pentagon-heptagon",
  "octagon-square",
];

test("all built-in boards satisfy the configuration contract", () => {
  const configurations = listConfigurations();

  assert.deepEqual(configurations.map(({ id }) => id), EXPECTED_CONFIGURATIONS);
  assert.equal(new Set(configurations.map(({ id }) => id)).size, configurations.length);

  for (const configuration of configurations) {
    assert.ok(configuration.minimumSize <= configuration.defaultSize);
    assert.ok(configuration.defaultSize <= configuration.maximumSize);
    assert.equal(DEFAULT_SETTINGS[configuration.settingsKey], configuration.defaultSize);
    assert.ok(configuration.sizeLabel(configuration.defaultSize).length > 0);
    assert.ok(configuration.rulesets[configuration.defaultRulesetId]);
    assert.ok(typeof configuration.tileTypeId === "function");
    assert.ok(configuration.sampleTiles && Object.keys(configuration.sampleTiles).length > 0);

    for (const size of [
      configuration.minimumSize,
      configuration.defaultSize,
      configuration.maximumSize,
    ]) {
      const coordinates = configuration.coordinates(size);
      assert.equal(coordinates.length, configuration.cellCount(size));
      assert.equal(coordinates.length, boardCellCount(size, configuration.id));
      assert.equal(new Set(coordinates.map(({ x, y }) => key(x, y))).size, coordinates.length);

      for (const { x, y } of coordinates) {
        assert.equal(configuration.isOnBoard(x, y, size), true);
        assert.equal(isOnBoard(x, y, size, configuration.id), true);
      }

      const sample = coordinates[Math.floor(coordinates.length / 2)];
      const presentation = configuration.presentation(sample.x, sample.y, size, 20);
      assert.ok(Number.isFinite(presentation.px));
      assert.ok(Number.isFinite(presentation.py));
      assert.ok(presentation.pieceRadius > 0);
      assert.ok(presentation.margin > 0);
      assert.ok(["circle", "rect", "polygon"].includes(presentation.shape.type));
    }
  }
});

test("each built-in ruleset exposes distinct copy and jump destinations", () => {
  for (const configuration of listConfigurations()) {
    const size = configuration.defaultSize;
    const ruleset = configuration.rulesets[configuration.defaultRulesetId];
    assert.ok(ruleset.tileTypes);
    assert.ok(Object.keys(ruleset.tileTypes).length > 0);
    for (const { x, y } of configuration.coordinates(size)) {
      const copyKeys = ruleset.copyOffsets(x, y).map(([dx, dy]) => key(dx, dy));
      const jumpKeys = ruleset.jumpOffsets(x, y).map(([dx, dy]) => key(dx, dy));

      assert.equal(new Set(copyKeys).size, copyKeys.length);
      assert.equal(new Set(jumpKeys).size, jumpKeys.length);
      assert.equal(copyKeys.some((destination) => jumpKeys.includes(destination)), false);
      assert.ok(ruleset.captureOffsets(x, y).length > 0);
    }
    for (const [tileTypeId, sample] of Object.entries(configuration.sampleTiles)) {
      assert.equal(configuration.tileTypeId(sample.x, sample.y), tileTypeId);
    }
  }
});

test("configuration and ruleset identifiers survive serialization", () => {
  for (const configuration of listConfigurations()) {
    const game = createGame({
      shape: configuration.id,
      [configuration.settingsKey]: configuration.defaultSize,
      rockPercent: 0,
    });
    const saved = serializeGame(game);
    const restored = deserializeGame(saved);

    assert.equal(saved.configurationId, configuration.id);
    assert.equal(saved.shape, configuration.id);
    assert.equal(restored.shape, configuration.id);
    assert.equal(restored.rulesetId, configuration.defaultRulesetId);
    assert.equal(getRuleset(restored).id, configuration.defaultRulesetId);
  }
});

test("legacy saves and unknown rulesets use compatible defaults", () => {
  const game = createGame({ shape: "triangle", triangleSize: 8, rockPercent: 0 });
  const legacySave = serializeGame(game);
  delete legacySave.configurationId;
  delete legacySave.rulesetId;

  const restoredLegacy = deserializeGame(legacySave);
  assert.equal(restoredLegacy.shape, "triangle");
  assert.equal(restoredLegacy.rulesetId, "classic");

  const unknownRuleset = serializeGame(game);
  unknownRuleset.rulesetId = "future-rules";
  assert.equal(deserializeGame(unknownRuleset).rulesetId, "classic");
});
