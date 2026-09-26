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
export type Box = {
  id?: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  length: number;
  kind: "dock" | "breakwater" | "boundary";
};
// Harbour entrance: a gap in the south breakwater, red light at its west end
// and green at its east end (IALA region A, entering northbound). The gate
// line runs across the gap at the breakwater's centre line.
const entrance = { x: -30, y: -50, width: 18, breakwater: 3 };
export const scenario = {
  version: 6,
  name: "North quay · Berth 01",
  area: "Fictional training area",
  start: { x: 0, y: -22, heading: 0 },
  target: {
    x: 0,
    y: 16,
    heading: 0,
    width: 10,
    length: 17,
    positionTolerance: 1.2,
    headingTolerance: (8 * Math.PI) / 180,
    maxSpeed: 0.18,
    maxYaw: 0.025,
    dwell: 3,
  },
  // Full waterline footprint envelope beside the EAST quay, not a centre-point target.
  alongside: {
    x: 2,
    y: 16,
    width: 10,
    length: 20,
    heading: 0,
    headingTolerance: (10 * Math.PI) / 180,
    maxSpeed: 0.18,
    maxYaw: 0.025,
    obstacleId: "east-quay",
    gentleSpeed: 0.08,
    boundaryAllowance: 0.02,
  },
  wind: { speed: 2, direction: Math.PI / 2 }, // direction blowing TOWARD, not meteorological FROM
  current: { x: 0, y: 0 },
  collisionPenalty: 5,
  obstacles: [
    {
      id: "east-quay",
      name: "East quay",
      x: 12,
      y: 16,
      width: 10,
      length: 42,
      kind: "dock",
    },
    {
      id: "north-quay",
      name: "North quay",
      x: -3,
      y: 34,
      width: 40,
      length: 6,
      kind: "dock",
    },
    {
      id: "west-breakwater",
      name: "West breakwater",
      x: (-47 + entrance.x - entrance.width / 2) / 2,
      y: entrance.y,
      width: entrance.x - entrance.width / 2 + 47,
      length: entrance.breakwater,
      kind: "breakwater",
    },
    {
      id: "east-breakwater",
      name: "East breakwater",
      x: (47 + entrance.x + entrance.width / 2) / 2,
      y: entrance.y,
      width: 47 - entrance.x - entrance.width / 2,
      length: entrance.breakwater,
      kind: "breakwater",
    },
    // Training barriers enclose the harbour and the water outside the entrance.
    {
      id: "west-limit",
      name: "West training barrier",
      x: -46,
      y: -13.5,
      width: 2,
      length: 129,
      kind: "boundary",
    },
    {
      id: "east-limit",
      name: "East training barrier",
      x: 46,
      y: -13.5,
      width: 2,
      length: 129,
      kind: "boundary",
    },
    {
      id: "south-limit",
      name: "South training barrier",
      x: 0,
      y: -77,
      width: 94,
      length: 2,
      kind: "boundary",
    },
    {
      id: "north-limit",
      name: "North training barrier",
      x: 0,
      y: 50,
      width: 94,
      length: 2,
      kind: "boundary",
    },
  ] as Box[],
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
  lines: {
    bow: {
      name: "Bow",
      bollard: "B01",
      obstacleId: "east-quay",
      anchor: { x: 7.7, y: 23 },
      fairlead: { x: 3.3, y: 4.6 },
    },
    stern: {
      name: "Stern",
      bollard: "B02",
      obstacleId: "east-quay",
      anchor: { x: 7.7, y: 9 },
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
  // Boat centre must stay inside; clear of the monohull's south-west exit.
  holding: { x: 20, y: -22, radius: 8, countdown: 5 },
  // Fuel berth and its approach lane (x -4..7, y -10..37).
  fuelZone: { x: 1.5, y: 13.5, width: 11, length: 47 },
  earlyEntryPenalty: 10,
  entrance,
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
  monohull: {
    id: "monohull",
    name: "Monohull",
    length: 12,
    beam: 3.9,
    // Alongside the east quay at the fuel berth, bow north.
    start: { x: 4.5, y: 16, heading: 0 },
    cruiseSpeed: 1,
    accel: 0.15,
    brake: 0.4,
    turnRadius: 8,
    pivotYaw: 0.03,
    maxYaw: 0.12,
    arriveRadius: 3,
    lookAhead: 6,
    lateralClearance: 1,
    legs: [
      // Back off the quay; the bow swings in as the stern opens, as with a bow spring.
      { gear: "astern", x: 3.2, y: 2, stop: true },
      { gear: "ahead", x: -12, y: 6, stop: false },
      // Out through the entrance on the starboard (west) side of the channel.
      { gear: "ahead", x: -33, y: -8, stop: false },
      { gear: "ahead", x: -33, y: -64, stop: false },
    ] as { gear: "ahead" | "astern"; x: number; y: number; stop: boolean }[],
  },
};
export const STEP = 1 / 60;
export const knots = (v: number) => v * 1.943844;
export const metresPerSecond = (kn: number) => kn / 1.943844;
export const degrees = (v: number) => (v * 180) / Math.PI;
export const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
