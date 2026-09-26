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
  kind: "dock" | "boundary";
};
export const scenario = {
  version: 3,
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
      id: "west-limit",
      name: "West training barrier",
      x: -46,
      y: 0,
      width: 2,
      length: 102,
      kind: "boundary",
    },
    {
      id: "east-limit",
      name: "East training barrier",
      x: 46,
      y: 0,
      width: 2,
      length: 102,
      kind: "boundary",
    },
    {
      id: "south-limit",
      name: "South training barrier",
      x: 0,
      y: -50,
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
export const STEP = 1 / 60;
export const knots = (v: number) => v * 1.943844;
export const metresPerSecond = (kn: number) => kn / 1.943844;
export const degrees = (v: number) => (v * 180) / Math.PI;
export const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
