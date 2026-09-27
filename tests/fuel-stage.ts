// Values of the fuel dock stage's mission that the tests use, read from the
// stage file so the tests follow it.
import { stage } from "../src/config";
const steps = stage.file.mission.steps;
const hold = steps.find((s) => s.kind === "holdInZone")!;
const exit = steps.find((s) => s.kind === "exitThroughGate")!;
const checklist = steps.find((s) => s.kind === "checklist")!;
const keepOut = stage.file.mission.rules.find((r) => r.kind === "keepOut")!;
const shape = stage.zones[hold.kind === "holdInZone" ? hold.zone : ""].shape;
const fuelZone =
  stage.zones[keepOut.kind === "keepOut" ? keepOut.zone : ""].shape;
const timed =
  checklist.kind === "checklist"
    ? checklist.items.find((i) => i.action === "timed")
    : undefined;
if (
  hold.kind !== "holdInZone" ||
  shape.kind !== "circle" ||
  fuelZone.kind !== "rect" ||
  exit.kind !== "exitThroughGate" ||
  keepOut.kind !== "keepOut" ||
  timed?.action !== "timed"
)
  throw new Error("Unexpected fuel dock stage layout");
export const fuel = {
  holding: {
    x: shape.x,
    y: shape.y,
    radius: shape.radius,
    countdown: hold.seconds,
  },
  fuelZone,
  entrance: stage.gates[exit.gate],
  earlyEntryPenalty: keepOut.penalty,
  channelSidePenalty: exit.sidePenalty,
  service: { total: timed.total, rate: timed.rate },
};
