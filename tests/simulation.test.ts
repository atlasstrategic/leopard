import { test } from "node:test";
import assert from "node:assert/strict";
import { boat, scenario, STEP } from "../src/config";
import {
  initialState,
  initialControls,
  step,
  type State,
  type Controls,
} from "../src/simulation";
import { initialProgress, updateProgress, requirements } from "../src/scenario";
import { FixedClock, Session } from "../src/session";
import { hullPoints } from "../src/contacts";
const calm = { speed: 0, direction: 0, currentX: 0, currentY: 0 };
function run(c: Controls, seconds = 20, s = initialState()) {
  for (let i = 0; i < seconds * 60; i++) step(s, c, calm, STEP, boat, []);
  return s;
}
const close = (a: number, b: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
test("equal thrust moves straight in symmetric calm water", () => {
  const s = run({ port: 0.6, starboard: 0.6, rudder: 0 });
  assert.ok(s.y > scenario.start.y + 10);
  close(s.x, 0);
  close(s.heading, 0);
});
test("port ahead / starboard astern rotates clockwise; forces act at engine offsets", () => {
  const s = run({ port: 0.6, starboard: -0.6, rudder: 0 }, 5);
  assert.ok(s.heading > 0.05);
  assert.ok(s.yaw > 0);
});
test("neutral preserves momentum initially then water drag slows boat", () => {
  const s = initialState();
  s.vy = 1.5;
  step(s, initialControls(), calm, STEP, boat, []);
  assert.ok(s.vy > 1.49 && s.vy < 1.5);
  run(initialControls(), 30, s);
  assert.ok(s.vy > 0 && s.vy < 0.5);
});
test("mirrored levers yield mirrored turning", () => {
  const a = run({ port: 0.8, starboard: 0.2, rudder: 0 });
  const b = run({ port: 0.2, starboard: 0.8, rudder: 0 });
  close(a.x, -b.x);
  close(a.y, b.y);
  close(a.heading, -b.heading);
  close(a.yaw, -b.yaw);
});
test("fixed step remains equivalent at 30, 60, 144 Hz and uneven frame durations", () => {
  function simulate(hz: number) {
    const s = initialState(),
      clock = new FixedClock();
    let ticks = 0;
    for (let i = 0; i < hz * 20; i++)
      clock.advance(1 / hz, () => {
        step(
          s,
          { port: ticks < 600 ? 0.6 : -0.2, starboard: 0.2, rudder: 0.1 },
          calm,
          STEP,
          boat,
          [],
        );
        ticks++;
      });
    assert.equal(ticks, 1200);
    return s;
  }
  const base = simulate(60);
  for (const hz of [30, 144]) {
    const other = simulate(hz);
    close(other.x, base.x);
    close(other.heading, base.heading);
  }
  const clock = new FixedClock();
  let ticks = 0;
  for (let i = 0; i < 200; i++) {
    clock.advance(0.013, () => ticks++);
    clock.advance(0.037, () => ticks++);
  }
  assert.equal(ticks, 600);
  let caught = 0;
  clock.advance(100, () => caught++);
  assert.equal(caught, 6);
});
test("water and wind use relative velocities", () => {
  const s = initialState();
  s.vx = 1;
  step(
    s,
    initialControls(),
    { speed: 1, direction: Math.PI / 2, currentX: 1, currentY: 0 },
    STEP,
    boat,
    [],
  );
  close(s.vx, 1);
  close(s.yaw, 0);
  const windy = initialState();
  run(initialControls(), 1, windy);
  for (let i = 0; i < 600; i++)
    step(
      windy,
      initialControls(),
      { ...calm, speed: 6, direction: Math.PI / 2 },
      STEP,
      boat,
      [],
    );
  assert.ok(windy.x > 0.5);
  assert.ok(windy.heading > 0);
});
test("engine response is delayed, reverse is weaker, rudder persists", () => {
  const s = initialState(),
    c = { port: 1, starboard: 1, rudder: 0.2 };
  step(s, c, calm, STEP, boat, []);
  assert.ok(s.port > 0 && s.port < 0.02);
  close(s.rudder, 0.2);
  const ahead = run({ port: 1, starboard: 1, rudder: 0 }, 3);
  const astern = run({ port: -1, starboard: -1, rudder: 0 }, 3);
  assert.ok(ahead.vy > Math.abs(astern.vy));
});
function atTarget(): State {
  return {
    ...initialState(),
    x: scenario.target.x,
    y: scenario.target.y,
    heading: 0,
  };
}
function dwell(s: State) {
  const p = initialProgress();
  for (let i = 0; i < 480; i++) updateProgress(p, s, STEP, true);
  return p;
}
test("objective rejects wrong berth, excess speed, heading, rotation and contact", () => {
  for (const s of [
    { ...atTarget(), x: 10 },
    { ...atTarget(), y: -22 },
    { ...atTarget(), vx: 0.19 },
    { ...atTarget(), heading: 0.15 },
    { ...atTarget(), yaw: 0.03 },
    { ...atTarget(), contact: true },
  ])
    assert.equal(dwell(s).phase, "approach");
  assert.equal(dwell(atTarget()).phase, "securing");
  assert.equal(dwell(atTarget()).success, false);
});
test("dwell must be continuous and success never snaps pose", () => {
  const p = initialProgress(),
    s = { ...atTarget(), x: 0.5 };
  const original = { ...s };
  for (let i = 0; i < 120; i++) updateProgress(p, s, STEP);
  assert.equal(p.success, false);
  updateProgress(p, { ...s, vx: 1 }, STEP);
  close(p.dwell, 0);
  for (let i = 0; i < 180; i++) updateProgress(p, s, STEP);
  assert.equal(p.phase, "securing");
  assert.equal(p.success, false);
  p.positionTarget = "alongside";
  const alongside = { ...s, x: 2.5 };
  for (let i = 0; i < 180; i++) updateProgress(p, alongside, STEP, true);
  assert.equal(p.success, true);
  assert.deepEqual(s, original);
  assert.ok(requirements(s).position);
});
test("dock contact withstands sustained forward thrust without penetration or energy explosion", () => {
  const s = initialState();
  s.y = 22;
  s.vy = 2;
  for (let i = 0; i < 3600; i++)
    step(s, { port: 1, starboard: 1, rudder: 0 }, calm, STEP);
  for (const pt of hullPoints(boat)) {
    const x = s.x + pt.x * Math.cos(s.heading) + pt.y * Math.sin(s.heading);
    const y = s.y - pt.x * Math.sin(s.heading) + pt.y * Math.cos(s.heading);
    for (const b of scenario.obstacles) {
      const qx = Math.max(b.x - b.width / 2, Math.min(b.x + b.width / 2, x));
      const qy = Math.max(b.y - b.length / 2, Math.min(b.y + b.length / 2, y));
      assert.ok(Math.hypot(x - qx, y - qy) > boat.hullRadius - 0.025);
    }
  }
  assert.ok(s.y < 25);
  assert.ok(Math.hypot(s.vx, s.vy) < 0.05);
  assert.ok(Math.abs(s.yaw) < 0.01);
});
test("calm approach reaches live securing phase using only 20% lever steps, no pose snapping", () => {
  const g = new Session(undefined, { traffic: false });
  g.weather.speed = 0;
  for (let i = 0; i < 7200 && g.progress.phase === "approach"; i++) {
    const desiredSpeed = Math.max(
      -1,
      Math.min(1, (scenario.target.y - g.state.y) * 0.18),
    );
    const throttle = Math.max(
      -1,
      Math.min(1, (desiredSpeed - g.state.vy) * 1.4),
    );
    g.controls.port = g.controls.starboard = Math.round(throttle * 5) / 5;
    g.tick();
  }
  assert.equal(g.progress.phase, "securing");
  assert.equal(g.progress.success, false);
  assert.equal(g.progress.collisions, 0);
  assert.ok(g.progress.elapsed > 30 && g.progress.elapsed < 90);
  assert.ok(Math.abs(g.state.y - scenario.target.y) < 1.2);
});
test("session collision penalties match recorded contact episodes, not frames", () => {
  const g = new Session(undefined, { traffic: false });
  g.weather.speed = 0;
  g.state.y = 24;
  g.state.vy = 0.5;
  g.controls.port = g.controls.starboard = 1;
  for (let i = 0; i < 600; i++) g.tick();
  assert.equal(g.progress.collisions, 1);
  assert.equal(g.progress.penalty, 5);
  assert.equal(g.recorder.events.filter((e) => e.type === "penalty").length, 1);
});
test("retry clears physics, actuators, objective, penalties, pause and clock; preserves chosen tuning", () => {
  const g = new Session();
  g.controls.port = 1;
  g.controls.rudder = 0.4;
  for (let i = 0; i < 300; i++) g.tick();
  Object.assign(g.progress, {
    success: true,
    collisions: 3,
    penalty: 15,
    dwell: 3,
  });
  g.clock.accumulator = 0.01;
  g.paused = true;
  g.weather.speed = 7;
  g.tuning.engineLag = 2;
  g.retry();
  assert.deepEqual(g.state, initialState());
  assert.deepEqual(g.previous, initialState());
  assert.deepEqual(g.controls, initialControls());
  assert.deepEqual(g.progress, initialProgress(true));
  assert.equal(g.radio.length, 1, "only the fresh briefing remains");
  assert.equal(g.paused, false);
  assert.equal(g.clock.accumulator, 0);
  assert.equal(g.weather.speed, 7);
  assert.equal(g.tuning.engineLag, 2);
});
