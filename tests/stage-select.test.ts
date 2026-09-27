import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import westQuay from "./fixtures/west-quay.stage.json";
import { parseStage } from "../src/stage/load";
import { bundledStages } from "../src/stage/registry";
import { chooseStage } from "../src/stage/select";
import {
  mooringConfig,
  scenario,
  stage,
  trafficConfig,
  useStage,
} from "../src/config";
import { lineIds } from "../src/mooring";
import { Session } from "../src/session";
import { debrief } from "../src/debrief";
import { objective } from "../src/objective";
import { showMeAvailable } from "../src/demonstration";
const calm = { speed: 0, direction: 0, currentX: 0, currentY: 0 };
const run = (g: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.tick();
};
const fuelDock = bundledStages()[0];
after(() => useStage(fuelDock));
test("every stage folder is bundled, and the first is the default", () => {
  const folders = readdirSync(new URL("../stages/", import.meta.url), {
    withFileTypes: true,
  })
    .filter(
      (d) =>
        d.isDirectory() &&
        existsSync(new URL(`../stages/${d.name}/stage.json`, import.meta.url)),
    )
    .map((d) => d.name)
    .sort();
  assert.deepEqual(
    bundledStages()
      .map((s) => s.id)
      .sort(),
    folders,
  );
  assert.equal(stage.id, "fuel-dock");
});
test("the URL chooses a bundled stage; unknown ids fall back with a notice", () => {
  assert.equal(chooseStage("").stage.id, "fuel-dock");
  assert.equal(chooseStage("?stage=fuel-dock").notice, "");
  const unknown = chooseStage("?stage=nowhere");
  assert.equal(unknown.stage.id, "fuel-dock");
  assert.match(unknown.notice, /Unknown stage "nowhere"/);
});
test("a loaded stage file is read from session storage and validated", () => {
  const store = new Map<string, string>();
  Object.assign(globalThis, {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
  });
  assert.match(chooseStage("?stage=file").notice, /no longer available/);
  store.set("leopard.stageFile", JSON.stringify(westQuay));
  assert.equal(chooseStage("?stage=file").stage.id, "west-quay");
  store.set("leopard.stageFile", "{ not json");
  assert.match(chooseStage("?stage=file").notice, /Not valid JSON/);
  store.set("leopard.stageFile", JSON.stringify({ ...westQuay, traffic: 3 }));
  const bad = chooseStage("?stage=file");
  assert.equal(bad.stage.id, "fuel-dock");
  assert.match(bad.notice, /Stage "west-quay" is invalid/);
});
test("another stage runs end to end with nothing left over from the fuel dock", () => {
  useStage(parseStage(westQuay));
  assert.equal(scenario.name, "Test · West quay");
  assert.equal(trafficConfig.monohull, undefined);
  assert.equal(mooringConfig.lines.bow.bollard, "W1");
  assert.equal(stage.berth.face, "east");
  assert.equal(showMeAvailable(), false);
  const g = new Session(calm);
  assert.equal(g.traffic, null);
  assert.deepEqual(g.state.x, 0);
  assert.equal(g.state.heading, Math.PI);
  assert.equal(g.progress.phase, "approach");
  assert.equal(g.radio[0].message, "Proceed to the west berth.");
  assert.equal(objective(g).eyebrow, "01 / APPROACH");
  // Hold the bow-south approach target.
  Object.assign(g.state, { x: 0, y: 0, heading: Math.PI });
  g.previous = { ...g.state };
  run(g, 3.5);
  assert.equal(g.progress.phase, "securing");
  assert.equal(g.radio.at(-1)!.message, "Arrival confirmed.");
  // Alongside the east face of the west quay, starboard side to.
  Object.assign(g.state, { x: -2.5, y: 0, vx: 0, vy: 0, yaw: 0 });
  g.previous = { ...g.state };
  g.fenders.starboard.deployed = g.fenders.starboard.target = true;
  for (const id of lineIds()) {
    const result = g.requestLine(id, "attach");
    assert.equal(result.accepted, true, result.message);
  }
  run(g, 13);
  // Securing is the last step here, so it completes the mission.
  assert.equal(g.progress.phase, "complete");
  assert.match(
    g.radio.at(-1)!.message,
    /^Moored in .* s with \+0 s penalties\.$/,
  );
  const d = debrief(g.progress, g.recorder.events);
  assert.equal(d.scored, true);
  // No traffic, so no traffic-clearance figure.
  assert.ok(!d.figures.some(([k]) => k.startsWith("Closest")));
  assert.deepEqual(g.sceneMarks(), { zones: [], gate: null });
});
test("the fuel dock is unchanged after switching back", () => {
  useStage(fuelDock);
  const g = new Session(calm);
  assert.equal(g.progress.phase, "holding");
  assert.equal(mooringConfig.lines.bow.bollard, "B01");
  assert.notEqual(g.traffic, null);
  assert.equal(showMeAvailable(), true);
});
