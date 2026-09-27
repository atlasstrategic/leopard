// Validates stages: schema, references, the id matching its folder, and the
// geometry checks (fit, reach, reachability, traffic routes). Checks every
// stages/<id>/stage.json, or the files given as arguments. Exits non-zero on
// any error; warnings are listed but do not fail.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { parseStage, StageError } from "../src/stage/load";
import { checkStage } from "../src/stage/check";
const root = new URL("../stages/", import.meta.url);
const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => resolve(f))
  : readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => new URL(`${d.name}/stage.json`, root).pathname)
      .filter((f) => existsSync(f));
let failed = 0;
for (const file of files) {
  const folder = basename(dirname(file));
  try {
    const stage = parseStage(JSON.parse(readFileSync(file, "utf8")));
    const inStages = dirname(dirname(file)) === resolve(root.pathname);
    if (inStages && stage.id !== folder)
      throw new StageError(stage.id, [`id must match its folder "${folder}"`]);
    const { errors, warnings } = checkStage(stage);
    if (errors.length) throw new StageError(stage.id, errors);
    console.log(`✔ ${stage.id} (${stage.version})`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  } catch (e) {
    failed++;
    console.error(`✖ ${file}\n${e instanceof Error ? e.message : e}`);
  }
}
process.exit(failed ? 1 : 0);
