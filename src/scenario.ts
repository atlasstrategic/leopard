import { angle, boat, scenario, mooringConfig } from "./config";
import { missionSteps, phaseFor } from "./mission";
import type { State } from "./simulation";
import { hullPoints, type ContactSample } from "./contacts";
export type PositionTarget = "approach" | "alongside";
export function contactAcceptable(s: State, samples: ContactSample[]) {
  if (!s.contact) return true;
  return (
    samples.length > 0 &&
    samples.every(
      (c) =>
        c.obstacleId === scenario.alongside.obstacleId &&
        c.covered &&
        !c.hullContact &&
        c.speed <= scenario.alongside.gentleSpeed,
    )
  );
}
export const positioningTarget = (mode: PositionTarget) =>
  mode === "alongside" ? scenario.alongside : scenario.target;
// Smallest gap between the boat's hull and the berth's quay.
export function quayClearance(s: State) {
  const quay = scenario.obstacles.find(
    (b) => b.id === scenario.alongside.obstacleId,
  )!;
  const sn = Math.sin(s.heading),
    cs = Math.cos(s.heading);
  let min = Infinity;
  for (const point of hullPoints(boat)) {
    const x = s.x + point.x * cs + point.y * sn,
      y = s.y - point.x * sn + point.y * cs;
    const qx = Math.max(
        quay.x - quay.width / 2,
        Math.min(quay.x + quay.width / 2, x),
      ),
      qy = Math.max(
        quay.y - quay.length / 2,
        Math.min(quay.y + quay.length / 2, y),
      );
    min = Math.min(min, Math.hypot(x - qx, y - qy) - boat.hullRadius);
  }
  return min;
}
export type Phase =
  | "holding"
  | "approach"
  | "securing"
  | "secured"
  | "departure"
  | "complete"
  | "failed";
export type Progress = {
  elapsed: number;
  phase: Phase;
  positionTarget: PositionTarget;
  arrivalAt: number | null;
  securedAt: number | null;
  dwell: number;
  success: boolean;
  collisions: number;
  penalty: number;
  // Index of the current mission step.
  step: number;
  // Hold step: countdown remaining while inside (null when not counting).
  countdown: number | null;
  // When a hold released its traffic, and when a wait-for-clear completed.
  releasedAt: number | null;
  clearedAt: number | null;
  // Keep-out rules: whether the boat is inside each zone, and entries made.
  insideKeepOut: Record<string, boolean>;
  earlyEntries: number;
  failure: string | null;
  service: Service;
  // Departure: when the boat crossed the entrance gate and on which side.
  exitedAt: number | null;
  channelSide: "starboard" | "port" | null;
  metrics: Metrics;
};
// Recorded during the attempt for the debrief.
export type Metrics = {
  // Hull-to-hull, while traffic is in the harbour.
  closestTraffic: number | null;
  // m/s, near the berth before first securing.
  arrivalPeakSpeed: number | null;
  countdownResets: number;
  fendersAtArrival: boolean | null;
  leverChanges: number;
  serviceRefusals: number;
  lineRefusals: number;
  releasesUnderLoad: number;
  // Shown in the debrief, not scored.
  checkpointRestarts: number;
};
export const initialMetrics = (): Metrics => ({
  closestTraffic: null,
  arrivalPeakSpeed: null,
  countdownResets: 0,
  fendersAtArrival: null,
  leverChanges: 0,
  serviceRefusals: 0,
  lineRefusals: 0,
  releasesUnderLoad: 0,
  checkpointRestarts: 0,
});
// Checklist step state. Items complete in order; engines may be restarted at
// any time for safety, after which they must be switched off again.
export type Service = {
  enginesOff: boolean;
  // Completed choice and confirm items, by id.
  done: string[];
  // Timed item progress and the id of the item running, if any.
  amount: number;
  running: string | null;
  completedAt: number | null;
};
export const initialService = (): Service => ({
  enginesOff: false,
  done: [],
  amount: 0,
  running: null,
  completedAt: null,
});
// The fuel mission starts by waiting for the fuel berth; the docking-only
// practice harbour (Show me) starts at the approach.
export const initialProgress = (mission = false): Progress => ({
  elapsed: 0,
  phase: phaseFor(missionSteps(mission)[0]) ?? "approach",
  positionTarget: "approach",
  arrivalAt: null,
  securedAt: null,
  dwell: 0,
  success: false,
  collisions: 0,
  penalty: 0,
  step: 0,
  countdown: null,
  releasedAt: null,
  clearedAt: null,
  insideKeepOut: {},
  earlyEntries: 0,
  failure: null,
  service: initialService(),
  exitedAt: null,
  channelSide: null,
  metrics: initialMetrics(),
});
export function requirements(
  s: State,
  mode: PositionTarget = "approach",
  acceptableContact = false,
) {
  const t = positioningTarget(mode),
    a = angle(s.heading - t.heading);
  const dx = s.x - t.x,
    dy = s.y - t.y;
  const localX = dx * Math.cos(t.heading) - dy * Math.sin(t.heading);
  const localY = dx * Math.sin(t.heading) + dy * Math.cos(t.heading);
  const extentX =
    (Math.abs(Math.cos(a)) * boat.beam) / 2 +
    (Math.abs(Math.sin(a)) * boat.length) / 2;
  const extentY =
    (Math.abs(Math.sin(a)) * boat.beam) / 2 +
    (Math.abs(Math.cos(a)) * boat.length) / 2;
  return {
    position:
      (mode === "alongside" ||
        Math.hypot(dx, dy) <= scenario.target.positionTolerance) &&
      Math.abs(localX) + extentX <=
        t.width / 2 +
          (mode === "alongside" ? scenario.alongside.boundaryAllowance : 0) &&
      Math.abs(localY) + extentY <= t.length / 2,
    heading: Math.abs(a) <= t.headingTolerance,
    speed: Math.hypot(s.vx, s.vy) <= t.maxSpeed && Math.abs(s.yaw) <= t.maxYaw,
    clear: !s.contact || (mode === "alongside" && acceptableContact),
  };
}
export function updateProgress(
  p: Progress,
  s: State,
  dt: number,
  readyToSecure = false,
  acceptableContact = false,
) {
  p.elapsed += dt;
  // Holding and departure are advanced by the session; complete and failed
  // are terminal.
  if (
    p.phase === "holding" ||
    p.phase === "departure" ||
    p.phase === "complete" ||
    p.phase === "failed"
  )
    return;
  const inBerth = Object.values(
    requirements(s, p.positionTarget, acceptableContact),
  ).every(Boolean);
  if (p.phase === "approach") {
    p.dwell = inBerth ? p.dwell + dt : 0;
    if (p.dwell + 1e-8 >= scenario.target.dwell) {
      p.phase = "securing";
      p.arrivalAt = p.elapsed;
      p.dwell = 0;
    }
    return;
  }
  // Secured is a LIVE state, not a frozen success screen. Losing a prerequisite
  // (including release/break, thrust, position or speed) revokes it immediately.
  if (!inBerth || !readyToSecure || p.positionTarget !== "alongside") {
    p.phase = "securing";
    p.success = false;
    p.dwell = 0;
    return;
  }
  p.dwell = Math.min(mooringConfig.securedDwell, p.dwell + dt);
  if (p.dwell + 1e-8 >= mooringConfig.securedDwell) {
    p.phase = "secured";
    p.success = true;
    p.securedAt ??= p.elapsed;
  }
}
