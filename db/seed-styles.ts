import { existsSync } from "node:fs";
import { join } from "node:path";
import { and, eq, notInArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { bibliothequeStyles, cheminApercuStyle } from "../lib/styles/library";
import { conceptions, styles } from "./schema";

/** Seeds the `styles` table from the versioned library (lib/styles/bibliotheque.json + clauses.json): idempotent, re-run at each
 * migration. An entry removed from the JSON is removed from the database, after the designs that chose it are turned into a FREE
 * style with the same name and prompts (ticket 06, 2026-11-24: the library went from 55 to 17 styles; nothing breaks, nothing changes in
 * the images). The showcase image is re-read from disk (`mediaRoot`/styles/<id>/apercu.webp). */
export async function semerStyles(db: PostgresJsDatabase<Record<string, unknown>>, mediaRoot: string): Promise<number> {
  const lignes = bibliothequeStyles().map((s, ordre) => ({
    id: s.id,
    nom: s.nom,
    descriptor: s.descriptor,
    categories: s.categories,
    filtres: s.filtres,
    clause: s.clause ?? "",
    apercus: existsSync(join(mediaRoot, cheminApercuStyle(s.id))) ? ["apercu"] : [],
    ordre,
  }));
  const gardes = lignes.map((l) => l.id);
  await convertirStylesRetires(db, gardes);
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
  await db.delete(styles).where(notInArray(styles.id, gardes));
  return lignes.length;
}

/** A design whose library style is about to leave the library keeps it as a free style (same name, same image prompt, same clause),
 * read from the `styles` row while it still exists. A style unknown to the table is left alone (nothing to copy). */
async function convertirStylesRetires(db: PostgresJsDatabase<Record<string, unknown>>, gardes: string[]): Promise<void> {
  const retires = await db.select().from(styles).where(notInArray(styles.id, gardes));
  for (const s of retires) {
    const libre = { source: "libre", nom: s.nom, promptImage: s.descriptor, clause: s.clause };
    await db
      .update(conceptions)
      .set({ contenu: sql`jsonb_set(${conceptions.contenu}, '{style}', ${JSON.stringify(libre)}::jsonb)`, updatedAt: new Date() })
      .where(and(eq(sql`${conceptions.contenu}->'style'->>'source'`, "bibliotheque"), eq(sql`${conceptions.contenu}->'style'->>'styleId'`, s.id)));
  }
}
