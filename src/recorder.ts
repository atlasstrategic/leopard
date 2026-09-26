import { angle, recorderConfig, scenario, STEP } from "./config";
import type { ContactSample } from "./contacts";

export type LogEvent = {
  sequence: number;
  time: number;
  phase: string;
  type: string;
  message: string;
  data: Record<string, unknown>;
};
export type Episode = {
  obstacleId: string;
  obstacleName: string;
  start: number;
  lastSeen: number;
  duration: number;
  status: "active" | "ended";
  endedReason?: string;
  peakSpeed: number;
  totalNormalImpulseNs: number;
  peakTickImpulseNs: number;
  estimatedPeakLoadN: number;
  fenderCovered: boolean;
  unprotectedContact: boolean;
  hullContact: boolean;
  bottomedOut: boolean;
  maxCompression: number;
  penaltySeconds: number;
  peakContact: ContactSample;
};
export class Recorder {
  events: LogEvent[] = [];
  snapshots: { time: number; data: Record<string, unknown> }[] = [];
  active = new Map<string, Episode>();
  droppedEvents = 0;
  droppedSnapshots = 0;
  private sequence = 0;
  private nextSample = 0;
  constructor(
    public attempt: number,
    public metadata: Record<string, unknown>,
    public phase = "approach",
  ) {
    this.event(0, "attempt.start", "Attempt started", { attempt });
  }
  event(
    time: number,
    type: string,
    message: string,
    data: Record<string, unknown> = {},
  ) {
    const event = {
      sequence: ++this.sequence,
      time,
      phase: this.phase,
      type,
      message,
      data,
    };
    this.events.push(event);
    if (this.events.length > recorderConfig.events) {
      this.events.shift();
      this.droppedEvents++;
    }
    return event;
  }
  // A copy of this log for a new attempt continuing from a checkpoint. Open
  // contact episodes are not carried over.
  fork(attempt: number) {
    const next = new Recorder(attempt, this.metadata, this.phase);
    next.events = structuredClone(this.events);
    next.snapshots = structuredClone(this.snapshots);
    next.droppedEvents = this.droppedEvents;
    next.droppedSnapshots = this.droppedSnapshots;
    next.sequence = this.sequence;
    next.nextSample = this.nextSample;
    return next;
  }
  sample(time: number, data: Record<string, unknown>, force = false) {
    if (!force && time + 1e-8 < this.nextSample) return;
    this.nextSample = time + recorderConfig.sampleSeconds;
    this.snapshots.push({ time, data: structuredClone(data) });
    if (this.snapshots.length > recorderConfig.snapshots) {
      this.snapshots.shift();
      this.droppedSnapshots++;
    }
  }
  contacts(time: number, samples: ContactSample[], dt = STEP) {
    let penalties = 0,
      collisions = 0;
    const groups = new Map<string, ContactSample[]>();
    for (const s of samples) {
      const group = groups.get(s.obstacleId) ?? [];
      group.push(s);
      groups.set(s.obstacleId, group);
    }
    // Expire before considering a new sample, so a return after a gap is a new episode.
    for (const [key, episode] of this.active) {
      if (time - episode.lastSeen > recorderConfig.separationSeconds)
        this.endContact(key, "separated");
    }
    for (const [key, group] of groups) {
      let episode = this.active.get(key);
      if (!episode) {
        episode = {
          obstacleId: key,
          obstacleName: group[0].obstacleName,
          start: time,
          lastSeen: time,
          duration: 0,
          status: "active",
          peakSpeed: 0,
          totalNormalImpulseNs: 0,
          peakTickImpulseNs: 0,
          estimatedPeakLoadN: 0,
          fenderCovered: false,
          unprotectedContact: false,
          hullContact: false,
          bottomedOut: false,
          maxCompression: 0,
          penaltySeconds: 0,
          peakContact: { ...group[0] },
        };
        this.active.set(key, episode);
        // One live summary row per episode; values accumulate until separation.
        this.event(
          time,
          "contact",
          `Contact: ${episode.obstacleName}`,
          episode as unknown as Record<string, unknown>,
        );
      }
      const impulse = group.reduce((sum, s) => sum + s.impulse, 0);
      episode.lastSeen = time;
      episode.duration = time - episode.start;
      episode.totalNormalImpulseNs += impulse;
      episode.peakTickImpulseNs = Math.max(episode.peakTickImpulseNs, impulse);
      episode.estimatedPeakLoadN = Math.max(
        episode.estimatedPeakLoadN,
        impulse / dt,
      );
      for (const s of group) {
        if (s.speed > episode.peakSpeed) {
          episode.peakSpeed = s.speed;
          episode.peakContact = { ...s };
        }
        episode.fenderCovered ||= s.covered;
        episode.unprotectedContact ||= !s.covered;
        episode.hullContact ||= s.hullContact;
        episode.bottomedOut ||= s.hullContact && s.covered;
        episode.maxCompression = Math.max(
          episode.maxCompression,
          s.compression,
        );
      }
      if (
        episode.penaltySeconds === 0 &&
        episode.peakSpeed > recorderConfig.impactThreshold
      ) {
        episode.penaltySeconds = scenario.collisionPenalty;
        penalties += episode.penaltySeconds;
        collisions++;
        this.event(
          time,
          "penalty",
          `${episode.obstacleName}: +${episode.penaltySeconds}s — contact speed above ${recorderConfig.impactThreshold} m/s`,
          {
            obstacleId: key,
            seconds: episode.penaltySeconds,
            reason:
              "Contact speed threshold; fenders are not collision immunity",
          },
        );
      }
    }
    return { penalties, collisions };
  }
  private endContact(key: string, reason: string) {
    const e = this.active.get(key)!;
    e.status = "ended";
    e.endedReason = reason;
    this.active.delete(key);
  }
  finish(time: number, reason: string) {
    for (const key of [...this.active.keys()]) this.endContact(key, reason);
    this.event(time, "attempt.end", `Attempt ended: ${reason}`, { reason });
  }
  export() {
    return structuredClone({
      schemaVersion: 2,
      attempt: this.attempt,
      metadata: this.metadata,
      units: {
        time: "s simulation time",
        position: "m; x east, y north",
        heading: "rad clockwise from north",
        windDirection: "rad TOWARD",
        speed: "m/s",
        impulse: "N·s (normal only)",
        lineTension:
          "N; modeled planar spring/damper load, not measured rope safe working load",
        lineLength: "m (planar); rest length includes attachment slack",
        estimatedPeakLoadN:
          "N = summed tick normal impulse / fixed dt; NOT physical peak force or damage",
      },
      droppedEvents: this.droppedEvents,
      droppedSnapshots: this.droppedSnapshots,
      events: this.events,
      snapshots: this.snapshots,
      activeContacts: [...this.active.values()],
    });
  }
}
export type Recording = ReturnType<Recorder["export"]>;
export function recordingCSV(recording: Recording) {
  const quote = (v: unknown) => {
    let s = typeof v === "string" ? v : JSON.stringify(v);
    // Avoid spreadsheet formula interpretation for external text fields.
    if (/^[=+@-]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  const rows: unknown[][] = [
    [
      "record",
      "time_s",
      "phase",
      "type",
      "message",
      "details_json",
      "obstacle_id",
      "peak_closing_speed_m_s",
      "total_normal_impulse_Ns",
      "peak_tick_impulse_Ns",
      "estimated_peak_load_N",
      "fender_coverage",
      "bottomed_out",
      "penalty_s",
      "contact_duration_s",
    ],
  ];
  rows.push([
    "metadata",
    0,
    "",
    "schema",
    "SI units; estimated loads are solver-dependent",
    {
      schemaVersion: recording.schemaVersion,
      attempt: recording.attempt,
      metadata: recording.metadata,
      units: recording.units,
      droppedEvents: recording.droppedEvents,
      droppedSnapshots: recording.droppedSnapshots,
    },
  ]);
  for (const e of recording.events) {
    const c = e.type === "contact" ? (e.data as unknown as Episode) : null;
    rows.push([
      "event",
      e.time,
      e.phase,
      e.type,
      e.message,
      e.data,
      ...(c
        ? [
            c.obstacleId,
            c.peakSpeed,
            c.totalNormalImpulseNs,
            c.peakTickImpulseNs,
            c.estimatedPeakLoadN,
            c.fenderCovered
              ? c.unprotectedContact
                ? "mixed"
                : "covered"
              : "unprotected",
            c.bottomedOut,
            c.penaltySeconds,
            c.duration,
          ]
        : []),
    ]);
  }
  for (const s of recording.snapshots)
    rows.push(["telemetry", s.time, "", "snapshot", "", s.data]);
  return rows
    .map((row) =>
      [...row, ...Array(rows[0].length - row.length).fill("")]
        .map(quote)
        .join(","),
    )
    .join("\r\n");
}
export const headingChanged = (a: number, b: number) =>
  Math.abs(angle(a - b)) >= (5 * Math.PI) / 180;
