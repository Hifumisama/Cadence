import { ORDRE_GROUPES, TITRES_GROUPES } from "./changements";
import type {
  Avertissement,
  CompteursProposition,
  EcrasementAConfirmer,
  Operation,
  VueChangement,
  VueGroupe,
} from "./types";

/** Cochage et résumé d'une sélection — pur, testé. Règles validées (2026-10-02) :
 * créations cochées ; modifications d'éléments déjà validés (`ecrase`), suppressions,
 * changements bloqués par un contrôle et changements refusés d'office : DÉCOCHÉS. */

type PourCochage = {
  operation: Operation;
  avertissements: Avertissement[];
  ecrase: string | null;
  refuseRaison: string | null;
};

export function estBloque(avertissements: Avertissement[]): boolean {
  return avertissements.some((a) => a.type === "bloque_controle");
}

export function cocheParDefaut(c: PourCochage): boolean {
  if (c.refuseRaison) return false;
  if (estBloque(c.avertissements)) return false;
  if (c.operation === "supprimer") return false;
  if (c.ecrase || c.avertissements.some((a) => a.type === "ecrase_valide")) return false;
  return true;
}

/** Pourquoi on ne peut pas cocher ce changement, ou null. */
export function raisonNonCochable(c: Pick<PourCochage, "avertissements" | "refuseRaison">): string | null {
  if (c.refuseRaison) return c.refuseRaison;
  if (estBloque(c.avertissements)) return "Un contrôle échoue : corrige-le d'abord.";
  return null;
}

/** Le groupe affiché : les écrasements sont regroupés en tête, quel que soit leur type. */
export function groupeAffiche(c: Pick<VueChangement, "groupe" | "ecrase" | "refuseRaison">): string {
  return c.ecrase && !c.refuseRaison ? "ecrasement" : c.groupe;
}

export function compter(changements: VueChangement[]): CompteursProposition {
  let selectionnes = 0;
  let bloques = 0;
  let refuses = 0;
  let ecrasementsSelectionnes = 0;
  let inventions = 0;
  for (const c of changements) {
    if (c.refuseRaison) refuses++;
    else if (c.bloque) bloques++;
    else if (c.coche) {
      selectionnes++;
      if (c.ecrase) ecrasementsSelectionnes++;
    }
    if (c.avertissements.some((a) => a.type === "invention")) inventions++;
  }
  const total = changements.length;
  return { total, selectionnes, ecartes: total - selectionnes - bloques - refuses, bloques, refuses, ecrasementsSelectionnes, inventions };
}

export function ecrasementsAConfirmer(changements: VueChangement[]): EcrasementAConfirmer[] {
  return changements
    .filter((c) => c.coche && c.ecrase && !c.refuseRaison && !c.bloque)
    .map((c) => ({ changementId: c.id, libelle: c.libelle, ecrase: c.ecrase as string }));
}

/** Range les changements en groupes d'affichage, dans l'ordre : écrasements en tête. */
export function grouper(changements: VueChangement[]): VueGroupe[] {
  const parGroupe = new Map<string, VueChangement[]>();
  for (const c of [...changements].sort((a, b) => a.ordre - b.ordre)) {
    const id = groupeAffiche(c);
    parGroupe.set(id, [...(parGroupe.get(id) ?? []), c]);
  }
  const ids = [...parGroupe.keys()].sort((a, b) => {
    const ia = ORDRE_GROUPES.indexOf(a);
    const ib = ORDRE_GROUPES.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return ids.map((id) => {
    const liste = parGroupe.get(id)!;
    return {
      id,
      titre: TITRES_GROUPES[id] ?? id,
      changements: liste,
      coches: liste.filter((c) => c.coche && !c.bloque && !c.refuseRaison).length,
      total: liste.length,
    };
  });
}

/** Résumé en une phrase de la sélection (« 12 changements : 9 retenus, 3 écartés… »). */
export function resumerSelection(c: CompteursProposition): string {
  const morceaux = [`${c.selectionnes} retenu${c.selectionnes > 1 ? "s" : ""}`];
  if (c.ecartes) morceaux.push(`${c.ecartes} écarté${c.ecartes > 1 ? "s" : ""}`);
  if (c.bloques) morceaux.push(`${c.bloques} bloqué${c.bloques > 1 ? "s" : ""}`);
  if (c.refuses) morceaux.push(`${c.refuses} refusé${c.refuses > 1 ? "s" : ""}`);
  return `${c.total} changement${c.total > 1 ? "s" : ""} : ${morceaux.join(", ")}.`;
}
