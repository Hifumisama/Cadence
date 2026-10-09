import type { ChangementBrut } from "../changements";
import type { Operation } from "./types";
import { planParUuid, repliqueParUuid, type VueEpisode } from "./vue-episode";

/** Une opération validée devient un changement pour les applicateurs existants (`plan.ts`, `replique.ts`) : eux calculent l'aperçu
 * (avant/après, écrasement, refus) et appliquent dans la transaction de la proposition. Pur, testé. */

const coupe = (t: string, n = 48) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Où se pose un plan ajouté : sert à garder l'ORDRE DE LECTURE de plusieurs plans ajoutés au même endroit. Les applicateurs insèrent
 * chacun juste après leur repère : appliqués dans l'ordre, ils se retrouveraient à l'envers. On les applique donc en sens inverse, groupe
 * par groupe (la fin de l'épisode, où chaque ajout s'empile, garde l'ordre direct). */
const repere = (op: Operation): string | null => {
  if (op.type !== "ajouter_plan" || "fin" in op.position) return null;
  return "debut" in op.position ? "debut" : op.position.apresPlanUuid;
};

export function operationsVersChangements(operations: Operation[], vue: VueEpisode): ChangementBrut[] {
  const blocs = operations.map((op) => ({ repere: repere(op), bruts: versChangements(op, vue) }));
  for (const r of new Set(blocs.map((b) => b.repere).filter((x): x is string => x != null))) {
    const places = blocs.flatMap((b, i) => (b.repere === r ? [i] : []));
    const inverses = places.map((i) => blocs[i]!).reverse();
    places.forEach((i, k) => (blocs[i] = inverses[k]!));
  }
  return blocs.flatMap((b) => b.bruts);
}

function versChangements(op: Operation, vue: VueEpisode): ChangementBrut[] {
  if (op.type === "supprimer_replique" || op.type === "remplacer_replique") {
    const r = repliqueParUuid(vue, op.repliqueUuid);
    if (!r) return [];
    if (op.type === "supprimer_replique") {
      return [{ groupe: "repliques", cibleType: "replique", cibleRef: r.uuid, libelle: `Supprimer ${r.handle} · « ${coupe(r.texte)} »`, operation: "supprimer" }];
    }
    return [
      {
        groupe: "repliques",
        cibleType: "replique",
        cibleRef: r.uuid,
        libelle: `Modifier ${r.handle} · « ${coupe(r.texte)} »`,
        operation: "modifier",
        apres: { ...(op.texte !== undefined ? { texte: op.texte } : {}), ...(op.locuteur !== undefined ? { locuteur: op.locuteur } : {}) },
      },
    ];
  }
  if (op.type === "ajouter_replique") {
    const p = planParUuid(vue, op.planUuid);
    if (!p) return [];
    return [
      {
        groupe: "repliques",
        cibleType: "replique",
        cibleRef: null,
        libelle: `Ajouter à ${p.handle} · ${op.locuteur} : « ${coupe(op.texte)} »`,
        operation: "creer",
        apres: { texte: op.texte, locuteur: op.locuteur, episodeId: vue.episodeId, planUuid: p.uuid },
      },
    ];
  }
  if (op.type === "ajouter_plan") {
    // L'applicateur « plan » crée : la scène est celle du plan qu'il suit (déduite à l'application), la fiche vient après (refondre_fiche).
    const plan: ChangementBrut = {
      groupe: "plans",
      cibleType: "plan",
      cibleRef: null,
      cle: op.ref,
      libelle: `Ajouter « ${coupe(op.titre)} » (${op.secondes} s)`,
      operation: "creer",
      apres: { titre: op.titre, description: op.description, dureeGenerationSecondes: op.secondes, episodeId: vue.episodeId },
      position: op.position,
    };
    if (!op.replique) return [plan];
    // Sa réplique se rattache au plan par sa clé : l'applicateur « réplique » la retrouve une fois le plan créé.
    return [
      plan,
      {
        groupe: "repliques",
        cibleType: "replique",
        cibleRef: null,
        libelle: `Réplique de « ${coupe(op.titre, 28)} » · ${op.replique.locuteur} : « ${coupe(op.replique.texte)} »`,
        operation: "creer",
        apres: { texte: op.replique.texte, locuteur: op.replique.locuteur, episodeId: vue.episodeId, planCle: op.ref },
      },
    ];
  }
  const p = planParUuid(vue, op.planUuid);
  if (!p) return [];
  // Une refonte de fiche n'écrit rien dans la transaction : le code lance `plan-h3` après l'application (revision-db.ts).
  if (op.type === "refondre_fiche") return [];
  const nom = `${p.handle} · ${p.titre}`;
  if (op.type === "couper_plan") return [{ groupe: "plans", cibleType: "plan", cibleRef: p.uuid, libelle: `Supprimer ${nom}`, operation: "supprimer" }];
  if (op.type === "duree_plan") {
    return [{ groupe: "plans", cibleType: "plan", cibleRef: p.uuid, libelle: `Durée de ${nom} : ${p.duree} → ${op.secondes} s`, operation: "modifier", apres: { dureeGenerationSecondes: op.secondes } }];
  }
  if (op.type === "deplacer_plan") {
    return [{ groupe: "plans", cibleType: "plan", cibleRef: p.uuid, libelle: `Déplacer ${nom}`, operation: "modifier", apres: {}, position: op.position }];
  }
  return [
    {
      groupe: "plans",
      cibleType: "plan",
      cibleRef: p.uuid,
      libelle: `Modifier ${nom}`,
      operation: "modifier",
      apres: { ...(op.titre !== undefined ? { titre: op.titre } : {}), ...(op.description !== undefined ? { description: op.description } : {}) },
    },
  ];
}
