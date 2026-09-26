import type { Session } from "./session";
import { recordingCSV, type Episode, type Recording } from "./recorder";
import "./log-ui.css";
export const crewMarkup = `<div class="crew-controls"><div class="eyebrow">FENDER CREW · 3s</div><div class="crew-buttons"><button id="fender-port" type="button" aria-describedby="crew-status">Port: stowed</button><button id="fender-starboard" type="button" aria-describedby="crew-status">Starboard: stowed</button></div><p id="crew-status" role="status">Click a side to deploy its fenders. Allow 3 simulation seconds.</p></div><button id="open-log" class="log-launch">Voyage log & export <span id="log-count"></span><small id="last-event">Approach practice started</small></button>`;
export const logMarkup = `<dialog id="voyage-log" aria-labelledby="log-title"><div class="log-header"><div><div class="eyebrow">LOCAL VOYAGE RECORDER</div><h2 id="log-title">Events & contact reports</h2></div><button id="close-log" aria-label="Close voyage log">Close ×</button></div><p>Opening this log pauses handling. Close it, then resume explicitly. Loads are solver estimates—not measured peak forces or damage predictions.</p><div class="log-options"><label>Attempt<select id="log-attempt"></select></label><label>Show<select id="log-filter"><option value="all">All events</option><option value="contact">Contacts & penalties</option><option value="crew">Fender crew</option><option value="lines">Mooring lines</option><option value="mission">Mission phases</option><option value="controls">Engines, rudder & heading</option><option value="weather">Weather & tuning</option></select></label><button id="export-json">Export JSON</button><button id="export-csv">Export CSV</button></div><p id="log-summary"></p><div id="log-events"></div><p>Time is simulation seconds. Telemetry is sampled at 1 Hz and included in exports. Last 3 attempts survive retry in memory; export before reloading. Newest 150 matching events shown; exports contain all retained events. Limits and any dropped records are included in exports.</p></dialog>`;
export class LogUI {
  private dialog: HTMLDialogElement;
  private attemptsKey = "";
  constructor(
    private root: HTMLElement,
    private game: Session,
    private pause: () => void,
    private readOnly: () => boolean = () => false,
  ) {
    this.dialog = this.el("voyage-log") as HTMLDialogElement;
    for (const side of ["port", "starboard"] as const)
      this.el(`fender-${side}`).onclick = () => {
        if (this.readOnly()) return;
        const result = game.requestFenders(side);
        this.update(); // Acknowledge on click, without waiting for the next HUD frame.
        this.el("crew-status").textContent = result.message;
      };
    this.el("open-log").onclick = () => {
      if (!game.paused) pause();
      this.dialog.showModal();
      this.refresh();
    };
    this.el("close-log").onclick = () => this.dialog.close();
    this.dialog.addEventListener("keydown", (e) => e.stopPropagation());
    this.el("log-attempt").onchange = () => this.refresh();
    this.el("log-filter").onchange = () => this.refresh();
    this.el("export-json").onclick = () => this.download("json");
    this.el("export-csv").onclick = () => this.download("csv");
  }
  private el(id: string) {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
  private recording(): Recording {
    const attempt = Number((this.el("log-attempt") as HTMLSelectElement).value);
    return (
      this.game.history.find((r) => r.attempt === attempt) ??
      this.game.recorder.export()
    );
  }
  private download(format: "json" | "csv") {
    const recording = this.recording();
    const blob = new Blob(
      [
        format === "json"
          ? JSON.stringify(recording, null, 2)
          : recordingCSV(recording),
      ],
      {
        type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
      },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `leopard-attempt-${recording.attempt}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  update() {
    const g = this.game;
    for (const side of ["port", "starboard"] as const) {
      const f = g.fenders[side],
        button = this.el(`fender-${side}`) as HTMLButtonElement;
      const label = `${side === "port" ? "Port" : "Starboard"}: ${f.remaining > 0 ? `${f.target ? "deploy" : "stow"} ${f.remaining.toFixed(1)}s` : f.deployed ? "deployed" : "stowed"}`;
      if (button.textContent !== label) button.textContent = label;
      button.disabled = g.paused || f.remaining > 0 || this.readOnly();
      button.setAttribute("aria-disabled", String(button.disabled));
      button.setAttribute("aria-pressed", String(f.deployed));
      button.title = `${f.deployed ? "Retrieve" : "Deploy"} ${side} fenders (3 simulation seconds)`;
    }
    const status = g.paused
      ? "Paused — crew timers are stopped. Resume (P) to continue."
      : g.fenders.port.remaining > 0 || g.fenders.starboard.remaining > 0
        ? "Crew working — watch the countdown. Orange fenders appear when deployment finishes."
        : `Port ${g.fenders.port.deployed ? "deployed" : "stowed"}; starboard ${g.fenders.starboard.deployed ? "deployed" : "stowed"}. Click a side to ${g.fenders.port.deployed || g.fenders.starboard.deployed ? "deploy or retrieve" : "deploy"}.`;
    if (this.el("crew-status").textContent !== status)
      this.el("crew-status").textContent = status;
    this.el("log-count").textContent = String(g.recorder.events.length);
    this.el("last-event").textContent =
      g.recorder.events.at(-1)?.message ?? "No events";
    if (this.dialog.open) this.refresh();
  }
  private refresh() {
    const key = [
      this.game.recorder.attempt,
      ...this.game.history.map((r) => r.attempt),
    ].join("/");
    const select = this.el("log-attempt") as HTMLSelectElement;
    if (key !== this.attemptsKey) {
      this.attemptsKey = key;
      select.replaceChildren();
      for (const id of key.split("/")) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = `Attempt ${id}${Number(id) === this.game.recorder.attempt ? " (current)" : " (archived)"}`;
        select.append(option);
      }
    }
    const r = this.recording(),
      filter = (this.el("log-filter") as HTMLSelectElement).value;
    this.el("log-summary").textContent =
      `${r.events.length} events · ${r.snapshots.length} telemetry samples · dropped: ${r.droppedEvents} events / ${r.droppedSnapshots} samples`;
    const container = this.el("log-events");
    // Avoid needless rebuilding during pause so text selection/scroll remains usable.
    const signature = `${r.attempt}/${filter}/${r.events.length}/${r.snapshots.length}`;
    if (container.dataset.signature === signature) return;
    container.dataset.signature = signature;
    container.replaceChildren();
    const matches = (type: string) =>
      filter === "all" ||
      (filter === "contact" && ["contact", "penalty"].includes(type)) ||
      (filter === "crew" && /^(fender|crew)\./.test(type)) ||
      (filter === "lines" && /^line\./.test(type)) ||
      (filter === "mission" && /^(mission|traffic)\.|^radio$/.test(type)) ||
      (filter === "controls" && /^(engines|rudder|heading)\./.test(type)) ||
      (filter === "weather" && /^(weather|tuning)\./.test(type));
    for (const event of r.events
      .filter((e) => matches(e.type))
      .slice(-150)
      .reverse()) {
      const row = document.createElement("article");
      row.className = "log-event";
      const title = document.createElement("strong");
      title.textContent = `${event.time.toFixed(1)}s · ${event.phase} · ${event.message}`;
      const detail = document.createElement("p");
      if (event.type === "contact") {
        const e = event.data as unknown as Episode;
        const protection = e.fenderCovered
          ? e.unprotectedContact
            ? "mixed coverage"
            : "fender covered"
          : "no fender coverage";
        detail.textContent = `${e.status} · duration ${e.duration.toFixed(2)}s · ${e.peakContact.side} at body (${e.peakContact.localX.toFixed(2)}, ${e.peakContact.localY.toFixed(2)}) m · ${protection}${e.bottomedOut ? " · fender bottomed out" : ""}\nPeak closing speed ${e.peakSpeed.toFixed(3)} m/s · normal impulse total ${e.totalNormalImpulseNs.toFixed(1)} N·s · peak tick ${e.peakTickImpulseNs.toFixed(1)} N·s · estimated tick-average load ${(e.estimatedPeakLoadN / 1000).toFixed(2)} kN · +${e.penaltySeconds}s`;
      } else detail.textContent = JSON.stringify(event.data);
      row.append(title, detail);
      container.append(row);
    }
    if (!container.childElementCount)
      container.textContent = "No matching events yet.";
  }
}
