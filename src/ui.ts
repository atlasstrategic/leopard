import { boat, degrees, scenario } from "./config";
import { Instruments, instrumentsMarkup } from "./instruments";
import { wrap } from "./instrument-data";
import { requirements } from "./scenario";
import { clamp } from "./simulation";
import type { Session } from "./session";
import type { View } from "./rendering";
export class UI {
  root = document.querySelector<HTMLDivElement>("#ui")!;
  instruments: Instruments;
  constructor(
    private game: Session,
    private view: View,
    actions: { retry: () => void; pause: () => void; camera: () => void },
  ) {
    this.root.innerHTML = `
      <header><div class="eyebrow">LEOPARD / HANDLING LAB</div><h1>A little power. A lot of patience.</h1><p>42-foot twin-hull · Fictional training area · Prototype B</p></header>
      <section class="panel objective"><div class="eyebrow">01 / APPROACH & HOLD</div><h2>Find your place at North quay.</h2><p>Enter the mint rectangle, bow north. Brake early with reverse, then hold still for 3 seconds.</p>
      <div id="requirements"></div><div class="progress"><div id="dwell"></div></div><div id="result" aria-live="polite"></div>
      <div class="stats"><span id="time"></span><span id="penalties"></span></div></section>
      ${instrumentsMarkup}
      <aside class="tools"><div class="toolbar"><button id="camera">Camera</button><button id="pause">Pause · P</button><button id="retry">Retry · R</button></div>
      <details class="panel"><summary>Handling & weather <span>↗</span></summary><p>Experimental coefficients, not certified training.</p>
      <label>Wind strength <output id="windSpeedValue"></output><input id="windSpeed" type="range" min="0" max="12" step="0.5"></label>
      <label>Wind from (° true) <output id="windDirectionValue"></output><input id="windDirection" type="range" min="0" max="360" step="5"></label>
      <label>Engine thrust <output id="maxThrustValue"></output><input id="maxThrust" type="range" min="1500" max="5000" step="100"></label>
      <label>Engine response <output id="engineLagValue"></output><input id="engineLag" type="range" min="0.3" max="3" step="0.1"></label>
      <label>Lateral resistance <output id="lateralDragValue"></output><input id="lateralDrag" type="range" min="4000" max="24000" step="1000"></label>
      <label>Yaw damping <output id="yawDragValue"></output><input id="yawDrag" type="range" min="40000" max="220000" step="10000"></label>
      <button id="defaults">Restore tuning defaults</button></details></aside>
      <footer><section class="panel levers"><div class="lever" data-engine="port"><div class="eyebrow">PORT <span>Q / A</span></div><strong id="portValue"></strong><input id="port" aria-label="Port gear and throttle" type="range" min="-100" max="100" step="20"><div class="lever-buttons"><button data-engine="port" data-value="-1">− REV</button><button data-engine="port" data-value="0">N</button><button data-engine="port" data-value="1">FWD +</button></div><small id="portActual"></small></div>
      <div class="wheel"><div class="eyebrow">PERSISTENT WHEEL</div><input id="wheel" aria-label="Rudder angle" type="range" min="-30" max="30" step="1"><button id="center">Centre rudder · X</button><button id="neutral">Both neutral · SPACE</button></div>
      <div class="lever" data-engine="starboard"><div class="eyebrow">STARBOARD <span>E / D</span></div><strong id="starboardValue"></strong><input id="starboard" aria-label="Starboard gear and throttle" type="range" min="-100" max="100" step="20"><div class="lever-buttons"><button data-engine="starboard" data-value="-1">− REV</button><button data-engine="starboard" data-value="0">N</button><button data-engine="starboard" data-value="1">FWD +</button></div><small id="starboardActual"></small></div></section>
      <div class="bindings"><b>Tap</b> Q/A port · E/D starboard · W/S both (20% steps) &nbsp; <b>Hold</b> ←/→ wheel<br>X centre · Space neutral · C camera · P pause · R retry &nbsp; / &nbsp; Levers persist. Neutral is not a brake.</div></footer>
      <div id="paused" hidden><div class="panel"><div class="eyebrow">SIMULATION PAUSED</div><h2>Take your time.</h2><p>Held inputs cleared. Lever and wheel settings preserved.</p><button id="resume">Resume · P</button></div></div>`;
    this.instruments = new Instruments(this.root);
    this.el("retry").onclick = actions.retry;
    this.el("pause").onclick = actions.pause;
    this.el("resume").onclick = actions.pause;
    this.el("camera").onclick = actions.camera;
    const allowed = () => !game.paused && !game.progress.success;
    this.el("neutral").onclick = () => {
      if (allowed()) game.controls.port = game.controls.starboard = 0;
    };
    this.el("center").onclick = () => {
      if (allowed()) game.controls.rudder = 0;
    };
    for (const engine of ["port", "starboard"] as const) {
      (this.el(engine) as HTMLInputElement).oninput = (e) => {
        if (allowed())
          game.controls[engine] =
            Number((e.target as HTMLInputElement).value) / 100;
      };
    }
    this.root.querySelectorAll<HTMLButtonElement>("[data-value]").forEach(
      (b) =>
        (b.onclick = () => {
          if (!allowed()) return;
          const key = b.dataset.engine as "port" | "starboard",
            v = Number(b.dataset.value);
          game.controls[key] =
            v === 0 ? 0 : clamp(game.controls[key] + v * 0.2, -1, 1);
        }),
    );
    (this.el("wheel") as HTMLInputElement).oninput = (e) => {
      if (allowed())
        game.controls.rudder =
          (Number((e.target as HTMLInputElement).value) * Math.PI) / 180;
    };
    for (const id of [
      "windSpeed",
      "windDirection",
      "maxThrust",
      "engineLag",
      "lateralDrag",
      "yawDrag",
    ]) {
      (this.el(id) as HTMLInputElement).oninput = (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        if (id === "windSpeed") game.weather.speed = v;
        else if (id === "windDirection")
          game.weather.direction = wrap((v * Math.PI) / 180 + Math.PI);
        else
          game.tuning[
            id as "maxThrust" | "engineLag" | "lateralDrag" | "yawDrag"
          ] = v;
        this.syncTuning();
      };
    }
    this.el("defaults").onclick = () => {
      game.tuning = { ...boat };
      game.weather.speed = scenario.wind.speed;
      game.weather.direction = scenario.wind.direction;
      this.syncTuning();
    };
    this.syncTuning();
  }
  el(id: string) {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
  syncTuning() {
    const g = this.game;
    const values: Record<string, [number, string]> = {
      windSpeed: [g.weather.speed, `${g.weather.speed.toFixed(1)} m/s`],
      windDirection: [
        degrees(wrap(g.weather.direction + Math.PI)),
        `${degrees(wrap(g.weather.direction + Math.PI)).toFixed(0)}° T`,
      ],
      maxThrust: [g.tuning.maxThrust, `${g.tuning.maxThrust} N`],
      engineLag: [g.tuning.engineLag, `${g.tuning.engineLag.toFixed(1)} s`],
      lateralDrag: [g.tuning.lateralDrag, `${g.tuning.lateralDrag}`],
      yawDrag: [g.tuning.yawDrag, `${g.tuning.yawDrag}`],
    };
    for (const [id, [v, text]] of Object.entries(values)) {
      (this.el(id) as HTMLInputElement).value = String(v);
      this.el(`${id}Value`).textContent = text;
    }
  }
  update() {
    const g = this.game,
      s = g.state,
      p = g.progress,
      r = requirements(s);
    this.instruments.update(g, this.view.mode);
    this.el("requirements").innerHTML = [
      [
        r.position,
        `Position within ${scenario.target.positionTolerance} m · full hull inside`,
      ],
      [r.heading, "Heading 000° ± 8°"],
      [r.speed, "Speed ≤ 0.35 kn · minimal rotation"],
      [r.clear, "Clear of docks and boundaries"],
    ]
      .map(
        ([ok, text]) =>
          `<div class="check ${ok ? "ok" : ""}"><span>${ok ? "●" : "○"}</span>${text}</div>`,
      )
      .join("");
    this.el("dwell").style.width =
      `${(p.dwell / scenario.target.dwell) * 100}%`;
    this.el("result").textContent = p.success
      ? `Berth held! ${p.elapsed.toFixed(1)} s + ${p.penalty} s penalties = ${(p.elapsed + p.penalty).toFixed(1)} s. Retry to improve.`
      : `Hold: ${p.dwell.toFixed(1)} / 3.0 s`;
    this.el("time").textContent = `TIME ${p.elapsed.toFixed(1)} s`;
    this.el("penalties").textContent =
      `CONTACTS ${p.collisions} / +${p.penalty} s`;
    for (const k of ["port", "starboard"] as const) {
      const v = g.controls[k];
      this.el(`${k}Value`).textContent =
        Math.abs(v) < 0.01
          ? "NEUTRAL"
          : `${v > 0 ? "AHEAD" : "ASTERN"} ${Math.round(Math.abs(v) * 100)}%`;
      (this.el(k) as HTMLInputElement).value = String(v * 100);
      this.el(`${k}Actual`).textContent =
        `Delivered thrust ${Math.abs(s[k]) < 0.01 ? "N" : s[k] > 0 ? "F" : "R"} ${Math.round(Math.abs(s[k]) * 100)}%`;
    }
    (this.el("wheel") as HTMLInputElement).value = String(
      degrees(g.controls.rudder),
    );
    this.el("camera").textContent =
      `${this.view.mode[0].toUpperCase() + this.view.mode.slice(1)} · C`;
    this.el("paused").hidden = !g.paused;
  }
}
