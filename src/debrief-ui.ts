import { missionConfig, scenario } from "./config";
import { debrief, tracks } from "./debrief";
import type { Episode } from "./recorder";
import type { Session } from "./session";
import "./debrief.css";
export const debriefMarkup = `<dialog id="debrief" aria-labelledby="debrief-title"><div class="log-header"><div><div class="eyebrow">FUEL MISSION DEBRIEF</div><h2 id="debrief-title"></h2></div><button id="close-debrief" aria-label="Close debrief">Close ×</button></div><div class="debrief-body"><div class="debrief-summary"><p class="debrief-score"><strong id="debrief-total"></strong><span id="debrief-rating"></span></p><div id="debrief-categories"></div><p class="debrief-tip"><b>One thing to try:</b> <span id="debrief-tip"></span></p><dl id="debrief-figures"></dl><div id="debrief-penalties"></div><p class="debrief-note">Game score with provisional weights (40% impact & clearance, 25% position & speed, 20% procedure, 15% smoothness). Not a skipper assessment.</p><div class="debrief-actions"><button id="debrief-retry">Retry · R</button></div></div><figure class="debrief-track"><svg id="debrief-svg" role="img" aria-label="Overhead trace of your track and the monohull's"></svg><figcaption><span class="key-boat"></span>Your track <span class="key-mono"></span>Monohull <span class="key-contact"></span>Contact</figcaption></figure></div></dialog>`;
const esc = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
// World metres to SVG: x east, y north drawn upwards.
const pts = (list: [number, number][]) =>
  list.map(([x, y]) => `${x.toFixed(1)},${(-y).toFixed(1)}`).join(" ");
function trackSvg(g: Session) {
  const recording = g.recorder.export();
  const { boat, monohull } = tracks(recording.snapshots);
  boat.push([g.state.x, g.state.y]);
  const shapes = scenario.obstacles
    .map(
      (b) =>
        `<rect class="${b.kind}" x="${b.x - b.width / 2}" y="${-(b.y + b.length / 2)}" width="${b.width}" height="${b.length}"/>`,
    )
    .join("");
  const t = scenario.target,
    h = missionConfig.holding,
    gate = missionConfig.entrance;
  const contacts = recording.events
    .filter((e) => e.type === "contact")
    .map((e) => (e.data as unknown as Episode).peakContact)
    .map(
      (c) =>
        `<circle class="contact" cx="${c.worldX.toFixed(1)}" cy="${(-c.worldY).toFixed(1)}" r="1.2"/>`,
    )
    .join("");
  const [sx, sy] = boat[0] ?? [0, 0];
  return `<rect class="water" x="-48" y="-52" width="96" height="131"/>${shapes}<rect class="berth" x="${t.x - t.width / 2}" y="${-(t.y + t.length / 2)}" width="${t.width}" height="${t.length}"/><circle class="holding" cx="${h.x}" cy="${-h.y}" r="${h.radius}"/><circle class="light-red" cx="${gate.x - gate.width / 2}" cy="${-gate.y}" r="1.1"/><circle class="light-green" cx="${gate.x + gate.width / 2}" cy="${-gate.y}" r="1.1"/>${monohull.length > 1 ? `<polyline class="mono" points="${pts(monohull)}"/>` : ""}<polyline class="boat" points="${pts(boat)}"/><circle class="start" cx="${sx.toFixed(1)}" cy="${(-sy).toFixed(1)}" r="1.3"/>${contacts}`;
}
export class DebriefUI {
  private dialog: HTMLDialogElement;
  private shownFor = "";
  constructor(
    private root: HTMLElement,
    private game: Session,
    retry: () => void,
  ) {
    this.dialog = this.el("debrief") as HTMLDialogElement;
    this.el("close-debrief").onclick = () => this.dialog.close();
    this.el("debrief-retry").onclick = () => {
      this.dialog.close();
      retry();
    };
    this.el("show-debrief").onclick = () => this.open();
    this.dialog.addEventListener("keydown", (e) => e.stopPropagation());
  }
  private el(id: string) {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
  private ended() {
    const phase = this.game.progress.phase;
    return phase === "complete" || phase === "failed";
  }
  open() {
    const g = this.game,
      d = debrief(g.progress, g.recorder.events);
    this.el("debrief-title").textContent =
      g.progress.phase === "failed"
        ? "Mission failed."
        : "Clear of the harbour.";
    this.el("debrief-total").textContent =
      d.total === null ? "—" : `${d.total}`;
    this.el("debrief-rating").textContent = d.rating;
    this.el("debrief-categories").innerHTML = d.categories
      .map(
        (c) =>
          `<div class="debrief-category"><div><span>${esc(c.label)} · ${Math.round(c.weight * 100)}%</span><b>${c.score}</b></div><div class="bar"><div style="width:${c.score}%"></div></div>${c.notes.length ? `<small>${c.notes.map(esc).join(" · ")}</small>` : ""}</div>`,
      )
      .join("");
    this.el("debrief-tip").textContent = d.tip;
    this.el("debrief-figures").innerHTML = d.figures
      .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
      .join("");
    this.el("debrief-penalties").innerHTML = d.penalties.length
      ? `<div class="eyebrow">PENALTIES</div>${d.penalties.map((p) => `<p>${p.time.toFixed(1)} s · ${esc(p.message)}</p>`).join("")}`
      : `<div class="eyebrow">PENALTIES</div><p>None.</p>`;
    const svg = this.el("debrief-svg");
    svg.setAttribute("viewBox", "-48 -52 96 131");
    svg.innerHTML = trackSvg(g);
    if (!this.dialog.open) this.dialog.showModal();
  }
  update() {
    const g = this.game,
      ended = this.ended();
    this.el("show-debrief").hidden = !ended;
    // Opens once when the attempt ends; reopen from the objective panel.
    const key = `${g.recorder.attempt}/${g.progress.phase}`;
    if (ended && this.shownFor !== key) {
      this.shownFor = key;
      this.open();
    }
    if (!ended && this.dialog.open) this.dialog.close();
  }
}
