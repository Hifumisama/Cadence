import type { ChangementBrut } from "../changes";
import type { Operation } from "./types";
import { planParUuid, type VueEpisode } from "./view-episode";

/** A validated operation becomes a change for the existing appliers (`clip.ts`): they compute the preview
 * (before/after, overwrite, refusal) and apply within the transaction of the proposal. Pure, tested. */

const coupe = (t: string, n = 48) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Where an added clip is placed: used to keep the READING ORDER of several clips added at the same place. The appliers each insert
 * just after their marker: applied in order, they would end up reversed. So we apply them in reverse order, group by group
 * (the end of the episode, where each addition stacks, keeps the direct order). */
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
  if (op.type === "ajouter_plan") {
    // The « plan » applier creates: the scene is that of the clip it follows (deduced on application), the sheet comes after (refondre_fiche).
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
    return [plan];
  }
  const p = planParUuid(vue, op.planUuid);
  if (!p) return [];
  // A sheet rewrite writes nothing in the transaction: the code recompiles the sheet with Open H3 IR after application.
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
      apres: { ...(op.titre !== undefined ? { titre: op.titre } : {}), ...(op.description !== undefined ? { description: op.description } : {}), ...(op.liaison !== undefined ? { liaison: op.liaison } : {}) },
    },
  ];
}
