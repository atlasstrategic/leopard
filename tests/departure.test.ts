import { test } from "node:test";
import assert from "node:assert/strict";
import { boat, missionConfig, scenario, trafficConfig } from "../src/config";
import { lineIds } from "../src/mooring";
import { Session } from "../src/session";
import { startDeparture, vesselObstacle } from "../src/traffic";
const calm = { speed: 0, direction: 0, currentX: 0, currentY: 0 };
const gate = missionConfig.entrance;
const run = (g: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.tick();
};
const types = (g: Session) => g.recorder.events.map((e) => e.type);
// Departure phase with lines already let go, heading out towards the gate.
function leaving(x: number) {
  const g = new Session(calm);
  g.traffic!.status = "gone";
  Object.assign(g.progress, { phase: "departure", clearedAt: 0 });
  Object.assign(g.state, { x, y: gate.y + 8, heading: Math.PI, vy: -1 });
  g.previous = { ...g.state };
  g.controls.port = g.controls.starboard = 0.4;
  return g;
}
test("breakwaters leave exactly the entrance gap between the lights", () => {
  const west = scenario.obstacles.find((b) => b.id === "west-breakwater")!;
  const east = scenario.obstacles.find((b) => b.id === "east-breakwater")!;
  assert.equal(west.x + west.width / 2, gate.x - gate.width / 2);
  assert.equal(east.x - east.width / 2, gate.x + gate.width / 2);
  assert.equal(west.y, gate.y);
  assert.ok(gate.width > boat.beam * 2, "room for a starboard-side exit");
});
test("completing the service starts the departure; letting go no longer unsecures", () => {
  const g = new Session(calm);
  g.traffic!.status = "gone";
  Object.assign(g.progress, { phase: "securing", clearedAt: 0 });
  Object.assign(g.state, { x: 2.5, y: 16 });
  g.previous = { ...g.state };
  g.fenders.starboard.deployed = g.fenders.starboard.target = true;
  for (const id of lineIds) g.requestLine(id, "attach");
  run(g, 13);
  for (const action of ["enginesOff", "diesel", "fuel"] as const)
    assert.equal(g.requestService(action).accepted, true);
  run(g, 10);
  assert.equal(g.requestService("pay").accepted, true);
  assert.equal(g.requestService("enginesOn").accepted, true);
  assert.equal(g.progress.phase, "departure");
  assert.equal(g.recorder.phase, "departure");
  assert.ok(types(g).includes("mission.departure"));
  assert.match(g.radio.at(-1)!.message, /harbour entrance/);
  for (const id of lineIds)
    assert.equal(g.requestLine(id, "release").accepted, true);
  run(g, 1);
  assert.equal(g.progress.phase, "departure");
  assert.ok(!types(g).includes("mission.unsecured"));
});
test("leaving on the starboard side of the channel completes the mission", () => {
  const g = leaving(gate.x - gate.width / 4);
  run(g, 12);
  assert.equal(g.progress.phase, "complete");
  assert.equal(g.progress.channelSide, "starboard");
  assert.equal(g.progress.penalty, 0);
  assert.notEqual(g.progress.exitedAt, null);
  assert.ok(types(g).includes("mission.complete"));
  assert.match(g.radio.at(-1)!.message, /mission complete/);
  const frozen = { ...g.state };
  run(g, 1);
  assert.deepEqual(g.state, frozen, "simulation stops once complete");
  assert.match(g.requestFenders("port").message, /Mission complete/);
});
test("leaving on the port side of the channel costs a penalty", () => {
  const g = leaving(gate.x + gate.width / 4);
  run(g, 12);
  assert.equal(g.progress.phase, "complete");
  assert.equal(g.progress.channelSide, "port");
  assert.equal(g.progress.penalty, missionConfig.channelSidePenalty);
  assert.ok(types(g).includes("mission.channel_side"));
  assert.ok(
    g.radio.some((m) => /starboard side of the channel/.test(m.message)),
  );
});
test("crossing the gate before departure does not end the mission", () => {
  const g = leaving(gate.x - gate.width / 4);
  g.progress.phase = "holding";
  run(g, 12);
  assert.ok(g.state.y < gate.y, "the boat did cross the gate line");
  assert.notEqual(g.progress.phase, "complete");
  assert.equal(g.progress.exitedAt, null);
});
test("the breakwater is solid outside the gap", () => {
  const g = leaving(gate.x + gate.width / 2 + 8);
  run(g, 12);
  assert.equal(g.progress.phase, "departure");
  assert.ok(g.state.y > gate.y, "the boat stays inside the harbour");
  assert.ok(
    g.recorder.events.some(
      (e) => e.type === "contact" && e.data.obstacleId === "east-breakwater",
    ),
  );
});
test("the monohull leaves through the entrance on its starboard side", () => {
  const g = new Session(calm);
  startDeparture(g.traffic!);
  Object.assign(g.state, { x: 20, y: -22 });
  g.previous = { ...g.state };
  let crossedAt: number | null = null;
  for (let i = 0; i < 60 * 130 && g.traffic!.status !== "gone"; i++) {
    const before = g.traffic!.y;
    g.tick();
    const o = vesselObstacle(g.traffic!);
    if (o && before > gate.y && o.y <= gate.y) crossedAt = o.x;
  }
  assert.equal(g.traffic!.status, "gone");
  assert.notEqual(crossedAt, null);
  assert.ok(crossedAt! < gate.x, "west (starboard) half going out");
  assert.ok(
    crossedAt! - trafficConfig.monohull.beam / 2 > gate.x - gate.width / 2,
  );
  assert.equal(g.progress.collisions, 0);
});
