import {
  boat,
  degrees,
  knots,
  metresPerSecond,
  scenario,
  mooringConfig,
  missionConfig,
} from "./config";
import { MooringUI, mooringMarkup } from "./mooring-ui";
import { ServiceUI, serviceMarkup } from "./service-ui";
import { Instruments, instrumentsMarkup } from "./instruments";
import { wrap } from "./instrument-data";
import { LogUI, crewMarkup, logMarkup } from "./log-ui";
import { insideHolding, requirements } from "./scenario";
import { DemoUI, demoMarkup, type DemoActions } from "./demo-ui";
import type { PracticeLab } from "./demonstration";
import { clamp } from "./simulation";
import type { Session } from "./session";
import type { View } from "./rendering";
export class UI {
  root = document.querySelector<HTMLDivElement>("#ui")!;
  instruments: Instruments;
  logUI: LogUI;
  mooringUI: MooringUI;
  serviceUI: ServiceUI;
  demoUI: DemoUI;
  constructor(
    private game: Session,
    private view: View,
    private actions: {
      retry: () => void;
      pause: () => void;
      camera: () => void;
      readOnly: () => boolean;
    } & DemoActions,
    private lab: PracticeLab,
  ) {
    this.root.innerHTML = `
      <header><div class="eyebrow">LEOPARD / HANDLING LAB</div><h1>A little power. A lot of patience.</h1><p>42-foot twin-hull · Fictional training area · Mooring prototype</p></header>
      <section class="panel objective"><div class="eyebrow" id="mission-phase"></div><h2 id="mission-title"></h2><p id="mission-hint"></p>
      <div class="objective-tabs" role="group" aria-label="Objective panel section"><button id="objective-tab" aria-pressed="true">Objective</button><button id="crew-tab" aria-pressed="false">Crew & lines</button></div>
      <div id="objective-page"><div id="requirements"></div><div class="progress"><div id="dwell"></div></div>${serviceMarkup}</div>
      <div id="result" aria-live="polite"></div><div class="stats"><span id="time"></span><span id="penalties"></span></div>
      <div id="crew-page" hidden>${mooringMarkup}${crewMarkup}</div></section>
      <section class="panel radio" id="radio" role="status" aria-live="polite" hidden><div class="eyebrow">HARBOUR RADIO · <span id="radio-time"></span></div><p id="radio-message"></p></section>
      ${instrumentsMarkup}
      <aside class="tools"><div class="toolbar"><button id="camera">Camera</button><button id="pause">Pause · P</button><button id="retry">Retry · R</button><button id="show-me">Show me</button></div>
      <details class="panel"><summary>Handling & weather <span>↗</span></summary><p>Experimental coefficients, not certified training.</p>
      <label>Wind strength <output id="windSpeedValue"></output><input id="windSpeed" type="range" min="0" max="24" step="0.5"></label>
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
      <div id="paused" hidden><div class="panel"><div class="eyebrow">SIMULATION PAUSED</div><h2>Take your time.</h2><p>Held inputs cleared. Lever and wheel settings preserved.</p><button id="resume">Resume · P</button><button id="paused-show-me">Show me (calm example)</button></div></div>${logMarkup}${demoMarkup}`;
    for (const section of ["objective", "crew"] as const) {
      this.el(`${section}-tab`).onclick = () => {
        for (const page of ["objective", "crew"]) {
          this.el(`${page}-page`).hidden = page !== section;
          this.el(`${page}-tab`).setAttribute(
            "aria-pressed",
            String(page === section),
          );
        }
      };
    }
    this.instruments = new Instruments(this.root);
    this.mooringUI = new MooringUI(this.root, game, actions.readOnly);
    this.serviceUI = new ServiceUI(this.root, game);
    this.logUI = new LogUI(this.root, game, actions.pause, actions.readOnly);
    this.demoUI = new DemoUI(this.root, lab, actions);
    this.el("retry").onclick = actions.retry;
    this.el("pause").onclick = actions.pause;
    this.el("resume").onclick = actions.pause;
    this.el("paused-show-me").onclick = actions.showDemo;
    this.el("camera").onclick = actions.camera;
    const allowed = () => !game.paused && !actions.readOnly();
    this.el("neutral").onclick = () => {
      if (allowed()) game.controls.port = game.controls.starboard = 0;
      game.observe();
    };
    this.el("center").onclick = () => {
      if (allowed()) game.controls.rudder = 0;
      game.observe();
    };
    for (const engine of ["port", "starboard"] as const) {
      (this.el(engine) as HTMLInputElement).oninput = (e) => {
        if (allowed())
          game.controls[engine] =
            Number((e.target as HTMLInputElement).value) / 100;
        game.observe();
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
          game.observe();
        }),
    );
    (this.el("wheel") as HTMLInputElement).oninput = (e) => {
      if (allowed())
        game.controls.rudder =
          (Number((e.target as HTMLInputElement).value) * Math.PI) / 180;
      game.observe();
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
        if (actions.readOnly()) return;
        const v = Number((e.target as HTMLInputElement).value);
        // Slider is in knots; simulation stays in m/s.
        if (id === "windSpeed") game.weather.speed = metresPerSecond(v);
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
      if (actions.readOnly()) return;
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
    g.observe();
    const values: Record<string, [number, string]> = {
      windSpeed: [
        knots(g.weather.speed),
        `${knots(g.weather.speed).toFixed(1)} kn`,
      ],
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
      r = requirements(s, p.positionTarget, g.acceptableContact);
    this.instruments.update(g, this.view.mode);
    this.root
      .querySelectorAll<HTMLInputElement | HTMLButtonElement>(
        "input, #neutral, #center, [data-value], #defaults",
      )
      .forEach((el) => {
        el.disabled = this.actions.readOnly();
      });
    const secured = g.securingRequirements();
    // Stage numbers include the holding stage only when there is traffic.
    const stage = (n: number) =>
      String(n + (g.missionEnabled ? 1 : 0)).padStart(2, "0");
    // Fuel service runs while secured in the fuel mission.
    const service = p.service,
      servicing = g.missionEnabled && p.phase === "secured",
      serviced = service.completedAt !== null;
    this.el("mission-phase").textContent =
      p.phase === "holding"
        ? "01 / HOLD"
        : p.phase === "failed"
          ? "MISSION FAILED"
          : p.phase === "approach"
            ? `${stage(1)} / APPROACH`
            : p.phase === "securing"
              ? `${stage(2)} / SECURE THE BOAT`
              : servicing
                ? serviced
                  ? `${stage(4)} / SERVICE COMPLETE`
                  : `${stage(3)} / SECURED · FUEL SERVICE`
                : `${stage(3)} / SECURED · LIVE`;
    this.el("mission-title").textContent =
      p.phase === "holding"
        ? "Wait for the fuel berth."
        : p.phase === "failed"
          ? "Hull contact without a fender."
          : p.phase === "approach"
            ? "Approach North quay."
            : p.phase === "securing"
              ? "Make fast, without rushing."
              : servicing
                ? serviced
                  ? "Fuelled. Ready to depart."
                  : "Fuel service alongside."
                : "Lines on. Stay attentive.";
    this.el("mission-hint").textContent =
      p.phase === "holding"
        ? p.departedAt === null
          ? "The monohull is refuelling. Keep your boat's centre inside the blue holding area south-east of the quay; it leaves 5 seconds after you are in position."
          : "The monohull is leaving. Keep clear of the fuel berth and its approach lane until the radio calls it clear."
        : p.phase === "failed"
          ? `${p.failure}. Fenders must cover the point of contact with another vessel. Retry (R) to start again.`
          : p.phase === "approach"
            ? "Enter the mint berth, bow north. Hold for 3 seconds, then attach lines from Crew & lines."
            : p.phase === "securing"
              ? p.positionTarget === "alongside"
                ? "Amber area: settle alongside, not at the old centre point. Tend slack with Take in / Ease. Gentle covered fender contact is allowed."
                : "Attach the first line to activate the amber alongside area. Use Crew & lines; either attachment order is allowed."
              : servicing
                ? serviced
                  ? "The boat is still live and secured. Departure through the harbour entrance comes next."
                  : "Work through the checklist in order. Stay secured: fuelling stops if a line, fender or position requirement is lost."
                : "The boat is still live. Watch tension and wind. Release either line to practise again.";
    const checks: [boolean, string][] =
      p.phase === "holding"
        ? [
            [insideHolding(s), "Boat centre inside holding area"],
            [
              p.departedAt !== null,
              `Monohull departs after ${missionConfig.holding.countdown} s in position`,
            ],
            [!p.inFuelZone, "Stay out of the fuel berth until called"],
          ]
        : p.phase === "failed"
          ? []
          : servicing
            ? [[true, "Secured alongside · lines, fenders, neutral"]]
            : [
                [
                  r.position,
                  p.positionTarget === "alongside"
                    ? "Full hull inside amber alongside area"
                    : `Position within ${scenario.target.positionTolerance} m · full hull inside`,
                ],
                [
                  r.heading,
                  p.positionTarget === "alongside"
                    ? "Parallel to quay · 000° ± 10°"
                    : "Heading 000° ± 8°",
                ],
                [r.speed, "Speed ≤ 0.35 kn · minimal rotation"],
                [
                  r.clear,
                  p.positionTarget === "alongside"
                    ? "Clear or gentle covered fender contact"
                    : "Clear of docks and boundaries",
                ],
                ...(p.phase === "approach"
                  ? []
                  : ([
                      [secured.fenders, "Starboard fenders deployed"],
                      [
                        secured.lines,
                        "Both lines · slack ≤0.45 m · safe load · crew idle",
                      ],
                      [
                        secured.neutral,
                        service.enginesOff
                          ? "Engines off for fuel service"
                          : "Both neutral · delivered thrust settled",
                      ],
                    ] as [boolean, string][])),
              ];
    this.el("requirements").innerHTML = checks
      .map(
        ([ok, text]) =>
          `<div class="check ${ok ? "ok" : ""}"><span>${ok ? "●" : "○"}</span>${text}</div>`,
      )
      .join("");
    const countdown = missionConfig.holding.countdown;
    this.el("dwell").style.width =
      p.phase === "holding"
        ? `${(p.departedAt !== null ? 1 : p.countdown === null ? 0 : (countdown - p.countdown) / countdown) * 100}%`
        : p.phase === "failed"
          ? "0%"
          : `${(p.dwell / (p.phase === "approach" ? scenario.target.dwell : mooringConfig.securedDwell)) * 100}%`;
    this.el("result").textContent =
      p.phase === "holding"
        ? p.departedAt !== null
          ? "Monohull leaving — wait to be called"
          : p.countdown === null
            ? "Countdown starts inside the holding area"
            : `Monohull departs in ${p.countdown.toFixed(1)} s`
        : p.phase === "failed"
          ? `Mission failed at ${p.elapsed.toFixed(1)} s · press Retry (R)`
          : servicing && service.fuelling
            ? `Fuelling ${service.litres.toFixed(0)} / ${missionConfig.service.litres} L`
            : servicing && serviced
              ? `Service complete at ${service.completedAt!.toFixed(1)} s · +${p.penalty} s penalties`
              : p.phase === "secured"
                ? `Secured · first achieved ${p.securedAt!.toFixed(1)} s · +${p.penalty} s penalties. Simulation remains live.`
                : `${p.phase === "approach" ? "Arrival hold" : "Securing hold"}: ${p.dwell.toFixed(1)} / 3.0 s`;
    const latest = g.radio.at(-1);
    this.el("radio").hidden = !latest;
    if (latest) {
      this.el("radio-time").textContent = `${latest.time.toFixed(1)} s`;
      this.el("radio-message").textContent = latest.message;
      this.el("radio").classList.toggle("fresh", p.elapsed - latest.time < 6);
    }
    this.el("time").textContent = `TIME ${p.elapsed.toFixed(1)} s`;
    this.el("penalties").textContent =
      `CONTACTS ${p.collisions} / +${p.penalty} s`;
    for (const k of ["port", "starboard"] as const) {
      const v = g.controls[k];
      this.el(`${k}Value`).textContent = service.enginesOff
        ? "ENGINE OFF"
        : Math.abs(v) < 0.01
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
    this.el("paused").hidden = !g.paused || this.lab.mode === "demo";
    this.logUI.update();
    this.mooringUI.update();
    this.serviceUI.update();
    this.demoUI.update();
  }
}
