import { degrees, stage } from "./config";
import { positioningTarget } from "./scenario";
import { bearingText, instrumentData, wrap } from "./instrument-data";
import type { Session } from "./session";
import type { CameraMode } from "./rendering";
import "./instruments.css";

// One display after an autopilot control head (a Raymarine p70-style unit):
// rudder bar across the top, mode and data boxes on the left, and a dial on
// the right that depends on the page. Heading page: a heading-up compass card
// with the true wind (T) and the training bearing on its ring. Wind page: a
// bow-up wind dial with the apparent-wind needle and the true wind. Not a
// branded replica or an emulated autopilot: the mode is always Standby.
export type Page = "heading" | "wind";
export type Palette = "night" | "day";
const pages: Page[] = ["heading", "wind"];
const pageNames: Record<Page, string> = { heading: "Heading", wind: "Wind" };
// Kept outside the UI, which is rebuilt when the session changes; the palette
// is also remembered in this browser.
const display: { page: Page; palette: Palette } = {
  page: "heading",
  palette: readPalette(),
};
function readPalette(): Palette {
  try {
    return localStorage.getItem("leopard.palette") === "day" ? "day" : "night";
  } catch {
    return "night";
  }
}
export function nextPage() {
  display.page = pages[(pages.indexOf(display.page) + 1) % pages.length];
}
export function setPalette(palette: Palette) {
  display.palette = palette;
  try {
    localStorage.setItem("leopard.palette", palette);
  } catch {
    // Private windows may refuse storage; the choice still applies now.
  }
}

// Layout of the 320 × 240 screen.
const W = 320,
  H = 240,
  M = 8,
  w = W - 2 * M,
  h = H - 2 * M,
  bar = 19,
  top = M + bar,
  left = w * 0.4,
  boxTop = top + h * 0.17,
  boxH = h * 0.2,
  foot = boxTop + 3 * boxH,
  cx = M + left + (w - left) / 2,
  cy = top + (foot - top) / 2,
  R = Math.min((w - left) / 2, (foot - top) / 2) - h * 0.03;
const n = (v: number) => v.toFixed(1);
const at = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};
function ticks() {
  let d = "";
  for (let a = 0; a < 360; a += 10) {
    const [x1, y1] = at(R * 0.965, a),
      [x2, y2] = at(R * 0.965 - (a % 30 === 0 ? R * 0.16 : R * 0.07), a);
    d += `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`;
  }
  return `<path d="${d}" class="p70-ring-line" stroke-width="${n(R * 0.03)}"/>`;
}
function arc(from: number, to: number) {
  const [x1, y1] = at(R * 0.84, from),
    [x2, y2] = at(R * 0.84, to);
  return `M${n(x1)} ${n(y1)}A${n(R * 0.84)} ${n(R * 0.84)} 0 0 1 ${n(x2)} ${n(y2)}`;
}
// A marker on the ring at the top, turned into place by its group.
const [, ringTop] = at(R, 0);
const trueMarker = `<circle cx="${n(cx)}" cy="${n(ringTop)}" r="${n(R * 0.1)}" class="p70-true"/><text x="${n(cx)}" y="${n(ringTop + R * 0.045)}" class="p70-true-label" font-size="${n(R * 0.12)}">T</text>`;
const boat = `<path d="M${n(cx)} ${n(cy - R * 0.14)}C${n(cx + R * 0.09)} ${n(cy - R * 0.02)} ${n(cx + R * 0.07)} ${n(cy + R * 0.07)} ${n(cx)} ${n(cy + R * 0.07)}C${n(cx - R * 0.07)} ${n(cy + R * 0.07)} ${n(cx - R * 0.09)} ${n(cy - R * 0.02)} ${n(cx)} ${n(cy - R * 0.14)}Z" class="p70-boat"/>`;
const ring = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R)}" class="p70-dial" stroke-width="${n(R * 0.07)}"/>`;
function compassCard() {
  let letters = "";
  for (const [a, text] of [
    [0, "N"],
    [90, "E"],
    [180, "S"],
    [270, "W"],
  ] as const) {
    const [x, y] = at(R * 0.7, a);
    letters += `<text x="${n(x)}" y="${n(y + R * 0.07)}" class="p70-card-letter" font-size="${n(R * 0.2)}">${text}</text>`;
  }
  return ticks() + letters;
}
function windScale() {
  let labels = "";
  for (const a of [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]) {
    const [x, y] = at(R * 0.66, a);
    labels += `<text x="${n(x)}" y="${n(y + R * 0.05)}" class="p70-scale" font-size="${n(R * 0.13)}">${a <= 180 ? a : 360 - a}</text>`;
  }
  return labels;
}
function rudderBar() {
  const seg = w / 12;
  let out = `<rect x="${M}" y="${M}" width="${w}" height="${bar}" class="p70-bar"/>`;
  const labels = ["30", "", "20", "", "10", "", "", "10", "", "20", "", "30"];
  labels.forEach((label, i) => {
    const x = M + i * seg;
    out += `<path d="M${n(x)} ${M}V${M + bar}" class="p70-box-line" stroke-width="${i % 2 ? 0.6 : 1.4}"/>`;
    if (label)
      out += `<text x="${n(x + seg / 2)}" y="${n(M + bar * 0.75)}" class="p70-bar-label" font-size="${n(bar * 0.62)}">${label}</text>`;
  });
  return (
    out +
    `<rect id="p70-rudder" x="${n(M + w / 2 - seg / 4)}" y="${M + 1}" width="${n(seg / 2)}" height="${bar - 2}" class="p70-rudder"/>`
  );
}
function boxes() {
  let out = "";
  for (let i = 0; i < 3; i++) {
    const y = boxTop + i * boxH;
    out += `<rect x="${M}" y="${n(y)}" width="${n(left)}" height="${n(boxH)}" class="p70-box"/>`;
    out += `<text id="p70-label-${i}" x="${M + 4}" y="${n(y + boxH * 0.3)}" class="p70-faint" font-size="${n(boxH * 0.22)}"></text>`;
    out += `<text id="p70-value-${i}" x="${n(M + left - 6)}" y="${n(y + boxH * 0.86)}" class="p70-value" font-size="${n(boxH * 0.5)}"></text>`;
  }
  return out;
}
const screen = `<svg viewBox="0 0 ${W} ${H}" class="p70-screen" aria-hidden="true">
  <rect width="${W}" height="${H}" rx="10" class="p70-bezel"/>
  <rect x="${M}" y="${M}" width="${w}" height="${h}" class="p70-lcd"/>
  ${rudderBar()}
  <text x="${M + 4}" y="${n(top + h * 0.085)}" class="p70-mode" font-size="${n(h * 0.085)}">Standby</text>
  <text id="p70-line" x="${M + 4}" y="${n(top + h * 0.155)}" class="p70-ink" font-size="${n(h * 0.06)}"></text>
  ${boxes()}
  <path d="M${M} ${n(foot)}H${M + w}" class="p70-box-line" stroke-width="1.2"/>
  <text id="p70-page" x="${M + 6}" y="${n(foot + (M + h - foot) * 0.7)}" class="p70-ink" font-size="${n((M + h - foot) * 0.5)}"></text>
  <circle id="p70-dot-0" cx="${n(M + w - 22)}" cy="${n(foot + (M + h - foot) / 2)}" r="2.7" class="p70-dot"/>
  <circle id="p70-dot-1" cx="${n(M + w - 12)}" cy="${n(foot + (M + h - foot) / 2)}" r="2.7" class="p70-dot"/>
  ${ring}
  <g id="p70-heading-page">
    <g id="p70-card">${compassCard()}</g>
    <path d="M${n(cx)} ${n(cy)}L${n(cx)} ${n(cy - R * 0.93)}" class="p70-lubber" stroke-width="${n(R * 0.018)}"/>
    <g id="p70-bearing"><rect x="${n(cx - R * 0.075)}" y="${n(ringTop - R * 0.075)}" width="${n(R * 0.15)}" height="${n(R * 0.15)}" transform="rotate(45 ${n(cx)} ${n(ringTop)})" class="p70-target"/></g>
    <g id="p70-heading-true">${trueMarker}</g>
    ${boat}
    <text id="p70-heading" x="${n(cx)}" y="${n(cy + R * 0.5)}" class="p70-big" font-size="${n(R * 0.3)}"></text>
  </g>
  <g id="p70-wind-page">
    <path d="${arc(300, 340)}" class="p70-port" stroke-width="${n(R * 0.1)}"/>
    <path d="${arc(20, 60)}" class="p70-starboard" stroke-width="${n(R * 0.1)}"/>
    ${ticks()}${windScale()}
    <g id="p70-wind-true">${trueMarker}</g>
    <g id="p70-needle"><path d="M${n(cx)} ${n(cy + R * 0.2)}L${n(cx)} ${n(cy - R * 0.9)}" class="p70-needle" stroke-width="${n(R * 0.07)}"/></g>
    ${boat}
  </g>
</svg>`;
export const instrumentsMarkup = `<section class="instruments" aria-label="Helm instrument"><button type="button" id="p70" class="p70" aria-describedby="p70-readout">${screen}</button><p id="p70-readout" class="visually-hidden" aria-live="off"></p><small class="p70-hint">I or click: next page</small></section>`;
// The palette choice, for the Handling & weather panel.
export const paletteMarkup = `<div class="palette-row" role="group" aria-label="Instrument palette"><span>Instrument display</span><button type="button" id="palette-night">Night</button><button type="button" id="palette-day">Day</button></div>`;

const rotate = (deg: number) => `rotate(${n(deg)} ${n(cx)} ${n(cy)})`;
const side = (relative: number) =>
  Math.abs(relative) < Math.PI / 360 ||
  Math.abs(relative) > Math.PI - Math.PI / 360
    ? ""
    : relative < 0
      ? " P"
      : " S";
export class Instruments {
  private elements = new Map<string, Element>();
  constructor(private root: HTMLElement) {
    // A mouse click hands focus back, so Space still means both neutral.
    this.el("p70").addEventListener("click", (e) => {
      nextPage();
      if ((e as MouseEvent).detail > 0) (this.el("p70") as HTMLElement).blur();
    });
    for (const palette of ["night", "day"] as const)
      this.root
        .querySelector(`#palette-${palette}`)
        ?.addEventListener("click", () => setPalette(palette));
  }
  private el(id: string) {
    if (!this.elements.has(id))
      this.elements.set(id, this.root.querySelector(`#${id}`)!);
    return this.elements.get(id)!;
  }
  private text(id: string, value: string) {
    const e = this.el(id);
    if (e.textContent !== value) e.textContent = value;
  }
  private show(id: string, visible: boolean) {
    (this.el(id) as SVGElement).style.visibility = visible
      ? "visible"
      : "hidden";
  }
  update(game: Session, camera: CameraMode) {
    // The training bearing follows the current step's target (e.g. a holding
    // area or the harbour entrance), defaulting to the berth. After the
    // mission it keeps the last step's target.
    const done = game.progress.phase === "complete",
      step = done ? game.steps[game.steps.length - 1] : game.step,
      target = step?.bearing,
      label = target?.label ?? stage.berth.label;
    const data = instrumentData(
      game.state,
      game.weather,
      target?.zone
        ? stage.zones[target.zone].shape
        : target?.gate
          ? stage.gates[target.gate]
          : positioningTarget(game.progress.positionTarget),
    );
    const heading = degrees(data.heading),
      page = display.page;
    const section = this.root.querySelector(".instruments")!;
    section.classList.toggle("helm-instruments", camera === "helm");
    const unit = this.el("p70");
    unit.classList.toggle("day", display.palette === "day");
    unit.setAttribute(
      "aria-label",
      `Instrument, ${pageNames[page]} page. Activate for the next page (I).`,
    );
    for (const palette of ["night", "day"] as const)
      this.root
        .querySelector(`#palette-${palette}`)
        ?.setAttribute("aria-pressed", String(display.palette === palette));
    // Rudder bar: 30° either side of the centre.
    const rudder = Math.max(-30, Math.min(30, degrees(game.controls.rudder)));
    this.el("p70-rudder").setAttribute(
      "x",
      n(M + w / 2 + (rudder / 30) * (w / 2) - w / 48),
    );
    this.text(
      "p70-line",
      `COG:${data.course === null ? "—" : bearingText(data.course).replace(" T", "")}`,
    );
    this.text("p70-page", pageNames[page]);
    pages.forEach((p, i) =>
      this.el(`p70-dot-${i}`).classList.toggle("on", p === page),
    );
    // Pages by display, so markers made visible inside a page stay hidden
    // with it.
    (this.el("p70-heading-page") as SVGElement).style.display =
      page === "heading" ? "" : "none";
    (this.el("p70-wind-page") as SVGElement).style.display =
      page === "wind" ? "" : "none";
    const apparent = data.apparent,
      water = data.true;
    const boxes: [string, string][] =
      page === "heading"
        ? [
            ["TWS (kn)", water.speed.toFixed(1)],
            ["SOG (kn)", data.speed.toFixed(2)],
            [
              `BRG ${label} ${data.bearing === null ? "—" : bearingText(data.bearing).replace(" T", "")} (m)`,
              data.distance.toFixed(1),
            ],
          ]
        : [
            ["AWS (kn)", apparent.speed.toFixed(1)],
            ["TWS (kn)", water.speed.toFixed(1)],
            [
              "AWA",
              apparent.relative === null
                ? "—"
                : `${Math.abs(degrees(apparent.relative)).toFixed(0)}°${side(apparent.relative)}`,
            ],
          ];
    boxes.forEach(([l, v], i) => {
      this.text(`p70-label-${i}`, l);
      this.text(`p70-value-${i}`, v);
    });
    if (page === "heading") {
      this.el("p70-card").setAttribute("transform", rotate(-heading));
      this.text(
        "p70-heading",
        `${String(Math.round(heading) % 360).padStart(3, "0")}°T`,
      );
      this.show("p70-heading-true", water.relative !== null);
      this.el("p70-heading-true").setAttribute(
        "transform",
        rotate(degrees(water.relative ?? 0)),
      );
      this.show("p70-bearing", data.bearing !== null);
      this.el("p70-bearing").setAttribute(
        "transform",
        rotate(degrees(wrap((data.bearing ?? 0) - data.heading))),
      );
    } else {
      this.show("p70-needle", apparent.relative !== null);
      this.el("p70-needle").setAttribute(
        "transform",
        rotate(degrees(apparent.relative ?? 0)),
      );
      this.show("p70-wind-true", water.relative !== null);
      this.el("p70-wind-true").setAttribute(
        "transform",
        rotate(degrees(water.relative ?? 0)),
      );
    }
    // A plain-text reading for screen readers.
    this.text(
      "p70-readout",
      `Heading ${bearingText(data.heading)}, speed ${data.speed.toFixed(2)} knots, true wind ${water.speed.toFixed(1)} knots from ${bearingText(water.from)}, apparent wind ${apparent.speed.toFixed(1)} knots, bearing to ${label} ${bearingText(data.bearing)} at ${data.distance.toFixed(1)} metres, rudder ${Math.abs(rudder).toFixed(0)} degrees${side(game.controls.rudder)}.`,
    );
  }
}
