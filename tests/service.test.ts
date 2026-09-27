import { test } from "node:test";
import assert from "node:assert/strict";
import { lineIds } from "../src/mooring";
import { Session } from "../src/session";
import { fuel } from "./fuel-stage";
const run = (g: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.tick();
};
const fuelSeconds = fuel.service.total / fuel.service.rate;
// Fuel mission after clearance, secured alongside with both lines.
function secured() {
  const g = new Session({ speed: 0, direction: 0, currentX: 0, currentY: 0 });
  g.skipTo("secure");
  Object.assign(g.state, { x: 2.5, y: 16 });
  g.previous = { ...g.state };
  g.fenders.starboard.deployed = g.fenders.starboard.target = true;
  for (const id of lineIds())
    assert.equal(g.requestLine(id, "attach").accepted, true);
  run(g, 13);
  assert.equal(g.progress.phase, "secured");
  // Skipping past the clearance leaves no early-entry penalty.
  assert.equal(g.progress.penalty, 0);
  return g;
}
const ok = (g: Session, action: Parameters<Session["requestService"]>[0]) =>
  assert.equal(g.requestService(action).accepted, true, action);
const refused = (
  g: Session,
  action: Parameters<Session["requestService"]>[0],
  pattern: RegExp,
) => {
  const result = g.requestService(action);
  assert.equal(result.accepted, false, action);
  assert.match(result.message, pattern);
};
test("service is refused before securing and outside the fuel mission", () => {
  const g = new Session();
  refused(g, "engines-off", /Secure the boat alongside first/);
  const practice = new Session(undefined, { mission: false });
  refused(practice, "engines-off", /No checklist/);
});
test("checklist runs in order; out-of-order steps and petrol are refused with explanations", () => {
  const g = secured();
  assert.match(g.radio.at(-1)!.message, /Switch the engines off/);
  refused(g, "fuel", /engines off first/);
  refused(g, "diesel", /engines off first/);
  refused(g, "pay", /engines off first/);
  g.controls.port = 0.2;
  refused(g, "engines-off", /neutral first/);
  g.controls.port = 0;
  ok(g, "engines-off");
  refused(g, "fuel", /Confirm the fuel type first/);
  refused(g, "petrol", /diesel engines/);
  ok(g, "diesel");
  refused(g, "pay", /Finish fuelling first/);
  ok(g, "fuel");
  run(g, fuelSeconds / 2);
  assert.equal(g.progress.service.running, "fuel");
  refused(g, "pay", /Finish fuelling first/);
  run(g, fuelSeconds / 2 + 0.1);
  assert.equal(g.progress.service.amount, fuel.service.total);
  assert.equal(g.progress.service.running, null);
  assert.match(g.radio.at(-1)!.message, /Please pay/);
  ok(g, "pay");
  ok(g, "engines-on");
  assert.notEqual(g.progress.service.completedAt, null);
  assert.match(g.radio.at(-1)!.message, /Service complete/);
  refused(g, "engines-off", /already complete/);
  const types = g.recorder.events.map((e) => e.type);
  for (const type of [
    "service.engines-off",
    "service.diesel",
    "service.fuel",
    "service.fuel.done",
    "service.pay",
    "service.engines-on",
    "service.rejected",
  ])
    assert.ok(types.includes(type), type);
});
test("engines off deliver no thrust and still count as secured", () => {
  const g = secured();
  ok(g, "engines-off");
  g.controls.port = g.controls.starboard = 1;
  const start = { x: g.state.x, y: g.state.y };
  run(g, 3);
  assert.ok(
    Math.abs(g.state.port) < 1e-6 && Math.abs(g.state.starboard) < 1e-6,
  );
  assert.ok(Math.hypot(g.state.x - start.x, g.state.y - start.y) < 0.05);
  assert.equal(g.progress.phase, "secured");
  refused(g, "engines-on", /neutral before starting/);
  g.controls.port = g.controls.starboard = 0;
  ok(g, "engines-on");
  assert.match(g.radio.at(-1)!.message, /Switch them off again/);
  refused(g, "diesel", /engines off first/);
});
test("losing secured interrupts fuelling; the service resumes once re-secured", () => {
  const g = secured();
  ok(g, "engines-off");
  ok(g, "diesel");
  ok(g, "fuel");
  run(g, 3);
  assert.equal(g.requestLine("bow", "release").accepted, true);
  run(g, 0.1);
  const partial = g.progress.service.amount;
  assert.ok(partial > 0 && partial < fuel.service.total);
  assert.equal(g.progress.service.running, null);
  assert.ok(
    g.recorder.events.some((e) => e.type === "service.fuel.interrupted"),
  );
  assert.match(g.radio.at(-1)!.message, /Fuelling stopped/);
  refused(g, "fuel", /re-secure/);
  assert.equal(g.requestLine("bow", "attach").accepted, true);
  run(g, 4);
  assert.equal(g.progress.phase, "secured");
  ok(g, "fuel");
  run(g, fuelSeconds);
  assert.equal(g.progress.service.amount, fuel.service.total);
});
test("fuelling pauses with the game and retry resets the service", () => {
  const g = secured();
  ok(g, "engines-off");
  ok(g, "diesel");
  ok(g, "fuel");
  run(g, 1);
  const amount = g.progress.service.amount;
  g.paused = true;
  run(g, 2);
  assert.equal(g.progress.service.amount, amount);
  refused(g, "pay", /Paused/);
  g.retry();
  assert.deepEqual(g.progress.service, {
    enginesOff: false,
    done: [],
    amount: 0,
    running: null,
    completedAt: null,
  });
});
