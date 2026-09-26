import { test } from "node:test";
import assert from "node:assert/strict";
import { boat, scenario, STEP, trafficConfig } from "../src/config";
import { resolveContacts } from "../src/contacts";
import { initialFenders } from "../src/fenders";
import { initialState } from "../src/simulation";
import { Session } from "../src/session";
import { PracticeLab } from "../src/demonstration";
import {
  initialMonohull,
  vesselObstacle,
  type VesselObstacle,
} from "../src/traffic";
const calm = { speed: 0, direction: 0, currentX: 0, currentY: 0 };
const mono = trafficConfig.monohull;
const run = (g: Session, seconds: number, each = () => {}) => {
  for (let i = 0; i < seconds * 60; i++) {
    g.tick();
    each();
  }
};
// Smallest gap between the monohull's capsule and any dock box.
function dockClearance(o: VesselObstacle) {
  let min = Infinity;
  const ax = Math.sin(o.heading),
    ay = Math.cos(o.heading);
  for (let t = -o.halfLength; t <= o.halfLength; t += 0.25) {
    const x = o.x + ax * t,
      y = o.y + ay * t;
    for (const b of scenario.obstacles.filter((b) => b.kind === "dock")) {
      const qx = Math.max(b.x - b.width / 2, Math.min(b.x + b.width / 2, x));
      const qy = Math.max(b.y - b.length / 2, Math.min(b.y + b.length / 2, y));
      min = Math.min(min, Math.hypot(x - qx, y - qy) - o.radius);
    }
  }
  return min;
}
test("monohull waits at the fuel berth, departs on cue and leaves the harbour clear of docks", () => {
  const g = new Session(calm);
  let clearance = Infinity;
  run(g, 4.9);
  assert.equal(g.traffic!.status, "moored");
  assert.deepEqual(
    { x: g.traffic!.x, y: g.traffic!.y, heading: g.traffic!.heading },
    mono.start,
  );
  run(g, 130, () => {
    const o = g.traffic && vesselObstacle(g.traffic);
    if (o) clearance = Math.min(clearance, dockClearance(o));
  });
  const types = g.recorder.events.map((e) => e.type);
  const depart = g.recorder.events.find((e) => e.type === "traffic.depart")!;
  assert.ok(Math.abs(depart.time - mono.departAt) < 2 * STEP);
  assert.ok(types.includes("traffic.clear"));
  assert.ok(!types.includes("traffic.yield"));
  assert.equal(g.traffic!.status, "gone");
  assert.equal(vesselObstacle(g.traffic!), null);
  assert.equal(g.interpolatedTraffic(0.5), null);
  assert.ok(clearance > 0.1, `closest dock approach ${clearance}`);
  assert.equal(g.progress.collisions, 0);
});
test("moving hull contact uses relative velocity and pushes the boat", () => {
  const vessel = (vx: number): VesselObstacle => ({
    id: mono.id,
    name: mono.name,
    // Capsule surface 1 cm inside the boat's starboard hull circles.
    x: boat.beam / 2 - boat.hullRadius + boat.hullRadius + mono.beam / 2 - 0.01,
    y: 0,
    heading: 0,
    vx,
    vy: 0,
    yaw: 0,
    halfLength: mono.length / 2 - mono.beam / 2,
    radius: mono.beam / 2,
  });
  const hit = { ...initialState(), x: 0, y: 0 };
  const samples = resolveContacts(hit, boat, [], initialFenders(), STEP, [
    vessel(-0.5),
  ]);
  assert.ok(samples.length > 0);
  assert.ok(samples.every((c) => c.obstacleId === mono.id));
  assert.ok(Math.abs(Math.max(...samples.map((c) => c.speed)) - 0.5) < 1e-9);
  assert.ok(hit.vx < -0.1, "stationary boat is pushed by the moving hull");
  const together = { ...initialState(), x: 0, y: 0, vx: -0.5 };
  const shared = resolveContacts(together, boat, [], initialFenders(), STEP, [
    vessel(-0.5),
  ]);
  assert.ok(shared.every((c) => c.speed < 1e-9 && c.impulse < 1e-6));
});
test("driving into the moored monohull is a penalised contact episode", () => {
  const g = new Session(calm);
  Object.assign(g.state, {
    x: mono.start.x - mono.beam / 2 - boat.beam / 2 - 0.3,
    y: mono.start.y,
    vx: 0.3,
  });
  g.previous = { ...g.state };
  run(g, 3);
  assert.equal(g.traffic!.status, "moored");
  assert.equal(g.progress.collisions, 1);
  assert.equal(g.progress.penalty, scenario.collisionPenalty);
  const contact = g.recorder.events.find((e) => e.type === "contact")!;
  assert.equal(contact.data.obstacleId, mono.id);
  assert.ok(g.state.x < mono.start.x - mono.beam / 2 - boat.beam / 2 + 0.05);
});
test("monohull stops for a boat in its path without pushing it, then resumes", () => {
  const g = new Session(calm);
  // Directly astern of the monohull's reversing leg.
  Object.assign(g.state, { x: mono.start.x - 2, y: 0 });
  g.previous = { ...g.state };
  run(g, 30);
  assert.equal(g.traffic!.status, "yielding");
  assert.equal(g.traffic!.speed, 0);
  assert.ok(Math.abs(g.traffic!.y - mono.start.y) < 0.5);
  assert.ok(
    !g.recorder.events.some(
      (e) => e.type === "contact" && e.data.obstacleId === mono.id,
    ),
    "monohull never touches the waiting boat",
  );
  assert.equal(g.progress.collisions, 0);
  assert.ok(g.recorder.events.some((e) => e.type === "traffic.yield"));
  Object.assign(g.state, { x: 20, y: -35 });
  g.previous = { ...g.state };
  run(g, 130);
  assert.ok(g.recorder.events.some((e) => e.type === "traffic.resume"));
  assert.equal(g.traffic!.status, "gone");
});
test("traffic resets on retry, matches across render rates and is absent from Show me", () => {
  const g = new Session(calm);
  run(g, 20);
  assert.notEqual(g.traffic!.status, "moored");
  g.retry();
  assert.deepEqual(g.traffic, initialMonohull());
  const at = (hz: number) => {
    const s = new Session(calm);
    for (let i = 0; i < hz * 30; i++) s.clock.advance(1 / hz, () => s.tick());
    return s.traffic;
  };
  assert.deepEqual(at(30), at(60));
  assert.deepEqual(at(60), at(144));
  const lab = new PracticeLab(new Session(calm));
  lab.showMe();
  assert.equal(lab.active.traffic, null);
  assert.notEqual(lab.practice.traffic, null);
});
