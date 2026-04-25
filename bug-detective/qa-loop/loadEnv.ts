import { config } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// bug-detective/qa-loop/loadEnv.ts -> bug-detective/.env
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });
