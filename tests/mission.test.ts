import { test } from "node:test";
import assert from "node:assert/strict";
import fuelDock from "../stages/fuel-dock/stage.json";
import { parseStage, StageError } from "../src/stage/load";
import { fill, missionSteps, phaseFor } from "../src/mission";
import { objective } from "../src/objective";
import { Session } from "../src/session";
import { scoreConfig } from "../src/config";
import { fuel } from "./fuel-stage";
const calm = { speed: 0, direction: 0, currentX: 0, currentY: 0 };
const copy = () => structuredClone(fuelDock) as typeof fuelDock;
const rejects = (data: unknown, pattern: RegExp) =>
  assert.throws(
    () => parseStage(data),
    (e: unknown) => e instanceof StageError && pattern.test(e.message),
  );
const run = (g: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.tick();
};
test("the fuel dock mission is a sequence of building-block steps", () => {
  assert.deepEqual(
    missionSteps(true).map((s) => `${s.id}:${s.kind}`),
    [
      "hold:holdInZone",
      "clearance:waitForClear",
      "approach:arriveAtBerth",
      "secure:secureAlongside",
      "service:checklist",
      "departure:exitThroughGate",
    ],
  );
  // The practice harbour runs only the berth steps.
  assert.deepEqual(
    missionSteps(false).map((s) => s.id),
    ["approach", "secure"],
  );
  assert.equal(phaseFor(missionSteps(true)[0]), "holding");
});
test("mission references are checked when a stage loads", () => {
  const zone = copy();
  zone.mission.steps[0].zone = "nowhere";
  rejects(zone, /Step hold: zone "nowhere" does not exist/);
  const vessel = copy();
  vessel.mission.rules[1].vessel = "ferry";
  rejects(vessel, /protectedContact rule: vessel "ferry" does not exist/);
  const until = copy();
  until.mission.rules[0].until = "later";
  rejects(until, /keepOut rule: step "later" does not exist/);
  const order = copy();
  order.mission.steps.splice(2, 1);
  rejects(order, /must directly follow an arriveAtBerth step/);
  const choice = copy();
  delete (choice.mission.steps[4].items![1].options![1] as { refusal?: string })
    .refusal;
  rejects(choice, /needs exactly one option without a refusal/);
  const circle = copy();
  circle.mission.steps[1].zone = "holding";
  rejects(circle, /must be a rectangle/);
});
test("scoring from the stage is merged with the engine defaults", () => {
  assert.equal(scoreConfig.weights.impact, 0.4);
  assert.equal(scoreConfig.control.arrivalRadius, 12);
  assert.match(scoreConfig.tips.earlyEntries, /fuel berth/);
  assert.match(scoreConfig.tips.clean, /clean run/);
  assert.equal(scoreConfig.ratings[0].label, "Excellent");
});
test("texts fill their placeholders and leave unknown ones alone", () => {
  assert.equal(
    fill("+{penalty} s in {time} s {unknown}", { penalty: 5, time: "9.0" }),
    "+5 s in 9.0 s {unknown}",
  );
});
test("the objective panel follows the current step", () => {
  const g = new Session(calm);
  let o = objective(g);
  assert.equal(o.eyebrow, "01 / HOLD");
  assert.equal(o.title, "Wait for the fuel berth.");
  assert.match(o.result, /Countdown starts inside the holding area/);
  Object.assign(g.state, { x: fuel.holding.x, y: fuel.holding.y });
  g.previous = { ...g.state };
  run(g, 2);
  o = objective(g);
  assert.match(o.result, /Monohull departs in 3\.0 s/);
  assert.ok(o.checks[0][0], "inside the holding area");
  g.skipTo("approach");
  assert.equal(objective(g).eyebrow, "02 / APPROACH");
  g.skipTo("service");
  o = objective(g);
  assert.equal(o.eyebrow, "04 / SECURED · FUEL SERVICE");
  g.skipTo("departure");
  assert.equal(objective(g).eyebrow, "05 / DEPART");
  assert.match(objective(g).checks[2][1], /starboard side of the channel/);
});
test("the practice harbour numbers its berth steps and stays live once secured", () => {
  const g = new Session(calm, { mission: false });
  assert.equal(objective(g).eyebrow, "01 / APPROACH");
  g.progress.phase = "secured";
  g.progress.securedAt = 1;
  const o = objective(g);
  assert.equal(o.eyebrow, "03 / SECURED · LIVE");
  assert.equal(o.title, "Lines on. Stay attentive.");
  assert.equal(g.radio.length, 0, "no radio in the practice harbour");
});
test("skipTo jumps to a step as if the earlier ones were done", () => {
  const g = new Session(calm);
  g.skipTo("approach");
  assert.equal(g.step!.id, "approach");
  assert.equal(g.progress.phase, "approach");
  assert.equal(g.traffic!.status, "gone");
  assert.notEqual(g.progress.clearedAt, null);
  assert.throws(() => g.skipTo("nowhere"), /No step "nowhere"/);
});
