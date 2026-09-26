import * as THREE from "three";
import {
  boat,
  scenario,
  fenderConfig,
  mooringConfig,
  trafficConfig,
} from "./config";
import { initialMooring, lineIds, lineGeometry, type Mooring } from "./mooring";
import { initialFenders, type Fenders } from "./fenders";
import type { State } from "./simulation";
import { positioningTarget, type PositionTarget } from "./scenario";
export type CameraMode = "chase" | "overhead" | "helm";
export function hasWebGL2() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}
export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
  vessel = new THREE.Group();
  monohull = new THREE.Group();
  fenderMeshes = { port: new THREE.Group(), starboard: new THREE.Group() };
  mooringMeshes = new Map<
    string,
    THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  >();
  targetGroup = new THREE.Group();
  targetOutline = new THREE.LineBasicMaterial({ color: 0x94ffce });
  mode: CameraMode = "chase";
  waterTime = { value: 0 };
  targetMaterial = new THREE.MeshBasicMaterial({
    color: 0x6fffc4,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  });
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0xa9cbd7);
    this.scene.fog = new THREE.Fog(0xa9cbd7, 150, 340);
    this.scene.add(new THREE.HemisphereLight(0xe0f5ff, 0x537c86, 2.6));
    const sun = new THREE.DirectionalLight(0xfff4d9, 3.2);
    sun.position.set(-35, 65, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -70,
      right: 70,
      top: 70,
      bottom: -70,
      far: 180,
    });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      new THREE.ShaderMaterial({
        uniforms: { time: this.waterTime },
        vertexShader:
          "varying vec2 p; void main(){p=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader: `varying vec2 p; uniform float time; void main(){
        float a=sin(p.x*.65+p.y*.23+time*.65)*sin(p.y*.95-time*.4);
        float b=pow(max(0.,sin(p.x*1.8+p.y*2.4+time)),22.);
        vec3 col=mix(vec3(.045,.29,.36),vec3(.10,.43,.49),.5+a*.18);
        col+=b*.035; gl_FragColor=vec4(col,1.);
      }`,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.09;
    this.scene.add(water);
    const mat = (color: number) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.78 });
    const concrete = mat(0xb9b5a4),
      wood = mat(0x8d7861),
      navy = mat(0x193545),
      white = mat(0xf1f0e7),
      glass = mat(0x204858);
    const box = (
      parent: THREE.Object3D,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      material: THREE.Material,
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    for (const b of scenario.obstacles) {
      if (b.kind === "dock") {
        box(this.scene, b.x, 0.45, -b.y, b.width, 1.0, b.length, concrete);
        box(
          this.scene,
          b.x,
          0.98,
          -b.y,
          b.width - 0.2,
          0.08,
          b.length - 0.2,
          wood,
        );
        for (let y = b.y - b.length / 2 + 2; y < b.y + b.length / 2; y += 4) {
          box(
            this.scene,
            b.x - b.width / 2 - 0.05,
            0.45,
            -y,
            0.15,
            0.65,
            0.9,
            navy,
          );
          box(
            this.scene,
            b.x - b.width / 2 + 0.8,
            1.15,
            -y,
            0.35,
            0.32,
            0.35,
            navy,
          );
        }
      } else {
        box(
          this.scene,
          b.x,
          0.06,
          -b.y,
          b.width,
          0.12,
          b.length,
          new THREE.MeshBasicMaterial({
            color: 0xf1bd62,
            transparent: true,
            opacity: 0.22,
          }),
        );
        const alongX = b.width > b.length;
        for (
          let k = -(alongX ? b.width : b.length) / 2 + 3;
          k < (alongX ? b.width : b.length) / 2;
          k += 7
        ) {
          const buoy = new THREE.Mesh(
            new THREE.SphereGeometry(0.4, 12, 8),
            mat(0xf5be62),
          );
          buoy.position.set(
            b.x + (alongX ? k : 0),
            0.25,
            -b.y + (alongX ? 0 : k),
          );
          this.scene.add(buoy);
        }
      }
    }
    const t = scenario.target;
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(t.width, t.length),
      this.targetMaterial,
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.015, 0);
    this.targetGroup.add(pad);
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-t.width / 2, 0.03, -t.length / 2),
        new THREE.Vector3(t.width / 2, 0.03, -t.length / 2),
        new THREE.Vector3(t.width / 2, 0.03, t.length / 2),
        new THREE.Vector3(-t.width / 2, 0.03, t.length / 2),
      ]),
      this.targetOutline,
    );
    this.targetGroup.add(outline);
    this.targetGroup.add(
      new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 0.12, 3),
        5,
        0x94ffce,
        1.6,
        1.2,
      ),
    );
    this.scene.add(this.targetGroup);
    for (const id of lineIds) {
      const def = mooringConfig.lines[id];
      const bollard = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.32, 0.5, 12),
        mat(0xd7af60),
      );
      bollard.position.set(def.anchor.x, 1.25, -def.anchor.y);
      bollard.castShadow = true;
      this.scene.add(bollard);
      this.label(
        `${def.bollard} / ${def.name.toUpperCase()}`,
        def.anchor.x + 1.5,
        2.4,
        -def.anchor.y,
        4.8,
      );
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(17 * 3), 3),
      );
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: 0xe9dbad }),
      );
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      this.mooringMeshes.set(id, line);
    }
    this.label("01  /  NORTH QUAY", 0, 3, -26, 11);
    this.label("FICTIONAL TRAINING AREA", -17, 2, -39, 19);
    for (const x of [
      -boat.beam / 2 + boat.hullRadius,
      boat.beam / 2 - boat.hullRadius,
    ]) {
      // Capsule waterline exactly shares the contact envelope's dimensions.
      const hull = new THREE.Mesh(
        new THREE.CapsuleGeometry(
          boat.hullRadius,
          boat.length - 2 * boat.hullRadius,
          8,
          12,
        ),
        white,
      );
      hull.rotation.x = Math.PI / 2;
      hull.scale.z = 1.5;
      hull.position.set(x, 0.5, 0);
      hull.castShadow = true;
      this.vessel.add(hull);
      box(this.vessel, x, 1.22, 0, 1.25, 0.16, 10.7, white);
      box(this.vessel, x, 0.95, 0, 1.46, 0.12, 9, navy);
    }
    box(this.vessel, 0, 1.35, 0.7, 5.55, 0.3, 8.8, white);
    box(this.vessel, 0, 2.1, 0, 4.6, 1.3, 4.6, glass);
    box(this.vessel, 0, 2.87, -0.05, 5.2, 0.22, 5.3, white);
    box(this.vessel, 0, 1.65, 3.6, 4.5, 0.3, 1.2, wood);
    box(this.vessel, 2.0, 3.0, 1.0, 0.65, 0.7, 0.65, navy);
    box(this.vessel, 0, 6.2, -0.4, 0.12, 7.3, 0.12, white);
    // Open foredeck netting and perimeter rails aid scale and orientation.
    for (let x = -2.1; x < 2.2; x += 0.35)
      box(this.vessel, x, 1.35, -4.2, 0.035, 0.025, 2.1, navy);
    for (const x of [-3.3, 3.3]) {
      box(this.vessel, x, 2.0, -0.3, 0.04, 0.04, 10.8, white);
      for (const z of [-5.5, -2, 2, 5])
        box(this.vessel, x, 1.65, z, 0.04, 0.7, 0.04, white);
    }
    for (const side of ["port", "starboard"] as const) {
      const group = this.fenderMeshes[side];
      for (const y of fenderConfig.positions) {
        const fender = new THREE.Mesh(
          new THREE.CapsuleGeometry(fenderConfig.thickness / 2, 0.65, 4, 10),
          mat(0xf5ae63),
        );
        fender.position.set(
          (side === "port" ? -1 : 1) *
            (boat.beam / 2 + fenderConfig.thickness / 2),
          0.7,
          -y,
        );
        fender.castShadow = true;
        group.add(fender);
      }
      group.visible = false;
      this.vessel.add(group);
    }
    this.scene.add(this.vessel);
    // Monohull: capsule waterline matches its contact footprint.
    const mono = trafficConfig.monohull,
      radius = mono.beam / 2;
    const monoHull = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, mono.length - mono.beam, 8, 16),
      mat(0x2b4f73),
    );
    monoHull.rotation.x = Math.PI / 2;
    monoHull.scale.z = 0.42;
    monoHull.position.y = 0.45;
    monoHull.castShadow = true;
    this.monohull.add(monoHull);
    box(
      this.monohull,
      0,
      1.2,
      0.4,
      mono.beam - 0.7,
      0.14,
      mono.length - 3.4,
      white,
    );
    box(this.monohull, 0, 1.65, 0.6, 2.2, 0.75, 3.6, white);
    box(this.monohull, 0, 1.7, -0.6, 2.0, 0.5, 0.9, glass);
    box(this.monohull, 0, 8.4, -0.9, 0.14, 14.2, 0.14, white);
    box(this.monohull, 0, 2.3, 1.6, 0.1, 0.1, 4.6, white);
    this.monohull.visible = false;
    this.scene.add(this.monohull);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  label(text: string, x: number, y: number, z: number, width: number) {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 96;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#112e3de0";
    ctx.fillRect(0, 0, 1024, 96);
    ctx.font = "600 42px sans-serif";
    ctx.fillStyle = "#def3ed";
    ctx.textAlign = "center";
    ctx.fillText(text, 512, 62);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c),
        depthTest: false,
      }),
    );
    sprite.position.set(x, y, z);
    sprite.scale.set(width, (width * 96) / 1024, 1);
    this.scene.add(sprite);
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  render(
    s: State,
    time: number,
    dwell: number,
    fenders: Fenders = initialFenders(),
    mooring: Mooring = initialMooring(),
    positionTarget: PositionTarget = "approach",
    traffic: { x: number; y: number; heading: number } | null = null,
  ) {
    this.monohull.visible = !!traffic;
    if (traffic) {
      this.monohull.position.set(
        traffic.x,
        Math.sin(time * 1.1 + 1) * 0.03,
        -traffic.y,
      );
      this.monohull.rotation.y = -traffic.heading;
    }
    const target = positioningTarget(positionTarget);
    this.targetGroup.position.set(target.x, 0, -target.y);
    this.targetGroup.scale.set(
      target.width / scenario.target.width,
      1,
      target.length / scenario.target.length,
    );
    this.targetMaterial.color.setHex(
      positionTarget === "alongside" ? 0xffcc77 : 0x6fffc4,
    );
    this.targetOutline.color.setHex(
      positionTarget === "alongside" ? 0xffcc77 : 0x94ffce,
    );
    for (const id of lineIds) {
      const mesh = this.mooringMeshes.get(id)!,
        line = mooring[id];
      mesh.visible = line.attached;
      if (!line.attached) continue;
      const g = lineGeometry(s, id),
        positions = mesh.geometry.getAttribute("position");
      const sag = Math.min(
        0.8,
        Math.max(0, line.restLength - g.distance) + 0.08,
      );
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        positions.setXYZ(
          i,
          g.point.x + (g.anchor.x - g.point.x) * t,
          1.35 - 0.1 * t - 4 * sag * t * (1 - t),
          -(g.point.y + (g.anchor.y - g.point.y) * t),
        );
      }
      positions.needsUpdate = true;
      mesh.material.color.setHex(
        line.warning ? 0xff8a70 : line.tension > 20 ? 0x9ff6ce : 0xe9dbad,
      );
    }
    for (const side of ["port", "starboard"] as const)
      this.fenderMeshes[side].visible = fenders[side].deployed;
    this.waterTime.value = time;
    this.targetMaterial.opacity = 0.13 + dwell * 0.05;
    this.vessel.position.set(s.x, Math.sin(time * 1.3) * 0.025, -s.y);
    this.vessel.rotation.y = -s.heading;
    // Decorative heave only: no wave contribution to collision/physics.
    const f = new THREE.Vector3(Math.sin(s.heading), 0, -Math.cos(s.heading));
    const pos = new THREE.Vector3(s.x, 0, -s.y);
    this.camera.up.set(0, 1, 0);
    if (this.mode === "overhead") {
      this.camera.position.copy(pos).add(new THREE.Vector3(0, 78, 24));
      this.camera.lookAt(pos.clone().add(new THREE.Vector3(0, 0, -6)));
    } else if (this.mode === "helm") {
      this.vessel.updateMatrixWorld();
      this.camera.position.copy(
        this.vessel.localToWorld(new THREE.Vector3(2.1, 3.65, 0.65)),
      );
      this.camera.lookAt(
        this.camera.position
          .clone()
          .addScaledVector(f, 40)
          .add(new THREE.Vector3(0, -2.2, 0)),
      );
    } else {
      this.camera.position
        .copy(pos)
        .addScaledVector(f, -29)
        .add(new THREE.Vector3(0, 23, 0));
      this.camera.lookAt(pos.clone().addScaledVector(f, 3));
    }
    this.renderer.render(this.scene, this.camera);
  }
}
