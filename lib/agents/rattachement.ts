import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { assets, repliques } from "../../db/schema";
import type { Db } from "./applicateurs/commun";
import { rapprocherLocuteur, type AssetLocuteur } from "./locuteurs";

/** Rattrape les répliques « libres » : un scénario écrit avant le registre d'assets garde le nom de son
 * locuteur en simple texte (`locuteur_texte`), faute de personnage à qui le lier. Dès que le personnage
 * existe (la voix off en est un), on relie la réplique à lui (`locuteur_id`), avec la même règle de
 * rapprochement qu'à la création d'une réplique (`rapprocherLocuteur`). Une réplique dont le locuteur
 * reste inconnu n'est pas touchée. */

export type RepliqueLibre = { id: number; locuteurTexte: string };
export type Rattachement = { id: number; locuteurId: number };

/** Pur : quelles répliques libres se relient à quel élément du registre. */
export function decideRattachements(registre: AssetLocuteur[], libres: RepliqueLibre[]): Rattachement[] {
  const sortie: Rattachement[] = [];
  for (const r of libres) {
    const l = rapprocherLocuteur(r.locuteurTexte, registre);
    if (l.locuteurId != null) sortie.push({ id: r.id, locuteurId: l.locuteurId });
  }
  return sortie;
}

/** Relie les répliques libres du projet à ce que le registre sait maintenant. Renvoie combien l'ont été. */
export async function rattacherRepliquesLibres(db: Db, projectId: number): Promise<number> {
  const lignes = await db.select({ id: assets.id, code: assets.code, type: assets.type }).from(assets).where(eq(assets.projectId, projectId));
  const registre = lignes.filter((a) => a.type === "personnage").map((a) => ({ id: a.id, code: a.code, type: "personnage" as const }));
  const libres = await db
    .select({ id: repliques.id, locuteurTexte: repliques.locuteurTexte })
    .from(repliques)
    .where(and(eq(repliques.projectId, projectId), isNull(repliques.locuteurId), ne(repliques.locuteurTexte, "")))
    .orderBy(asc(repliques.id));
  const decisions = decideRattachements(registre, libres);
  for (const d of decisions) {
    await db.update(repliques).set({ locuteurId: d.locuteurId, locuteurTexte: "", updatedAt: new Date() }).where(eq(repliques.id, d.id));
  }
  return decisions.length;
}
