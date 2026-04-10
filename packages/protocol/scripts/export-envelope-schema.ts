import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { envelopeSchema } from "../src/envelope.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");
const schemasDir = join(packageRoot, "schemas");
const outPath = join(schemasDir, "envelope.schema.json");

mkdirSync(schemasDir, { recursive: true });

const schema = z.toJSONSchema(envelopeSchema, { target: "draft-2020-12" });
writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
