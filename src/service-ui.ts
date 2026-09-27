import { stage } from "./config";
import type { Session } from "./session";
import type { Step } from "./stage/load";
type Checklist = Extract<Step, { kind: "checklist" }>;
// The stage's checklist (the fuel service for the fuel dock), if it has one.
const checklist = stage.file.mission.steps.find(
  (st): st is Checklist => st.kind === "checklist",
);
const buttons = (item: Checklist["items"][number]): [string, string][] =>
  item.action === "choice"
    ? item.options.map((o) => [o.id, o.label])
    : [[item.id, "button" in item ? item.button : item.label]];
// Every step stays clickable so out-of-order requests are explained, not hidden.
export const serviceMarkup = checklist
  ? `<section class="service" id="service" aria-label="${checklist.title}" hidden><div class="eyebrow">${checklist.label.split("·").pop()!.trim()} CHECKLIST</div>${checklist.items
      .map(
        (item, i) =>
          `<div class="service-row" id="svc-row-${i}"><span class="service-mark">○</span><span class="service-label">${item.label}${item.action === "timed" ? ` <small id="svc-amount"></small>` : ""}</span><span class="service-buttons">${buttons(
            item,
          )
            .map(
              ([action, text]) =>
                `<button type="button" id="svc-${action}" aria-describedby="service-feedback">${text}</button>`,
            )
            .join("")}</span></div>`,
      )
      .join(
        "",
      )}<p id="service-feedback" role="status">Work through the steps in order.</p></section>`
  : "";
export class ServiceUI {
  private attempt = 0;
  constructor(
    private root: HTMLElement,
    private game: Session,
  ) {
    for (const item of checklist?.items ?? [])
      for (const [action] of buttons(item))
        this.el(`svc-${action}`).onclick = () => {
          const result = game.requestService(action);
          this.el("service-feedback").textContent = result.message;
          this.update();
        };
  }
  private el(id: string) {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
  update() {
    if (!checklist) return;
    const g = this.game,
      p = g.progress,
      s = p.service;
    const index = g.steps.indexOf(checklist);
    // Shown while its step is current, including after losing secured.
    const visible = g.missionEnabled && index >= 0 && p.step === index;
    this.el("service").hidden = !visible;
    if (!visible) return;
    if (this.attempt !== g.recorder.attempt) {
      this.attempt = g.recorder.attempt;
      this.el("service-feedback").textContent =
        "Work through the steps in order.";
    }
    checklist.items.forEach((item, i) => {
      const ok = g.itemComplete(item);
      const row = this.el(`svc-row-${i}`);
      row.classList.toggle("ok", ok);
      row.querySelector(".service-mark")!.textContent = ok ? "●" : "○";
      if (item.action === "timed")
        this.el("svc-amount").textContent =
          s.amount > 0
            ? `${s.amount.toFixed(0)} / ${item.total} ${item.unit}`
            : `${item.total} ${item.unit}`;
    });
    for (const item of checklist.items)
      for (const [action] of buttons(item))
        (this.el(`svc-${action}`) as HTMLButtonElement).disabled =
          g.paused || s.completedAt !== null;
  }
}
