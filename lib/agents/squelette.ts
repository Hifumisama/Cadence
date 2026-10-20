import { diffSections } from "./brief";
import type { ChangementBrut } from "./changements";
import type { BriefContenu, StatutChamp } from "./types";

/** Le squelette d'un projet, construit EN CODE depuis le brief (aucun appel au modèle) :
 * l'épisode du film, et le brief lui-même (la clause de style du projet suit le brief : voir
 * brief-db.ts, plus de changement « projet » séparé). Pur, testé. Idempotent : un
 * épisode du même titre n'est pas recréé. */

export type EtatProjetPourSquelette = {
  /** `vide` : ni plan, ni scène, ni résumé : le squelette le réutilise au lieu d'en créer un de trop. */
  episodes: { id: number; numero: number; titre: string; resume: string; vide?: boolean }[];
  /** Le brief VALIDE du projet, s'il existe (sinon null : le brief est créé). */
  briefValide: BriefContenu | null;
};

export function squeletteDepuisBrief(
  brief: BriefContenu,
  statuts: Record<string, StatutChamp>,
  etat: EtatProjetPourSquelette,
): ChangementBrut[] {
  const changements: ChangementBrut[] = [];

  // 1. Le brief : créé d'un bloc, ou section par section s'il existe déjà et change.
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

  // 2. Les épisodes du brief, sauf ceux qui existent déjà (même titre).
  const existants = etat.episodes;
  const titresExistants = new Set(existants.map((e) => e.titre.trim().toLowerCase()));
  let numero = existants.reduce((m, e) => Math.max(m, e.numero), 0);
  // Les épisodes vides déjà là (un film naît avec le sien) reçoivent les premiers épisodes du brief.
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
