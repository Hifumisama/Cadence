import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Do not throw an error here: this module is imported during page collection
// at Next.js build time, before the runtime environment variables
// (provided by docker-compose) are available. The postgres-js
// connection is lazy — it only happens on the first real call.
const connectionString = process.env.DATABASE_URL ?? "postgres://invalid/invalid";

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
