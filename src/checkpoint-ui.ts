import { stage } from "./config";
// Restart buttons for the active stage's checkpoint steps, in mission order.
const checkpoints = () =>
  stage.file.mission.steps.flatMap((st) =>
    st.checkpoint ? [{ id: st.id, label: st.checkpoint }] : [],
  );
export const checkpointIds = () => checkpoints().map((c) => c.id);
export const checkpointLabel = (id: string) =>
  checkpoints().find((c) => c.id === id)?.label ?? id;
export const checkpointMarkup = (prefix: string) =>
  `<div class="checkpoints" id="${prefix}-checkpoints" hidden><span>Restart from</span>${checkpoints()
    .map(
      (c) =>
        `<button type="button" id="${prefix}-${c.id}" hidden>${c.label}</button>`,
    )
    .join("")}</div>`;
