import { test, after } from "node:test";
import assert from "node:assert/strict";
import fuelDockFile from "../stages/fuel-dock/stage.json";
import { boat, STEP, useStage } from "../src/config";
import { catamaranOutline } from "../src/hulls";
import { parseStage, StageError } from "../src/stage/load";
import type { StageFile } from "../src/stage/schema";
import { checkStage } from "../src/stage/check";
import { bundledStages } from "../src/stage/registry";
import { Session } from "../src/session";
after(() => useStage(bundledStages()[0]));
const calm = { speed: 0, direction: 0, currentX: 0, currentY: 0 };
// The fuel dock with a catamaran and a monohull moored in open water west of
// the start, clear of the monohull's route.
const withMoored = () => {
  const data = structuredClone(fuelDockFile) as StageFile;
  data.scene.moored = [
    {
      id: "cat",
      name: "Moored catamaran",
      kind: "catamaran",
      x: -20,
      y: -30,
      heading: 0,
      length: 12.67,
      beam: 7.04,
    },
    {
      id: "mono",
      name: "Moored monohull",
      kind: "monohull",
      x: -20,
      y: -41,
      heading: 90,
      length: 11.5,
      beam: 3.99,
    },
  ];
  return data;
};
const run = (g: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) g.tick();
};
const place = (g: Session, x: number, y: number, vx: number) => {
  Object.assign(g.state, { x, y, heading: 0, vx, vy: 0, yaw: 0 });
  g.previous = { ...g.state };
};
test("a moored catamaran's outline follows the Leopard model's hulls", () => {
  const o = catamaranOutline(boat.length, boat.beam, boat.hullRadius);
  const xs = o.map(([x]) => x),
    ys = o.map(([, y]) => y);
  assert.ok(Math.abs(Math.max(...xs) - boat.beam / 2) < 1e-9);
  assert.ok(Math.abs(Math.min(...xs) + boat.beam / 2) < 1e-9);
  assert.ok(Math.abs(Math.min(...ys) + (boat.length / 2 - 0.25)) < 1e-9);
  assert.ok(Math.abs(Math.max(...ys) - (boat.length / 2 - 0.05)) < 1e-9);
});
test("moored boats load with their outlines and pass the geometry checks", () => {
  const stage = parseStage(withMoored());
  const [cat, mono] = stage.moored;
  assert.equal(cat.kind, "catamaran");
  assert.equal(mono.heading, Math.PI / 2);
  assert.equal(cat.vx + cat.vy + cat.yaw, 0);
  assert.equal(
    cat.reach,
    Math.max(...cat.outline.map(([x, y]) => Math.hypot(x, y))),
  );
  assert.deepEqual(checkStage(stage), { errors: [], warnings: [] });
  // A moored boat shares the contact namespace with structures and traffic.
  const clash = withMoored();
  clash.scene.moored![0].id = "east-quay";
  assert.throws(
    () => parseStage(clash),
    (e: unknown) =>
      e instanceof StageError &&
      /Moored boat east-quay: id is already used/.test(e.message),
  );
});
test("the validator treats moored boats as obstacles", () => {
  const errors = (data: unknown) =>
    checkStage(parseStage(data)).errors.join("\n");
  const onQuay = withMoored();
  Object.assign(onQuay.scene.moored![0], { x: 10, y: 16 });
  assert.match(errors(onQuay), /Moored boat cat: overlaps East quay/);
  const stacked = withMoored();
  Object.assign(stacked.scene.moored![1], { x: -20, y: -36, heading: 0 });
  assert.match(errors(stacked), /Moored boat cat: overlaps Moored monohull/);
  const atStart = withMoored();
  Object.assign(atStart.scene.moored![0], { x: 0, y: -22 });
  assert.match(
    errors(atStart),
    /Start: the boat overlaps a structure or moored boat/,
  );
  // On the monohull's route: the error names the boat, the leg and the time.
  const inTheWay = withMoored();
  Object.assign(inTheWay.scene.moored![0], { x: -33, y: -35 });
  assert.match(
    errors(inTheWay),
    /route passes through a structure or moored boat \(Moored catamaran, on leg 4 of 4 at \d+ s\)/,
  );
});
test("touching a moored boat where no fender covers the hull fails the mission", () => {
  useStage(parseStage(withMoored()));
  const g = new Session(calm);
  // Starboard side drifting onto the catamaran's straight outer side.
  place(g, -20 - 7.04 - 0.35, -30 + 0.12, 0.3);
  run(g, 3);
  assert.equal(g.progress.phase, "failed");
  assert.match(
    g.progress.failure!,
    /^Contact with the moored catamaran on the starboard hull where no fender covered it/,
  );
});
test("fenders that cover the contact point make touching a moored boat safe", () => {
  useStage(parseStage(withMoored()));
  const g = new Session(calm);
  g.requestFenders("starboard");
  run(g, 3.5);
  place(g, -20 - 7.04 - 0.35, -30 + 0.12, 0.1);
  run(g, 5);
  assert.notEqual(g.progress.phase, "failed", g.progress.failure ?? "");
  const touches = g.recorder.events.filter((e) => e.type === "contact");
  assert.ok(touches.length > 0, "the fenders touched the catamaran");
  assert.ok(g.state.x < -20 - 7.04 + 0.01, "held off by the fenders");
});
