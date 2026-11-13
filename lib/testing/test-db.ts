import "dotenv/config";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** A throwaway PostgreSQL database for tests that touch the database: created next to the development one (same server, never the same database),
 * migrated from scratch (which also proves that the migrations replay on an empty database), dropped afterwards. Returns null when no server answers:
 * the caller skips its tests (the hook and the CI then do not depend on Docker).
 *
 * `DATABASE_URL` must be set to `url` BEFORE the first import of `db/index.ts` (it reads the variable once): import it dynamically after this call. */
export async function creerBaseDeTest(): Promise<{ url: string; fermer: () => Promise<void> } | null> {
  const base = process.env.DATABASE_URL;
  if (!base) return null;
  const admin = new URL(base);
  admin.pathname = "/postgres";
  const nom = `cadence_test_${randomBytes(4).toString("hex")}`;
  const sqlAdmin = postgres(admin.toString(), { max: 1, connect_timeout: 3 });
  try {
    await sqlAdmin.unsafe(`CREATE DATABASE ${nom}`);
  } catch {
    await sqlAdmin.end({ timeout: 1 }).catch(() => undefined);
    return null;
  }
  const url = new URL(base);
  url.pathname = `/${nom}`;
  const sqlBase = postgres(url.toString(), { max: 1 });
  await migrate(drizzle(sqlBase), { migrationsFolder: resolve("db/migrations") });
  await sqlBase.end();
  return {
    url: url.toString(),
    fermer: async () => {
      await sqlAdmin.unsafe(`DROP DATABASE IF EXISTS ${nom} WITH (FORCE)`).catch(() => undefined);
      await sqlAdmin.end({ timeout: 1 }).catch(() => undefined);
    },
  };
}
