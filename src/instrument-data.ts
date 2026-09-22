import { angle, degrees, knots } from "./config";
import type { State, Weather } from "./simulation";

export type WindMode = "apparent" | "true";
export const wrap = (radians: number) =>
  ((radians % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
export const bearingText = (radians: number | null) =>
  radians === null
    ? "—"
    : `${(Math.round(degrees(wrap(radians))) % 360).toString().padStart(3, "0")}° T`;

// Display deadbands: don't invent a direction for still air, a stopped boat,
// or a destination already reached. These do not change simulation state.
export const instrumentThresholds = {
  wind: 0.05,
  course: 0.15,
  bearingDistance: 0.25,
};
export function instrumentData(
  s: State,
  w: Weather,
  target: { x: number; y: number },
) {
  const airX = Math.sin(w.direction) * w.speed,
    airY = Math.cos(w.direction) * w.speed;
  const wind = (vx: number, vy: number) => {
    const speed = Math.hypot(vx, vy);
    const from =
      speed >= instrumentThresholds.wind ? wrap(Math.atan2(-vx, -vy)) : null;
    return {
      speed: knots(speed),
      from,
      relative: from === null ? null : angle(from - s.heading),
    };
  };
  const speed = Math.hypot(s.vx, s.vy);
  const dx = target.x - s.x,
    dy = target.y - s.y;
  return {
    heading: wrap(s.heading),
    speed: knots(speed),
    course:
      speed >= instrumentThresholds.course
        ? wrap(Math.atan2(s.vx, s.vy))
        : null,
    bearing:
      Math.hypot(dx, dy) >= instrumentThresholds.bearingDistance
        ? wrap(Math.atan2(dx, dy))
        : null,
    distance: Math.hypot(dx, dy),
    apparent: wind(airX - s.vx, airY - s.vy),
    // True wind relative to the water, consistent with STW-derived sailing instruments.
    // With the default zero current this is also earth-referenced true wind.
    true: wind(airX - w.currentX, airY - w.currentY),
  };
}
