import type { Stage } from "./stage/load";
import { bundledStages } from "./stage/registry";
// SI throughout. x=east, y=north; heading 0=north, positive clockwise.
// Manufacturer September 2024 baseline, NOT verified 2026 equipment.
export const boat = {
  length: 12.67,
  beam: 7.04,
  draft: 1.4,
  mass: 13691,
  engineHp: 45,
  inertia: 225000,
  hullRadius: 0.72,
  engineOffset: 2.8,
  engineAft: -4.5,
  maxThrust: 3000,
  reverseEfficiency: 0.72,
  engineLag: 1.1,
  longitudinalDrag: 850,
  lateralDrag: 12000,
  yawDrag: 110000,
  rudderForce: 1600,
  maxRudder: Math.PI / 6,
  windArea: 38,
  windLever: 1.2,
};
export type Tuning = typeof boat;
export type { Box } from "./stage/load";
// The active stage: harbour layout, conditions, traffic and mission come from
// its stage file (stages/<id>/stage.json); the engine constants stay here.
// These bindings are live: useStage() replaces them. The game calls it once at
// startup, before building the scene; tests call it to run another stage.
export let stage: Stage;
const scenarioFor = (s: Stage) => ({
  version: s.version,
  name: s.name,
  area: s.area,
  start: s.start,
  target: s.berth.approach,
  // Full waterline footprint envelope beside the quay, not a centre-point target.
  alongside: s.berth.alongside,
  wind: s.wind, // direction blowing TOWARD, not meteorological FROM
  current: s.current,
  collisionPenalty: 5,
  obstacles: s.obstacles,
});
export let scenario: ReturnType<typeof scenarioFor>;
// Debrief score from the stage's mission, with engine defaults filled in.
export let scoreConfig: Stage["mission"]["scoring"];
// The stage's scripted traffic vessel, if it has one (the engine supports
// one). It follows its legs, never reacts to impacts itself, and stops rather
// than pushing through the player.
export const trafficConfig: { monohull: Stage["traffic"][number] | undefined } =
  { monohull: undefined };
export function useStage(next: Stage) {
  stage = next;
  scenario = scenarioFor(next);
  scoreConfig = next.mission.scoring;
  trafficConfig.monohull = next.traffic[0];
  mooringConfig.lines = Object.fromEntries(
    Object.entries(next.berth.lines).map(([id, line]) => [
      id,
      { ...line, fairlead: fittings[id as keyof typeof fittings] },
    ]),
  );
}
// Provisional game equipment and logging limits, not measured hardware specifications.
export const fenderConfig = {
  positions: [-3, 0, 3],
  halfCoverage: 0.8,
  thickness: 0.25,
  stiffness: 18000,
  damping: 3500,
  maxForce: 6000,
  crewSeconds: 3,
  // The roving fender: seconds for the crew to move it, and how far from its
  // hull corner (the end contact circle's centre) it covers.
  rovingSeconds: 2,
  rovingCoverage: 0.8,
};
// Where each line leaves the boat (x starboard, y forward, metres): the
// starboard bow and stern fairleads used alongside, the stern cleats on each
// quarter used stern-to, and the lazy line's bridle between the bows.
// Fictional fittings, not measured from a real Leopard 42.
export const fittings = {
  bow: { x: 3.3, y: 4.6 },
  stern: { x: 3.3, y: -4.6 },
  portQuarter: { x: -3.3, y: -6.0 },
  starboardQuarter: { x: 3.3, y: -6.0 },
  lazy: { x: 0, y: 6.0 },
};
export type LineDef = Stage["berth"]["lines"][string] & {
  fairlead: { x: number; y: number };
};
// Fictional quay bollards and boat fittings. Planar line-throwing reach,
// not a claim about crew arm reach, real deck fittings or rope safe working load.
export const mooringConfig = {
  reach: 6.5,
  maxPointSpeed: 0.25,
  maxYaw: 0.025,
  slack: 0.2,
  stiffness: 9000,
  damping: 9000,
  warningLoad: 7000,
  breakLoad: 16000,
  breakDelay: 0.4,
  securedDwell: 3,
  maxSecuredSlack: 0.45,
  tending: {
    step: 0.25,
    rate: 0.12,
    minLength: 1,
    maxLength: 10,
    // The lazy line runs from the bow to its ground chain well off the quay.
    lazyMaxLength: 40,
    maxHaulLoad: 1800,
    maxEaseLoad: 6500,
    maxPointSpeed: 0.25,
  },
  // The active berth's lines (set by useStage), keyed by line id.
  lines: {} as Record<string, LineDef>,
};
export const recorderConfig = {
  events: 4000,
  snapshots: 7200,
  sampleSeconds: 1,
  separationSeconds: 0.5,
  impactThreshold: 0.08,
  history: 3,
};
export const STEP = 1 / 60;
export const knots = (v: number) => v * 1.943844;
export const metresPerSecond = (kn: number) => kn / 1.943844;
export const degrees = (v: number) => (v * 180) / Math.PI;
export const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
useStage(bundledStages()[0]);
