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
  x: number;
  y: number;
  width: number;
  length: number;
  kind: "dock" | "boundary";
};
export const scenario = {
  version: 1,
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
  wind: { speed: 2, direction: Math.PI / 2 }, // direction blowing TOWARD, not meteorological FROM
  current: { x: 0, y: 0 },
  collisionPenalty: 5,
  obstacles: [
    { x: 12, y: 16, width: 10, length: 42, kind: "dock" },
    { x: -3, y: 34, width: 40, length: 6, kind: "dock" },
    { x: -46, y: 0, width: 2, length: 102, kind: "boundary" },
    { x: 46, y: 0, width: 2, length: 102, kind: "boundary" },
    { x: 0, y: -50, width: 94, length: 2, kind: "boundary" },
    { x: 0, y: 50, width: 94, length: 2, kind: "boundary" },
  ] as Box[],
};
export const STEP = 1 / 60;
export const knots = (v: number) => v * 1.943844;
export const degrees = (v: number) => (v * 180) / Math.PI;
export const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
