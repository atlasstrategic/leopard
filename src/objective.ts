import { degrees, knots, mooringConfig, scenario, stage } from "./config";
import { fill, insideZone, midSentence, zoneShape } from "./mission";
import { quayClearance, requirements } from "./scenario";
import type { Session } from "./session";
import type { Step } from "./stage/load";

// What the objective panel shows for the current step.
export type Objective = {
  eyebrow: string;
  title: string;
  hint: string;
  checks: [boolean, string][];
  // Progress bar, 0–1.
  bar: number;
  result: string;
};
const pad = (n: number) => String(n).padStart(2, "0");
const bearing = (radians: number) =>
  String(Math.round(degrees(radians)) % 360).padStart(3, "0");
// Consecutive steps sharing a label share a number.
function numbers(steps: Step[]) {
  let n = 0,
    previous = "";
  return steps.map((s) => {
    if (s.label !== previous) n++;
    previous = s.label;
    return n;
  });
}
const vesselName = (id: string) =>
  stage.traffic.find((v) => v.id === id)?.name ?? id;
const zoneName = (id: string) => midSentence(stage.zones[id].name);
// Docking checks: the approach target, then the alongside envelope once the
// first line is on, plus the securing requirements after arrival.
function berthChecks(g: Session): [boolean, string][] {
  const p = g.progress,
    alongside = p.positionTarget === "alongside",
    r = requirements(g.state, p.positionTarget, g.acceptableContact),
    secured = g.securingRequirements(),
    t = alongside ? scenario.alongside : scenario.target;
  const heading = `${bearing(t.heading)}° ± ${Math.round(degrees(t.headingTolerance))}°`;
  const checks: [boolean, string][] = [
    [
      r.position,
      alongside
        ? "Full hull inside amber alongside area"
        : `Position within ${scenario.target.positionTolerance} m · full hull inside`,
    ],
    [
      r.heading,
      alongside ? `Parallel to quay · ${heading}` : `Heading ${heading}`,
    ],
    [r.speed, `Speed ≤ ${knots(t.maxSpeed).toFixed(2)} kn · minimal rotation`],
    [
      r.clear,
      alongside
        ? "Clear or gentle covered fender contact"
        : "Clear of docks and boundaries",
    ],
  ];
  if (p.phase === "approach") return checks;
  return [
    ...checks,
    [secured.fenders, "Starboard fenders deployed"],
    [secured.lines, "Both lines · slack ≤0.45 m · safe load · crew idle"],
    [
      secured.neutral,
      p.service.enginesOff
        ? "Engines off for fuel service"
        : "Both neutral · delivered thrust settled",
    ],
  ];
}
function keepOutChecks(g: Session): [boolean, string][] {
  const p = g.progress;
  return stage.mission.rules.flatMap((rule): [boolean, string][] => {
    if (rule.kind !== "keepOut") return [];
    const until = g.steps.findIndex((s) => s.id === rule.until);
    return p.step <= until ? [[!p.insideKeepOut[rule.zone], rule.check]] : [];
  });
}
// Never assume a time is set: the panel updates every frame.
const securedText = (g: Session) => {
  const p = g.progress;
  return p.securedAt === null
    ? `Secured · +${p.penalty} s penalties. Simulation remains live.`
    : `Secured · first achieved ${p.securedAt.toFixed(1)} s · +${p.penalty} s penalties. Simulation remains live.`;
};
const dwellText = (g: Session) => {
  const p = g.progress;
  return `${p.phase === "approach" ? "Arrival hold" : "Securing hold"}: ${p.dwell.toFixed(1)} / 3.0 s`;
};
const dwellBar = (g: Session) =>
  g.progress.dwell /
  (g.progress.phase === "approach"
    ? scenario.target.dwell
    : mooringConfig.securedDwell);
export function objective(g: Session): Objective {
  const p = g.progress,
    n = numbers(g.steps);
  if (p.phase === "failed")
    return {
      eyebrow: "MISSION FAILED",
      title: "Hull contact without a fender.",
      hint: `${p.failure}. Fenders must cover the point of contact with another vessel. Retry (R) to start again.`,
      checks: [],
      bar: 0,
      result: `Mission failed at ${p.elapsed.toFixed(1)} s · press Retry (R)`,
    };
  if (p.phase === "complete") {
    const exit = g.steps.find(
      (s): s is Extract<Step, { kind: "exitThroughGate" }> =>
        s.kind === "exitThroughGate",
    );
    return {
      eyebrow: "MISSION COMPLETE",
      title: stage.mission.complete.title,
      hint: fill(stage.mission.complete.hint, { penalty: p.penalty }),
      checks:
        exit && p.channelSide
          ? [
              [true, "Both lines let go"],
              [
                p.channelSide === exit.keepSide,
                p.channelSide === exit.keepSide
                  ? `Left on the ${p.channelSide} side of the channel`
                  : `Left on the ${p.channelSide} side of the channel · +${exit.sidePenalty} s`,
              ],
            ]
          : [],
      bar: 1,
      result: `Mission complete at ${(p.exitedAt ?? p.elapsed).toFixed(1)} s · +${p.penalty} s penalties`,
    };
  }
  // The practice harbour stays live once secured.
  if (!g.missionEnabled && p.phase === "secured")
    return {
      eyebrow: `${pad(n[n.length - 1] + 1)} / SECURED · LIVE`,
      title: "Lines on. Stay attentive.",
      hint: "The boat is still live. Watch tension and wind. Release either line to practise again.",
      checks: berthChecks(g),
      bar: dwellBar(g),
      result: securedText(g),
    };
  let index = p.step,
    step = g.step;
  if (!step)
    return {
      eyebrow: "",
      title: stage.name,
      hint: "",
      checks: [],
      bar: 0,
      result: "",
    };
  // A checklist that has lost secured shows the securing step again.
  if (step.kind === "checklist" && p.phase !== "secured") {
    const secure = g.steps.findIndex((s) => s.kind === "secureAlongside");
    if (secure >= 0) {
      index = secure;
      step = g.steps[secure];
    }
  }
  const base = {
    eyebrow: `${pad(n[index])} / ${step.label}`,
    title: step.title,
    hint: step.hint,
  };
  switch (step.kind) {
    case "holdInZone": {
      const released = step.releases.map(vesselName).join(", ");
      return {
        ...base,
        checks: [
          [
            insideZone(zoneShape(step.zone), g.state),
            `Boat centre inside the ${zoneName(step.zone)}`,
          ],
          [
            p.countdown === 0,
            released
              ? `${released} departs after ${step.seconds} s in position`
              : `Hold ${step.seconds} s in position`,
          ],
          ...keepOutChecks(g),
        ],
        bar: p.countdown === null ? 0 : 1 - p.countdown / step.seconds,
        result:
          p.countdown === null
            ? `Countdown starts inside the ${zoneName(step.zone)}`
            : released
              ? `${released} departs in ${p.countdown.toFixed(1)} s`
              : `Hold complete in ${p.countdown.toFixed(1)} s`,
      };
    }
    case "waitForClear":
      return {
        ...base,
        checks: [
          [
            false,
            `${vesselName(step.vessel)} clear of the ${zoneName(step.zone)}`,
          ],
          ...keepOutChecks(g),
        ],
        bar: 1,
        result: `${vesselName(step.vessel)} leaving — wait to be called`,
      };
    case "arriveAtBerth":
      return {
        ...base,
        checks: berthChecks(g),
        bar: dwellBar(g),
        result: dwellText(g),
      };
    case "secureAlongside":
      return {
        ...base,
        hint: p.positionTarget === "alongside" ? step.hintAlongside : step.hint,
        checks: berthChecks(g),
        bar: dwellBar(g),
        result: dwellText(g),
      };
    case "checklist": {
      const running = step.items.find((it) => it.id === p.service.running);
      return {
        ...base,
        checks: [[true, "Secured alongside · lines, fenders, neutral"]],
        bar: 1,
        result:
          running && running.action === "timed"
            ? `${running.label} ${p.service.amount.toFixed(0)} / ${running.total} ${running.unit}`
            : securedText(g),
      };
    }
    case "exitThroughGate": {
      const lines = !g.mooring.bow.attached && !g.mooring.stern.attached;
      return {
        ...base,
        checks: [
          [lines, "Both lines let go"],
          [quayClearance(g.state) > 2, "Clear of the quay by 2 m"],
          [
            false,
            `Exit between the lights · ${step.keepSide} side of the channel`,
          ],
        ],
        bar: 0,
        result:
          p.service.completedAt === null
            ? "Depart when ready"
            : `Service complete at ${p.service.completedAt.toFixed(1)} s · depart when ready`,
      };
    }
  }
}
