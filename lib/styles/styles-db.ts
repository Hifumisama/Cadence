import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { styles } from "@/db/schema";
import type { StyleBibliotheque } from "./bibliotheque";
import type { FiltresStyle } from "./filtres";

/** Un style de la bibliothèque tel que la base le rend (table `styles`, semée par db/seed-styles.ts) : le style, plus les sujets dont l'aperçu existe. */
export type StyleEnBase = StyleBibliotheque & { apercus: string[] };

const versStyle = (l: typeof styles.$inferSelect): StyleEnBase => ({
  id: l.id,
  nom: l.nom,
  descriptor: l.descriptor,
  categories: l.categories as string[],
  filtres: l.filtres as FiltresStyle,
  ...(l.clause ? { clause: l.clause } : {}),
  apercus: l.apercus as string[],
});

export async function listerStyles(): Promise<StyleEnBase[]> {
  return (await db.select().from(styles).orderBy(asc(styles.ordre))).map(versStyle);
}

export async function apercusDuStyle(id: string): Promise<string[]> {
  const [l] = await db.select({ apercus: styles.apercus }).from(styles).where(eq(styles.id, id));
  return (l?.apercus as string[] | undefined) ?? [];
}
