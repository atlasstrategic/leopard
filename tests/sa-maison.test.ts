import { test, after } from "node:test";
import assert from "node:assert/strict";
import saMaisonFile from "../stages/sa-maison/stage.json";
import { STEP, useStage } from "../src/config";
import { lineIds } from "../src/mooring";
import { parseStage, StageError } from "../src/stage/load";
import type { StageFile } from "../src/stage/schema";
import { berthPose } from "../src/stage/check";
import { bundledStages } from "../src/stage/registry";
import { Session } from "../src/session";
after(() => useStage(bundledStages()[0]));
const calm = { speed: 0, direction: 0, currentX: 0, currentY: 0 };
const copy = () => structuredClone(saMaisonFile) as StageFile;
// The Sa Maison slot, securing, with the boat lying on its starboard
// fenders against the quay beside the slot.
function onTheQuay(data: StageFile) {
  const stage = parseStage(data);
  useStage(stage);
  const g = new Session(calm, { mission: false });
  Object.assign(g.state, { ...berthPose(stage), y: -0.6 });
  g.previous = { ...g.state };
  g.progress.phase = "securing";
  for (const side of ["port", "starboard"] as const)
    g.fenders[side].deployed = g.fenders[side].target = true;
  for (let i = 0; i < Math.round(0.5 / STEP); i++) g.tick();
  assert.ok(g.state.contact, "the starboard fenders touch the quay");
  return g;
}
test("gentle fender contact with a quay beside the berth does not stop securing", () => {
  assert.equal(onTheQuay(copy()).acceptableContact, true);
  const without = copy();
  delete without.scene.berths[0].besides;
  assert.equal(onTheQuay(without).acceptableContact, false);
});
test("besides must name other quays", () => {
  for (const other of ["north-limit", "west-pontoon", "nowhere"]) {
    const data = copy();
    data.scene.berths[0].besides = [other];
    assert.throws(
      () => parseStage(data),
      (e: unknown) =>
        e instanceof StageError &&
        e.message.includes(`besides "${other}" is not another quay`),
    );
  }
});
test("Sa Maison: backing in with the levers alone and securing works in the majjistral", () => {
  // The lever-only autopilot from the between-boats test, mirrored for a
  // slot on a west pontoon: if it can back in beside the quay, arrive and
  // secure without touching anything, a player can. The corner leaves no
  // room to line up on the slot's centre line in the fairway, so it starts
  // where the turn ends: north of the slot, bow swung north-east.
  const stage = parseStage(copy());
  useStage(stage);
  const g = new Session({
    speed: stage.wind.speed,
    direction: stage.wind.direction,
    currentX: 0,
    currentY: 0,
  });
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) g.tick();
  };
  g.skipTo("approach");
  g.requestFenders("port");
  g.requestFenders("starboard");
  const east = 0.5 * Math.PI,
    stop = stage.berth.approach.x;
  Object.assign(g.state, { x: 21, y: 4, heading: east - Math.PI / 6 });
  g.previous = { ...g.state };
  const clamp = (v: number, a: number) => Math.max(-a, Math.min(a, v));
  for (let t = 0; t < 240 && g.progress.phase === "approach"; t += STEP) {
    const s = g.state,
      togo = s.x - stop,
      astern = -(s.vx * Math.sin(s.heading) + s.vy * Math.cos(s.heading));
    const heading =
      east - (togo < 4 ? 0 : clamp(0.12 * s.y + 0.25 * s.vy, 0.25));
    const turn = clamp(
      1.2 *
        Math.atan2(
          Math.sin(heading - s.heading),
          Math.cos(heading - s.heading),
        ) -
        3 * s.yaw,
      0.6,
    );
    const thrust = clamp(-(clamp(togo * 0.04, 0.2) - astern) * 2.5, 0.8);
    g.controls.port = clamp(thrust + turn / 2, 1);
    g.controls.starboard = clamp(thrust - turn / 2, 1);
    g.tick();
  }
  assert.equal(g.progress.phase, "securing", "arrived in the slot");
  g.controls.port = g.controls.starboard = 0;
  run(2);
  for (const id of lineIds()) {
    const result = g.requestLine(id, "attach");
    assert.ok(result.accepted, result.message);
  }
  for (let i = 0; i < 6; i++) {
    g.requestTend("lazy", "in");
    run(3);
  }
  run(5);
  assert.equal(g.progress.phase, "complete");
  assert.equal(g.progress.collisions, 0);
  assert.equal(g.progress.penalty, 0);
});
