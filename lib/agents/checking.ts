import { ORDRE_GROUPES, TITRES_GROUPES } from "./changes";
import type {
  Avertissement,
  CompteursProposition,
  EcrasementAConfirmer,
  Operation,
  VueChangement,
  VueGroupe,
} from "./types";

/** Ticking and summary of a selection — pure, tested. Rules validated (2026-10-02):
 * creations ticked; edits of already-validated items (`ecrase`), deletions,
 * changes blocked by a check and changes refused outright: UNTICKED. */

type PourCochage = {
  operation: Operation;
  avertissements: Avertissement[];
  ecrase: string | null;
  refuseRaison: string | null;
  /** The converter judged the action risk-free (see `ChangementBrut.cocheOffice`). */
  office?: boolean;
};

export function estBloque(avertissements: Avertissement[]): boolean {
  return avertissements.some((a) => a.type === "bloque_controle");
}

export function cocheParDefaut(c: PourCochage): boolean {
  if (c.refuseRaison) return false;
  if (estBloque(c.avertissements)) return false;
  if (c.ecrase || c.avertissements.some((a) => a.type === "ecrase_valide")) return false;
  if (c.operation === "supprimer") return c.office === true;
  return true;
}

/** Why this change cannot be ticked, or null. */
export function raisonNonCochable(c: Pick<PourCochage, "avertissements" | "refuseRaison">): string | null {
  if (c.refuseRaison) return c.refuseRaison;
  if (estBloque(c.avertissements)) return "Un contrôle échoue : corrige-le d'abord.";
  return null;
}

/** The displayed group: overwrites are grouped at the top, whatever their type. */
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

/** Sorts the changes into display groups, in order: overwrites first. */
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
