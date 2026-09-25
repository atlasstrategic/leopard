import { degrees } from "./config";
import { positioningTarget } from "./scenario";
import { bearingText, instrumentData, type WindMode } from "./instrument-data";
import type { Session } from "./session";
import type { CameraMode } from "./rendering";
import "./instruments.css";

function ticks(compass: boolean) {
  let markup = "";
  for (let d = 0; d < 360; d += 10) {
    const major = d % 30 === 0;
    markup += `<line x1="100" y1="${major ? 21 : 17}" x2="100" y2="12" transform="rotate(${d} 100 100)" class="dial-tick ${major ? "major" : ""}"/>`;
    if (major) {
      const a = (d * Math.PI) / 180;
      const text = compass
        ? { 0: "N", 90: "E", 180: "S", 270: "W" }[d] || String(d)
        : String(d <= 180 ? d : 360 - d);
      markup += `<text x="${100 + 69 * Math.sin(a)}" y="${100 - 69 * Math.cos(a)}" class="dial-number ${d % 90 === 0 ? "cardinal" : ""}">${text}</text>`;
    }
  }
  return markup;
}

// Clean instrument-inspired screens, not a branded replica or emulated autopilot.
export const instrumentsMarkup = `
<section class="instruments" aria-label="Helm instruments">
  <article class="instrument">
    <div class="instrument-title"><span>HEADING</span><span class="manual-mode">STBY · MANUAL</span></div>
    <div class="rudder-display" aria-label="Rudder angle indicator">
      <div class="rudder-labels"><span class="port-color">30 P</span><span>15</span><span id="rudder">0° —</span><span>15</span><span class="starboard-color">S 30</span></div>
      <div class="rudder-track"><i></i><b id="rudder-marker"></b></div>
    </div>
    <div class="dial-wrap">
      <svg class="instrument-dial" viewBox="0 0 200 200" role="img" aria-label="Heading compass; cyan diamond is bearing to berth">
        <circle cx="100" cy="100" r="91" class="dial-face"/>
        <g id="compass-card">${ticks(true)}</g>
        <path d="M95 4 L105 4 L100 15 Z" class="bow-index"/>
        <g id="berth-marker"><path d="M100 15 L105 22 L100 29 L95 22 Z" class="berth-index"/></g>
      </svg>
      <div class="dial-readout"><small>HDG / TRUE</small><strong id="heading">000° T</strong></div>
    </div>
    <div class="instrument-data"><div><small>SOG</small><strong id="speed">0.00 kn</strong></div><div><small>COG / TRUE</small><strong id="course">—</strong></div></div>
    <div class="instrument-caption berth-caption" title="Training overlay: bearing to the centre of berth 01, not a steering command">◆ BRG 01 <span id="bearing">—</span></div>
  </article>
  <article class="instrument">
    <div class="instrument-title"><span>WIND</span><span>FROM · KNOTS</span></div>
    <div class="wind-selector" role="group" aria-label="Wind reference"><button id="wind-apparent" aria-pressed="true">APPARENT</button><button id="wind-true" aria-pressed="false">TRUE</button></div>
    <div class="dial-wrap">
      <svg class="instrument-dial" viewBox="0 0 200 200" role="img" aria-label="Wind from angle relative to bow; port left, starboard right">
        <circle cx="100" cy="100" r="91" class="dial-face"/>
        <path d="M100 9 A91 91 0 0 0 9 100" class="wind-sector port-sector"/>
        <path d="M100 9 A91 91 0 0 1 191 100" class="wind-sector starboard-sector"/>
        ${ticks(false)}
        <path d="M96 6 L104 6 L100 15 Z" class="bow-index"/>
        <g id="wind-needle"><path d="M100 17 L106 32 L101.5 31 L101.5 51 L98.5 51 L98.5 31 L94 32 Z" class="wind-pointer"/></g>
      </svg>
      <div class="dial-readout"><small id="wind-angle-label">AWA / FROM BOW</small><strong id="wind-angle">—</strong></div>
    </div>
    <div class="instrument-data"><div><small id="wind-speed-label">AWS</small><strong id="wind">0.0 kn</strong></div><div><small>FROM / TRUE</small><strong id="wind-from">—</strong></div></div>
    <div class="instrument-caption" id="wind-reference">Apparent · felt on the moving boat</div>
  </article>
</section>`;

export class Instruments {
  mode: WindMode = "apparent";
  private elements = new Map<string, HTMLElement>();
  constructor(private root: HTMLElement) {
    for (const mode of ["apparent", "true"] as const) {
      this.el(`wind-${mode}`).onclick = () => {
        this.mode = mode;
      };
    }
  }
  private el(id: string) {
    if (!this.elements.has(id))
      this.elements.set(id, this.root.querySelector<HTMLElement>(`#${id}`)!);
    return this.elements.get(id)!;
  }
  update(game: Session, camera: CameraMode) {
    const data = instrumentData(
        game.state,
        game.weather,
        positioningTarget(game.progress.positionTarget),
      ),
      wind = data[this.mode];
    this.root
      .querySelector(".instruments")!
      .classList.toggle("helm-instruments", camera === "helm");
    this.el("heading").textContent = bearingText(data.heading);
    this.el("speed").textContent = `${data.speed.toFixed(2)} kn`;
    this.el("course").textContent = bearingText(data.course);
    this.el("bearing").textContent =
      `${bearingText(data.bearing)} · ${data.distance.toFixed(1)} m`;
    this.el("compass-card").setAttribute(
      "transform",
      `rotate(${-degrees(data.heading)} 100 100)`,
    );
    this.el("berth-marker").style.visibility =
      data.bearing === null ? "hidden" : "visible";
    this.el("berth-marker").setAttribute(
      "transform",
      `rotate(${degrees((data.bearing ?? 0) - data.heading)} 100 100)`,
    );
    const rudder = degrees(game.controls.rudder);
    this.el("rudder").textContent =
      `${Math.abs(rudder).toFixed(0)}° ${rudder < -0.3 ? "P" : rudder > 0.3 ? "S" : "—"}`;
    this.el("rudder-marker").style.left = `${50 + (rudder / 30) * 48}%`;
    for (const mode of ["apparent", "true"])
      this.el(`wind-${mode}`).setAttribute(
        "aria-pressed",
        String(this.mode === mode),
      );
    this.el("wind-angle-label").textContent =
      `${this.mode === "apparent" ? "AWA" : "TWA"} / FROM BOW`;
    this.el("wind-speed-label").textContent =
      this.mode === "apparent" ? "AWS" : "TWS";
    const relative = wind.relative;
    const side =
      relative === null ||
      Math.abs(relative) < Math.PI / 360 ||
      Math.abs(relative) > Math.PI - Math.PI / 360
        ? ""
        : relative < 0
          ? " P"
          : " S";
    this.el("wind-angle").textContent =
      relative === null
        ? "—"
        : `${Math.abs(degrees(relative)).toFixed(0)}°${side}`;
    this.el("wind").textContent = `${wind.speed.toFixed(1)} kn`;
    this.el("wind-from").textContent = bearingText(wind.from);
    this.el("wind-reference").textContent =
      this.mode === "apparent"
        ? "Apparent · felt on the moving boat"
        : "True · relative to the water";
    this.el("wind-needle").style.visibility =
      relative === null ? "hidden" : "visible";
    this.el("wind-needle").setAttribute(
      "transform",
      `rotate(${degrees(relative ?? 0)} 100 100)`,
    );
  }
}
