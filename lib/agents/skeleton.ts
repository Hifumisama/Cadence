import { diffSections } from "./brief";
import type { ChangementBrut } from "./changes";
import type { BriefContenu, StatutChamp } from "./types";

/** A project's skeleton, built IN CODE from the brief (no call to the model):
 * the film's episode, and the brief itself (the project's style clause follows the brief: see
 * brief-db.ts, no more separate "projet" change). Pure, tested. Idempotent: an
 * episode with the same title is not recreated. */

export type EtatProjetPourSquelette = {
  /** `vide`: no clip, no scene, no summary: the skeleton reuses it instead of creating one too many. */
  episodes: { id: number; numero: number; titre: string; resume: string; vide?: boolean }[];
  /** The project's VALIDATED brief, if it exists (otherwise null: the brief is created). */
  briefValide: BriefContenu | null;
};

export function squeletteDepuisBrief(
  brief: BriefContenu,
  statuts: Record<string, StatutChamp>,
  etat: EtatProjetPourSquelette,
): ChangementBrut[] {
  const changements: ChangementBrut[] = [];

  // 1. The brief: created in one block, or section by section if it already exists and changes.
  if (!etat.briefValide) {
    changements.push({
      groupe: "brief",
      cibleType: "brief",
      cibleRef: "*",
      libelle: `Brief du projet · ${brief.titre}`,
      operation: "creer",
      apres: { contenu: brief, statuts },
    });
  } else {
    for (const d of diffSections(etat.briefValide, brief)) {
      changements.push({
        groupe: "brief",
        cibleType: "brief",
        cibleRef: d.cle,
        libelle: `Brief · ${d.cle}`,
        operation: "modifier",
        avant: d.avant,
        apres: { valeur: d.apres, statut: statuts[d.cle] ?? "deduit" },
      });
    }
  }

  // 2. The brief's episodes, except those that already exist (same title).
  const existants = etat.episodes;
  const titresExistants = new Set(existants.map((e) => e.titre.trim().toLowerCase()));
  let numero = existants.reduce((m, e) => Math.max(m, e.numero), 0);
  // Empty episodes already there (a film is born with its own) receive the brief's first episodes.
  const videsAReutiliser = existants.filter((e) => e.vide).sort((a, b) => a.numero - b.numero);
  for (const [i, ep] of brief.episodes.entries()) {
    if (titresExistants.has(ep.titre.trim().toLowerCase())) continue;
    const vide = videsAReutiliser.shift();
    if (vide) {
      changements.push({
        groupe: "episodes",
        cibleType: "episode",
        cibleRef: String(vide.id),
        libelle: `Épisode ${vide.numero} · ${ep.titre}`,
        operation: "modifier",
        avant: { titre: vide.titre, resume: vide.resume },
        apres: { titre: ep.titre, resume: ep.resume },
      });
      continue;
    }
    numero += 1;
    changements.push({
      groupe: "episodes",
      cle: `episode-${i + 1}`,
      cibleType: "episode",
      cibleRef: null,
      libelle: `Épisode ${numero} · ${ep.titre}`,
      operation: "creer",
      apres: { titre: ep.titre, resume: ep.resume },
    });
  }
  return changements;
}
