import { fenderConfig } from "./config";
export type Side = "port" | "starboard";
export type Fender = { deployed: boolean; target: boolean; remaining: number };
export type Fenders = Record<Side, Fender>;
export const initialFenders = (): Fenders => ({
  port: { deployed: false, target: false, remaining: 0 },
  starboard: { deployed: false, target: false, remaining: 0 },
});
// Normal points out of obstacle. Coverage requires the OUTER hull side, not the
// tunnel, bow, stern or an oblique end impact. No global invulnerability flag.
export function coveredFender(
  localX: number,
  localY: number,
  normalRight: number,
  f: Fenders,
): { side: Side; index: number } | null {
  const side: Side = localX < 0 ? "port" : "starboard";
  if (!f[side].deployed || normalRight * Math.sign(localX) > -0.8) return null;
  const index = fenderConfig.positions.findIndex(
    (y) => Math.abs(y - localY) <= fenderConfig.halfCoverage,
  );
  return index < 0 ? null : { side, index };
}
