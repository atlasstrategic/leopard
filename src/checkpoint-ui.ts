import { checkpointLabels, type CheckpointId } from "./session";
export const checkpointIds: CheckpointId[] = ["approach", "departure"];
export const checkpointMarkup = (prefix: string) =>
  `<div class="checkpoints" id="${prefix}-checkpoints" hidden><span>Restart from</span>${checkpointIds.map((id) => `<button type="button" id="${prefix}-${id}" hidden>${checkpointLabels[id]}</button>`).join("")}</div>`;
