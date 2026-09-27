// Hull forms shared by the 3D models (boats.ts) and collision (traffic.ts),
// so the monohull collides with exactly the hull you see.

// Modern plumb-bowed cruising monohull (after the Beneteau Oceanis 38.1),
// from the transom (f = 0) to the stem (f = 1). Half widths at the deck edge
// and the waterline are fractions of half the beam; depth and sheer are
// metres below and above the waterline.
export const monohullForm = [
  { f: 0, deck: 0.84, water: 0.66, depth: 0.28, sheer: 1.12 },
  { f: 0.12, deck: 0.95, water: 0.82, depth: 0.42, sheer: 1.16 },
  { f: 0.3, deck: 1.0, water: 0.9, depth: 0.55, sheer: 1.2 },
  { f: 0.5, deck: 0.99, water: 0.88, depth: 0.6, sheer: 1.25 },
  { f: 0.68, deck: 0.92, water: 0.76, depth: 0.55, sheer: 1.31 },
  { f: 0.82, deck: 0.74, water: 0.52, depth: 0.46, sheer: 1.38 },
  { f: 0.93, deck: 0.44, water: 0.24, depth: 0.34, sheer: 1.44 },
  { f: 1, deck: 0.05, water: 0.02, depth: 0.2, sheer: 1.48 },
];
export type Outline = [number, number][];
// Plan outline at the deck edge (the widest part, which touches first when
// boats meet), in the vessel's frame: x to starboard, y forward, centred.
export function monohullOutline(length: number, beam: number): Outline {
  const side = monohullForm.map((s): [number, number] => [
    (s.deck * beam) / 2,
    -length / 2 + s.f * length,
  ]);
  return [
    ...side,
    ...side.reverse().map(([x, y]): [number, number] => [-x, y]),
  ];
}
// World point into a vessel's frame (heading clockwise from north).
export function toLocal(
  v: { x: number; y: number; heading: number },
  x: number,
  y: number,
) {
  const dx = x - v.x,
    dy = y - v.y,
    sn = Math.sin(v.heading),
    cs = Math.cos(v.heading);
  return { x: dx * cs - dy * sn, y: dx * sn + dy * cs };
}
// Signed distance from a point to an outline (negative inside) and the unit
// normal pointing out of the outline at the nearest point, both local.
export function outlineDistance(outline: Outline, px: number, py: number) {
  let best = Infinity,
    qx = 0,
    qy = 0,
    ex = 0,
    ey = 0,
    inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ax, ay] = outline[j],
      [bx, by] = outline[i];
    if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax)
      inside = !inside;
    const lx = bx - ax,
      ly = by - ay,
      t = Math.max(
        0,
        Math.min(
          1,
          ((px - ax) * lx + (py - ay) * ly) / (lx * lx + ly * ly || 1),
        ),
      );
    const cx = ax + lx * t,
      cy = ay + ly * t,
      d = Math.hypot(px - cx, py - cy);
    if (d < best) {
      best = d;
      qx = cx;
      qy = cy;
      ex = lx;
      ey = ly;
    }
  }
  let nx: number, ny: number;
  if (best > 1e-8) {
    nx = (px - qx) / best;
    ny = (py - qy) / best;
    if (inside) {
      nx = -nx;
      ny = -ny;
    }
  } else {
    // On the edge: its perpendicular, pointing away from the centre.
    const l = Math.hypot(ex, ey) || 1;
    nx = ey / l;
    ny = -ex / l;
    if (nx * qx + ny * qy < 0) {
      nx = -nx;
      ny = -ny;
    }
  }
  return { distance: inside ? -best : best, nx, ny };
}
// Points along an outline in world coordinates, at most `spacing` apart.
export function outlineWorld(
  v: { x: number; y: number; heading: number; outline: Outline },
  spacing = Infinity,
) {
  const sn = Math.sin(v.heading),
    cs = Math.cos(v.heading);
  const world = ([px, py]: [number, number]) => ({
    x: v.x + px * cs + py * sn,
    y: v.y - px * sn + py * cs,
  });
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < v.outline.length; i++) {
    const a = v.outline[i],
      b = v.outline[(i + 1) % v.outline.length];
    const steps = Math.max(
      1,
      Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / spacing),
    );
    for (let k = 0; k < steps; k++)
      points.push(
        world([
          a[0] + ((b[0] - a[0]) * k) / steps,
          a[1] + ((b[1] - a[1]) * k) / steps,
        ]),
      );
  }
  return points;
}
