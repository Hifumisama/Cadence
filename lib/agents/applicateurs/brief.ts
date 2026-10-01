import { eq, sql } from "drizzle-orm";
import { briefs } from "../../../db/schema";
import { estCleSection } from "../brief";
import type { ChangementBrut } from "../changements";
import type { BriefContenu, StatutChamp } from "../types";
import { synchroniserClauseStyle } from "../brief-db";
import { apres, REFUS_SUPPRESSION, type Applicateur } from "./commun";

/** Cible `brief` : `cibleRef` = « * » (le brief entier, création) ou une clé de section.
 * `apres` = { contenu, statuts } pour « * » ; { valeur, statut? } pour une section. */
export const applicateurBrief: Applicateur = {
  cibleType: "brief",

  async cible(_db, _ctx, ch) {
    return { type: "brief", operation: ch.operation };
  },

  async previsualiser(db, ctx, ch) {
    const sortie: ChangementBrut = { ...ch };
    if (ch.operation === "supprimer") return { ...sortie, refuseRaison: REFUS_SUPPRESSION };
    const [existant] = await db.select().from(briefs).where(eq(briefs.projectId, ctx.projectId));
    const avertissements = [...(ch.avertissements ?? [])];
    if (ch.cibleRef === "*") {
      sortie.avant = existant ? { contenu: existant.contenu } : null;
      if (existant?.statut === "valide") {
        sortie.operation = "modifier";
        sortie.ecrase = "Le brief validé du projet sera remplacé en entier.";
        avertissements.push({ type: "ecrase_valide", texte: "Remplace le brief validé du projet." });
      }
    } else if (ch.cibleRef && estCleSection(ch.cibleRef)) {
      if (!existant) return { ...sortie, refuseRaison: "Aucun brief à modifier : crée-le d'abord." };
      const contenu = existant.contenu as Record<string, unknown>;
      sortie.avant = contenu[ch.cibleRef] ?? null;
      const statuts = existant.statuts as Record<string, StatutChamp>;
      if (existant.statut === "valide" && statuts[ch.cibleRef] === "fourni") {
        sortie.ecrase = `La section « ${ch.cibleRef} », posée par toi, sera remplacée.`;
        avertissements.push({ type: "ecrase_valide", texte: "Remplace une section posée par l'utilisateur." });
      }
    } else {
      return { ...sortie, refuseRaison: `Section de brief inconnue : « ${ch.cibleRef} ».` };
    }
    return { ...sortie, avertissements };
  },

  async verifier(tx, ctx, ch) {
    if (ch.operation === "supprimer") return REFUS_SUPPRESSION;
    if (ch.cibleRef === "*") return null;
    if (!ch.cibleRef || !estCleSection(ch.cibleRef)) return `Section de brief inconnue : « ${ch.cibleRef} ».`;
    const [existant] = await tx.select({ id: briefs.id }).from(briefs).where(eq(briefs.projectId, ctx.projectId));
    return existant ? null : "Aucun brief à modifier.";
  },

  async appliquer(tx, ctx, ch) {
    const a = apres(ch);
    const maintenant = new Date();
    if (ch.cibleRef === "*") {
      const contenu = a.contenu as BriefContenu;
      const statuts = (a.statuts ?? {}) as Record<string, StatutChamp>;
      await tx
        .insert(briefs)
        .values({ projectId: ctx.projectId, statut: "valide", source: "conversation", contenu, statuts })
        .onConflictDoUpdate({
          target: briefs.projectId,
          set: { statut: "valide", contenu, statuts, version: sql`${briefs.version} + 1`, updatedAt: maintenant },
        });
      await synchroniserClauseStyle(tx, ctx.projectId);
      return;
    }
    const [existant] = await tx.select().from(briefs).where(eq(briefs.projectId, ctx.projectId));
    if (!existant) throw new Error("Aucun brief à modifier.");
    const cle = ch.cibleRef as string;
    const statut = (typeof a.statut === "string" ? a.statut : "deduit") as StatutChamp;
    await tx
      .update(briefs)
      .set({
        contenu: { ...(existant.contenu as Record<string, unknown>), [cle]: a.valeur },
        statuts: { ...(existant.statuts as Record<string, StatutChamp>), [cle]: statut },
        version: existant.version + 1,
        updatedAt: maintenant,
      })
      .where(eq(briefs.id, existant.id));
    await synchroniserClauseStyle(tx, ctx.projectId); // la clause de style du projet suit le brief
  },
};
