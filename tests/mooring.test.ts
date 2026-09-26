import { test } from "node:test";
import assert from "node:assert/strict";
import { Session } from "../src/session";
import { boat, scenario, STEP, mooringConfig } from "../src/config";
import {
  attachmentCheck,
  lineGeometry,
  mooringForces,
  initialMooring,
  lineIds,
} from "../src/mooring";
import { initialState } from "../src/simulation";
const close = (a: number, b: number, epsilon = 1e-8) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
function ready(x = 0) {
  const g = new Session(undefined, { mission: false });
  g.weather.speed = 0;
  Object.assign(g.state, { x, y: 16 });
  g.previous = { ...g.state };
  g.progress.phase = "securing";
  g.fenders.starboard.deployed = g.fenders.starboard.target = true;
  return g;
}
function attachBoth(g: Session) {
  for (const id of lineIds)
    assert.equal(g.requestLine(id, "attach").accepted, true);
}

test("attachment is phase/fender/neutral/reach/point-speed/side/route validated", () => {
  const g = ready();
  g.progress.phase = "approach";
  assert.equal(g.requestLine("bow", "attach").accepted, false);
  g.progress.phase = "securing";
  g.fenders.starboard.deployed = false;
  assert.equal(g.requestLine("bow", "attach").accepted, false);
  g.fenders.starboard.deployed = true;
  g.controls.port = 0.2;
  assert.equal(g.requestLine("bow", "attach").accepted, false);
  g.controls.port = 0;
  g.state.y = -22;
  assert.equal(g.requestLine("bow", "attach").accepted, false);
  g.state.y = 16;
  g.state.vx = 0.24;
  g.state.yaw = 0.024;
  assert.equal(g.requestLine("bow", "attach").accepted, false);
  g.state.vx = 0;
  g.state.yaw = 0;
  assert.ok(attachmentCheck(g.state, "bow").ok);
  assert.equal(
    attachmentCheck({ ...g.state, heading: Math.PI }, "bow").ok,
    false,
  );
  assert.equal(attachmentCheck({ ...g.state, x: 9 }, "bow").ok, false);
  assert.equal(attachmentCheck({ ...g.state, contact: true }, "bow").ok, false);
  assert.equal(
    attachmentCheck(g.state, "bow", [
      ...scenario.obstacles,
      { id: "blocker", kind: "dock", x: 5.5, y: 21.8, width: 1, length: 1 },
    ]).ok,
    false,
  );
  assert.equal(g.mooring.bow.attached, false);
  assert.ok(g.recorder.events.some((e) => e.type === "line.rejected"));
});
test("attaching stores current length plus slack without changing pose or momentum", () => {
  const g = ready();
  g.state.vy = 0.05;
  const before = { ...g.state },
    geometry = lineGeometry(g.state, "bow");
  assert.equal(g.requestLine("bow", "attach").accepted, true);
  assert.deepEqual(g.state, before);
  close(g.mooring.bow.restLength, geometry.distance + mooringConfig.slack);
  assert.deepEqual(mooringForces(g.state, g.mooring, STEP), {
    fx: 0,
    fy: 0,
    torque: 0,
  });
  g.state.x += 0.3; // shorter than rest length: never pushes away from bollard
  assert.deepEqual(mooringForces(g.state, g.mooring, STEP), {
    fx: 0,
    fy: 0,
    torque: 0,
  });
});
test("taut lines pull at their fairleads with correct opposite bow/stern yaw moments", () => {
  const bow = ready(),
    stern = ready();
  bow.requestLine("bow", "attach");
  stern.requestLine("stern", "attach");
  bow.state.x = stern.state.x = -0.6;
  const a = mooringForces(bow.state, bow.mooring, STEP),
    b = mooringForces(stern.state, stern.mooring, STEP);
  assert.ok(a.fx > 0 && b.fx > 0);
  assert.ok(a.torque > 0 && b.torque < 0);
  close(a.fx, b.fx);
  close(a.fy, -b.fy);
  close(a.torque, -b.torque);
});
test("pair of lines stably restrains offshore wind without teleporting or exploding", () => {
  const g = ready();
  attachBoth(g);
  g.weather.speed = 5;
  g.weather.direction = -Math.PI / 2;
  for (let i = 0; i < 10800; i++) g.tick();
  assert.ok(lineIds.every((id) => g.mooring[id].attached));
  assert.ok(Math.abs(g.state.x) < 1);
  assert.ok(Math.abs(g.state.y - 16) < 0.5);
  assert.ok(Math.hypot(g.state.vx, g.state.vy) < 0.1);
  assert.ok(Math.abs(g.state.yaw) < 0.01);
  assert.ok(lineIds.some((id) => g.mooring[id].tension > 0));
});
test("sustained excessive tension warns and breaks, then stops pulling", () => {
  const g = ready();
  attachBoth(g);
  // Fault/high-load fixture: equivalent to a line much too short, not a UI action.
  g.mooring.bow.restLength = 0.01;
  for (let i = 0; i < 40; i++) g.tick();
  assert.ok(g.mooring.bow.broken);
  assert.equal(g.mooring.bow.attached, false);
  close(g.mooring.bow.tension, 0);
  assert.equal(
    g.recorder.events.filter(
      (e) => e.type === "line.overload" && e.data.line === "bow",
    ).length,
    1,
  );
  assert.equal(
    g.recorder.events.filter(
      (e) => e.type === "line.break" && e.data.line === "bow",
    ).length,
    1,
  );
  const isolated = initialMooring();
  isolated.bow = { ...g.mooring.bow };
  assert.deepEqual(mooringForces(g.state, isolated, STEP, boat), {
    fx: 0,
    fy: 0,
    torque: 0,
  });
});
test("brief overload does not break; recovery resets the continuous failure timer", () => {
  const g = ready();
  g.requestLine("bow", "attach");
  const length = g.mooring.bow.restLength;
  g.mooring.bow.restLength = 0.01;
  for (let i = 0; i < 10; i++) mooringForces(g.state, g.mooring, STEP);
  assert.ok(g.mooring.bow.attached && g.mooring.bow.warning);
  g.mooring.bow.restLength = length;
  mooringForces(g.state, g.mooring, STEP);
  close(g.mooring.bow.overloadTime, 0);
  assert.equal(g.mooring.bow.warning, false);
});
test("secured requires both lines, fenders, neutral and continuous low-speed dwell; remains live", () => {
  const g = ready(2.5);
  for (let i = 0; i < 240; i++) g.tick();
  assert.equal(g.progress.success, false);
  g.requestLine("bow", "attach");
  for (let i = 0; i < 240; i++) g.tick();
  assert.equal(g.progress.success, false);
  g.requestLine("stern", "attach");
  for (let i = 0; i < 120; i++) g.tick();
  assert.equal(g.progress.success, false);
  g.controls.port = 0.2;
  g.tick();
  close(g.progress.dwell, 0);
  g.controls.port = 0;
  for (let i = 0; i < 400; i++) g.tick();
  assert.equal(g.progress.phase, "secured");
  const elapsed = g.progress.elapsed;
  g.tick();
  assert.ok(g.progress.elapsed > elapsed);
  assert.equal(g.requestFenders("port").accepted, true); // no old success lockout
  const before = { ...g.state };
  assert.equal(g.requestLine("bow", "release").accepted, true);
  assert.deepEqual(g.state, before);
  assert.equal(g.progress.phase, "securing");
  assert.equal(g.progress.success, false);
  g.tick();
  close(g.mooring.bow.tension, 0);
  assert.ok(g.recorder.events.some((e) => e.type === "mission.secured"));
  assert.ok(g.recorder.events.some((e) => e.type === "mission.unsecured"));
});
test("secured status is lost on departure from berth, engine input or retrieval of required fenders", () => {
  for (const change of [
    (g: Session) => {
      g.state.x = -5;
    },
    (g: Session) => {
      g.controls.starboard = 0.2;
    },
    (g: Session) => {
      g.requestFenders("starboard");
    },
  ]) {
    const g = ready(2.5);
    attachBoth(g);
    for (let i = 0; i < 180; i++) g.tick();
    assert.equal(g.progress.success, true);
    change(g);
    g.tick();
    assert.equal(g.progress.success, false);
  }
});
test("pause, retry and exports preserve lifecycle boundaries and clear every line field", () => {
  const g = ready();
  attachBoth(g);
  g.paused = true;
  const lines = structuredClone(g.mooring),
    state = { ...g.state },
    elapsed = g.progress.elapsed;
  assert.equal(g.requestLine("bow", "release").accepted, false);
  for (let i = 0; i < 60; i++) g.tick();
  assert.deepEqual(g.mooring, lines);
  assert.deepEqual(g.state, state);
  close(g.progress.elapsed, elapsed);
  g.retry();
  assert.deepEqual(g.mooring, initialMooring());
  assert.equal(g.progress.phase, "approach");
  assert.ok(g.history[0].events.some((e) => e.type === "line.attach"));
  assert.ok(g.history[0].snapshots.at(-1)!.data.mooring);
});
test("mooring response and phase transitions match at 30/60/144 render Hz", () => {
  const run = (hz: number) => {
    const g = ready();
    attachBoth(g);
    g.weather.speed = 4;
    g.weather.direction = -Math.PI / 2;
    for (let i = 0; i < 20 * hz; i++) g.clock.advance(1 / hz, () => g.tick());
    return {
      state: g.state,
      mooring: g.mooring,
      progress: g.progress,
      events: g.recorder.events,
    };
  };
  assert.deepEqual(run(30), run(60));
  assert.deepEqual(run(144), run(60));
});
test("entire calm approach, attach, secure and release uses commands without berth snapping", () => {
  const g = new Session(undefined, { mission: false });
  g.weather.speed = 0;
  g.requestFenders("starboard");
  for (let i = 0; i < 7200 && g.progress.phase === "approach"; i++) {
    const wanted = Math.max(-1, Math.min(1, (16 - g.state.y) * 0.18));
    const throttle =
      Math.round(Math.max(-1, Math.min(1, (wanted - g.state.vy) * 1.4)) * 5) /
      5;
    g.controls.port = g.controls.starboard = throttle;
    g.tick();
  }
  assert.equal(g.progress.phase, "securing");
  g.controls.port = g.controls.starboard = 0;
  attachBoth(g);
  for (let i = 0; i < 6000 && !g.progress.success; i++) {
    for (const id of lineIds)
      if (g.mooring[id].tending === "idle" && g.mooring[id].restLength > 3.1)
        g.requestTend(id, "in");
    g.tick();
  }
  assert.equal(g.progress.phase, "secured");
  assert.equal(g.progress.collisions, 0);
  assert.equal(g.requestLine("stern", "release").accepted, true);
  assert.equal(g.progress.phase, "securing");
  assert.equal(g.progress.success, false);
});
