import fuelDock from "../stages/fuel-dock/stage.json";
import { parseStage } from "./stage/load";
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
// The active stage: harbour layout, conditions and traffic come from its
// stage file (stages/<id>/stage.json); the engine constants below stay here.
export const stage = parseStage(fuelDock);
const zone = (id: string) => {
  const found = stage.zones[id];
  if (!found) throw new Error(`Stage ${stage.id} needs a "${id}" zone`);
  return found.shape;
};
const gate = (id: string) => {
  const found = stage.gates[id];
  if (!found) throw new Error(`Stage ${stage.id} needs a "${id}" gate`);
  return found;
};
export const scenario = {
  version: stage.version,
  name: stage.name,
  area: stage.area,
  start: stage.start,
  target: stage.berth.approach,
  // Full waterline footprint envelope beside the quay, not a centre-point target.
  alongside: stage.berth.alongside,
  wind: stage.wind, // direction blowing TOWARD, not meteorological FROM
  current: stage.current,
  collisionPenalty: 5,
  obstacles: stage.obstacles,
};
// Provisional game equipment and logging limits, not measured hardware specifications.
export const fenderConfig = {
  positions: [-3, 0, 3],
  halfCoverage: 0.8,
  thickness: 0.25,
  stiffness: 18000,
  damping: 3500,
  maxForce: 6000,
  crewSeconds: 3,
};
// Fictional quay bollards and starboard fairleads. Planar line-throwing reach,
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
    maxHaulLoad: 1800,
    maxEaseLoad: 6500,
    maxPointSpeed: 0.25,
  },
  // Bollards come from the stage's berth; fairleads are fittings on the boat.
  lines: {
    bow: {
      name: "Bow",
      ...stage.berth.lines.bow,
      fairlead: { x: 3.3, y: 4.6 },
    },
    stern: {
      name: "Stern",
      ...stage.berth.lines.stern,
      fairlead: { x: 3.3, y: -4.6 },
    },
  },
};
export const recorderConfig = {
  events: 4000,
  snapshots: 7200,
  sampleSeconds: 1,
  separationSeconds: 0.5,
  impactThreshold: 0.08,
  history: 3,
};
// Fuel mission before the approach: wait in the holding area, then enter the
// fuel berth only once it is called clear.
export const missionConfig = {
  // Boat centre must stay inside the stage's "holding" circle.
  holding: {
    ...(zone("holding") as { x: number; y: number; radius: number }),
    countdown: 5,
  },
  // The stage's "fuel-berth" zone: the berth and its approach lane.
  fuelZone: zone("fuel-berth") as {
    x: number;
    y: number;
    width: number;
    length: number;
  },
  earlyEntryPenalty: 10,
  entrance: gate("entrance"),
  // Crossing the gate line in the port half of the channel on the way out.
  channelSidePenalty: 5,
  // Accelerated, fictional fuel service: not real quantities or procedures.
  service: { fuelType: "diesel", litres: 180, litresPerSecond: 20 },
};
// Debrief score: the plan's weighting, with provisional thresholds to tune in
// playtesting. Each category scores 0–100 before weighting.
export const scoreConfig = {
  weights: { impact: 0.4, control: 0.25, procedure: 0.2, smoothness: 0.15 },
  impact: {
    perContact: 25,
    // Hull-to-hull clearance to the monohull below which points are lost.
    monohullClearance: 3,
    monohullDeduction: 30,
  },
  control: {
    // Peak speed within arrivalRadius of the berth before first securing.
    arrivalRadius: 12,
    arrivalGood: 0.3,
    arrivalPoor: 0.8,
    arrivalDeduction: 50,
    perCountdownReset: 10,
    perEarlyEntry: 25,
    portSide: 30,
  },
  procedure: {
    fendersLate: 30,
    perServiceRefusal: 10,
    perLineRefusal: 5,
    perReleaseUnderLoad: 10,
  },
  smoothness: {
    parTime: 300,
    slowTime: 600,
    slowTimeScore: 40,
    leverPar: 60,
    timeShare: 0.6,
  },
  ratings: [
    [90, "Excellent"],
    [75, "Good"],
    [60, "Fair"],
    [0, "Needs practice"],
  ] as [number, string][],
};
// Scripted, kinematic harbour traffic. It follows its legs, never reacts to
// impacts itself, and stops rather than pushing through the player.
export const trafficConfig = {
  monohull: (() => {
    const v = stage.traffic.find((t) => t.id === "monohull");
    if (!v) throw new Error(`Stage ${stage.id} needs a "monohull" vessel`);
    return v;
  })(),
};
export const STEP = 1 / 60;
export const knots = (v: number) => v * 1.943844;
export const metresPerSecond = (kn: number) => kn / 1.943844;
export const degrees = (v: number) => (v * 180) / Math.PI;
export const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
