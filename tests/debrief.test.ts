import { test } from "node:test";
import assert from "node:assert/strict";
import { boat, missionConfig, scoreConfig, trafficConfig } from "../src/config";
import { debrief, tracks } from "../src/debrief";
import { initialProgress, type Progress } from "../src/scenario";
import { Session } from "../src/session";
const calm = { speed: 0, direction: 0, currentX: 0, currentY: 0 };
const run = (g: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.tick();
};
const completed = (extra: Partial<Progress> = {}): Progress => ({
  ...initialProgress(true),
  phase: "complete",
  elapsed: 250,
  exitedAt: 250,
  channelSide: "starboard",
  ...extra,
});
test("a clean completed run scores 100 with a positive tip", () => {
  const d = debrief(completed());
  assert.equal(d.scored, true);
  assert.equal(d.total, 100);
  assert.equal(d.rating, "Excellent");
  assert.ok(d.categories.every((c) => c.score === 100));
  assert.match(d.tip, /clean run/);
  assert.deepEqual(
    d.categories.map((c) => c.weight),
    [0.4, 0.25, 0.2, 0.15],
  );
});
test("categories use the plan's weights and the tip targets the largest weighted loss", () => {
  const p = completed({
    collisions: 1,
    channelSide: "port",
    elapsed: 450,
    exitedAt: 450,
  });
  p.metrics.fendersAtArrival = false;
  const d = debrief(p);
  const score = Object.fromEntries(d.categories.map((c) => [c.key, c.score]));
  assert.deepEqual(score, {
    impact: 75,
    control: 70,
    procedure: 70,
    smoothness: 82,
  });
  // 0.4·75 + 0.25·70 + 0.2·70 + 0.15·82 = 73.8
  assert.equal(d.total, 74);
  assert.equal(d.rating, "Fair");
  assert.match(d.tip, /penalised contact/);
});
test("arrival speed, monohull clearance and lever changes deduct proportionally", () => {
  const c = scoreConfig;
  const p = completed();
  p.metrics.arrivalPeakSpeed =
    (c.control.arrivalGood + c.control.arrivalPoor) / 2;
  p.metrics.closestMonohull = c.impact.monohullClearance / 2;
  p.metrics.leverChanges = c.smoothness.leverPar + 20;
  const d = debrief(p);
  const score = Object.fromEntries(d.categories.map((c) => [c.key, c.score]));
  assert.equal(score.control, 100 - c.control.arrivalDeduction / 2);
  assert.equal(score.impact, 100 - c.impact.monohullDeduction / 2);
  assert.equal(score.smoothness, 100 - 20 * (1 - c.smoothness.timeShare));
  assert.match(d.tip, /Brake earlier/);
});
test("a failed mission is not scored and explains the failure", () => {
  const p: Progress = {
    ...initialProgress(true),
    phase: "failed",
    failure:
      "Contact with the monohull on the port hull where no fender covered it",
  };
  const d = debrief(p);
  assert.equal(d.scored, false);
  assert.equal(d.total, null);
  assert.match(d.rating, /not scored/);
  assert.match(d.tip, /port hull where no fender/);
});
test("penalty reasons come from the log; tracks come from telemetry", () => {
  const events = [
    {
      sequence: 1,
      time: 10,
      phase: "holding",
      type: "radio",
      message: "x",
      data: {},
    },
    {
      sequence: 2,
      time: 20,
      phase: "holding",
      type: "mission.early_entry",
      message: "Early +10s",
      data: {},
    },
    {
      sequence: 3,
      time: 30,
      phase: "approach",
      type: "penalty",
      message: "Quay +5s",
      data: {},
    },
  ];
  const d = debrief(completed(), events);
  assert.deepEqual(d.penalties, [
    { time: 20, message: "Early +10s" },
    { time: 30, message: "Quay +5s" },
  ]);
  const t = tracks([
    {
      data: {
        state: { x: 0, y: -22 },
        traffic: { x: 4, y: 16, status: "moored" },
      },
    },
    {
      data: {
        state: { x: 1, y: -21 },
        traffic: { x: 4, y: 15, status: "departing" },
      },
    },
    { data: { state: { x: 2, y: -20 }, traffic: null } },
  ]);
  assert.deepEqual(t.boat, [
    [0, -22],
    [1, -21],
    [2, -20],
  ]);
  assert.deepEqual(t.monohull, [[4, 15]]);
});
test("the session records debrief metrics and retry clears them", () => {
  const g = new Session(calm);
  g.controls.port = 0.2;
  g.observe();
  g.controls.port = 0;
  g.observe();
  assert.equal(g.progress.metrics.leverChanges, 2);
  g.requestLine("bow", "attach");
  g.requestService("enginesOff");
  assert.equal(g.progress.metrics.lineRefusals, 1);
  assert.equal(g.progress.metrics.serviceRefusals, 1);
  // Beside the moored monohull: closest hull-to-hull gap is tracked.
  Object.assign(g.state, {
    x:
      trafficConfig.monohull.start.x -
      trafficConfig.monohull.beam / 2 -
      boat.beam / 2 -
      2,
    y: trafficConfig.monohull.start.y,
  });
  g.previous = { ...g.state };
  run(g, 0.5);
  assert.ok(Math.abs(g.progress.metrics.closestMonohull! - 2) < 0.1);
  // Holding: leaving during the countdown is counted.
  Object.assign(g.state, {
    x: missionConfig.holding.x,
    y: missionConfig.holding.y,
  });
  g.previous = { ...g.state };
  run(g, 1);
  Object.assign(g.state, { x: 0, y: -22 });
  g.previous = { ...g.state };
  run(g, 0.5);
  assert.equal(g.progress.metrics.countdownResets, 1);
  g.retry();
  assert.deepEqual(g.progress.metrics, initialProgress(true).metrics);
});
test("arrival speed and fender readiness are recorded on the way into the berth", () => {
  const g = new Session(calm, { mission: false });
  g.fenders.starboard.deployed = g.fenders.starboard.target = true;
  Object.assign(g.state, { x: 0, y: 8, vy: 0.4 });
  g.previous = { ...g.state };
  run(g, 1);
  assert.ok(g.progress.metrics.arrivalPeakSpeed! > 0.3);
  Object.assign(g.state, { x: 0, y: 16, vx: 0, vy: 0, yaw: 0, heading: 0 });
  g.previous = { ...g.state };
  run(g, 3.5);
  assert.equal(g.progress.phase, "securing");
  assert.equal(g.progress.metrics.fendersAtArrival, true);
});
