import { Session } from "./session";
import { lineGeometry, lineIds } from "./mooring";
import { tendingBlock } from "./tending";
import { clamp } from "./simulation";
export const demonstrationConfig = {
  maxSeconds: 180,
  preparationSeconds: 4,
  lineDelay: 1.5,
  maxSpeed: 1,
  positionGain: 0.18,
  speedGain: 1.4,
  alongsidePose: { x: 2.6, y: 16, heading: 0 },
};
export const lessonSteps = {
  prepare: {
    title: "1 / Prepare the starboard fenders",
    text: "This is a calm-water example with the default boat. Prepare the quay-side fenders before approaching. Your practice attempt is saved separately.",
    focus: "fenders",
  },
  approach: {
    title: "2 / Approach with equal thrust",
    text: "Equal engine settings keep the bow north. Watch SOG: momentum builds gradually, so avoid carrying full power toward the berth.",
    focus: "engines",
  },
  brake: {
    title: "3 / Remove momentum",
    text: "Neutral alone does not stop the boat. Use short, equal reverse bursts when needed, then return to neutral as speed falls.",
    focus: "engines",
  },
  arrival: {
    title: "4 / Hold the approach position",
    text: "Hold low speed and heading in the mint approach target for three seconds. This unlocks line attachment; it is not yet a secured berth.",
    focus: "objective",
  },
  bow: {
    title: "5 / Attach a first line",
    text: "For this calm, aligned example we choose bow → B01 first. This is not a universal order: wind, current and the end drifting away can change the priority. The first line activates the amber alongside area.",
    focus: "lines",
  },
  stern: {
    title: "6 / Attach the stern line",
    text: "Attach stern → B02 within reach and at low speed. Each line initially has slack. Attachment neither stops the boat instantly nor moves it into position.",
    focus: "lines",
  },
  tend: {
    title: "7 / Tend the lines gradually",
    text: "Take in short lengths on both lines to draw the boat toward the quay without twisting it unnecessarily. Lines only pull. Watch load and movement; Ease pays line out if more length is needed.",
    focus: "lines",
  },
  settle: {
    title: "8 / Let the boat settle alongside",
    text: "Both engines remain neutral. Check the amber envelope, parallel heading, low movement, fenders, and both lines with limited slack and safe loads. Gentle covered fender contact is allowed.",
    focus: "objective",
  },
  complete: {
    title: "Secured — your turn",
    text: "The ordinary securing checks passed. The lesson is now paused. Take over to practise, repeat the example, or return to your unchanged practice attempt. This two-line game example is not a complete real-world mooring procedure.",
    focus: "objective",
  },
  stopped: {
    title: "Demonstration stopped safely",
    text: "The demonstration could not complete its validated calm-water workflow. No pose or objective was forced. Repeat, take over, or return to practice.",
    focus: "objective",
  },
} as const;
export type LessonStage = keyof typeof lessonSteps;
export class Demonstration {
  stage: LessonStage = "prepare";
  stageAt = 0;
  failure = "";
  private acted = false;
  constructor(public readonly game: Session) {
    game.recorder.metadata.demonstration = {
      profile:
        "Calm water, default boat; one suitable example, not universal seamanship",
      config: demonstrationConfig,
    };
    game.recorder.event(0, "demo.start", lessonSteps.prepare.title);
    game.requestFenders("starboard");
  }
  private enter(stage: LessonStage) {
    if (this.stage === stage) return;
    this.stage = stage;
    this.stageAt = this.game.progress.elapsed;
    this.acted = false;
    this.game.recorder.event(
      this.game.progress.elapsed,
      "demo.step",
      lessonSteps[stage].title,
      { stage, explanation: lessonSteps[stage].text },
    );
  }
  private stop(reason: string) {
    this.failure = reason;
    this.enter("stopped");
    this.game.controls.port = this.game.controls.starboard = 0;
    for (const id of lineIds) this.game.requestTend(id, "stop");
    this.game.recorder.event(
      this.game.progress.elapsed,
      "demo.stopped",
      reason,
    );
    this.game.paused = true;
  }
  beforeTick() {
    const g = this.game,
      elapsed = g.progress.elapsed;
    if (g.paused || this.stage === "complete" || this.stage === "stopped")
      return;
    if (elapsed > demonstrationConfig.maxSeconds) {
      this.stop("Time limit reached; no automatic recovery or teleportation.");
      return;
    }
    if (
      g.progress.collisions > 0 ||
      lineIds.some((id) => g.mooring[id].broken)
    ) {
      this.stop("Unexpected impact or line failure.");
      return;
    }
    if (["approach", "brake", "arrival"].includes(this.stage)) {
      if (g.progress.phase !== "approach") {
        g.controls.port = g.controls.starboard = 0;
        this.enter("bow");
        return;
      }
      const error = 16 - g.state.y;
      const desired = clamp(
        error * demonstrationConfig.positionGain,
        -demonstrationConfig.maxSpeed,
        demonstrationConfig.maxSpeed,
      );
      const throttle =
        Math.round(
          clamp((desired - g.state.vy) * demonstrationConfig.speedGain, -1, 1) *
            5,
        ) / 5;
      g.controls.port = g.controls.starboard = throttle;
      g.controls.rudder = 0;
      if (error < 8 && throttle < 0 && this.stage === "approach")
        this.enter("brake");
      if (g.progress.dwell > 0 && this.stage !== "arrival")
        this.enter("arrival");
      return;
    }
    g.controls.port = g.controls.starboard = 0;
    if (this.stage === "prepare") {
      if (
        elapsed >= demonstrationConfig.preparationSeconds &&
        g.fenders.starboard.deployed
      )
        this.enter("approach");
    } else if (this.stage === "bow" || this.stage === "stern") {
      if (
        !this.acted &&
        elapsed - this.stageAt >= demonstrationConfig.lineDelay
      ) {
        const result = g.requestLine(this.stage, "attach");
        if (!result.accepted) {
          this.stop(result.message);
          return;
        }
        this.acted = true;
      }
      if (
        this.acted &&
        elapsed - this.stageAt >= demonstrationConfig.lineDelay * 2
      )
        this.enter(this.stage === "bow" ? "stern" : "tend");
    } else if (this.stage === "tend") {
      let finished = true;
      for (const id of lineIds) {
        const target =
          lineGeometry({ ...g.state, ...demonstrationConfig.alongsidePose }, id)
            .distance + 0.05;
        const line = g.mooring[id];
        if (line.tending !== "idle") {
          finished = false;
          continue;
        }
        const error = line.restLength - target;
        if (Math.abs(error) > 0.13) {
          finished = false;
          const direction = error > 0 ? "in" : "out";
          // Wait for load/speed to drop rather than bypassing crew limits.
          if (!tendingBlock(g.state, g.controls, g.mooring, id, direction))
            g.requestTend(id, direction);
        }
      }
      if (finished) this.enter("settle");
    }
  }
  afterTick() {
    if (
      this.stage === "settle" &&
      this.game.progress.success &&
      this.game.progress.elapsed - this.stageAt >= 3
    ) {
      this.enter("complete");
      this.game.recorder.event(
        this.game.progress.elapsed,
        "demo.complete",
        "Normal alongside securing checks passed",
      );
      this.game.paused = true;
    }
  }
}
export class PracticeLab {
  readonly practice: Session;
  mode: "practice" | "demo" | "takeover" = "practice";
  active: Session;
  demonstration: Demonstration | null = null;
  constructor(practice = new Session()) {
    this.practice = practice;
    this.active = practice;
  }
  private freeze(game: Session) {
    game.paused = true;
    game.clock.reset();
    game.previous = { ...game.state };
    game.observe();
  }
  showMe() {
    this.freeze(this.active);
    // Docking-only lesson: calm water and no harbour traffic.
    this.active = new Session(
      { speed: 0, direction: 0, currentX: 0, currentY: 0 },
      { mission: false },
    );
    this.demonstration = new Demonstration(this.active);
    this.mode = "demo";
  }
  takeOver() {
    if (this.mode !== "demo") return;
    this.mode = "takeover";
    this.freeze(this.active);
    this.active.recorder.event(
      this.active.progress.elapsed,
      "demo.takeover",
      "Player took control; resume explicitly",
    );
  }
  returnToPractice() {
    if (this.mode === "practice") return;
    this.freeze(this.active);
    this.active = this.practice;
    this.freeze(this.practice);
    this.mode = "practice";
    this.demonstration = null;
  }
  tick() {
    if (
      this.active.paused ||
      (this.mode === "demo" &&
        ["complete", "stopped"].includes(this.demonstration!.stage))
    )
      return;
    if (this.mode === "demo") this.demonstration!.beforeTick();
    if (this.active.paused) return;
    this.active.tick();
    if (this.mode === "demo") this.demonstration!.afterTick();
  }
}
