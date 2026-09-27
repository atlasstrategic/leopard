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
  // The monohull's close pass to the quay is flagged, not failed.
  assert.match(
    checkStage(parseStage(fuelDockFile)).warnings.join("\n"),
    /monohull: route passes within 0\.[12]\d m/,
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
