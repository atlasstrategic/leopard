import {
  boat,
  degrees,
  knots,
  metresPerSecond,
  scenario,
  mooringConfig,
  stage,
} from "./config";
import { bundledStages } from "./stage/registry";
import { parseStage } from "./stage/load";
import { problemText, stageFileKey } from "./stage/select";
import { showMeAvailable } from "./demonstration";
import { MooringUI, mooringMarkup } from "./mooring-ui";
import { ServiceUI, serviceMarkup } from "./service-ui";
import { DebriefUI, debriefMarkup } from "./debrief-ui";
import { Instruments, instrumentsMarkup, paletteMarkup } from "./instruments";
import { wrap } from "./instrument-data";
import { LogUI, crewMarkup, logLaunchMarkup, logMarkup } from "./log-ui";
import { objective } from "./objective";
import { DemoUI, demoMarkup, type DemoActions } from "./demo-ui";
import type { PracticeLab } from "./demonstration";
import { clamp } from "./simulation";
import type { CheckpointId, Session } from "./session";
import {
  checkpointIds,
  checkpointLabel,
  checkpointMarkup,
} from "./checkpoint-ui";

import type { View } from "./rendering";
// Panels that open in the drawer beside the rail. The open one is kept
// outside the UI, which is rebuilt when the session changes.
export type Drawer = "crew" | "stage" | "handling";
const drawers: Drawer[] = ["crew", "stage", "handling"];
const drawerTitles: Record<Drawer, string> = {
  crew: "CREW & LINES",
  stage: "STAGE",
  handling: "HANDLING & WEATHER",
};
// Phones get the stacked layout in style.css and shorter strip texts.
const phone = matchMedia("(max-width: 760px), (max-height: 500px)");
let drawer: Drawer | null = null;
// The objective card (O) and the harbour radio (M) can be hidden from the
// rail; a dot on the rail button then marks a new step or a new call. The keys card shows the first time the game
// starts in this browser, then on ? or the rail's Keys button.
const shown = {
  objective: true,
  seenStep: "",
  radio: true,
  seenCalls: 0,
  keys: firstVisit(),
  // Focus mode (H): only one-line strips over the view.
  focus: false,
};
export function toggleFocus() {
  shown.focus = !shown.focus;
}
function firstVisit() {
  try {
    return localStorage.getItem("leopard.keysSeen") !== "1";
  } catch {
    return false;
  }
}
export function toggleObjective() {
  shown.objective = !shown.objective;
}
export function toggleRadioShown() {
  shown.radio = !shown.radio;
}
export function toggleKeys(open = !shown.keys) {
  shown.keys = open;
  if (!open)
    try {
      localStorage.setItem("leopard.keysSeen", "1");
    } catch {
      // Storage refused: the card simply shows again next time.
    }
}
const key = (...keys: string[]) => keys.map((k) => `<kbd>${k}</kbd>`).join(" ");
const keysMarkup = `<section id="keys" class="panel keys-card" role="dialog" aria-labelledby="keys-title" hidden><div class="drawer-head"><div class="eyebrow" id="keys-title">KEYS</div><button type="button" id="keys-close" aria-label="Close keys">Close ×</button></div><dl class="keys-list">
<dt>${key("Q", "A")}</dt><dd>Port lever up / down, 20% steps</dd>
<dt>${key("E", "D")}</dt><dd>Starboard lever up / down</dd>
<dt>${key("W", "S")} ${key("↑", "↓")}</dt><dd>Both levers up / down</dd>
<dt>${key("←", "→")}</dt><dd>Hold to turn the wheel (it stays put)</dd>
<dt>${key("X")}</dt><dd>Centre the rudder</dd>
<dt>${key("Space")}</dt><dd>Both engines neutral (even while paused)</dd>
<dt>${key("C")}</dt><dd>Camera: chase, overhead, helm</dd>
<dt>${key("I")}</dt><dd>Next instrument page</dd>
<dt>${key("O")} ${key("M")}</dt><dd>Show or hide the objective · the radio</dd>
<dt>${key("V")}</dt><dd>Fold or open the radio</dd>
<dt>${key("P")} ${key("R")}</dt><dd>Pause · retry (R twice while sailing)</dd>
<dt>${key("H")}</dt><dd>Focus mode: minimal overlay</dd>
<dt>${key("?")}</dt><dd>This card</dd></dl><div class="eyebrow numpad-title">NUMPAD · PORT · BOTH · STARBOARD</div><div class="numpad" role="table" aria-label="Numpad levers"><div role="row"><span role="cell">${key("7")} ahead</span><span role="cell">${key("8")} ahead</span><span role="cell">${key("9")} ahead</span></div><div role="row"><span role="cell">${key("4")} neutral</span><span role="cell">${key("5")} neutral</span><span role="cell">${key("6")} neutral</span></div><div role="row"><span role="cell">${key("1")} astern</span><span role="cell">${key("2")} astern</span><span role="cell">${key("3")} astern</span></div></div><p>Levers persist: set them and let go. Neutral is not a brake; use short bursts astern to stop.</p><button type="button" id="keys-ok">Got it</button></section>`;
const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const railButton = (id: string, label: string, paths: string, attrs = "") =>
  `<button type="button" id="${id}" class="rail-button" ${attrs}>${icon(paths)}<span>${label}</span></button>`;
const railMarkup = [
  railButton(
    "rail-objective",
    "Goal",
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    'aria-controls="objective" aria-pressed="true" title="Show or hide the objective (O)"',
  ),
  railButton(
    "rail-radio",
    "Radio",
    '<path d="M5 9a9 9 0 0 1 14 0M8 12a5 5 0 0 1 8 0"/><circle cx="12" cy="15.5" r="1.5"/><path d="M12 17v4"/>',
    'aria-controls="radio" aria-pressed="true" title="Show or hide the harbour radio (M)"',
  ),
  railButton(
    "rail-crew",
    "Crew",
    '<rect x="8" y="3" width="8" height="18" rx="4"/><path d="M8 8h8M8 16h8"/>',
    'aria-controls="drawer" aria-expanded="false" title="Crew & lines: fenders and mooring lines"',
  ),
  railButton(
    "rail-stage",
    "Stage",
    '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    'aria-controls="drawer" aria-expanded="false" title="Stage: choose or load a stage"',
  ),
  railButton(
    "rail-handling",
    "Weather",
    '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    'aria-controls="drawer" aria-expanded="false" title="Handling & weather: wind, tuning and instrument display"',
  ),
  railButton(
    "rail-log",
    "Log",
    '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    'title="Voyage log & export"',
  ),
  railButton(
    "rail-focus",
    "Focus",
    '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    'title="Focus mode: a minimal overlay (H)"',
  ),
  railButton(
    "rail-keys",
    "Keys",
    '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h.5M7 14h10"/>',
    'aria-controls="keys" aria-expanded="false" title="Keyboard keys (?)"',
  ),
  '<div class="rail-gap"></div>',
  `<button type="button" id="camera" class="rail-button" title="Change camera (C)">${icon('<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/>')}<span id="camera-label">Chase</span></button>`,
  railButton(
    "pause",
    "Pause",
    '<path d="M9 5v14M15 5v14"/>',
    'aria-label="Pause (P)" title="Pause (P)"',
  ),
  railButton(
    "retry",
    "Retry",
    '<path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4"/>',
    'aria-label="Retry (R)" title="Retry (R)"',
  ),
  railButton(
    "show-me",
    "Show me",
    '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/>',
    'title="Show me: a calm-water demonstration"',
  ),
].join("");
// Harbour radio: a new call shows in full for a few seconds of simulation
// time, then folds to one line so it does not cover the view. V or the
// button unfolds it (it stays open) or folds it again. Kept outside the UI,
// which is rebuilt when the session changes.
const radioFold = { pinned: false, folded: -1 },
  radioFresh = 8;
function radioOpen(g: Session) {
  const latest = g.radio.at(-1);
  return (
    !!latest &&
    (radioFold.pinned ||
      (g.progress.elapsed - latest.time < radioFresh &&
        radioFold.folded !== g.radio.length))
  );
}
export function toggleRadio(g: Session) {
  if (!g.radio.length) return;
  // V on a hidden radio brings it back, open.
  if (!shown.radio) {
    shown.radio = true;
    radioFold.pinned = true;
    return;
  }
  if (radioOpen(g)) {
    radioFold.pinned = false;
    radioFold.folded = g.radio.length;
  } else radioFold.pinned = true;
}
// The step's long hint: shown in full for a while when a step starts (or the
// mission ends), then folded behind a button so the card stays small. The
// button opens it (it stays open) or folds it again.
const hintFold = { pinned: false, key: "", since: 0, folded: "" },
  hintFresh = 10;
const hintKey = (g: Session) =>
  `${g.recorder.attempt}/${g.progress.step}/${g.progress.phase === "failed" || g.progress.phase === "complete" ? g.progress.phase : ""}`;
function hintOpen(g: Session) {
  const key = hintKey(g);
  if (key !== hintFold.key) {
    hintFold.key = key;
    hintFold.since = g.progress.elapsed;
  }
  return (
    hintFold.pinned ||
    (g.progress.elapsed - hintFold.since < hintFresh && hintFold.folded !== key)
  );
}
function toggleHint(g: Session) {
  if (hintOpen(g)) {
    hintFold.pinned = false;
    hintFold.folded = hintKey(g);
  } else hintFold.pinned = true;
}
export class UI {
  root = document.querySelector<HTMLDivElement>("#ui")!;
  instruments: Instruments;
  logUI: LogUI;
  mooringUI: MooringUI;
  serviceUI: ServiceUI;
  debriefUI: DebriefUI;
  demoUI: DemoUI;
  constructor(
    private game: Session,
    private view: View,
    private actions: {
      retry: () => void;
      restartFrom: (id: CheckpointId) => void;
      pause: () => void;
      camera: () => void;
      readOnly: () => boolean;
      stageNotice: string;
    } & DemoActions,
    private lab: PracticeLab,
  ) {
    this.root.innerHTML = `
      <header><h1 class="visually-hidden">Leopard / Handling Lab: a little power, a lot of patience</h1><div class="eyebrow">LEOPARD / HANDLING LAB · <span class="header-stage">${stage.name}</span></div></header>
      <section class="panel objective" id="objective" aria-label="Objective"><div class="objective-head"><div class="eyebrow" id="mission-phase"></div><div class="stats"><span id="time"></span><span id="penalties"></span></div></div><h2 id="mission-title"></h2><p id="mission-hint"></p><button type="button" id="hint-toggle" class="hint-toggle" aria-controls="mission-hint" aria-expanded="true">Hide hint</button>
      <div id="objective-page"><div id="requirements"></div><div class="progress"><div id="dwell"></div></div>${serviceMarkup()}</div>
      <div id="result" aria-live="polite"></div><button id="show-debrief" class="debrief-launch" hidden>Debrief</button>${checkpointMarkup("restart")}</section>
      <section class="panel radio" id="radio" hidden><div class="radio-head"><div class="eyebrow">HARBOUR RADIO · <span id="radio-time"></span></div><button id="radio-toggle" type="button" aria-controls="radio-message" aria-expanded="true">Fold · V</button></div><p id="radio-message" role="status" aria-live="polite"></p></section>
      ${instrumentsMarkup}
      <nav class="rail panel" aria-label="Panels and actions">${railMarkup}</nav>
      <aside id="drawer" class="panel drawer" aria-labelledby="drawer-title" hidden><div class="drawer-head"><div class="eyebrow" id="drawer-title"></div><button type="button" id="drawer-close" aria-label="Close panel">Close ×</button></div>
      <section id="drawer-crew" hidden>${crewMarkup}${mooringMarkup()}${logLaunchMarkup}</section>
      <section id="drawer-stage" class="stage-panel" hidden><div class="eyebrow">CURRENT STAGE</div><strong id="stage-name"></strong><p id="stage-description"></p><label>Choose stage<select id="stage-select">${bundledStages()
        .map((s) => `<option value="${s.id}">${s.name}</option>`)
        .join(
          "",
        )}</select></label><label class="stage-file">Load stage file…<input id="stage-file" type="file" accept=".json,application/json"></label><p class="stage-help">Switching stage restarts the game; export your voyage log first if you need it.</p><p id="stage-notice" role="status"></p></section>
      <section id="drawer-handling" class="handling-panel" hidden><p>Experimental coefficients, not certified training.</p>${paletteMarkup}
      <label>Wind strength <output id="windSpeedValue"></output><input id="windSpeed" type="range" min="0" max="24" step="0.5"></label>
      <label>Wind from (° true) <output id="windDirectionValue"></output><input id="windDirection" type="range" min="0" max="360" step="5"></label>
      <label>Engine thrust <output id="maxThrustValue"></output><input id="maxThrust" type="range" min="1500" max="5000" step="100"></label>
      <label>Engine response <output id="engineLagValue"></output><input id="engineLag" type="range" min="0.3" max="3" step="0.1"></label>
      <label>Lateral resistance <output id="lateralDragValue"></output><input id="lateralDrag" type="range" min="4000" max="24000" step="1000"></label>
      <label>Yaw damping <output id="yawDragValue"></output><input id="yawDrag" type="range" min="40000" max="220000" step="10000"></label>
      <button id="defaults">Restore tuning defaults</button></section></aside>
      <footer><section class="panel levers"><div class="lever" data-engine="port"><div class="lever-head"><div class="eyebrow">PORT <span>Q / A</span></div><strong id="portValue"></strong></div><div class="lever-buttons"><button data-engine="port" data-value="1">FWD +</button><button data-engine="port" data-value="0">N</button><button data-engine="port" data-value="-1">− REV</button></div><input id="port" class="throttle" aria-label="Port gear and throttle" type="range" min="-100" max="100" step="20"><small id="portActual"></small></div>
      <div class="wheel"><div class="both"><div class="lever-head"><div class="eyebrow">BOTH <span>W / S</span></div></div><div class="lever-buttons"><button data-engine="both" data-value="1" aria-label="Both levers ahead a step (W)">FWD +</button><button id="neutral" aria-label="Both levers neutral (Space)">N</button><button data-engine="both" data-value="-1" aria-label="Both levers astern a step (S)">− REV</button></div></div><div class="rudder"><div class="eyebrow">RUDDER <span>← / →</span></div><input id="wheel" aria-label="Rudder angle" type="range" min="-30" max="30" step="1"><button id="center">Centre · X</button></div></div>
      <div class="lever" data-engine="starboard"><div class="lever-head"><div class="eyebrow">STARBOARD <span>E / D</span></div><strong id="starboardValue"></strong></div><div class="lever-buttons"><button data-engine="starboard" data-value="1">FWD +</button><button data-engine="starboard" data-value="0">N</button><button data-engine="starboard" data-value="-1">− REV</button></div><input id="starboard" class="throttle" aria-label="Starboard gear and throttle" type="range" min="-100" max="100" step="20"><small id="starboardActual"></small></div></section>
</footer>
      <div id="focus-hud" hidden><div class="panel focus-strip" id="focus-objective"></div><div class="panel focus-strip" id="focus-instruments"></div><div class="panel focus-strip" id="focus-helm"></div><button type="button" id="focus-exit" class="focus-exit">Exit focus · H</button></div>
      ${keysMarkup}<div id="toast" class="panel toast" role="status" aria-live="polite" hidden></div>
      <div id="paused" hidden><div class="panel"><div class="eyebrow">SIMULATION PAUSED</div><h2>Take your time.</h2><p>Held inputs cleared. Lever and wheel settings preserved.</p><button id="resume">Resume · P</button><button id="paused-show-me">Show me (calm example)</button></div></div>${logMarkup}${demoMarkup}${debriefMarkup()}`;
    for (const id of drawers)
      this.el(`rail-${id}`).onclick = () =>
        this.openDrawer(drawer === id ? null : id);
    this.el("drawer-close").onclick = () => this.openDrawer(null);
    this.el("rail-log").onclick = () => this.el("open-log").click();
    this.el("rail-objective").onclick = () => {
      toggleObjective();
      this.update();
    };
    this.el("rail-radio").onclick = () => {
      toggleRadioShown();
      this.update();
    };
    for (const id of ["rail-focus", "focus-exit"])
      this.el(id).onclick = () => {
        toggleFocus();
        this.update();
      };
    this.el("rail-keys").onclick = () => {
      toggleKeys();
      this.update();
    };
    for (const id of ["keys-close", "keys-ok"])
      this.el(id).onclick = () => {
        toggleKeys(false);
        this.update();
      };
    // A stage notice (such as an unknown stage id) opens the Stage panel.
    this.openDrawer(actions.stageNotice ? "stage" : drawer);
    this.instruments = new Instruments(this.root);
    this.mooringUI = new MooringUI(this.root, game, actions.readOnly);
    this.serviceUI = new ServiceUI(this.root, game);
    this.debriefUI = new DebriefUI(this.root, game, actions.retry);
    for (const prefix of ["restart", "debrief-restart"])
      for (const id of checkpointIds())
        this.el(`${prefix}-${id}`).onclick = () => {
          (this.el("debrief") as HTMLDialogElement).close();
          actions.restartFrom(id);
        };
    this.logUI = new LogUI(this.root, game, actions.pause, actions.readOnly);
    this.demoUI = new DemoUI(this.root, lab, actions);
    this.el("retry").onclick = actions.retry;
    this.el("pause").onclick = actions.pause;
    this.el("resume").onclick = actions.pause;
    this.el("paused-show-me").onclick = actions.showDemo;
    this.el("camera").onclick = actions.camera;
    this.el("hint-toggle").onclick = () => {
      toggleHint(game);
      this.update();
    };
    this.el("radio-toggle").onclick = () => {
      toggleRadio(game);
      this.update();
    };
    this.setupStagePanel();
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
          const engine = b.dataset.engine as "port" | "starboard" | "both",
            v = Number(b.dataset.value);
          for (const key of engine === "both"
            ? (["port", "starboard"] as const)
            : [engine])
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
  // A short message in the middle of the view; an empty one clears it.
  private toastTimer = 0;
  toast(message: string) {
    const el = this.el("toast");
    clearTimeout(this.toastTimer);
    el.textContent = message;
    el.hidden = !message;
    if (message)
      this.toastTimer = window.setTimeout(() => (el.hidden = true), 2500);
  }
  // One drawer beside the rail shows one panel at a time; null closes it.
  openDrawer(id: Drawer | null) {
    drawer = id;
    this.el("drawer").hidden = !id;
    // The radio moves over to make room for an open drawer.
    this.root.classList.toggle("drawer-open", !!id);
    for (const d of drawers) {
      this.el(`drawer-${d}`).hidden = d !== id;
      this.el(`rail-${d}`).setAttribute("aria-expanded", String(d === id));
    }
    if (id) this.el("drawer-title").textContent = drawerTitles[id];
  }
  // Stage picker: bundled stages reload with ?stage=<id>; a stage file is
  // validated first, kept for this browser tab and played with ?stage=file.
  private setupStagePanel() {
    const select = this.el("stage-select") as HTMLSelectElement,
      notice = this.el("stage-notice");
    this.el("stage-name").textContent = stage.name;
    this.el("stage-description").textContent =
      `${stage.file.description} Version ${stage.version} by ${stage.file.author}.`;
    notice.textContent = this.actions.stageNotice;
    select.value = stage.id;
    if (!bundledStages().some((s) => s.id === stage.id)) {
      select.add(new Option(`${stage.name} (file)`, "file"), 0);
      select.value = "file";
    }
    select.onchange = () => {
      if (select.value !== "file")
        location.search = `?stage=${encodeURIComponent(select.value)}`;
    };
    const file = this.el("stage-file") as HTMLInputElement;
    file.onchange = async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      const text = await chosen.text();
      try {
        parseStage(JSON.parse(text));
      } catch (e) {
        notice.textContent = `${chosen.name}: ${problemText(e)}`;
        file.value = "";
        return;
      }
      try {
        sessionStorage.setItem(stageFileKey, text);
      } catch {
        notice.textContent =
          "This browser blocked storage, so the stage file cannot be kept across the reload.";
        return;
      }
      location.search = "?stage=file";
    };
    // Show me is scripted for particular stages.
    for (const id of ["show-me", "paused-show-me"])
      this.el(id).hidden = !showMeAvailable();
  }
  // Restart buttons appear once a checkpoint has been reached.
  private updateCheckpoints() {
    const g = this.game,
      readOnly = this.actions.readOnly();
    for (const prefix of ["restart", "debrief-restart"]) {
      let any = false;
      for (const id of checkpointIds()) {
        const c = g.checkpoints[id],
          button = this.el(`${prefix}-${id}`) as HTMLButtonElement;
        button.hidden = !c || readOnly;
        any ||= !button.hidden;
        if (c)
          button.title = `Restart from the ${checkpointLabel(id).toLowerCase()} checkpoint saved in attempt ${c.attempt} at ${c.time.toFixed(1)} s`;
      }
      this.el(`${prefix}-checkpoints`).hidden = !any;
    }
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
      p = g.progress;
    this.instruments.update(g, this.view.mode);
    this.root
      .querySelectorAll<HTMLInputElement | HTMLButtonElement>(
        "input, #neutral, #center, [data-value], #defaults",
      )
      .forEach((el) => {
        el.disabled = this.actions.readOnly();
      });
    this.root.classList.toggle("focus-mode", shown.focus);
    this.el("focus-hud").hidden = !shown.focus;
    const step = hintKey(g);
    if (shown.objective) shown.seenStep = step;
    this.el("objective").hidden = !shown.objective;
    const goal = this.el("rail-objective");
    goal.setAttribute("aria-pressed", String(shown.objective));
    goal.classList.toggle("news", !shown.objective && shown.seenStep !== step);
    this.el("keys").hidden = !shown.keys || this.lab.mode === "demo";
    this.el("rail-keys").setAttribute("aria-expanded", String(shown.keys));
    const o = objective(g);
    this.el("mission-phase").textContent = o.eyebrow;
    this.el("mission-title").textContent = o.title;
    this.el("mission-hint").textContent = o.hint;
    const hint = hintOpen(g) && !!o.hint;
    this.el("mission-hint").hidden = !hint;
    const hintButton = this.el("hint-toggle");
    hintButton.hidden = !o.hint;
    hintButton.textContent = hint ? "Hide hint" : "Show hint";
    hintButton.setAttribute("aria-expanded", String(hint));
    this.el("requirements").innerHTML = o.checks
      .map(
        ([ok, text]) =>
          `<div class="check ${ok ? "ok" : ""}"><span>${ok ? "●" : "○"}</span>${text}</div>`,
      )
      .join("");
    this.el("dwell").style.width = `${Math.max(0, Math.min(1, o.bar)) * 100}%`;
    this.el("result").textContent = o.result;
    const latest = g.radio.at(-1);
    // A retry starts the calls again.
    if (shown.radio || g.radio.length < shown.seenCalls)
      shown.seenCalls = g.radio.length;
    this.el("radio").hidden = !latest || !shown.radio;
    const radio = this.el("rail-radio");
    radio.setAttribute("aria-pressed", String(shown.radio));
    radio.classList.toggle("news", g.radio.length > shown.seenCalls);
    if (latest) {
      this.el("radio-time").textContent = `${latest.time.toFixed(1)} s`;
      this.el("radio-message").textContent = latest.message;
      this.el("radio").classList.toggle("fresh", p.elapsed - latest.time < 6);
      const open = radioOpen(g);
      this.el("radio").classList.toggle("folded", !open);
      const toggle = this.el("radio-toggle");
      toggle.textContent = open ? "Fold · V" : "Open · V";
      toggle.setAttribute("aria-expanded", String(open));
    }
    this.el("time").textContent = `TIME ${p.elapsed.toFixed(1)} s`;
    if (shown.focus) {
      const lever = (k: "port" | "starboard") => {
        const v = g.controls[k];
        return p.service.enginesOff
          ? "OFF"
          : Math.abs(v) < 0.01
            ? "N"
            : `${v > 0 ? "AHEAD" : "ASTERN"} ${Math.round(Math.abs(v) * 100)}%`;
      };
      const rudder = degrees(g.controls.rudder);
      this.el("focus-objective").textContent =
        `${o.eyebrow} · ${o.title} · ${Math.round(Math.max(0, Math.min(1, o.bar)) * 100)}% · ${p.elapsed.toFixed(1)} s · +${p.penalty} s`;
      this.el("focus-instruments").textContent = phone.matches
        ? this.instruments.short
        : this.instruments.summary;
      this.el("focus-helm").textContent =
        `P ${lever("port")} · RUDDER ${Math.abs(rudder).toFixed(0)}°${rudder < -0.5 ? " P" : rudder > 0.5 ? " S" : ""} · S ${lever("starboard")}`;
    }
    this.el("penalties").textContent =
      `CONTACTS ${p.collisions} / +${p.penalty} s`;
    for (const k of ["port", "starboard"] as const) {
      const v = g.controls[k];
      this.el(`${k}Value`).textContent = p.service.enginesOff
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
    const camera = this.view.mode[0].toUpperCase() + this.view.mode.slice(1);
    this.el("camera-label").textContent = camera;
    this.el("camera").setAttribute("aria-label", `Camera: ${camera} (C)`);
    this.el("paused").hidden = !g.paused || this.lab.mode === "demo";
    this.logUI.update();
    this.mooringUI.update();
    this.serviceUI.update();
    this.debriefUI.update();
    this.updateCheckpoints();
    this.demoUI.update();
  }
}
