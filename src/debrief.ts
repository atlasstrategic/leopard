import { knots, scoreConfig } from "./config";
import type { LogEvent } from "./recorder";
import type { Progress } from "./scenario";

export type CategoryKey = keyof typeof scoreConfig.weights;
export type Category = {
  key: CategoryKey;
  label: string;
  weight: number;
  score: number;
  notes: string[];
};
export type Debrief = {
  scored: boolean;
  total: number | null;
  rating: string;
  categories: Category[];
  figures: [string, string][];
  penalties: { time: number; message: string }[];
  tip: string;
};
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
// Each deduction carries the tip it would earn; the tip for the largest
// weighted loss becomes the debrief's one actionable observation.
type Deduction = { points: number; note: string; tip: string };
export function debrief(p: Progress, events: LogEvent[] = []): Debrief {
  const m = p.metrics,
    c = scoreConfig;
  const impact: Deduction[] = [],
    control: Deduction[] = [],
    procedure: Deduction[] = [],
    smoothness: Deduction[] = [];
  if (p.collisions > 0)
    impact.push({
      points: c.impact.perContact * p.collisions,
      note: `${plural(p.collisions, "penalised contact")}`,
      tip: `You had ${plural(p.collisions, "penalised contact")}. Slow down earlier near quays and breakwaters, and have fenders out before you get close.`,
    });
  if (
    m.closestMonohull !== null &&
    m.closestMonohull < c.impact.monohullClearance
  ) {
    const gap = Math.max(0, m.closestMonohull);
    impact.push({
      points:
        c.impact.monohullDeduction * (1 - gap / c.impact.monohullClearance),
      note: `Closest to the monohull ${gap.toFixed(1)} m`,
      tip: `You came within ${gap.toFixed(1)} m of the monohull. Give moving traffic at least ${c.impact.monohullClearance} m and let it pass before you move in.`,
    });
  }
  if (
    m.arrivalPeakSpeed !== null &&
    m.arrivalPeakSpeed > c.control.arrivalGood
  ) {
    const share = Math.min(
      1,
      (m.arrivalPeakSpeed - c.control.arrivalGood) /
        (c.control.arrivalPoor - c.control.arrivalGood),
    );
    const kn = knots(m.arrivalPeakSpeed).toFixed(1);
    control.push({
      points: c.control.arrivalDeduction * share,
      note: `Speed near the berth peaked at ${kn} kn`,
      tip: `Your speed near the berth peaked at ${kn} kn. Brake earlier with short, equal reverse bursts so you arrive below ${knots(c.control.arrivalGood).toFixed(1)} kn.`,
    });
  }
  if (m.countdownResets > 0)
    control.push({
      points: c.control.perCountdownReset * m.countdownResets,
      note: `Holding countdown reset ${m.countdownResets}×`,
      tip: `You drifted out of the holding area ${m.countdownResets}×. Hold position against the wind with small, early lever corrections.`,
    });
  if (p.earlyEntries > 0)
    control.push({
      points: c.control.perEarlyEntry * p.earlyEntries,
      note: `${p.earlyEntries} early ${p.earlyEntries === 1 ? "entry" : "entries"} into the fuel berth`,
      tip: "You entered the fuel berth before it was called clear. Wait in the holding area for the radio call.",
    });
  if (p.channelSide === "port")
    control.push({
      points: c.control.portSide,
      note: "Left on the port side of the channel",
      tip: "You left on the port side of the channel. Going out, keep the red light on your starboard side.",
    });
  if (m.fendersAtArrival === false)
    procedure.push({
      points: c.procedure.fendersLate,
      note: "Starboard fenders not out on arrival",
      tip: "Your starboard fenders were not out when you arrived. Deploy them during the approach: the crew needs 3 seconds.",
    });
  if (m.serviceRefusals > 0)
    procedure.push({
      points: c.procedure.perServiceRefusal * m.serviceRefusals,
      note: `${plural(m.serviceRefusals, "checklist step")} refused`,
      tip: `${plural(m.serviceRefusals, "checklist step")} ${m.serviceRefusals === 1 ? "was" : "were"} refused. Follow the order: engines off, fuel type, fuel, pay, engines on.`,
    });
  if (m.lineRefusals > 0)
    procedure.push({
      points: c.procedure.perLineRefusal * m.lineRefusals,
      note: `${plural(m.lineRefusals, "line command")} refused`,
      tip: `${plural(m.lineRefusals, "line command")} ${m.lineRefusals === 1 ? "was" : "were"} refused. Read the reason (reach, speed, neutral, fenders) before trying again.`,
    });
  if (m.releasesUnderLoad > 0)
    procedure.push({
      points: c.procedure.perReleaseUnderLoad * m.releasesUnderLoad,
      note: `${plural(m.releasesUnderLoad, "line")} let go under high load`,
      tip: "You let go a line under high load. Ease the boat to take the load off before releasing.",
    });
  const elapsed = p.exitedAt ?? p.elapsed,
    s = c.smoothness;
  const timeScore =
    elapsed <= s.parTime
      ? 100
      : Math.max(
          s.slowTimeScore,
          100 -
            ((100 - s.slowTimeScore) * (elapsed - s.parTime)) /
              (s.slowTime - s.parTime),
        );
  if (timeScore < 100)
    smoothness.push({
      points: (100 - timeScore) * s.timeShare,
      note: `Mission time ${(elapsed / 60).toFixed(1)} min (par ${s.parTime / 60} min)`,
      tip: `The mission took ${(elapsed / 60).toFixed(1)} minutes. Prepare fenders and plan the approach while you wait, so you are ready as soon as the berth is clear.`,
    });
  const extraLevers = Math.max(0, m.leverChanges - s.leverPar);
  if (extraLevers > 0)
    smoothness.push({
      points: Math.min(100, extraLevers) * (1 - s.timeShare),
      note: `${m.leverChanges} lever changes (par ${s.leverPar})`,
      tip: `You made ${m.leverChanges} lever changes. Fewer, earlier corrections are smoother and easier on the engines.`,
    });
  const groups: [CategoryKey, string, Deduction[]][] = [
    ["impact", "Impact & clearance", impact],
    ["control", "Position & speed control", control],
    ["procedure", "Preparation & procedure", procedure],
    ["smoothness", "Smoothness & efficiency", smoothness],
  ];
  const categories = groups.map(([key, label, list]) => ({
    key,
    label,
    weight: c.weights[key],
    score: Math.round(clamp(100 - list.reduce((sum, d) => sum + d.points, 0))),
    notes: list.map((d) => d.note),
  }));
  const scored = p.phase === "complete";
  const total = scored
    ? Math.round(categories.reduce((sum, k) => sum + k.weight * k.score, 0))
    : null;
  const worst = groups
    .flatMap(([key, , list]) =>
      list.map((d) => ({ ...d, loss: d.points * c.weights[key] })),
    )
    .sort((a, b) => b.loss - a.loss)[0];
  const tip = !scored
    ? p.failure
      ? `${p.failure}. Deploy starboard fenders before you get near other boats, and keep well clear of the monohull while it manoeuvres.`
      : "The mission is not finished yet."
    : worst
      ? worst.tip
      : "A clean run. Try it again with stronger wind in Handling & weather.";
  const figures: [string, string][] = [
    ["Mission time", `${elapsed.toFixed(1)} s`],
    ["Penalty time", `+${p.penalty} s`],
    ["Penalised contacts", String(p.collisions)],
    [
      "Closest to monohull",
      m.closestMonohull === null
        ? "—"
        : `${Math.max(0, m.closestMonohull).toFixed(1)} m`,
    ],
    [
      "Peak speed near berth",
      m.arrivalPeakSpeed === null
        ? "—"
        : `${knots(m.arrivalPeakSpeed).toFixed(2)} kn`,
    ],
    ["Early entries", String(p.earlyEntries)],
    ["Countdown resets", String(m.countdownResets)],
    ["Channel side on exit", p.channelSide ?? "—"],
    ["Lever changes", String(m.leverChanges)],
  ];
  const penalties = events
    .filter((e) =>
      ["penalty", "mission.early_entry", "mission.channel_side"].includes(
        e.type,
      ),
    )
    .map((e) => ({ time: e.time, message: e.message }));
  return {
    scored,
    total,
    rating:
      total === null
        ? p.phase === "failed"
          ? "Mission failed — not scored"
          : "Not finished"
        : c.ratings.find(([min]) => total >= min)![1],
    categories,
    figures,
    penalties,
    tip,
  };
}
// Planar track points for the overhead trace, from 1 Hz telemetry.
export function tracks(snapshots: { data: Record<string, unknown> }[]) {
  const boat: [number, number][] = [],
    monohull: [number, number][] = [];
  for (const { data } of snapshots) {
    const s = data.state as { x: number; y: number } | undefined;
    if (s) boat.push([s.x, s.y]);
    const v = data.traffic as { x: number; y: number; status: string } | null;
    if (v && v.status !== "gone" && v.status !== "moored")
      monohull.push([v.x, v.y]);
  }
  return { boat, monohull };
}
