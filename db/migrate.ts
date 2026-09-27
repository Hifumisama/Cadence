import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL manquant (voir .env.example)");
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

await migrate(db, { migrationsFolder: "./db/migrations" });
console.log("Migrations Cadence appliquées.");
await client.end();
