import { stage } from "./config";
import type { Step } from "./stage/load";
import type { State } from "./simulation";
import type { Phase } from "./scenario";
import type { VesselObstacle } from "./traffic";
import { outlineWorld } from "./hulls";

// Building-block helpers shared by the session, UI and debrief. The stage's
// mission is an ordered list of steps; the coarse phase follows the step kind.
export type ZoneShape = Stage["zones"][string]["shape"];
type Stage = typeof stage;
export type Gate = Stage["gates"][string];

// The docking-only practice harbour (Show me) runs just the berth steps.
export function missionSteps(mission: boolean): Step[] {
  const steps = stage.file.mission.steps;
  return mission
    ? steps
    : steps.filter(
        (s) => s.kind === "arriveAtBerth" || s.kind === "secureAlongside",
      );
}
// Phase set when a step starts; berth steps and checklists keep the phase the
// docking logic gives them.
export function phaseFor(step: Step): Phase | null {
  switch (step.kind) {
    case "holdInZone":
    case "waitForClear":
      return "holding";
    case "arriveAtBerth":
      return "approach";
    case "exitThroughGate":
      return "departure";
    default:
      return null;
  }
}
export const zoneShape = (id: string) => stage.zones[id].shape;
// Boat centre inside a zone.
export function insideZone(shape: ZoneShape, s: { x: number; y: number }) {
  return shape.kind === "circle"
    ? Math.hypot(s.x - shape.x, s.y - shape.y) <= shape.radius
    : Math.abs(s.x - shape.x) <= shape.width / 2 &&
        Math.abs(s.y - shape.y) <= shape.length / 2;
}
// Any part of a vessel's outline (by bounding box) inside a rectangle zone.
export function vesselInZone(v: VesselObstacle, shape: ZoneShape) {
  if (shape.kind !== "rect") return false;
  const points = outlineWorld(v),
    xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  return (
    Math.max(...xs) > shape.x - shape.width / 2 &&
    Math.min(...xs) < shape.x + shape.width / 2 &&
    Math.max(...ys) > shape.y - shape.length / 2 &&
    Math.min(...ys) < shape.y + shape.length / 2
  );
}
// Outward crossing of a gate line between its lights, and which half of the
// channel it was in, relative to a boat leaving (starboard = the red side
// under IALA A).
export function gateCrossing(gate: Gate, previous: State, s: State) {
  const out = { x: Math.sin(gate.heading), y: Math.cos(gate.heading) },
    starboard = { x: Math.cos(gate.heading), y: -Math.sin(gate.heading) };
  const along = (p: State) => (p.x - gate.x) * out.x + (p.y - gate.y) * out.y;
  if (!(along(previous) < 0 && along(s) >= 0)) return null;
  const across = (s.x - gate.x) * starboard.x + (s.y - gate.y) * starboard.y;
  if (Math.abs(across) > gate.width / 2) return null;
  return across >= 0 ? "starboard" : "port";
}
// Author-given names used mid-sentence: "Holding area" → "holding area",
// "Mark A" → "mark A", "Harbour entrance" → "harbour entrance".
export const midSentence = (name: string) =>
  name.charAt(0).toLowerCase() + name.slice(1);
// Fill {placeholders} in stage texts; unknown ones are left as written.
export const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
