import { test } from "node:test";
import assert from "node:assert/strict";
import { missionConfig, trafficConfig, boat } from "../src/config";
import { debrief } from "../src/debrief";
import { lineIds } from "../src/mooring";
import { PracticeLab } from "../src/demonstration";
import { Session } from "../src/session";
const calm = { speed: 0, direction: 0, currentX: 0, currentY: 0 };
const run = (g: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.tick();
};
const place = (g: Session, x: number, y: number) => {
  Object.assign(g.state, { x, y, vx: 0, vy: 0, yaw: 0 });
  g.previous = { ...g.state };
};
// Hold until the berth is called clear, which saves the approach checkpoint.
function cleared() {
  const g = new Session(calm);
  place(g, missionConfig.holding.x, missionConfig.holding.y);
  for (let i = 0; i < 60 * 90 && g.progress.phase === "holding"; i++) g.tick();
  assert.equal(g.progress.phase, "approach");
  g.tick();
  return g;
}
test("the approach checkpoint is saved when the berth is called clear and restores that moment", () => {
  const g = cleared();
  const saved = g.checkpoints.approach!;
  assert.ok(saved);
  assert.equal(saved.progress.phase, "approach");
  assert.ok(g.recorder.events.some((e) => e.type === "mission.checkpoint"));
  // Carry on at full throttle so the boat ends up somewhere else.
  g.controls.port = g.controls.starboard = 1;
  run(g, 20);
  const attempt = g.recorder.attempt;
  g.retry("approach");
  assert.deepEqual(g.state, saved.state);
  assert.deepEqual(g.traffic, saved.traffic);
  assert.equal(g.progress.phase, "approach");
  assert.equal(g.progress.penalty, saved.progress.penalty);
  assert.equal(g.progress.metrics.checkpointRestarts, 1);
  assert.match(g.radio.at(-1)!.message, /Fuel berth clear/);
  assert.equal(g.recorder.attempt, attempt + 1);
  assert.equal(g.history[0].attempt, attempt);
  const types = g.recorder.events.map((e) => e.type);
  assert.ok(types.includes("attempt.checkpoint"));
  assert.ok(types.includes("mission.countdown"), "earlier log carried over");
  assert.equal(g.paused, false);
});
test("restarting from a checkpoint is repeatable", () => {
  const g = cleared();
  const after = () => {
    g.retry("approach");
    g.controls.port = 0.6;
    g.controls.starboard = 0.4;
    run(g, 10);
    return { state: { ...g.state }, traffic: { ...g.traffic! } };
  };
  assert.deepEqual(after(), after());
});
test("the departure checkpoint restores a secured, serviced boat ready to let go", () => {
  const g = new Session(calm);
  g.traffic!.status = "gone";
  Object.assign(g.progress, { phase: "securing", clearedAt: 0 });
  place(g, 2.5, 16);
  g.fenders.starboard.deployed = g.fenders.starboard.target = true;
  for (const id of lineIds) g.requestLine(id, "attach");
  run(g, 13);
  for (const action of ["enginesOff", "diesel", "fuel"] as const)
    g.requestService(action);
  run(g, 10);
  g.requestService("pay");
  g.requestService("enginesOn");
  assert.ok(g.checkpoints.departure);
  for (const id of lineIds) g.requestLine(id, "release");
  g.controls.port = g.controls.starboard = -0.6;
  run(g, 10);
  g.retry("departure");
  assert.equal(g.progress.phase, "departure");
  assert.notEqual(g.progress.service.completedAt, null);
  assert.ok(lineIds.every((id) => g.mooring[id].attached));
  assert.deepEqual(g.controls, { port: 0, starboard: 0, rudder: 0 });
  assert.equal(g.requestLine("bow", "release").accepted, true);
});
test("a failed attempt can restart from the approach checkpoint", () => {
  const g = cleared();
  const mono = trafficConfig.monohull;
  // Put the boat against the departing monohull without fenders.
  const v = g.traffic!;
  place(g, v.x - mono.beam / 2 - boat.beam / 2 - 0.1, v.y);
  g.state.heading = v.heading;
  g.state.vx = 0.5;
  run(g, 3);
  assert.equal(g.progress.phase, "failed");
  g.retry("approach");
  assert.equal(g.progress.phase, "approach");
  assert.equal(g.progress.failure, null);
});
test("missing checkpoints fall back to a full retry; checkpoints survive retries; Show me has none", () => {
  const g = new Session(calm);
  g.retry("departure");
  assert.equal(g.progress.phase, "holding");
  const h = cleared();
  h.retry();
  assert.equal(h.progress.phase, "holding");
  assert.ok(h.checkpoints.approach, "still available after a full retry");
  const lab = new PracticeLab(new Session(calm));
  lab.showMe();
  assert.deepEqual(lab.active.checkpoints, {});
});
test("the debrief reports checkpoint restarts", () => {
  const g = cleared();
  g.retry("approach");
  const figures = Object.fromEntries(debrief(g.progress).figures);
  assert.equal(figures["Checkpoint restarts"], "1");
});
