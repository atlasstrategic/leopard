import { mooringConfig } from "./config";
import { lineGeometry, lineIds, type Mooring, type LineId } from "./mooring";
import type { Controls, State } from "./simulation";
export type TendAction = "in" | "out" | "stop";
export function tendingBlock(
  s: State,
  c: Controls,
  lines: Mooring,
  id: LineId,
  action: "in" | "out",
) {
  const line = lines[id],
    cfg = mooringConfig.tending;
  if (!line.attached) return "Attach this line first";
  if (Math.abs(c.port) > 0.01 || Math.abs(c.starboard) > 0.01)
    return "Select both engines neutral before tending";
  const point = lineGeometry(s, id).point;
  if (Math.hypot(point.vx, point.vy) > cfg.maxPointSpeed)
    return "Boat moving too fast for the line crew";
  if (line.tension > (action === "in" ? cfg.maxHaulLoad : cfg.maxEaseLoad))
    return "Load too high for the crew — relieve tension before tending";
  if (action === "in" && line.restLength <= cfg.minLength + 1e-8)
    return "Minimum paid-out length reached";
  if (action === "out" && line.restLength >= cfg.maxLength - 1e-8)
    return "Maximum paid-out length reached";
  return "";
}
export function stopTending(lines: Mooring, id: LineId) {
  lines[id].tending = "idle";
  lines[id].adjustmentRemaining = 0;
  lines[id].restRate = 0;
}
// Bounded discrete crew tasks, not held inputs. Only length changes; position and
// velocity are affected later by the same rope forces used everywhere else.
export function advanceTending(
  s: State,
  c: Controls,
  lines: Mooring,
  dt: number,
) {
  const events: {
    id: LineId;
    type: "line.tend.complete" | "line.tend.blocked";
    reason: string;
    length: number;
  }[] = [];
  const cfg = mooringConfig.tending;
  for (const id of lineIds) {
    const line = lines[id];
    line.restRate = 0;
    if (line.tending === "idle") continue;
    const blocked = tendingBlock(s, c, lines, id, line.tending);
    if (blocked) {
      stopTending(lines, id);
      line.tendStatus = blocked;
      events.push({
        id,
        type: "line.tend.blocked",
        reason: blocked,
        length: line.restLength,
      });
      continue;
    }
    const direction = line.tending === "in" ? -1 : 1,
      previous = line.restLength;
    const amount = Math.min(cfg.rate * dt, line.adjustmentRemaining);
    line.restLength = Math.max(
      cfg.minLength,
      Math.min(cfg.maxLength, previous + direction * amount),
    );
    line.restRate = (line.restLength - previous) / dt;
    line.adjustmentRemaining = Math.max(
      0,
      line.adjustmentRemaining - Math.abs(line.restLength - previous),
    );
    if (line.adjustmentRemaining < 1e-8) {
      // Keep this tick's actual restRate for the force solver, clear next tick.
      line.tending = "idle";
      line.adjustmentRemaining = 0;
      line.tendStatus = "Adjustment complete";
      events.push({
        id,
        type: "line.tend.complete",
        reason: "Adjustment complete",
        length: line.restLength,
      });
    }
  }
  return events;
}
