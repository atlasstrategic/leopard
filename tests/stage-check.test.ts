import { test, after } from "node:test";
import assert from "node:assert/strict";
import fuelDockFile from "../stages/fuel-dock/stage.json";
import westQuay from "./fixtures/west-quay.stage.json";
import openWater from "../stages/open-water/stage.json";
import { parseStage } from "../src/stage/load";
import { checkStage } from "../src/stage/check";
import { playtest } from "../src/stage/playtest";
import { bundledStages } from "../src/stage/registry";
import { useStage } from "../src/config";
after(() => useStage(bundledStages()[0]));
const fuel = () => structuredClone(fuelDockFile) as typeof fuelDockFile;
const errors = (data: unknown) =>
  checkStage(parseStage(data)).errors.join("\n");
test("the bundled stages and the test fixture pass the geometry checks", () => {
  for (const data of [fuelDockFile, westQuay]) {
    const result = checkStage(parseStage(data));
    assert.deepEqual(result.errors, [], JSON.stringify(result));
  }
  // The fuel dock's monohull route now clears the quay comfortably.
  assert.deepEqual(checkStage(parseStage(fuelDockFile)).warnings, []);
  // A route that backs off less before turning passes close: a warning.
  const close = fuel();
  close.traffic[0].legs[0].x = 2.8;
  assert.match(
    checkStage(parseStage(close)).warnings.join("\n"),
    /monohull: route passes within 0\.\d\d m of a structure/,
  );
});
test("geometry mistakes are reported", () => {
  const reach = fuel();
  reach.scene.bollards[0].y = 35;
  assert.match(errors(reach), /bow line to B01 cannot be attached/);
  const closed = fuel();
  // Extend the west breakwater across the entrance.
  Object.assign(closed.scene.structures[2], { x: -32.5, width: 29 });
  assert.match(errors(closed), /gate entrance \(outside\) cannot be reached/);
  const reversed = fuel();
  reversed.scene.berths[0].alongside.heading = 180;
  assert.match(errors(reversed), /puts the port side against the quay/);
  const start = fuel();
  start.scene.start = { x: 12, y: 16, heading: 0 };
  assert.match(errors(start), /Start: the boat overlaps a structure/);
  const route = fuel();
  route.traffic[0].legs[1] = { gear: "ahead", x: 12, y: 30, stop: false };
  assert.match(errors(route), /route passes through a structure/);
});
test("stage logic mistakes the geometry cannot see are warned about", () => {
  const warnings = (data: unknown) =>
    checkStage(parseStage(data)).warnings.join("\n");
  // The wait's zone no longer covers the monohull at its berth.
  const empty = fuel();
  Object.assign(empty.scene.zones[1].shape, { y: 60 });
  assert.match(
    warnings(empty),
    /Step clearance: monohull starts outside zone fuel-berth, so the wait ends as soon as the step starts/,
  );
  // Keeping out of the very area the player is told to hold in.
  const penalised = fuel();
  const rule = penalised.mission.rules.find((r) => r.kind === "keepOut")!;
  (rule as { zone: string }).zone = "holding";
  assert.match(
    warnings(penalised),
    /keepOut holding: overlaps zone holding, where step \w+ holds before the rule ends/,
  );
  // The playtest names the penalty and the step it came in.
  const played = playtest(parseStage(penalised));
  const hold = played.steps.find((st) => st.kind === "holdInZone")!;
  assert.match(hold.penalties.join(), /Entered the holding area/);
  // The monohull leaves through the east (port) half of the entrance.
  const portSide = fuel();
  portSide.traffic[0].legs[2].x = -25;
  portSide.traffic[0].legs[3].x = -25;
  assert.match(
    warnings(portSide),
    /Traffic monohull: leaves through gate entrance on the port side/,
  );
});
test("the playtest completes every step of good stages", () => {
  for (const data of [fuelDockFile, westQuay]) {
    const result = playtest(parseStage(data));
    assert.ok(result.ok, JSON.stringify(result.steps));
    assert.equal(result.score, 100);
    assert.equal(result.penalty, 0);
  }
});
test("the playtest names the step that cannot be completed", () => {
  // Holding right in the monohull's path: it waits for the boat forever.
  const blocked = fuel();
  Object.assign(blocked.scene.zones[0].shape, { x: 3, y: -2 });
  const result = playtest(parseStage(blocked));
  assert.equal(result.ok, false);
  const failed = result.steps.find((s) => !s.ok)!;
  assert.equal(failed.step, "clearance");
  assert.match(
    failed.note,
    /had not cleared fuel-berth after 300 s \(yielding\)/,
  );
});
test("consecutive holds each take their full time", () => {
  // Open water has three holds in a row; the countdown must restart for each.
  const result = playtest(parseStage(openWater));
  assert.ok(result.ok, JSON.stringify(result.steps));
  const holds = openWater.mission.steps.filter((s) => s.kind === "holdInZone");
  for (const hold of holds) {
    const report = result.steps.find((s) => s.step === hold.id)!;
    assert.ok(
      Math.abs(report.seconds - hold.seconds!) < 0.05,
      `${hold.id}: ${report.seconds} s`,
    );
  }
});
test("every bundled stage passes the geometry checks and the playtest", () => {
  for (const stage of bundledStages()) {
    assert.deepEqual(checkStage(stage), { errors: [], warnings: [] }, stage.id);
    const result = playtest(stage);
    assert.ok(result.ok, `${stage.id}: ${JSON.stringify(result.steps)}`);
    assert.equal(result.penalty, 0, stage.id);
  }
});
