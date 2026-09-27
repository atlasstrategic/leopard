import { mooringConfig } from "./config";
import "./mooring.css";
import { lineIds, lineGeometry, attachmentCheck, sternTo } from "./mooring";
import type { Session } from "./session";
const firstHint = () =>
  sternTo()
    ? "Hold the berth first, then deploy fenders on both sides, attach both stern lines in neutral and pick up the lazy line."
    : "Hold the berth first, then deploy starboard fenders and attach both lines in neutral.";
// What a line is made fast to: its bollard, or the lazy line's bow bridle.
const target = (id: string) => {
  const def = mooringConfig.lines[id];
  return def.kind === "lazy" ? "bow" : def.bollard;
};
const attachLabel = (id: string) =>
  mooringConfig.lines[id].kind === "lazy"
    ? "Pick up"
    : `Attach ${mooringConfig.lines[id].bollard}`;
// Built when the UI is, so bollard names come from the active stage.
export const mooringMarkup = () =>
  `<section class="mooring-controls" aria-label="Mooring lines"><div class="eyebrow">${sternTo() ? "STERN LINES · LAZY LINE" : "STARBOARD LINES · NAMED BOLLARDS"}</div>${lineIds()
    .map(
      (id) =>
        `<div class="mooring-row"><div><strong>${mooringConfig.lines[id].name} → ${target(id)}</strong><small id="line-${id}-reading"></small></div><button type="button" id="line-${id}" aria-describedby="line-feedback">${attachLabel(id)}</button></div><div class="tending-buttons" aria-label="${mooringConfig.lines[id].name} line tending"><button id="tend-${id}-in" type="button">Take in 0.25 m</button><button id="tend-${id}-out" type="button">Ease 0.25 m</button><button id="tend-${id}-stop" type="button">Stop</button></div><small class="tending-status" id="tend-${id}-status"></small>`,
    )
    .join(
      "",
    )}<p id="line-feedback" role="status">${firstHint()}</p><p class="line-help">Line-throwing reach ≤6.5 m; fitting speed ≤0.25 m/s. Slack lines do not push. Releasing a loaded line may let the boat move.${sternTo() ? " The lazy line is picked up at the quay once a stern line is on, led to the bow and taken in until it holds the bow off." : ""}</p></section>`;
export class MooringUI {
  private attempt = 0;
  constructor(
    private root: HTMLElement,
    private game: Session,
    private readOnly: () => boolean = () => false,
  ) {
    for (const id of lineIds())
      for (const action of ["in", "out", "stop"] as const)
        this.el(`tend-${id}-${action}`).onclick = () => {
          if (this.readOnly()) return;
          const result = game.requestTend(id, action);
          this.update();
          this.el("line-feedback").textContent = result.message;
        };
    for (const id of lineIds())
      this.el(`line-${id}`).onclick = () => {
        if (this.readOnly()) return;
        const result = game.requestLine(
          id,
          game.mooring[id].attached ? "release" : "attach",
        );
        this.update();
        this.el("line-feedback").textContent = result.message;
      };
  }
  private el(id: string) {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
  update() {
    const g = this.game;
    if (this.attempt !== g.recorder.attempt) {
      this.attempt = g.recorder.attempt;
      this.el("line-feedback").textContent = firstHint();
    }
    for (const id of lineIds()) {
      const line = g.mooring[id],
        def = mooringConfig.lines[id],
        distance = lineGeometry(g.state, id).distance;
      const button = this.el(`line-${id}`) as HTMLButtonElement;
      button.disabled = g.paused || this.readOnly();
      for (const action of ["in", "out", "stop"])
        (this.el(`tend-${id}-${action}`) as HTMLButtonElement).disabled =
          g.paused ||
          this.readOnly() ||
          !line.attached ||
          (action !== "stop" && line.tending !== "idle");
      this.el(`tend-${id}-status`).textContent = line.attached
        ? `Paid out ${line.restLength.toFixed(2)} m · ${line.tending === "idle" ? line.tendStatus || "crew idle" : `${line.tending === "in" ? "taking in" : "easing"} · ${line.adjustmentRemaining.toFixed(2)} m remaining`}`
        : "Attach before tending";
      button.textContent = line.attached
        ? def.kind === "lazy"
          ? "Let go"
          : `Release ${def.bollard}`
        : attachLabel(id);
      button.setAttribute("aria-pressed", String(line.attached));
      button.title = line.attached
        ? `Release ${def.name.toLowerCase()} line${line.warning ? " — WARNING: under load" : ""}`
        : attachmentCheck(g.state, id, undefined, g.acceptableContact).reason;
      const text = line.attached
        ? `${line.warning ? "HIGH LOAD · " : ""}${(line.tension / 1000).toFixed(2)} kN · ${line.extension > 0.005 ? `stretch ${line.extension.toFixed(2)} m` : `slack ${Math.max(0, line.restLength - distance).toFixed(2)} m`}`
        : `${line.broken ? "BROKEN · " : ""}${def.kind === "lazy" ? "at the quay" : `${distance.toFixed(1)} / ${mooringConfig.reach} m reach`}`;
      this.el(`line-${id}-reading`).textContent = text;
      this.el(`line-${id}-reading`).classList.toggle(
        "line-warning",
        line.warning || line.broken,
      );
    }
  }
}
