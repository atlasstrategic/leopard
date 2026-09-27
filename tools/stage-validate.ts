// Validates every stages/<id>/stage.json: schema, references and the id
// matching its folder. Exits non-zero with the problems listed.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { parseStage, StageError } from "../src/stage/load";
const root = new URL("../stages/", import.meta.url);
let failed = 0;
for (const dir of readdirSync(root, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const file = new URL(`${dir.name}/stage.json`, root);
  if (!existsSync(file)) continue;
  try {
    const stage = parseStage(JSON.parse(readFileSync(file, "utf8")));
    if (stage.id !== dir.name)
      throw new StageError(stage.id, [
        `id must match its folder "${dir.name}"`,
      ]);
    console.log(`✔ ${dir.name} (${stage.version})`);
  } catch (e) {
    failed++;
    console.error(`✖ ${dir.name}\n${e instanceof Error ? e.message : e}`);
  }
}
process.exit(failed ? 1 : 0);
