import { knots, scoreConfig, stage } from "./config";
import { fill, midSentence } from "./mission";
import type { LogEvent } from "./recorder";
import type { Progress } from "./scenario";
import type { Weather } from "./simulation";

export type CategoryKey = keyof typeof scoreConfig.weights;
export type Category = {
  key: CategoryKey;
  label: string;
  weight: number;
  score: number;
  notes: string[];
};
export type Debrief = {
  // Wind and current: they make a big difference to how hard a run was.
  conditions: string;
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
// Weather at the start of the attempt and now; changes in between come from
// the log's weather.change events (the wind can be changed mid-run).
export type Conditions = { start: Weather; end: Weather };
const bearing = (radians: number) =>
  String(
    Math.round(((((radians * 180) / Math.PI) % 360) + 360) % 360) % 360,
  ).padStart(3, "0");
const windText = (w: Weather) =>
  w.speed < 0.05
    ? "calm"
    : `${knots(w.speed).toFixed(1)} kn from ${bearing(w.direction + Math.PI)}° T`;
const currentText = (w: Weather) => {
  const speed = Math.hypot(w.currentX, w.currentY);
  return speed < 0.01
    ? "no current"
    : `current ${knots(speed).toFixed(1)} kn towards ${bearing(Math.atan2(w.currentX, w.currentY))}° T`;
};
export function conditionsSummary(c: Conditions, events: LogEvent[] = []) {
  const seen = [
    c.start,
    ...events
      .filter((e) => e.type === "weather.change")
      .map((e) => e.data as unknown as Weather),
    c.end,
  ];
  const same = (a: Weather, b: Weather) =>
    a.speed === b.speed &&
    a.direction === b.direction &&
    a.currentX === b.currentX &&
    a.currentY === b.currentY;
  const changed = seen.some((w) => !same(w, c.start));
  const speeds = seen.map((w) => knots(w.speed));
  return {
    wind: windText(c.start),
    current: currentText(c.start),
    changed,
    range: `${Math.min(...speeds).toFixed(1)}–${Math.max(...speeds).toFixed(1)} kn`,
  };
}
export function debrief(
  p: Progress,
  events: LogEvent[] = [],
  conditions?: Conditions,
): Debrief {
  const weather = conditions && conditionsSummary(conditions, events);
  const m = p.metrics,
    c = scoreConfig,
    tips = c.tips,
    vessel =
      (stage.traffic[0] && midSentence(stage.traffic[0].name)) ?? "traffic";
  const impact: Deduction[] = [],
    control: Deduction[] = [],
    procedure: Deduction[] = [],
    smoothness: Deduction[] = [];
  const refused = (n: number, what: string) => ({
    count: plural(n, what),
    verb: n === 1 ? "was" : "were",
  });
  if (p.collisions > 0)
    impact.push({
      points: c.impact.perContact * p.collisions,
      note: plural(p.collisions, "penalised contact"),
      tip: fill(tips.contacts, {
        count: plural(p.collisions, "penalised contact"),
      }),
    });
  if (
    m.closestTraffic !== null &&
    m.closestTraffic < c.impact.trafficClearance
  ) {
    const gap = Math.max(0, m.closestTraffic);
    impact.push({
      points: c.impact.trafficDeduction * (1 - gap / c.impact.trafficClearance),
      note: `Closest to the ${vessel} ${gap.toFixed(1)} m`,
      tip: fill(tips.trafficClearance, {
        gap: gap.toFixed(1),
        clearance: c.impact.trafficClearance,
        vessel,
      }),
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
      tip: fill(tips.arrivalSpeed, {
        kn,
        target: knots(c.control.arrivalGood).toFixed(1),
      }),
    });
  }
  if (m.countdownResets > 0)
    control.push({
      points: c.control.perCountdownReset * m.countdownResets,
      note: `Holding countdown reset ${m.countdownResets}×`,
      tip: fill(tips.countdownResets, { count: m.countdownResets }),
    });
  if (p.earlyEntries > 0)
    control.push({
      points: c.control.perEarlyEntry * p.earlyEntries,
      note: `${p.earlyEntries} early ${p.earlyEntries === 1 ? "entry" : "entries"} into a keep-out zone`,
      tip: tips.earlyEntries,
    });
  const exit = stage.file.mission.steps.find(
    (st) => st.kind === "exitThroughGate",
  );
  if (p.channelSide && exit && p.channelSide !== exit.keepSide)
    control.push({
      points: c.control.wrongSide,
      note: `Left on the ${p.channelSide} side of the channel`,
      tip: tips.wrongSide,
    });
  if (m.fendersAtArrival === false)
    procedure.push({
      points: c.procedure.fendersLate,
      note: "Fenders not out on arrival",
      tip: tips.fendersLate,
    });
  if (m.serviceRefusals > 0)
    procedure.push({
      points: c.procedure.perChecklistRefusal * m.serviceRefusals,
      note: `${plural(m.serviceRefusals, "checklist step")} refused`,
      tip: fill(
        tips.checklistRefusals,
        refused(m.serviceRefusals, "checklist step"),
      ),
    });
  if (m.lineRefusals > 0)
    procedure.push({
      points: c.procedure.perLineRefusal * m.lineRefusals,
      note: `${plural(m.lineRefusals, "line command")} refused`,
      tip: fill(tips.lineRefusals, refused(m.lineRefusals, "line command")),
    });
  if (m.releasesUnderLoad > 0)
    procedure.push({
      points: c.procedure.perReleaseUnderLoad * m.releasesUnderLoad,
      note: `${plural(m.releasesUnderLoad, "line")} let go under high load`,
      tip: tips.releaseUnderLoad,
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
      tip: fill(tips.time, { minutes: (elapsed / 60).toFixed(1) }),
    });
  const extraLevers = Math.max(0, m.leverChanges - s.leverPar);
  if (extraLevers > 0)
    smoothness.push({
      points: Math.min(100, extraLevers) * (1 - s.timeShare),
      note: `${m.leverChanges} lever changes (par ${s.leverPar})`,
      tip: fill(tips.levers, { count: m.leverChanges }),
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
      ? fill(tips.failed, { failure: p.failure })
      : "The mission is not finished yet."
    : worst
      ? worst.tip
      : tips.clean;
  // Only figures the stage can produce: no traffic, keep-out rule, hold or
  // exit means nothing to report for that line.
  const steps = stage.file.mission.steps,
    has = (kind: string) => steps.some((st) => st.kind === kind);
  const figures = (
    [
      ["Mission time", `${elapsed.toFixed(1)} s`, true],
      ["Penalty time", `+${p.penalty} s`, true],
      ["Penalised contacts", String(p.collisions), true],
      [
        `Closest to ${vessel}`,
        m.closestTraffic === null
          ? "—"
          : `${Math.max(0, m.closestTraffic).toFixed(1)} m`,
        stage.traffic.length > 0,
      ],
      [
        "Peak speed near berth",
        m.arrivalPeakSpeed === null
          ? "—"
          : `${knots(m.arrivalPeakSpeed).toFixed(2)} kn`,
        has("arriveAtBerth"),
      ],
      [
        "Early entries",
        String(p.earlyEntries),
        stage.file.mission.rules.some((r) => r.kind === "keepOut"),
      ],
      ["Countdown resets", String(m.countdownResets), has("holdInZone")],
      ["Channel side on exit", p.channelSide ?? "—", has("exitThroughGate")],
      ["Lever changes", String(m.leverChanges), true],
      ["Checkpoint restarts", String(m.checkpointRestarts), true],
      ...(weather
        ? [
            [
              "Wind",
              weather.changed ? `${weather.range} (changed)` : weather.wind,
              true,
            ],
            ["Current", weather.current, true],
          ]
        : []),
    ] as [string, string, boolean][]
  )
    .filter(([, , shown]) => shown)
    .map(([label, value]): [string, string] => [label, value]);
  const penalties = events
    .filter((e) =>
      ["penalty", "mission.early_entry", "mission.channel_side"].includes(
        e.type,
      ),
    )
    .map((e) => ({ time: e.time, message: e.message }));
  return {
    conditions: weather
      ? weather.changed
        ? `Conditions: wind ${weather.wind} at the start, changed during the attempt (${weather.range}) · ${weather.current}`
        : `Conditions: wind ${weather.wind} · ${weather.current}`
      : "",
    scored,
    total,
    rating:
      total === null
        ? p.phase === "failed"
          ? "Mission failed — not scored"
          : "Not finished"
        : c.ratings.find((r) => total >= r.min)!.label,
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
