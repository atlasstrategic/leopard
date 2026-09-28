import { boat, fenderConfig } from "./config";
export type Side = "port" | "starboard";
export type Fender = { deployed: boolean; target: boolean; remaining: number };
// The roving fender a crew member holds at one hull corner.
export type Corner =
  "portBow" | "starboardBow" | "portQuarter" | "starboardQuarter";
export const corners: Corner[] = [
  "portBow",
  "starboardBow",
  "portQuarter",
  "starboardQuarter",
];
export const cornerNames: Record<Corner, string> = {
  portBow: "Port bow",
  starboardBow: "Starboard bow",
  portQuarter: "Port quarter",
  starboardQuarter: "Starboard quarter",
};
export type Roving = {
  // Where it is held now (null: stowed), where the crew is taking it, and
  // the seconds until it gets there.
  at: Corner | null;
  target: Corner | null;
  remaining: number;
};
export type Fenders = Record<Side, Fender> & { roving: Roving };
export const initialFenders = (): Fenders => ({
  port: { deployed: false, target: false, remaining: 0 },
  starboard: { deployed: false, target: false, remaining: 0 },
  roving: { at: null, target: null, remaining: 0 },
});
// Centre of the hull's corner contact circle, in the boat's frame.
export function cornerPoint(corner: Corner) {
  const x = boat.beam / 2 - boat.hullRadius,
    y = boat.length / 2 - boat.hullRadius;
  return {
    x: corner.startsWith("port") ? -x : x,
    y: corner.endsWith("Bow") ? y : -y,
  };
}
// Normal points out of obstacle. Side fenders cover the OUTER hull side, not
// the tunnel, bow, stern or an oblique end impact; the roving fender covers
// the hull within fenderConfig.rovingCoverage of its corner, from any
// direction. No global invulnerability flag.
export function coveredFender(
  localX: number,
  localY: number,
  normalRight: number,
  f: Fenders,
): { side: Side; key: string } | null {
  const side: Side = localX < 0 ? "port" : "starboard";
  const at = f.roving.at;
  if (at) {
    const c = cornerPoint(at);
    if (Math.hypot(localX - c.x, localY - c.y) <= fenderConfig.rovingCoverage)
      return { side, key: "roving" };
  }
  if (!f[side].deployed || normalRight * Math.sign(localX) > -0.8) return null;
  const index = fenderConfig.positions.findIndex(
    (y) => Math.abs(y - localY) <= fenderConfig.halfCoverage,
  );
  return index < 0 ? null : { side, key: `${side}/${index}` };
}
