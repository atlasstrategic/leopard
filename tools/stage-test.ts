// Step-by-step playtest of stages with the real engine (see
// src/stage/playtest.ts). Tests every bundled stage, or the stage files given
// as arguments. Exits non-zero if any stage cannot be completed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseStage } from "../src/stage/load";
import { bundledStages } from "../src/stage/registry";
import { playtest } from "../src/stage/playtest";
const stages = process.argv.slice(2).length
  ? process.argv
      .slice(2)
      .map((f) => parseStage(JSON.parse(readFileSync(resolve(f), "utf8"))))
  : bundledStages();
let failed = 0;
for (const stage of stages) {
  const result = playtest(stage);
  console.log(
    `${result.ok ? "✔" : "✖"} ${stage.id} (${stage.version})${result.ok ? ` · score ${result.score} · +${result.penalty} s` : ""}`,
  );
  for (const s of result.steps)
    console.log(
      `  ${s.ok ? "✔" : "✖"} ${s.step} (${s.kind}) ${s.seconds.toFixed(1)} s${s.note ? ` — ${s.note}` : ""}${s.penalties.map((p) => `\n      penalty: ${p}`).join("")}`,
    );
  if (!result.ok) failed++;
}
process.exit(failed ? 1 : 0);
