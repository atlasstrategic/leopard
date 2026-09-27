import { parseStage, StageError, type Stage } from "./load";
import { bundledStages } from "./registry";

// Picks the stage to play from the page URL: ?stage=<bundled id>, or
// ?stage=file for a stage file the player loaded (kept in session storage).
// Anything unusable falls back to the default stage with a notice.
export const stageFileKey = "leopard.stageFile";
export function chooseStage(search: string): {
  stage: Stage;
  notice: string;
} {
  const stages = bundledStages(),
    fallback = stages[0];
  const requested = new URLSearchParams(search).get("stage");
  if (!requested) return { stage: fallback, notice: "" };
  if (requested === "file") {
    let text: string | null = null;
    try {
      text = sessionStorage.getItem(stageFileKey);
    } catch {
      // Storage blocked: treated like a missing file.
    }
    if (!text)
      return {
        stage: fallback,
        notice: "The loaded stage file is no longer available. Load it again.",
      };
    try {
      return { stage: parseStage(JSON.parse(text)), notice: "" };
    } catch (e) {
      return { stage: fallback, notice: problemText(e) };
    }
  }
  const found = stages.find((s) => s.id === requested);
  return found
    ? { stage: found, notice: "" }
    : {
        stage: fallback,
        notice: `Unknown stage "${requested}". Playing ${fallback.name}.`,
      };
}
// Readable text for a stage that failed to load.
export function problemText(e: unknown) {
  if (e instanceof StageError) return e.message;
  if (e instanceof SyntaxError) return `Not valid JSON: ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}
