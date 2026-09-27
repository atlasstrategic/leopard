import { z } from "zod";
import { stageSchema } from "./schema";
export const stageJsonSchema = () => ({
  ...z.toJSONSchema(stageSchema, { target: "draft-2020-12" }),
  title: "Leopard / Handling Lab stage",
});
