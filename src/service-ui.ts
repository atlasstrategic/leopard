import { missionConfig } from "./config";
import type { Session, ServiceAction } from "./session";
// Every step stays clickable so out-of-order requests are explained, not hidden.
const rows: { label: string; actions: [ServiceAction, string][] }[] = [
  { label: "Engines off", actions: [["enginesOff", "Engines off"]] },
  {
    label: "Fuel type",
    actions: [
      ["diesel", "Diesel"],
      ["petrol", "Petrol"],
    ],
  },
  { label: "Fuel", actions: [["fuel", "Start fuelling"]] },
  { label: "Pay", actions: [["pay", "Pay"]] },
  { label: "Engines on", actions: [["enginesOn", "Engines on"]] },
];
export const serviceMarkup = `<section class="service" id="service" aria-label="Fuel service checklist" hidden><div class="eyebrow">FUEL SERVICE CHECKLIST</div>${rows
  .map(
    (row, i) =>
      `<div class="service-row" id="svc-row-${i}"><span class="service-mark">○</span><span class="service-label">${row.label}${i === 2 ? ` <small id="svc-litres"></small>` : ""}</span><span class="service-buttons">${row.actions.map(([action, text]) => `<button type="button" id="svc-${action}" aria-describedby="service-feedback">${text}</button>`).join("")}</span></div>`,
  )
  .join(
    "",
  )}<p id="service-feedback" role="status">Work through the steps in order. Fuelling stops if the boat is no longer secured.</p></section>`;
export class ServiceUI {
  private attempt = 0;
  constructor(
    private root: HTMLElement,
    private game: Session,
  ) {
    for (const row of rows)
      for (const [action] of row.actions)
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
    const g = this.game,
      p = g.progress,
      s = p.service,
      total = missionConfig.service.litres;
    // Shown from first securing until the service is complete.
    const visible =
      g.missionEnabled && p.securedAt !== null && s.completedAt === null;
    this.el("service").hidden = !visible;
    if (!visible) return;
    if (this.attempt !== g.recorder.attempt) {
      this.attempt = g.recorder.attempt;
      this.el("service-feedback").textContent =
        "Work through the steps in order. Fuelling stops if the boat is no longer secured.";
    }
    const done = [
      s.enginesOff || s.paid,
      s.fuelConfirmed,
      s.litres >= total,
      s.paid,
      s.completedAt !== null,
    ];
    done.forEach((ok, i) => {
      const row = this.el(`svc-row-${i}`);
      row.classList.toggle("ok", ok);
      row.querySelector(".service-mark")!.textContent = ok ? "●" : "○";
    });
    this.el("svc-litres").textContent =
      s.litres > 0 ? `${s.litres.toFixed(0)} / ${total} L` : `${total} L`;
    for (const row of rows)
      for (const [action] of row.actions)
        (this.el(`svc-${action}`) as HTMLButtonElement).disabled =
          g.paused || s.completedAt !== null;
  }
}
