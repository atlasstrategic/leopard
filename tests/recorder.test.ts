import { test } from "node:test";
import assert from "node:assert/strict";
import { boat, STEP, recorderConfig, scenario } from "../src/config";
import { Recorder, recordingCSV, type Episode } from "../src/recorder";
import { coveredFender, initialFenders } from "../src/fenders";
import { resolveContacts, type ContactSample } from "../src/contacts";
import { initialState, initialControls, step } from "../src/simulation";
import { Session } from "../src/session";
const sample = (extra: Partial<ContactSample> = {}): ContactSample => ({
  obstacleId: "quay",
  obstacleName: "Test quay",
  side: "starboard",
  worldX: 7,
  worldY: 0,
  localX: 3.52,
  localY: 0,
  normalX: -1,
  normalY: 0,
  speed: 0.2,
  impulse: 10,
  covered: false,
  fendersDeployed: { port: false, starboard: false },
  hullContact: true,
  compression: 0,
  ...extra,
});
const episodes = (r: Recorder) =>
  r.events
    .filter((e) => e.type === "contact")
    .map((e) => e.data as unknown as Episode);
const calm = { speed: 0, direction: 0, currentX: 0, currentY: 0 };

test("contact reports aggregate all solver impulses per tick, not pass maxima", () => {
  const r = new Recorder(1, {});
  const scored = r.contacts(
    1,
    [sample({ impulse: 10 }), sample({ impulse: 20, speed: 0.4 })],
    STEP,
  );
  const e = episodes(r)[0];
  assert.equal(e.peakTickImpulseNs, 30);
  assert.equal(e.totalNormalImpulseNs, 30);
  assert.equal(e.estimatedPeakLoadN, 1800);
  assert.equal(e.peakSpeed, 0.4);
  assert.equal(scored.penalties, 5);
  assert.equal(scored.collisions, 1);
  r.contacts(1 + STEP, [sample({ impulse: 15 })], STEP);
  assert.equal(e.totalNormalImpulseNs, 45);
  assert.equal(e.peakTickImpulseNs, 30);
  assert.equal(episodes(r).length, 1);
  assert.equal(r.events.filter((e) => e.type === "penalty").length, 1);
});
test("sustained rubbing is one episode, separation permits a new one; different obstacles stay separate", () => {
  const r = new Recorder(1, {});
  for (let i = 1; i <= 600; i++) r.contacts(i * STEP, [sample()]);
  assert.equal(episodes(r).length, 1);
  assert.ok(episodes(r)[0].duration > 9.9);
  r.contacts(10.6, []);
  assert.equal(episodes(r)[0].status, "ended");
  const scored = r.contacts(11, [
    sample(),
    sample({ obstacleId: "other", obstacleName: "Other quay" }),
  ]);
  assert.equal(scored.penalties, 10);
  assert.equal(episodes(r).length, 3);
});
test("gentle contact is still logged; later hard contact in that episode gets one penalty", () => {
  const r = new Recorder(1, {});
  assert.equal(r.contacts(0, [sample({ speed: 0.02 })]).penalties, 0);
  assert.equal(episodes(r).length, 1);
  assert.equal(r.contacts(0.1, [sample({ speed: 0.3 })]).penalties, 5);
  assert.equal(r.contacts(0.2, [sample({ speed: 0.5 })]).penalties, 0);
});
test("coverage is local: correct outer side and stations only, not bow/stern/tunnel/gaps", () => {
  const f = initialFenders();
  f.starboard.deployed = true;
  assert.ok(coveredFender(2.8, 0, -1, f));
  assert.equal(coveredFender(-2.8, 0, 1, f), null);
  assert.equal(coveredFender(2.8, 0, 1, f), null);
  assert.equal(coveredFender(2.8, 0, 0, f), null);
  assert.equal(coveredFender(2.8, 5.6, -1, f), null);
  assert.equal(coveredFender(2.8, 1.5, -1, f), null);
  f.port.deployed = true;
  assert.ok(coveredFender(-2.8, -3, 1, f));
});
test("fenders apply bounded cushioning outside hull; bare hull has no contact at same clearance", () => {
  const wall = [
    { id: "wall", x: 5, y: 0, width: 2, length: 30, kind: "dock" as const },
  ];
  const bare = { ...initialState(), x: 0.3, y: 0, vx: 0.2 };
  const protectedState = { ...bare },
    f = initialFenders();
  f.starboard.deployed = true;
  const bareSamples = resolveContacts(bare, boat, wall);
  const covered = resolveContacts(protectedState, boat, wall, f);
  assert.equal(bareSamples.length, 0);
  assert.ok(covered.length > 0);
  assert.ok(covered.every((c) => c.covered && !c.hullContact));
  assert.ok(protectedState.vx < bare.vx);
  assert.ok(protectedState.vx > 0);
  assert.ok(covered.some((c) => c.compression > 0 && c.impulse > 0));
});
test("angular contact speed is measured even with no centre translation; correction is not impulse", () => {
  const wall = [
    { id: "wall", x: 5, y: 0, width: 2, length: 30, kind: "dock" as const },
  ];
  const s = { ...initialState(), x: 0.5, y: 0, yaw: 0.1 };
  const contacts = resolveContacts(s, boat, wall);
  assert.ok(Math.max(...contacts.map((c) => c.speed)) > 0.1);
  const stationary = { ...initialState(), x: 0.5, y: 0 };
  const projection = resolveContacts(stationary, boat, wall);
  assert.ok(projection.length > 0);
  assert.equal(
    projection.reduce((sum, c) => sum + c.impulse, 0),
    0,
  );
});
test("hard impact bottoms out fenders, cannot tunnel, and is not penalty immune", () => {
  const f = initialFenders();
  f.starboard.deployed = true;
  const wall = [
    { id: "wall", x: 5, y: 0, width: 2, length: 30, kind: "dock" as const },
  ];
  const s = { ...initialState(), x: 0.5, y: 0, vx: 2 },
    r = new Recorder(1, {});
  const samples = resolveContacts(s, boat, wall, f);
  assert.ok(samples.some((c) => c.covered && c.hullContact));
  assert.equal(r.contacts(0, samples).penalties, 5);
  assert.ok(episodes(r)[0].bottomedOut);
  for (let i = 0; i < 600; i++)
    step(s, initialControls(), calm, STEP, boat, wall, f);
  assert.ok(s.x < 0.51);
  assert.ok(Number.isFinite(s.heading)); // Tangential momentum can remain; contact must not act as an instant mooring.
  assert.ok(Math.hypot(s.vx, s.vy) < 0.3);
});
test("coverage changes in one episode preserve mixed and bottomed-out evidence", () => {
  const r = new Recorder(1, {});
  r.contacts(0, [sample({ covered: true, hullContact: false })]);
  r.contacts(0.1, [sample({ covered: false })]);
  r.contacts(0.2, [
    sample({ covered: true, hullContact: true, compression: 0.25 }),
  ]);
  const e = episodes(r)[0];
  assert.ok(e.fenderCovered && e.unprotectedContact && e.bottomedOut);
  assert.equal(e.maxCompression, 0.25);
});
test("fender crew takes simulation time, pauses, logs completion, and resets on retry", () => {
  const g = new Session();
  g.requestFenders("port");
  for (let i = 0; i < 60; i++) g.tick();
  assert.equal(g.fenders.port.deployed, false);
  g.paused = true;
  const remaining = g.fenders.port.remaining;
  for (let i = 0; i < 180; i++) g.tick();
  assert.equal(g.fenders.port.remaining, remaining);
  g.paused = false;
  for (let i = 0; i < 120; i++) g.tick();
  assert.equal(g.fenders.port.deployed, true);
  assert.equal(
    g.recorder.events.filter((e) => e.type === "fender.complete").length,
    1,
  );
  g.requestFenders("port");
  assert.equal(g.fenders.port.deployed, true);
  g.retry();
  assert.deepEqual(g.fenders, initialFenders());
  assert.equal(g.history[0].attempt, 1);
  assert.equal(g.recorder.attempt, 2);
  assert.equal(g.history[0].events.at(-1)?.type, "attempt.end");
});
test("fender requests explain pause/busy blocks and stay usable after securing", () => {
  const g = new Session();
  g.paused = true;
  assert.match(g.requestFenders("port").message, /resume/i);
  assert.deepEqual(g.fenders, initialFenders());
  g.paused = false;
  g.progress.success = true;
  const live = g.requestFenders("starboard");
  assert.equal(live.accepted, true);
  assert.equal(g.fenders.starboard.remaining, 3);
  g.retry();
  assert.equal(g.requestFenders("port").accepted, true);
  const remaining = g.fenders.port.remaining;
  assert.equal(g.requestFenders("port").accepted, false);
  assert.equal(g.fenders.port.remaining, remaining);
});
test("recorder captures commands, heading, wind, tuning, SI snapshots and bounded history", () => {
  const g = new Session();
  g.controls.port = 0.4;
  g.controls.rudder = 0.2;
  g.weather.speed = 8;
  g.tuning.engineLag = 2;
  g.state.heading = 0.2;
  for (let i = 0; i < 120; i++) g.tick();
  for (const type of [
    "engines.change",
    "rudder.change",
    "weather.change",
    "tuning.change",
    "heading.change",
  ])
    assert.ok(
      g.recorder.events.some((e) => e.type === type),
      type,
    );
  assert.equal(g.recorder.snapshots.length, 3);
  for (let i = 0; i < 5; i++) g.retry();
  assert.equal(g.history.length, recorderConfig.history);
  assert.equal(g.history[0].attempt, 5);
});
test("exports are detached snapshots; active contacts retained; CSV quotes commas/newlines and formulas", () => {
  const r = new Recorder(1, { scenario });
  r.event(0, "note", '=bad,"quoted"\nline', { value: "test" });
  r.contacts(0, [sample()]);
  const exported = r.export();
  r.contacts(0.1, [sample({ impulse: 99 })]);
  assert.equal(exported.activeContacts[0].totalNormalImpulseNs, 10);
  assert.equal(exported.activeContacts[0].status, "active");
  assert.equal(JSON.parse(JSON.stringify(exported)).schemaVersion, 1);
  const csv = recordingCSV(exported);
  assert.ok(csv.includes("estimatedPeakLoadN"));
  assert.ok(csv.includes('"\'=bad,""quoted""\nline"'));
  assert.ok(csv.includes("telemetry") === false);
  r.finish(1, "retry");
  assert.equal(r.active.size, 0);
});
test("contact reports and fender handling agree at 30/60/144 render Hz", () => {
  const run = (hz: number) => {
    const g = new Session();
    g.weather.speed = 0;
    Object.assign(g.state, { x: 3.3, y: 0, vx: 0.2 });
    g.fenders.starboard.deployed = g.fenders.starboard.target = true;
    for (let i = 0; i < hz * 6; i++) g.clock.advance(1 / hz, () => g.tick());
    return {
      state: g.state,
      progress: g.progress,
      events: g.recorder.export().events,
    };
  };
  assert.deepEqual(run(30), run(60));
  assert.deepEqual(run(144), run(60));
});
test("recording buffers are bounded and report truncation instead of silently growing", () => {
  const r = new Recorder(1, {});
  for (let i = 0; i < recorderConfig.events + 5; i++)
    r.event(i, "test", "test");
  for (let i = 0; i < recorderConfig.snapshots + 5; i++)
    r.sample(i, { value: i });
  assert.equal(r.events.length, recorderConfig.events);
  assert.equal(r.droppedEvents, 6);
  assert.equal(r.snapshots.length, recorderConfig.snapshots);
  assert.equal(r.droppedSnapshots, 5);
});
