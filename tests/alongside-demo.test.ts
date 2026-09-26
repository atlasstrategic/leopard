import { test } from "node:test";
import assert from "node:assert/strict";
import { Session } from "../src/session";
import { PracticeLab } from "../src/demonstration";
import {
  requirements,
  contactAcceptable,
  positioningTarget,
} from "../src/scenario";
import { scenario, mooringConfig, STEP, boat } from "../src/config";
import { lineIds, lineGeometry } from "../src/mooring";
import { advanceTending } from "../src/tending";
import { resolveContacts, type ContactSample } from "../src/contacts";
function alongside(x = 2.5, y = 16) {
  const g = new Session(
    { speed: 0, direction: 0, currentX: 0, currentY: 0 },
    { traffic: false },
  );
  Object.assign(g.state, { x, y });
  g.progress.phase = "securing";
  g.fenders.starboard.deployed = g.fenders.starboard.target = true;
  return g;
}
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const contact = (extra: Partial<ContactSample> = {}): ContactSample => ({
  obstacleId: "east-quay",
  obstacleName: "East quay",
  side: "starboard",
  worldX: 7,
  worldY: 16,
  localX: 3.52,
  localY: 0,
  normalX: -1,
  normalY: 0,
  speed: 0.03,
  impulse: 5,
  covered: true,
  fendersDeployed: { port: false, starboard: true },
  hullContact: false,
  compression: 0.02,
  ...extra,
});
test("first line switches the target immediately without moving the boat; release keeps the alongside target", () => {
  const g = alongside(0),
    before = { ...g.state };
  assert.equal(g.progress.positionTarget, "approach");
  assert.ok(g.requestLine("stern", "attach").accepted);
  assert.deepEqual(g.state, before);
  assert.equal(g.progress.positionTarget, "alongside");
  assert.deepEqual(
    positioningTarget(g.progress.positionTarget),
    scenario.alongside,
  );
  g.requestLine("stern", "release");
  assert.equal(g.progress.positionTarget, "alongside");
  g.retry();
  assert.equal(g.progress.positionTarget, "approach");
});
test("screenshot regression: sensible alongside position outside old centre tolerance can secure", () => {
  const g = alongside(3.2, 14);
  assert.equal(requirements(g.state).position, false);
  for (const id of lineIds) assert.ok(g.requestLine(id, "attach").accepted);
  for (let i = 0; i < 180; i++) g.tick();
  assert.equal(g.progress.phase, "secured");
  assert.ok(requirements(g.state, "alongside").position);
});
test("alongside envelope still rejects the wrong place, bad heading, speed and yaw", () => {
  const s = alongside().state;
  for (const state of [
    { ...s, x: 8 },
    { ...s, x: -3 },
    { ...s, y: 34 },
  ])
    assert.equal(requirements(state, "alongside").position, false);
  assert.equal(
    requirements({ ...s, heading: 0.2 }, "alongside").heading,
    false,
  );
  assert.equal(requirements({ ...s, vx: 0.19 }, "alongside").speed, false);
  assert.equal(requirements({ ...s, yaw: 0.03 }, "alongside").speed, false);
});
test("only gentle, covered, non-bottomed contact on the correct quay is allowed", () => {
  const g = alongside();
  g.state.contact = true;
  assert.equal(contactAcceptable(g.state, [contact()]), true);
  for (const c of [
    contact({ covered: false }),
    contact({ hullContact: true }),
    contact({ speed: 0.09 }),
    contact({ obstacleId: "north-quay" }),
  ]) {
    assert.equal(contactAcceptable(g.state, [c]), false);
    assert.equal(contactAcceptable(g.state, [contact(), c]), false);
  }
  assert.equal(contactAcceptable(g.state, []), false);
  assert.equal(requirements(g.state, "approach", true).clear, false);
  assert.equal(requirements(g.state, "alongside", true).clear, true);
});
test("actual fender solver contacts qualify and permit attachment, not just synthetic flags", () => {
  const g = alongside(3.3);
  g.state.vx = 0.03;
  const samples = resolveContacts(g.state, boat, scenario.obstacles, g.fenders);
  assert.ok(samples.length > 0);
  assert.ok(g.state.contact);
  g.acceptableContact = contactAcceptable(g.state, samples);
  assert.ok(g.acceptableContact);
  assert.ok(g.requestLine("bow", "attach").accepted);
  assert.ok(requirements(g.state, "alongside", g.acceptableContact).clear);
});
test("long slack cannot masquerade as effective securing", () => {
  const g = alongside();
  for (const id of lineIds) g.requestLine(id, "attach");
  g.mooring.bow.restLength += 2;
  assert.equal(g.securingRequirements().lines, false);
  for (let i = 0; i < 240; i++) g.tick();
  assert.equal(g.progress.success, false);
});
test("take in and ease alter only paid-out length gradually, with a bounded task size", () => {
  const g = alongside();
  g.requestLine("bow", "attach");
  const pose = { ...g.state },
    length = g.mooring.bow.restLength;
  assert.ok(g.requestTend("bow", "in").accepted);
  close(g.mooring.bow.restLength, length);
  advanceTending(g.state, g.controls, g.mooring, STEP);
  close(g.mooring.bow.restLength, length - mooringConfig.tending.rate * STEP);
  assert.deepEqual(g.state, pose);
  for (let i = 0; i < 200; i++)
    advanceTending(g.state, g.controls, g.mooring, STEP);
  close(g.mooring.bow.restLength, length - 0.25);
  assert.equal(g.mooring.bow.tending, "idle");
  assert.ok(g.requestTend("bow", "out").accepted);
  for (let i = 0; i < 200; i++)
    advanceTending(g.state, g.controls, g.mooring, STEP);
  close(g.mooring.bow.restLength, length);
  assert.deepEqual(g.state, pose);
});
test("tending rejects unsafe requests and stops if load, speed or engine conditions change", () => {
  const g = alongside();
  assert.equal(g.requestTend("bow", "in").accepted, false);
  g.requestLine("bow", "attach");
  g.mooring.bow.tension = mooringConfig.tending.maxHaulLoad + 1;
  assert.equal(g.requestTend("bow", "in").accepted, false);
  g.mooring.bow.tension = 0;
  assert.ok(g.requestTend("bow", "in").accepted);
  assert.equal(g.requestTend("bow", "out").accepted, false);
  const length = g.mooring.bow.restLength;
  g.controls.port = 0.2;
  const events = advanceTending(g.state, g.controls, g.mooring, STEP);
  assert.equal(events[0].type, "line.tend.blocked");
  close(g.mooring.bow.restLength, length);
  assert.equal(g.mooring.bow.tending, "idle");
  g.controls.port = 0;
  g.state.vx = 0.3;
  assert.equal(g.requestTend("bow", "in").accepted, false);
  g.state.vx = 0;
  g.mooring.bow.tension = mooringConfig.tending.maxEaseLoad + 1;
  assert.equal(g.requestTend("bow", "out").accepted, false);
});
test("crew length limits, Stop, pause and retry cannot leave a runaway adjustment", () => {
  const g = alongside();
  g.requestLine("bow", "attach");
  g.mooring.bow.restLength = mooringConfig.tending.minLength;
  assert.equal(g.requestTend("bow", "in").accepted, false);
  g.mooring.bow.restLength = mooringConfig.tending.maxLength;
  assert.equal(g.requestTend("bow", "out").accepted, false);
  g.mooring.bow.restLength = lineGeometry(g.state, "bow").distance + 0.2;
  g.requestTend("bow", "in");
  g.tick();
  const before = g.mooring.bow.restLength;
  g.paused = true;
  for (let i = 0; i < 60; i++) g.tick();
  close(g.mooring.bow.restLength, before);
  g.paused = false;
  g.requestTend("bow", "stop");
  g.tick();
  close(g.mooring.bow.restLength, before);
  g.requestTend("bow", "out");
  g.retry();
  assert.equal(g.mooring.bow.tending, "idle");
  close(g.mooring.bow.restRate, 0);
});
function runDemo(hz = 60) {
  const lab = new PracticeLab();
  lab.showMe();
  for (let i = 0; i < hz * 190 && !lab.active.paused; i++)
    lab.active.clock.advance(1 / hz, () => lab.tick());
  return lab;
}
test("Show me completes the real approach, alongside, tending and securing objectives with no impacts", () => {
  const lab = runDemo(),
    g = lab.active;
  assert.equal(
    lab.demonstration!.stage,
    "complete",
    lab.demonstration!.failure,
  );
  assert.equal(g.progress.phase, "secured");
  assert.equal(g.progress.collisions, 0);
  assert.ok(g.state.x > 2 && g.state.x < 3.3);
  assert.ok(g.progress.elapsed < 120);
  for (const type of [
    "fender.complete",
    "line.attach",
    "line.tend.command",
    "line.tend.complete",
    "mission.target",
    "mission.secured",
    "demo.complete",
  ])
    assert.ok(
      g.recorder.events.some((e) => e.type === type),
      type,
    );
  assert.ok(
    g.recorder.events.some(
      (e) => e.type === "engines.change" && Number(e.data.port) < 0,
    ),
  );
  assert.equal(g.paused, true);
  const completedPose = { ...g.state };
  g.paused = false; // Even if a caller attempts to resume, terminal lessons cannot drift.
  for (let i = 0; i < 120; i++) lab.tick();
  assert.deepEqual(g.state, completedPose);
});
test("demonstration results match across rendering rates", () => {
  const a = runDemo(30).active,
    b = runDemo(144).active;
  assert.deepEqual(a.state, b.state);
  assert.deepEqual(a.progress, b.progress);
  assert.deepEqual(a.mooring, b.mooring);
});
test("pause, takeover, repeat and return preserve the original attempt including tuning, lines and log history", () => {
  const practice = alongside();
  practice.weather.speed = 7;
  practice.tuning.engineLag = 2;
  practice.requestLine("bow", "attach");
  practice.requestTend("bow", "in");
  practice.controls.port = 0.2;
  const original = {
    state: { ...practice.state },
    controls: { ...practice.controls },
    progress: { ...practice.progress },
    lines: structuredClone(practice.mooring),
    weather: { ...practice.weather },
    tuning: { ...practice.tuning },
    history: structuredClone(practice.history),
  };
  const lab = new PracticeLab(practice);
  lab.showMe();
  for (let i = 0; i < 100; i++) lab.tick();
  const demo = lab.active,
    demoPose = { ...demo.state };
  demo.paused = true;
  for (let i = 0; i < 60; i++) lab.tick();
  assert.deepEqual(demo.state, demoPose);
  lab.takeOver();
  assert.equal(lab.mode, "takeover");
  assert.equal(lab.active, demo);
  assert.equal(demo.paused, true);
  demo.paused = false;
  demo.controls.port = 1;
  lab.tick();
  assert.equal(demo.controls.port, 1);
  lab.showMe();
  assert.notEqual(lab.active, demo);
  close(lab.active.progress.elapsed, 0);
  close(lab.active.weather.speed, 0);
  lab.returnToPractice();
  assert.equal(lab.active, practice);
  assert.equal(practice.paused, true);
  assert.deepEqual(
    {
      state: practice.state,
      controls: practice.controls,
      progress: practice.progress,
      lines: practice.mooring,
      weather: practice.weather,
      tuning: practice.tuning,
      history: practice.history,
    },
    original,
  );
  assert.ok(!practice.recorder.events.some((e) => e.type === "demo.complete"));
});
test("demonstration failure stops rather than teleporting or bypassing checks", () => {
  const lab = new PracticeLab();
  lab.showMe();
  lab.active.progress.elapsed = 181;
  const pose = { ...lab.active.state };
  lab.tick();
  assert.equal(lab.demonstration!.stage, "stopped");
  assert.equal(lab.active.paused, true);
  assert.deepEqual(lab.active.state, pose);
});
