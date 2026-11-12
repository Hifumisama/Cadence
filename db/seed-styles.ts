import { existsSync } from "node:fs";
import { join } from "node:path";
import { notInArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { bibliothequeStyles, cheminApercuStyle } from "../lib/styles/library";
import { IDS_SUJETS } from "../lib/styles/subjects";
import { styles } from "./schema";

/** Seeds the `styles` table from the versioned library (lib/styles/library.json + clauses.json): idempotent, re-run at each
 * migration. An entry removed from the JSON is removed from the database; the available previews are
 * re-read from disk (`mediaRoot`/styles/<id>/<sujet>.webp). */
export async function semerStyles(db: PostgresJsDatabase<Record<string, unknown>>, mediaRoot: string): Promise<number> {
  const lignes = bibliothequeStyles().map((s, ordre) => ({
    id: s.id,
    nom: s.nom,
    descriptor: s.descriptor,
    categories: s.categories,
    filtres: s.filtres,
    clause: s.clause ?? "",
    apercus: IDS_SUJETS.filter((sujet) => existsSync(join(mediaRoot, cheminApercuStyle(s.id, sujet)))),
    ordre,
  }));
  for (let i = 0; i < lignes.length; i += 100) {
    await db
      .insert(styles)
      .values(lignes.slice(i, i + 100))
      .onConflictDoUpdate({
        target: styles.id,
        set: {
          nom: sql`excluded.nom`,
          descriptor: sql`excluded.descriptor`,
          categories: sql`excluded.categories`,
          filtres: sql`excluded.filtres`,
          clause: sql`excluded.clause`,
          apercus: sql`excluded.apercus`,
          ordre: sql`excluded.ordre`,
        },
      });
  }
  await db.delete(styles).where(notInArray(styles.id, lignes.map((l) => l.id)));
  return lignes.length;
}
