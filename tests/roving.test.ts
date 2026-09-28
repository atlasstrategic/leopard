import { test, after } from "node:test";
import assert from "node:assert/strict";
import fuelDockFile from "../stages/fuel-dock/stage.json";
import { boat, fenderConfig, STEP, useStage } from "../src/config";
import { cornerPoint, coveredFender, initialFenders } from "../src/fenders";
import { parseStage } from "../src/stage/load";
import type { StageFile } from "../src/stage/schema";
import { bundledStages } from "../src/stage/registry";
import { Session } from "../src/session";
after(() => useStage(bundledStages()[0]));
const calm = { speed: 0, direction: 0, currentX: 0, currentY: 0 };
const run = (g: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) g.tick();
};
test("the roving fender covers its corner from any direction, and only there", () => {
  const f = initialFenders();
  const c = cornerPoint("starboardQuarter");
  assert.ok(c.x > 0 && c.y < 0);
  assert.equal(coveredFender(c.x, c.y, 0, f), null, "stowed: corners bare");
  f.roving.at = "starboardQuarter";
  for (const normal of [-1, 0, 1])
    assert.deepEqual(coveredFender(c.x, c.y, normal, f), {
      side: "starboard",
      key: "roving",
    });
  // The next contact circle forward is within reach; the far one is not.
  const spacing = (boat.length - 2 * boat.hullRadius) / 16;
  assert.ok(coveredFender(c.x, c.y + spacing, 0, f));
  assert.equal(
    coveredFender(c.x, c.y + fenderConfig.rovingCoverage + 0.05, 0, f),
    null,
  );
  const p = cornerPoint("portQuarter");
  assert.equal(coveredFender(p.x, p.y, 0, f), null, "other corners bare");
  // Side fenders keep working alongside it.
  f.starboard.deployed = true;
  assert.equal(coveredFender(2.8, 0, -1, f)?.key, "starboard/1");
});
test("the crew takes 2 s to move the roving fender, lifting it at once", () => {
  const g = new Session(calm);
  assert.ok(g.requestRoving("portQuarter").accepted);
  assert.equal(g.fenders.roving.at, null);
  run(g, fenderConfig.rovingSeconds - 0.1);
  assert.equal(g.fenders.roving.at, null);
  run(g, 0.2);
  assert.equal(g.fenders.roving.at, "portQuarter");
  assert.match(
    g.requestRoving("portQuarter").message,
    /already at the port quarter/,
  );
  // Moving it uncovers the old corner straight away.
  assert.ok(g.requestRoving("starboardBow").accepted);
  assert.equal(g.fenders.roving.at, null);
  run(g, fenderConfig.rovingSeconds + 0.1);
  assert.equal(g.fenders.roving.at, "starboardBow");
  assert.ok(g.requestRoving(null).accepted);
  assert.equal(g.fenders.roving.at, null);
  assert.ok(g.recorder.events.some((e) => e.type === "fender.roving.complete"));
  g.paused = true;
  assert.match(g.requestRoving("portBow").message, /Paused/);
  g.paused = false;
  g.requestRoving("portBow");
  g.retry();
  assert.deepEqual(g.fenders.roving, { at: null, target: null, remaining: 0 });
});
// Backing the port quarter onto a moored catamaran's bows.
function quarterTouch(roving: boolean) {
  const data = structuredClone(fuelDockFile) as StageFile;
  data.scene.moored = [
    {
      id: "cat",
      name: "Moored catamaran",
      kind: "catamaran",
      x: -20,
      y: -30,
      heading: 0,
      length: 12.67,
      beam: 7.04,
    },
  ];
  useStage(parseStage(data));
  const g = new Session(calm);
  if (roving) {
    g.requestRoving("portQuarter");
    run(g, fenderConfig.rovingSeconds + 0.1);
  }
  // Port quarter circle over the catamaran's bows, starboard hull clear.
  const quarter = cornerPoint("portQuarter"),
    bows = -30 + 12.67 / 2 - 0.05;
  Object.assign(g.state, {
    x: -18 - quarter.x,
    y: bows - quarter.y + boat.hullRadius + fenderConfig.thickness + 0.2,
    heading: 0,
    vx: 0,
    vy: -0.12,
    yaw: 0,
  });
  g.previous = { ...g.state };
  run(g, 5);
  return g;
}
test("backing a quarter onto a moored boat fails without the roving fender", () => {
  const g = quarterTouch(false);
  assert.equal(g.progress.phase, "failed");
  assert.match(g.progress.failure!, /moored catamaran on the port hull/);
});
test("the roving fender at that quarter makes the touch safe and cushions it", () => {
  const g = quarterTouch(true);
  assert.notEqual(g.progress.phase, "failed", g.progress.failure ?? "");
  const touch = g.recorder.events.find((e) => e.type === "contact");
  assert.ok(touch, "the fender touched the catamaran");
  assert.equal((touch.data as { fenderCovered: boolean }).fenderCovered, true);
  assert.ok(g.state.vy > -0.05, "held off by the fender");
});
