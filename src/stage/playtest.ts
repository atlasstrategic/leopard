import { STEP, useStage } from "../config";
import { berthFenderSides, lineIds } from "../mooring";
import { Session } from "../session";
import type { State } from "../simulation";
import { debrief } from "../debrief";
import { berthPose, pose } from "./check";
import type { Stage } from "./load";

// Step-by-step playtest: plays each mission step with the real engine,
// placing the boat where the step should be completed and acting as a player
// would (fenders, lines, checklist, levers). It moves the boat between steps
// rather than steering there, so it proves each step can be completed; the
// reachability check in checkStage covers getting between them. Before moving
// onto the berth or to the exit it lets traffic under way leave, as the
// transit would.
export type StepReport = {
  step: string;
  kind: string;
  ok: boolean;
  seconds: number;
  note: string;
};
export type PlaytestResult = {
  ok: boolean;
  steps: StepReport[];
  score: number | null;
  penalty: number;
};
export function playtest(stage: Stage): PlaytestResult {
  useStage(stage);
  const g = new Session();
  const steps: StepReport[] = [];
  const place = (s: State) => {
    Object.assign(g.state, {
      x: s.x,
      y: s.y,
      heading: s.heading,
      vx: 0,
      vy: 0,
      yaw: 0,
    });
    g.previous = { ...g.state };
  };
  const ended = () =>
    g.progress.phase === "complete" || g.progress.phase === "failed";
  const runUntil = (done: () => boolean, limit: number) => {
    for (let t = 0; t < limit && !done() && !ended(); t += STEP) g.tick();
  };
  // Traffic still moored has not been released and will not leave.
  const trafficGone = () =>
    !g.traffic || g.traffic.status === "gone" || g.traffic.status === "moored";
  const refused = (result: { accepted: boolean; message: string }) =>
    result.accepted ? "" : result.message;
  // The berth's fenders go out first, as a careful skipper would.
  for (const side of berthFenderSides()) g.requestFenders(side);
  for (let i = 0; i < g.steps.length && !ended(); i++) {
    const st = g.steps[i],
      from = g.progress.elapsed,
      done = () => g.progress.step > i || g.progress.phase === "complete";
    let note = "";
    switch (st.kind) {
      case "holdInZone": {
        const z = stage.zones[st.zone].shape;
        place(pose(z.x, z.y, g.state.heading));
        runUntil(done, st.seconds + 5);
        if (!done()) note = `still holding after ${st.seconds + 5} s`;
        // A hold that ends early points at an engine bug, not the stage.
        else if (g.progress.elapsed - from < st.seconds - STEP)
          note = `completed in ${(g.progress.elapsed - from).toFixed(1)} s, before its ${st.seconds} s`;
        break;
      }
      case "waitForClear":
        // The boat stays where the previous step left it.
        runUntil(done, 300);
        if (!done())
          note = `${st.vessel} had not cleared ${st.zone} after 300 s (${g.traffic?.status ?? "no traffic"})`;
        break;
      case "arriveAtBerth": {
        // A player needs time to get here from the previous step; the
        // playtest lets traffic leave first rather than land next to it.
        runUntil(trafficGone, 300);
        const t = stage.berth.approach;
        place(pose(t.x, t.y, t.heading));
        runUntil(done, t.dwell + 5);
        if (!done()) note = "the approach target was not held";
        break;
      }
      case "secureAlongside": {
        runUntil(
          () => berthFenderSides().every((side) => g.fenders[side].deployed),
          5,
        );
        place(berthPose(stage));
        // Quay lines first: the lazy line (listed last) needs a stern line on.
        for (const id of lineIds())
          note ||= refused(g.requestLine(id, "attach"));
        if (!note) runUntil(done, 30);
        if (!note && !done()) note = "not secured within 30 s";
        break;
      }
      case "checklist":
        for (const item of st.items) {
          const action =
            item.action === "choice"
              ? item.options.find((o) => !o.refusal)!.id
              : item.id;
          note = refused(g.requestService(action));
          if (note) {
            note = `${item.id}: ${note}`;
            break;
          }
          if (item.action === "timed")
            runUntil(
              () => g.progress.service.amount >= item.total,
              item.total / item.rate + 5,
            );
        }
        if (!note && !done()) note = "checklist did not complete";
        break;
      case "exitThroughGate": {
        // Let traffic leave the harbour first, still alongside with lines on.
        runUntil(trafficGone, 300);
        for (const id of lineIds())
          if (g.mooring[id].attached) g.requestLine(id, "release");
        const gate = stage.gates[st.gate],
          out = { x: Math.sin(gate.heading), y: Math.cos(gate.heading) },
          side = st.keepSide === "starboard" ? 1 : -1,
          right = { x: Math.cos(gate.heading), y: -Math.sin(gate.heading) };
        place(
          pose(
            gate.x - out.x * 8 + right.x * side * (gate.width / 4),
            gate.y - out.y * 8 + right.y * side * (gate.width / 4),
            gate.heading,
          ),
        );
        g.controls.port = g.controls.starboard = 0.4;
        runUntil(done, 40);
        g.controls.port = g.controls.starboard = 0;
        if (!done()) note = "did not cross the gate line within 40 s";
        else if (g.progress.channelSide !== st.keepSide)
          note = `left on the ${g.progress.channelSide} side`;
        break;
      }
    }
    if (g.progress.phase === "failed") note = g.progress.failure ?? "failed";
    steps.push({
      step: st.id,
      kind: st.kind,
      ok: !note && done(),
      seconds: g.progress.elapsed - from,
      note,
    });
    if (note) break;
  }
  const d = debrief(g.progress, g.recorder.events);
  const complete =
    g.progress.phase === "complete" && steps.length === g.steps.length;
  return {
    ok: complete && steps.every((s) => s.ok),
    steps,
    score: d.total,
    penalty: g.progress.penalty,
  };
}
