import { test, after } from "node:test";
import assert from "node:assert/strict";
import sternToFile from "./fixtures/stern-to.stage.json";
import betweenBoatsFile from "../stages/between-boats/stage.json";
import { mooringConfig, STEP, useStage } from "../src/config";
import { lineIds } from "../src/mooring";
import { parseStage, StageError } from "../src/stage/load";
import type { StageFile } from "../src/stage/schema";
import { berthPose, checkStage } from "../src/stage/check";
import { playtest } from "../src/stage/playtest";
import { bundledStages } from "../src/stage/registry";
import { Session } from "../src/session";
import { objective } from "../src/objective";
after(() => useStage(bundledStages()[0]));
const calm = { speed: 0, direction: 0, currentX: 0, currentY: 0 };
const copy = () => structuredClone(sternToFile) as StageFile;
const run = (g: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) g.tick();
};
const rejects = (data: unknown, pattern: RegExp) =>
  assert.throws(
    () => parseStage(data),
    (e: unknown) => e instanceof StageError && pattern.test(e.message),
  );
// A session at the stern-to berth, arrived and ready to secure. Practice
// (no mission) stays live once secured.
function atBerth(mission = true) {
  const stage = parseStage(copy());
  useStage(stage);
  const g = new Session(calm, { mission });
  const place = (p: { x: number; y: number; heading: number }) => {
    Object.assign(g.state, { x: p.x, y: p.y, heading: p.heading });
    g.previous = { ...g.state };
  };
  place(stage.berth.approach);
  run(g, 3.5);
  assert.equal(g.progress.phase, "securing");
  place(berthPose(stage));
  return g;
}
test("a stern-to berth has quarter lines to the quay and a lazy line", () => {
  const stage = parseStage(copy());
  useStage(stage);
  assert.equal(stage.berth.style, "sternTo");
  assert.deepEqual(lineIds(), ["portQuarter", "starboardQuarter", "lazy"]);
  assert.equal(mooringConfig.lines.portQuarter.bollard, "Q1");
  assert.deepEqual(mooringConfig.lines.lazy.anchor, { x: -18, y: 0 });
  assert.equal(mooringConfig.lines.lazy.kind, "lazy");
  // The fittings: stern cleats on each quarter, the bridle between the bows.
  assert.ok(mooringConfig.lines.starboardQuarter.fairlead.y < -5);
  assert.equal(mooringConfig.lines.lazy.fairlead.x, 0);
  // Alongside berths keep their bow and stern lines.
  useStage(bundledStages()[0]);
  assert.deepEqual(lineIds(), ["bow", "stern"]);
});
test("berth styles are checked against their lines", () => {
  const noLazy = copy();
  delete noLazy.scene.berths[0].lazyLine;
  rejects(noLazy, /Berth slot: a stern-to berth needs a lazyLine/);
  const bowLine = copy();
  bowLine.scene.berths[0].lines.bow = "Q1";
  rejects(bowLine, /Berth slot: a stern-to berth has no bow line/);
  const alongside = copy();
  delete alongside.scene.berths[0].style;
  rejects(alongside, /Berth slot: needs a bow bollard/);
  rejects(alongside, /only a stern-to berth has a lazyLine/);
});
test("the stern-to fixture passes the geometry checks and the playtest", () => {
  const stage = parseStage(copy());
  assert.deepEqual(checkStage(stage), { errors: [], warnings: [] });
  const result = playtest(stage);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.penalty, 0);
});
test("stern-to geometry mistakes are reported", () => {
  const errors = (data: StageFile) =>
    checkStage(parseStage(data)).errors.join("\n");
  const bowIn = copy();
  bowIn.scene.berths[0].approach.heading = 90;
  bowIn.scene.berths[0].alongside.heading = 90;
  assert.match(
    errors(bowIn),
    /Berth \(stern-to\): the heading must point the bow away from the west face/,
  );
  const lazyAstern = copy();
  lazyAstern.scene.berths[0].lazyLine = { x: 4, y: 0 };
  assert.match(
    errors(lazyAstern),
    /lazyLine must lie ahead of the moored boat/,
  );
  const lazyFar = copy();
  lazyFar.scene.berths[0].lazyLine = { x: -48, y: 0 };
  assert.match(errors(lazyFar), /beyond the 40 m the crew can pay out/);
  const farBollard = copy();
  farBollard.scene.bollards[0].y = -12;
  assert.match(errors(farBollard), /portQuarter line to Q1 cannot be attached/);
});
test("securing stern-to needs fenders on both sides, stern lines, then the lazy line", () => {
  const g = atBerth();
  g.requestFenders("starboard");
  run(g, 3.5);
  assert.match(
    g.requestLine("portQuarter", "attach").message,
    /Deploy fenders on both sides/,
  );
  g.requestFenders("port");
  run(g, 3.5);
  assert.match(
    g.requestLine("lazy", "attach").message,
    /Get a stern line on first/,
  );
  assert.ok(g.requestLine("portQuarter", "attach").accepted);
  const lazy = g.requestLine("lazy", "attach");
  assert.ok(lazy.accepted, lazy.message);
  assert.match(lazy.message, /made fast at the bow/);
  assert.ok(g.requestLine("starboardQuarter", "attach").accepted);
  run(g, 4);
  assert.equal(g.progress.phase, "complete");
  const texts = objective(g).checks.map(([, text]) => text);
  assert.ok(!texts.some((t) => /Starboard fenders/.test(t)));
});
test("the lazy line pays out beyond a quay line's length and holds the boat off the quay", () => {
  const g = atBerth(false);
  g.requestFenders("port");
  g.requestFenders("starboard");
  run(g, 3.5);
  for (const id of lineIds()) g.requestLine(id, "attach");
  const line = g.mooring.lazy;
  assert.ok(line.restLength > mooringConfig.tending.maxLength);
  // A breeze from ahead (blowing towards the quay) pushes the boat astern:
  // the lazy line takes the load and holds the stern off the quay.
  g.weather = { speed: 6, direction: Math.PI / 2, currentX: 0, currentY: 0 };
  run(g, 20);
  assert.ok(line.attached && line.tension > 0, "the lazy line is loaded");
  assert.ok(!g.state.contact, "the stern is held off the quay");
  assert.ok(!Object.values(g.mooring).some((l) => l.broken));
});
test("between two boats: a stern-to slot in a row that holds in its crosswind", () => {
  const stage = parseStage(betweenBoatsFile);
  assert.equal(stage.berth.style, "sternTo");
  assert.equal(stage.moored.length, 6);
  assert.deepEqual(checkStage(stage), { errors: [], warnings: [] });
  const result = playtest(stage);
  assert.ok(result.ok, JSON.stringify(result.steps));
  assert.equal(result.penalty, 0);
  // Secured in the stage's own breeze (from the north, across the slot),
  // with the lazy line taken in: it stays put for a minute without touching.
  useStage(stage);
  const g = new Session(
    {
      speed: stage.wind.speed,
      direction: stage.wind.direction,
      currentX: 0,
      currentY: 0,
    },
    { mission: false },
  );
  const place = (p: { x: number; y: number; heading: number }) => {
    Object.assign(g.state, { x: p.x, y: p.y, heading: p.heading });
    g.previous = { ...g.state };
  };
  g.requestFenders("port");
  g.requestFenders("starboard");
  place(stage.berth.approach);
  run(g, 3.5);
  place(berthPose(stage));
  for (const id of lineIds()) assert.ok(g.requestLine(id, "attach").accepted);
  for (let i = 0; i < 6; i++) {
    g.requestTend("lazy", "in");
    run(g, 3);
  }
  run(g, 60);
  assert.equal(g.progress.phase, "secured");
  assert.equal(g.progress.collisions, 0);
  assert.ok(Math.abs(g.state.y) < 0.6, `drifted to y ${g.state.y.toFixed(2)}`);
  assert.ok(lineIds().every((id) => g.mooring[id].tension > 0));
});
test("between two boats: backing in with the levers alone and securing works in the stage's breeze", () => {
  // A crude lever-only autopilot: if it can back into the slot, arrive and
  // secure without touching anything, a player can.
  const stage = parseStage(betweenBoatsFile);
  useStage(stage);
  const g = new Session({
    speed: stage.wind.speed,
    direction: stage.wind.direction,
    currentX: 0,
    currentY: 0,
  });
  g.skipTo("approach");
  g.requestFenders("port");
  g.requestFenders("starboard");
  const west = 1.5 * Math.PI,
    stop = stage.berth.approach.x;
  Object.assign(g.state, { x: -20, y: 1, heading: west });
  g.previous = { ...g.state };
  const clamp = (v: number, a: number) => Math.max(-a, Math.min(a, v));
  for (let t = 0; t < 240 && g.progress.phase === "approach"; t += STEP) {
    const s = g.state,
      togo = stop - s.x,
      astern = -(s.vx * Math.sin(s.heading) + s.vy * Math.cos(s.heading));
    // Aim the stern up towards the slot's centre line, then straighten up.
    const heading =
      west + (togo < 5 ? 0 : clamp(0.12 * s.y + 0.25 * s.vy, 0.25));
    const turn = clamp(
      1.2 *
        Math.atan2(
          Math.sin(heading - s.heading),
          Math.cos(heading - s.heading),
        ) -
        3 * s.yaw,
      0.6,
    );
    const thrust = clamp(-(clamp(togo * 0.06, 0.3) - astern) * 2.5, 0.8);
    g.controls.port = clamp(thrust + turn / 2, 1);
    g.controls.starboard = clamp(thrust - turn / 2, 1);
    g.tick();
  }
  assert.equal(g.progress.phase, "securing", "arrived in the slot");
  g.controls.port = g.controls.starboard = 0;
  run(g, 2);
  for (const id of lineIds()) {
    const result = g.requestLine(id, "attach");
    assert.ok(result.accepted, result.message);
  }
  for (let i = 0; i < 6; i++) {
    g.requestTend("lazy", "in");
    run(g, 3);
  }
  run(g, 5);
  assert.equal(g.progress.phase, "complete");
  assert.equal(g.progress.collisions, 0);
  assert.equal(g.progress.penalty, 0);
});
