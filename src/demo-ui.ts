import { lessonSteps, type PracticeLab } from "./demonstration";
import "./demo.css";
export type DemoActions = {
  showDemo: () => void;
  takeOver: () => void;
  returnPractice: () => void;
  pause: () => void;
};
export const demoMarkup = `<section id="demo-panel" class="panel" hidden aria-label="Guided demonstration"><div class="eyebrow" id="demo-mode">SHOW ME · CALM WATER · DEFAULT BOAT</div><h2 id="demo-title"></h2><p id="demo-explanation" role="status"></p><div class="demo-buttons"><button id="demo-pause">Pause lesson</button><button id="demo-repeat">Repeat</button><button id="demo-takeover">Take over</button><button id="demo-return">Return to practice</button></div><small>Your practice attempt is preserved. No credit or penalties are copied back.</small></section>`;
export class DemoUI {
  private stageKey = "";
  constructor(
    private root: HTMLElement,
    private lab: PracticeLab,
    actions: DemoActions,
  ) {
    this.el("show-me").onclick = actions.showDemo;
    this.el("demo-pause").onclick = actions.pause;
    this.el("demo-repeat").onclick = actions.showDemo;
    this.el("demo-takeover").onclick = actions.takeOver;
    this.el("demo-return").onclick = actions.returnPractice;
  }
  private el(id: string) {
    return this.root.querySelector<HTMLElement>(`#${id}`)!;
  }
  update() {
    const lab = this.lab,
      demo = lab.demonstration;
    this.el("demo-panel").hidden = lab.mode === "practice";
    if (!demo || lab.mode === "practice") return;
    const step = lessonSteps[demo.stage];
    this.el("demo-mode").textContent =
      lab.mode === "takeover"
        ? "YOUR CONTROL · SEPARATE PRACTICE RUN"
        : "SHOW ME · CALM WATER · DEFAULT BOAT";
    this.el("demo-title").textContent =
      lab.mode === "takeover" ? "You have the controls." : step.title;
    const text =
      lab.mode === "takeover"
        ? "Resume (P) when ready. This is the demonstration boat, not your original attempt. Return to practice restores your saved attempt, paused."
        : `${step.text}${demo.failure ? ` Reason: ${demo.failure}` : ""}`;
    if (this.el("demo-explanation").textContent !== text)
      this.el("demo-explanation").textContent = text;
    this.el("demo-pause").textContent = lab.active.paused ? "Resume" : "Pause";
    (this.el("demo-pause") as HTMLButtonElement).disabled =
      lab.mode === "demo" &&
      (demo.stage === "complete" || demo.stage === "stopped");
    (this.el("demo-takeover") as HTMLButtonElement).disabled =
      lab.mode === "takeover";
    const stageKey = `${lab.mode}/${demo.stage}`;
    if (this.stageKey !== stageKey) {
      this.stageKey = stageKey;
      this.root
        .querySelectorAll(".lesson-focus")
        .forEach((e) => e.classList.remove("lesson-focus"));
      if (lab.mode === "demo") {
        const selector =
          step.focus === "engines"
            ? ".lever"
            : step.focus === "fenders"
              ? ".crew-controls"
              : step.focus === "lines"
                ? ".mooring-controls"
                : "#requirements";
        this.root
          .querySelectorAll(selector)
          .forEach((e) => e.classList.add("lesson-focus"));
        this.el(
          step.focus === "fenders" || step.focus === "lines"
            ? "crew-tab"
            : "objective-tab",
        ).click();
      }
    }
  }
}
