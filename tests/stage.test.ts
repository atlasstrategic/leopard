import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fuelDock from "../stages/fuel-dock/stage.json";
import { parseStage, StageError } from "../src/stage/load";
import { stageJsonSchema } from "../src/stage/json-schema";
import { scenario, stage } from "../src/config";
// A deep copy to break in each test.
const copy = () => structuredClone(fuelDock) as typeof fuelDock;
const rejects = (data: unknown, pattern: RegExp) =>
  assert.throws(
    () => parseStage(data),
    (e: unknown) => e instanceof StageError && pattern.test(e.message),
  );
test("the fuel dock stage loads and drives the game's scenario", () => {
  assert.equal(stage.id, "fuel-dock");
  assert.equal(scenario.obstacles, stage.obstacles);
  assert.deepEqual(
    stage.obstacles.map((b) => b.kind),
    [
      "dock",
      "dock",
      "breakwater",
      "breakwater",
      "boundary",
      "boundary",
      "boundary",
      "boundary",
    ],
  );
  // Authoring units are converted: degrees to radians, wind FROM to TOWARD.
  assert.equal(stage.berth.approach.headingTolerance, (8 * Math.PI) / 180);
  assert.equal(stage.wind.direction, Math.PI / 2);
  assert.deepEqual(stage.berth.lines.bow.anchor, { x: 7.7, y: 23 });
  // IALA A, leaving southbound: red on the west (starboard) end.
  const gate = stage.gates.entrance;
  assert.ok(Math.abs(gate.red.x - (gate.x - gate.width / 2)) < 1e-9);
  assert.ok(Math.abs(gate.green.x - (gate.x + gate.width / 2)) < 1e-9);
});
test("the committed JSON Schema matches the stage definition", () => {
  const committed = JSON.parse(
    readFileSync(
      new URL("../stages/stage.schema.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    committed,
    JSON.parse(JSON.stringify(stageJsonSchema())),
    "run npm run stage:schema",
  );
});
test("schema problems are reported with their path", () => {
  const missing = copy() as Record<string, unknown>;
  delete missing.author;
  rejects(missing, /author/);
  const version = { ...copy(), schemaVersion: 2 };
  rejects(version, /schemaVersion/);
  const negative = copy();
  negative.scene.zones[0].shape.radius = -1;
  rejects(negative, /scene\.zones\.0\.shape\.radius/);
});
test("broken references and duplicate ids are rejected", () => {
  const missingBollard = copy();
  missingBollard.scene.berths[0].lines.bow = "B99";
  rejects(missingBollard, /bow bollard "B99" does not exist/);
  const wrongQuay = copy();
  wrongQuay.scene.bollards[0].structure = "north-quay";
  rejects(wrongQuay, /B01 is not on east-quay/);
  const notQuay = copy();
  notQuay.scene.berths[0].structure = "west-breakwater";
  rejects(notQuay, /"west-breakwater" is not a quay/);
  const duplicate = copy();
  duplicate.scene.zones[1].id = "holding";
  rejects(duplicate, /Duplicate zone id "holding"/);
});
test("buoyage and gate direction decide which light is red", () => {
  const b = copy();
  b.buoyage = "IALA-B";
  const flipped = parseStage(b).gates.entrance;
  assert.ok(
    Math.abs(flipped.red.x - (flipped.x + flipped.width / 2)) < 1e-9,
    "IALA B: red on the east end",
  );
  const east = copy();
  east.scene.gates[0].outward = "east";
  const gate = parseStage(east).gates.entrance;
  // Leaving eastbound, starboard is south: red (IALA A) on the south end.
  assert.ok(gate.red.y < gate.green.y);
  assert.ok(Math.abs(gate.heading - Math.PI / 2) < 1e-12);
});
