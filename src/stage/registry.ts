import fuelDock from "../../stages/fuel-dock/stage.json";
import openWater from "../../stages/open-water/stage.json";
import { parseStage, type Stage } from "./load";
// Stages bundled with the game, in picker order; the first is the default.
// Add each new stages/<id>/stage.json here (a test checks none is missing).
const files: unknown[] = [fuelDock, openWater];
let parsed: Stage[] | undefined;
export const bundledStages = () => (parsed ??= files.map(parseStage));
