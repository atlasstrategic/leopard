import { test } from "node:test";
import assert from "node:assert/strict";
import { boat, missionConfig, STEP, trafficConfig } from "../src/config";
import { Session } from "../src/session";
import { PracticeLab } from "../src/demonstration";
const calm = { speed: 0, direction: 0, currentX: 0, currentY: 0 };
const mono = trafficConfig.monohull;
const run = (g: Session, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.tick();
};
const place = (g: Session, x: number, y: number, vx = 0) => {
  Object.assign(g.state, { x, y, vx, vy: 0, yaw: 0 });
  g.previous = { ...g.state };
};
const hold = (g: Session) =>
  place(g, missionConfig.holding.x, missionConfig.holding.y);
const types = (g: Session) => g.recorder.events.map((e) => e.type);
test("attempt starts holding with a radio briefing; Show me starts at the approach", () => {
  const g = new Session(calm);
  assert.equal(g.progress.phase, "holding");
  assert.equal(g.recorder.phase, "holding");
  assert.match(g.radio[0].message, /holding area/);
  assert.ok(types(g).includes("radio"));
  const lab = new PracticeLab(g);
  lab.showMe();
  assert.equal(lab.active.progress.phase, "approach");
  assert.equal(lab.active.radio.length, 0);
});
test("countdown runs only inside the holding area and restarts if the boat leaves", () => {
  const g = new Session(calm);
  run(g, 10);
  assert.equal(g.progress.countdown, null);
  hold(g);
  run(g, 3);
  assert.ok(Math.abs(g.progress.countdown! - 2) < 2 * STEP);
  place(g, missionConfig.holding.x + missionConfig.holding.radius + 1, -22);
  run(g, 1);
  assert.equal(g.progress.countdown, null);
  assert.ok(types(g).includes("mission.countdown_reset"));
  assert.ok(g.radio.some((m) => /countdown restarts/.test(m.message)));
  hold(g);
  run(g, 4.5);
  assert.equal(g.traffic!.status, "moored", "restarted from the full 5 s");
  run(g, 0.6);
  assert.equal(g.traffic!.status, "departing");
  assert.notEqual(g.progress.monohullDepartedAt, null);
  assert.ok(g.radio.some((m) => /departing/.test(m.message)));
});
test("berth is called clear once the monohull leaves the fuel zone; then the approach begins", () => {
  const g = new Session(calm);
  hold(g);
  run(g, 20);
  assert.equal(g.progress.phase, "holding");
  run(g, 40);
  assert.equal(g.progress.phase, "approach");
  assert.notEqual(g.progress.clearedAt, null);
  assert.notEqual(g.traffic!.status, "gone", "cleared before it has left");
  assert.ok(types(g).includes("mission.approach"));
  assert.match(g.radio.at(-1)!.message, /Fuel berth clear/);
  // Normal approach logic now applies.
  place(g, 0, 16);
  run(g, 3.5);
  assert.equal(g.progress.phase, "securing");
  assert.ok(g.radio.some((m) => /Arrival confirmed/.test(m.message)));
});
test("entering the fuel berth before clearance costs a penalty once per entry", () => {
  const g = new Session(calm);
  const zone = missionConfig.fuelZone;
  place(g, zone.x, zone.y - zone.length / 2 + 1);
  run(g, 1);
  assert.equal(g.progress.earlyEntries, 1);
  assert.equal(g.progress.penalty, missionConfig.earlyEntryPenalty);
  run(g, 2);
  assert.equal(g.progress.earlyEntries, 1, "staying inside is one entry");
  assert.ok(g.radio.some((m) => /not clear/.test(m.message)));
  place(g, 0, -22);
  run(g, 0.5);
  place(g, zone.x, zone.y - zone.length / 2 + 1);
  run(g, 0.5);
  assert.equal(g.progress.earlyEntries, 2);
  assert.equal(g.progress.penalty, 2 * missionConfig.earlyEntryPenalty);
  assert.equal(
    g.recorder.events.filter((e) => e.type === "mission.early_entry").length,
    2,
  );
});
test("line attachment waits for the berth to be called clear", () => {
  const g = new Session(calm);
  const result = g.requestLine("bow", "attach");
  assert.equal(result.accepted, false);
  assert.match(result.message, /called clear/);
});
test("contact with the monohull where no fender covers the hull fails the mission", () => {
  const g = new Session(calm);
  place(
    g,
    mono.start.x - mono.beam / 2 - boat.beam / 2 - 0.3,
    mono.start.y,
    0.3,
  );
  run(g, 3);
  assert.equal(g.progress.phase, "failed");
  assert.match(g.progress.failure!, /starboard hull where no fender/);
  assert.ok(types(g).includes("mission.failed"));
  assert.match(g.radio.at(-1)!.message, /Mission failed/);
  const frozen = { ...g.state },
    elapsed = g.progress.elapsed;
  run(g, 1);
  assert.deepEqual(g.state, frozen, "simulation stops after failure");
  assert.equal(g.progress.elapsed, elapsed);
  assert.equal(g.requestFenders("starboard").accepted, false);
  assert.equal(g.requestLine("bow", "attach").accepted, false);
  g.retry();
  assert.equal(g.progress.phase, "holding");
  assert.equal(g.progress.failure, null);
});
test("fender-covered contact with the monohull is a penalty, not a failure", () => {
  const g = new Session(calm);
  g.fenders.starboard.deployed = g.fenders.starboard.target = true;
  place(
    g,
    mono.start.x - mono.beam / 2 - boat.beam / 2 - 0.3,
    mono.start.y,
    0.2,
  );
  run(g, 5);
  assert.notEqual(g.progress.phase, "failed");
  const contact = g.recorder.events.find(
    (e) => e.type === "contact" && e.data.obstacleId === mono.id,
  )!;
  assert.ok(contact, "contact with the monohull was recorded");
  assert.equal(contact.data.fenderCovered, true);
  assert.equal(g.progress.collisions, 1);
});
