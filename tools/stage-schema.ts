// Writes stages/stage.schema.json from the zod definition, for editors and
// stage authors. `npm test` fails if the committed file is out of date.
import { writeFileSync } from "node:fs";
import { stageJsonSchema } from "../src/stage/json-schema";
writeFileSync(
  new URL("../stages/stage.schema.json", import.meta.url),
  `${JSON.stringify(stageJsonSchema(), null, 2)}\n`,
);
console.log("Wrote stages/stage.schema.json");
