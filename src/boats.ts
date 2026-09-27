import * as THREE from "three";

// Procedural boat models. Local frame: x starboard, y up (waterline at 0),
// z aft (the bow points to −z). Waterlines stay inside each boat's collision
// footprint so what you see is what you hit; the water is opaque, so nothing
// is modelled below it beyond the hull's own depth.

const materials = new Map<string, THREE.Material>();
const mat = (
  color: number,
  roughness = 0.7,
  metalness = 0,
  side: THREE.Side = THREE.FrontSide,
) => {
  const key = `${color}/${roughness}/${metalness}/${side}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness, side });
    materials.set(key, m);
  }
  return m;
};
// Lofted surfaces are drawn from both sides (their winding varies).
const shell = (color: number, roughness: number) =>
  mat(color, roughness, 0, THREE.DoubleSide);
const colors = {
  hull: 0xf3f2ea,
  deck: 0xe9e6da,
  nonSlip: 0xd8d3c2,
  glass: 0x1b2d38,
  navy: 0x1f3350,
  stripe: 0x3a4148,
  teak: 0x9b7b58,
  steel: 0xd4d9dc,
  dinghy: 0xb9bec2,
  sail: 0xf4f1e6,
  rope: 0x2d3a42,
};
function add<T extends THREE.Object3D>(parent: THREE.Object3D, o: T) {
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}
function box(
  parent: THREE.Object3D,
  [x, y, z]: [number, number, number],
  [w, h, d]: [number, number, number],
  material: THREE.Material,
  rotY = 0,
) {
  const m = add(
    parent,
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material),
  );
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  return m;
}
// A round spar or furled sail between two points.
function rod(
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  radiusEnd = radius,
) {
  const length = a.distanceTo(b);
  const m = add(
    parent,
    new THREE.Mesh(
      new THREE.CylinderGeometry(radiusEnd, radius, length, 10),
      material,
    ),
  );
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  return m;
}
// Standing rigging and lifelines: thin lines, no shadow.
function wires(
  parent: THREE.Object3D,
  segments: [THREE.Vector3, THREE.Vector3][],
  color = colors.rope,
) {
  const g = new THREE.BufferGeometry().setFromPoints(segments.flat());
  parent.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color })));
}
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
// A profile in the z–y plane extruded symmetrically across x.
function extrude(
  parent: THREE.Object3D,
  profile: [number, number][],
  width: number,
  material: THREE.Material,
  x = 0,
) {
  const shape = new THREE.Shape(
    profile.map(([z, y]) => new THREE.Vector2(z, y)),
  );
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: false,
  });
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2 + x, 0, 0);
  return add(parent, new THREE.Mesh(g, material));
}

// Hull stations from the transom (first) to the bow (last): z position, half
// width at the deck edge and at the waterline, canoe-body depth below the
// waterline and deck-edge height above it.
type Station = {
  z: number;
  deck: number;
  water: number;
  depth: number;
  sheer: number;
};
// Cross-section, starboard deck edge round the bottom to the port deck edge.
function section(s: Station): [number, number][] {
  const knuckle = Math.min(0.9, s.sheer * 0.7);
  const sideAtKnuckle = s.water + (s.deck - s.water) * 0.25;
  return [
    [s.deck, s.sheer],
    [sideAtKnuckle, knuckle],
    [s.water, 0],
    [s.water * 0.75, -s.depth * 0.6],
    [0, -s.depth],
    [-s.water * 0.75, -s.depth * 0.6],
    [-s.water, 0],
    [-sideAtKnuckle, knuckle],
    [-s.deck, s.sheer],
  ];
}
// Lofted hull: smooth topsides, a flat deck and a flat transom.
function loftHull(
  parent: THREE.Object3D,
  stations: Station[],
  x = 0,
  hullColor = colors.hull,
) {
  const rings = stations.map(section),
    n = rings[0].length;
  const sides: number[] = [],
    index: number[] = [];
  stations.forEach((s, i) =>
    rings[i].forEach(([px, py]) => sides.push(px + x, py, s.z)),
  );
  for (let i = 0; i < stations.length - 1; i++)
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j,
        b = a + 1,
        c = a + n,
        d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(sides, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  add(parent, new THREE.Mesh(g, shell(hullColor, 0.45)));
  // Deck: flat between the deck edges.
  const deck: number[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const s = stations[i],
      t = stations[i + 1];
    deck.push(
      x + s.deck,
      s.sheer,
      s.z,
      x - s.deck,
      s.sheer,
      s.z,
      x + t.deck,
      t.sheer,
      t.z,
      x - s.deck,
      s.sheer,
      s.z,
      x - t.deck,
      t.sheer,
      t.z,
      x + t.deck,
      t.sheer,
      t.z,
    );
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.Float32BufferAttribute(deck, 3));
  dg.computeVertexNormals();
  add(parent, new THREE.Mesh(dg, shell(colors.deck, 0.8)));
  // Transom: fan over the aft-most section.
  const aft = stations[0],
    ring = rings[0];
  const transom: number[] = [];
  const cy = aft.sheer * 0.35;
  for (let j = 0; j < n; j++) {
    const [ax, ay] = ring[j],
      [bx, by] = ring[(j + 1) % n];
    transom.push(x, cy, aft.z, x + bx, by, aft.z, x + ax, ay, aft.z);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute("position", new THREE.Float32BufferAttribute(transom, 3));
  tg.computeVertexNormals();
  add(parent, new THREE.Mesh(tg, shell(hullColor, 0.45)));
}
// Half width of the topsides at height y and position z (for fittings on
// the hull side such as windows and stripes).
function sideAt(stations: Station[], z: number, y: number) {
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i],
      b = stations[i + 1];
    if ((z - a.z) * (z - b.z) <= 0) {
      const t = (z - a.z) / (b.z - a.z || 1);
      const at = (s: Station) =>
        s.water +
        ((s.deck - s.water) * Math.max(0, Math.min(y, s.sheer))) / s.sheer;
      return {
        x: at(a) + (at(b) - at(a)) * t,
        slope: (at(b) - at(a)) / (b.z - a.z || 1),
      };
    }
  }
  return { x: stations[0].water, slope: 0 };
}
// Dark patches that follow one side of the hull (windows, stripes).
function onSide(
  parent: THREE.Object3D,
  stations: Station[],
  side: 1 | -1,
  z0: number,
  z1: number,
  y: number,
  height: number,
  color: number,
  x = 0,
  pieces = 6,
) {
  for (let k = 0; k < pieces; k++) {
    const za = z0 + ((z1 - z0) * k) / pieces,
      zb = z0 + ((z1 - z0) * (k + 1)) / pieces,
      zm = (za + zb) / 2;
    const s = sideAt(stations, zm, y);
    const m = box(
      parent,
      [x + side * (s.x + 0.012), y, zm],
      [0.02, height, Math.abs(zb - za) * 1.02],
      mat(color, 0.25),
    );
    m.rotation.y = side * Math.atan(s.slope);
  }
}
// Stanchions and two lifelines along a deck edge.
function guardrails(
  parent: THREE.Object3D,
  points: [number, number, number][],
) {
  const steel = mat(colors.steel, 0.3, 0.6);
  const segments: [THREE.Vector3, THREE.Vector3][] = [];
  points.forEach(([x, y, z], i) => {
    rod(parent, v(x, y, z), v(x, y + 0.62, z), 0.018, steel);
    if (i > 0) {
      const [px, py, pz] = points[i - 1];
      for (const h of [0.32, 0.6])
        segments.push([v(px, py + h, pz), v(x, y + h, z)]);
    }
  });
  wires(parent, segments, colors.steel);
}

// Beneteau Oceanis 38.1 (2016 on): 11.5 m, 3.99 m beam, plumb bow, wide
// transom, low coachroof, deck-stepped mast about 16.5 m above the waterline.
// Built inside a collision capsule of the given length and beam: the bow fills
// the front cap and the transom sits where the rear cap is as wide as it.
export function oceanis381(capsuleLength: number, beam: number) {
  const group = new THREE.Group();
  const loa = 11.5,
    b = beam / 2,
    bow = -capsuleLength / 2,
    stern = bow + loa;
  const at = (f: number) => stern - (stern - bow) * f;
  const stations: Station[] = [
    { f: 0, deck: 0.84, water: 0.66, depth: 0.28, sheer: 1.12 },
    { f: 0.12, deck: 0.95, water: 0.82, depth: 0.42, sheer: 1.16 },
    { f: 0.3, deck: 1.0, water: 0.9, depth: 0.55, sheer: 1.2 },
    { f: 0.5, deck: 0.99, water: 0.88, depth: 0.6, sheer: 1.25 },
    { f: 0.68, deck: 0.92, water: 0.76, depth: 0.55, sheer: 1.31 },
    { f: 0.82, deck: 0.74, water: 0.52, depth: 0.46, sheer: 1.38 },
    { f: 0.93, deck: 0.44, water: 0.24, depth: 0.34, sheer: 1.44 },
    { f: 1, deck: 0.05, water: 0.02, depth: 0.2, sheer: 1.48 },
  ].map((s) => ({
    z: at(s.f),
    deck: s.deck * b,
    water: s.water * b,
    depth: s.depth,
    sheer: s.sheer,
  }));
  loftHull(group, stations);
  // Thin sheer stripe and the dark band of hull windows.
  for (const side of [1, -1] as const) {
    onSide(
      group,
      stations,
      side,
      at(0.02),
      at(0.96),
      1.02,
      0.05,
      colors.stripe,
      0,
      12,
    );
    onSide(
      group,
      stations,
      side,
      at(0.52),
      at(0.66),
      0.72,
      0.16,
      colors.glass,
      0,
      3,
    );
    onSide(
      group,
      stations,
      side,
      at(0.7),
      at(0.8),
      0.76,
      0.14,
      colors.glass,
      0,
      3,
    );
  }
  // Coachroof with its window band, and the cockpit well.
  const roofFront = at(0.72),
    roofBack = at(0.4);
  extrude(
    group,
    [
      [roofFront, 1.2],
      [roofFront + 0.35, 1.62],
      [roofBack, 1.66],
      [roofBack, 1.2],
    ],
    2.5,
    mat(colors.deck, 0.6),
  );
  for (const side of [1, -1])
    box(
      group,
      [side * 1.255, 1.47, (roofFront + roofBack) / 2 + 0.3],
      [0.02, 0.13, 2.2],
      mat(colors.glass, 0.25),
    );
  // Cockpit: teak floor just above the deck inside low coamings.
  const cockpitFore = roofBack,
    cockpitAft = at(0.03),
    cockpitZ = (cockpitFore + cockpitAft) / 2,
    cockpitLength = cockpitAft - cockpitFore;
  box(
    group,
    [0, 1.15, cockpitZ],
    [2.7, 0.04, cockpitLength],
    mat(colors.teak, 0.85),
  );
  for (const side of [1, -1])
    box(
      group,
      [side * 1.4, 1.35, cockpitZ - 0.2],
      [0.12, 0.34, cockpitLength - 0.4],
      mat(colors.deck, 0.6),
    );
  // Twin wheels and the navy sprayhood and bimini.
  const steel = mat(colors.steel, 0.3, 0.6);
  for (const side of [1, -1]) {
    const wheel = add(
      group,
      new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 6, 24), steel),
    );
    wheel.position.set(side * 0.85, 1.72, at(0.1));
  }
  const canvas = mat(colors.navy, 0.9);
  extrude(
    group,
    [
      [roofBack, 1.66],
      [roofBack + 0.25, 2.25],
      [roofBack + 0.9, 2.3],
      [roofBack + 0.9, 1.66],
    ],
    2.3,
    canvas,
  );
  box(group, [0, 2.36, at(0.2)], [2.5, 0.05, 2.2], canvas);
  // Mast, spreaders and rigging.
  const mastZ = at(0.62),
    top = 16.5;
  const aluminium = mat(0xc9cdd0, 0.35, 0.5);
  rod(group, v(0, 1.66, mastZ), v(0, top, mastZ), 0.09, aluminium, 0.06);
  const chain: [number, number][] = [];
  for (const [h, span] of [
    [6.2, 1.25],
    [11, 0.8],
  ] as const)
    for (const side of [1, -1]) {
      rod(
        group,
        v(0, h, mastZ),
        v(side * span, h, mastZ + 0.45),
        0.03,
        aluminium,
      );
      chain.push([side * span, h]);
    }
  const shroudZ = mastZ + 0.9;
  wires(group, [
    [v(0, top - 0.3, mastZ), v(0, 1.5, at(0.985))],
    [v(0, top - 0.3, mastZ), v(0, 1.2, stern - 0.1)],
    ...([1, -1] as const).flatMap((side): [THREE.Vector3, THREE.Vector3][] => [
      [v(0, top - 0.5, mastZ), v(side * 1.25, 6.2, mastZ + 0.45)],
      [v(side * 1.25, 6.2, mastZ + 0.45), v(side * b * 0.94, 1.25, shroudZ)],
    ]),
  ]);
  // Furled genoa on the forestay; boom with a navy lazy bag.
  rod(
    group,
    v(0, 1.75, at(0.975)),
    v(0, top - 1.2, mastZ - 0.1),
    0.07,
    mat(colors.sail, 0.9),
    0.04,
  );
  rod(group, v(0, 2.45, mastZ + 0.1), v(0, 2.45, at(0.14)), 0.06, aluminium);
  extrude(
    group,
    [
      [mastZ + 0.2, 2.5],
      [mastZ + 0.2, 2.95],
      [at(0.2), 2.75],
      [at(0.15), 2.5],
    ],
    0.34,
    canvas,
  );
  // Anchor roller, pulpit, guardrails and the dinghy on the foredeck.
  box(group, [0, 1.45, bow - 0.12], [0.16, 0.12, 0.5], steel);
  for (const side of [1, -1] as const)
    guardrails(
      group,
      [0.9, 0.75, 0.6, 0.45, 0.3, 0.12].map((f) => {
        const s = sideAt(stations, at(f), 1.3);
        return [side * (s.x - 0.06), 1.2 + f * 0.25, at(f)];
      }),
    );
  const dinghy = extrude(
    group,
    [
      [0, 0],
      [0.25, 0.32],
      [2.6, 0.32],
      [2.8, 0],
    ],
    1.3,
    mat(colors.dinghy, 0.8),
  );
  dinghy.position.set(0, 1.66, at(0.84));
  return group;
}

// Leopard 42 catamaran, simplified: two slim hulls matching the collision
// footprint (half width `hullRadius` round each hull centre), bridgedeck and
// saloon with a raked, tinted window band, hardtop over the cockpit with the
// raised helm to starboard, trampoline forward and a tall deck-stepped rig.
export function leopard42(length: number, beam: number, hullRadius: number) {
  const group = new THREE.Group();
  const hullX = beam / 2 - hullRadius,
    bow = -length / 2,
    stern = length / 2 - 0.25;
  const at = (f: number) => stern - (stern - bow) * f;
  const hullStations = (w: number): Station[] =>
    [
      { f: 0, w: 0.72, sheer: 1.28 },
      { f: 0.1, w: 0.92, sheer: 1.32 },
      { f: 0.3, w: 1, sheer: 1.36 },
      { f: 0.7, w: 1, sheer: 1.42 },
      { f: 0.86, w: 0.76, sheer: 1.5 },
      { f: 0.95, w: 0.4, sheer: 1.58 },
      { f: 1, w: 0.03, sheer: 1.62 },
    ].map((s) => ({
      z: s.f === 1 ? bow + 0.05 : at(s.f),
      deck: s.w * w,
      water: s.w * w,
      depth: 0.6,
      sheer: s.sheer,
    }));
  const stations = hullStations(hullRadius);
  for (const side of [1, -1] as const) {
    loftHull(group, stations, side * hullX);
    // Long hull windows and a sheer stripe on the outboard side.
    onSide(
      group,
      stations,
      side,
      at(0.35),
      at(0.68),
      0.8,
      0.14,
      colors.glass,
      side * hullX,
      4,
    );
    onSide(
      group,
      stations,
      side,
      at(0.05),
      at(0.95),
      1.1,
      0.04,
      colors.stripe,
      side * hullX,
      12,
    );
  }
  const white = mat(colors.deck, 0.6),
    glass = mat(colors.glass, 0.2),
    steel = mat(colors.steel, 0.3, 0.6);
  // Bridgedeck spanning the hulls, with the aft cockpit floor.
  box(group, [0, 1.3, at(0.35)], [beam - 0.1, 0.3, 8.2], white);
  box(
    group,
    [0, 1.47, at(0.14)],
    [beam - 1.8, 0.04, 2.6],
    mat(colors.teak, 0.85),
  );
  // Saloon: white body with a raked front and a tinted window band.
  const front = at(0.7),
    back = at(0.34);
  extrude(
    group,
    [
      [front, 1.45],
      [front + 1.1, 2.7],
      [back, 2.85],
      [back, 1.45],
    ],
    beam - 1.2,
    white,
  );
  extrude(
    group,
    [
      [front + 0.2, 1.85],
      [front + 0.95, 2.55],
      [back + 0.05, 2.62],
      [back + 0.05, 1.95],
    ],
    beam - 1.16,
    glass,
  );
  // Hardtop over the cockpit and saloon aft, on two aft posts.
  box(group, [0, 4.0, at(0.23)], [beam - 0.7, 0.1, 5.4], white);
  for (const side of [1, -1])
    rod(
      group,
      v(side * (beam / 2 - 0.55), 1.45, at(0.03)),
      v(side * (beam / 2 - 0.55), 3.95, at(0.03)),
      0.05,
      steel,
    );
  // Raised helm to starboard, under the hardtop, where the helm camera sits.
  box(group, [2.1, 2.45, 1.0], [0.9, 0.1, 1.0], white);
  const wheel = add(
    group,
    new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 6, 24), steel),
  );
  wheel.position.set(2.1, 3.05, 0.1);
  wheel.rotation.x = -0.35;
  // Trampoline between the hulls forward, with the front crossbeam.
  box(group, [0, 1.52, bow + 0.55], [beam - 0.6, 0.18, 0.22], white);
  const net: [THREE.Vector3, THREE.Vector3][] = [];
  for (let x = -hullX + 0.5; x <= hullX - 0.5; x += 0.35)
    net.push([v(x, 1.45, bow + 0.65), v(x, 1.45, front)]);
  for (let z = bow + 0.65; z <= front; z += 0.35)
    net.push([v(-hullX + 0.5, 1.45, z), v(hullX - 0.5, 1.45, z)]);
  wires(group, net, 0x2c4a5a);
  // Mast on the saloon roof, spreaders, rigging, furled jib and boom.
  const mastZ = front + 1.6,
    top = 20;
  const aluminium = mat(0xc9cdd0, 0.35, 0.5);
  rod(group, v(0, 2.8, mastZ), v(0, top, mastZ), 0.11, aluminium, 0.07);
  for (const [h, span] of [
    [8.5, 1.6],
    [14, 1.0],
  ] as const)
    for (const side of [1, -1])
      rod(
        group,
        v(0, h, mastZ),
        v(side * span, h, mastZ + 0.6),
        0.035,
        aluminium,
      );
  wires(group, [
    [v(0, top - 0.3, mastZ), v(0, 1.62, bow + 0.55)],
    ...([1, -1] as const).flatMap((side): [THREE.Vector3, THREE.Vector3][] => [
      [v(0, top - 0.5, mastZ), v(side * 1.6, 8.5, mastZ + 0.6)],
      [v(side * 1.6, 8.5, mastZ + 0.6), v(side * hullX, 1.4, mastZ + 1.5)],
      [v(0, top - 0.5, mastZ), v(side * hullX, 1.4, at(0.12))],
    ]),
  ]);
  rod(
    group,
    v(0, 1.7, bow + 0.55),
    v(0, top - 2, mastZ - 0.12),
    0.08,
    mat(colors.sail, 0.9),
    0.045,
  );
  rod(group, v(0, 4.35, mastZ + 0.1), v(0, 4.35, at(0.08)), 0.07, aluminium);
  extrude(
    group,
    [
      [mastZ + 0.2, 4.4],
      [mastZ + 0.2, 4.95],
      [at(0.14), 4.7],
      [at(0.08), 4.4],
    ],
    0.38,
    mat(colors.navy, 0.9),
  );
  // Guardrails along each hull's outboard deck edge.
  for (const side of [1, -1] as const)
    guardrails(
      group,
      [0.95, 0.8, 0.62, 0.45, 0.28].map((f) => {
        const s = sideAt(stations, at(f), 1.4);
        return [side * (hullX + s.x - 0.05), 1.4 + f * 0.15, at(f)];
      }),
    );
  return group;
}
