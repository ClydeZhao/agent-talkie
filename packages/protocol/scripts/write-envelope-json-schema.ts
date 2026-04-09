import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toJSONSchema } from "zod";
import { EnvelopeSchema } from "../src/envelope.js";

const dir = dirname(fileURLToPath(import.meta.url));
const outDir = join(dir, "../json-schema");
const outPath = join(outDir, "envelope.schema.json");

mkdirSync(outDir, { recursive: true });

const schema = toJSONSchema(EnvelopeSchema);
writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
