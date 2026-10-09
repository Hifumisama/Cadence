import type { ChangementBrut } from "../changements";
import type { Operation } from "./types";
import { planParUuid, repliqueParUuid, type VueEpisode } from "./vue-episode";

/** Une opération validée devient un changement pour les applicateurs existants (`plan.ts`, `replique.ts`) : eux calculent l'aperçu
 * (avant/après, écrasement, refus) et appliquent dans la transaction de la proposition. Pur, testé. */

const coupe = (t: string, n = 48) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function operationsVersChangements(operations: Operation[], vue: VueEpisode): ChangementBrut[] {
  const bruts: ChangementBrut[] = [];
  for (const op of operations) {
    if (op.type === "supprimer_replique" || op.type === "remplacer_replique") {
      const r = repliqueParUuid(vue, op.repliqueUuid);
      if (!r) continue;
      if (op.type === "supprimer_replique") {
        bruts.push({ groupe: "repliques", cibleType: "replique", cibleRef: r.uuid, libelle: `Supprimer ${r.handle} · « ${coupe(r.texte)} »`, operation: "supprimer" });
      } else {
        bruts.push({
          groupe: "repliques",
          cibleType: "replique",
          cibleRef: r.uuid,
          libelle: `Modifier ${r.handle} · « ${coupe(r.texte)} »`,
          operation: "modifier",
          apres: { ...(op.texte !== undefined ? { texte: op.texte } : {}), ...(op.locuteur !== undefined ? { locuteur: op.locuteur } : {}) },
        });
      }
      continue;
    }
    if (op.type === "ajouter_plan") {
      // L'applicateur « plan » crée : la scène est celle du plan qu'il suit (déduite à l'application), la fiche vient après (refondre_fiche).
      bruts.push({
        groupe: "plans",
        cibleType: "plan",
        cibleRef: null,
        cle: op.ref,
        libelle: `Ajouter « ${coupe(op.titre)} » (${op.secondes} s)`,
        operation: "creer",
        apres: { titre: op.titre, description: op.description, dureeGenerationSecondes: op.secondes, episodeId: vue.episodeId },
        position: op.position,
      });
      continue;
    }
    const p = planParUuid(vue, op.planUuid);
    if (!p) continue;
    // Une refonte de fiche n'écrit rien dans la transaction : le code lance `plan-h3` après l'application (revision-db.ts).
    if (op.type === "refondre_fiche") continue;
    const nom = `${p.handle} · ${p.titre}`;
    if (op.type === "couper_plan") {
      bruts.push({ groupe: "plans", cibleType: "plan", cibleRef: p.uuid, libelle: `Supprimer ${nom}`, operation: "supprimer" });
    } else if (op.type === "duree_plan") {
      bruts.push({ groupe: "plans", cibleType: "plan", cibleRef: p.uuid, libelle: `Durée de ${nom} : ${p.duree} → ${op.secondes} s`, operation: "modifier", apres: { dureeGenerationSecondes: op.secondes } });
    } else if (op.type === "deplacer_plan") {
      bruts.push({ groupe: "plans", cibleType: "plan", cibleRef: p.uuid, libelle: `Déplacer ${nom}`, operation: "modifier", apres: {}, position: op.position });
    } else {
      bruts.push({
        groupe: "plans",
        cibleType: "plan",
        cibleRef: p.uuid,
        libelle: `Modifier ${nom}`,
        operation: "modifier",
        apres: { ...(op.titre !== undefined ? { titre: op.titre } : {}), ...(op.description !== undefined ? { description: op.description } : {}) },
      });
    }
  }
  return bruts;
}
