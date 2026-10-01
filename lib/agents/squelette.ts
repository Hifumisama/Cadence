import { diffSections } from "./brief";
import type { ChangementBrut } from "./changements";
import type { BriefContenu, StatutChamp } from "./types";

/** Le squelette d'un projet, construit EN CODE depuis le brief (aucun appel au modèle) :
 * clause de style, saison, épisodes, et le brief lui-même. Pur, testé. Idempotent : un
 * épisode du même titre dans la saison cible n'est pas recréé. */

export type EtatProjetPourSquelette = {
  clauseStyle: string;
  saisons: { id: number; numero: number; titre: string }[];
  /** `vide` : ni plan, ni scène, ni résumé : le squelette le réutilise au lieu d'en créer un de trop. */
  episodes: { id: number; seasonId: number; numero: number; titre: string; resume: string; vide?: boolean }[];
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

  // 2. La clause de style du projet (ajoutée telle quelle aux descriptions et prompts).
  if (brief.style?.clause && brief.style.clause.trim() !== etat.clauseStyle.trim()) {
    changements.push({
      groupe: "projet",
      cibleType: "projet",
      cibleRef: "clauseStyle",
      libelle: "Projet · clause de style",
      operation: "modifier",
      avant: etat.clauseStyle,
      apres: { clauseStyle: brief.style.clause.trim() },
    });
  }

  // 3. La saison : celle qui existe (la première), sinon une nouvelle.
  const saison = [...etat.saisons].sort((a, b) => a.numero - b.numero)[0] ?? null;
  const cleSaison = "saison-1";
  if (!saison) {
    changements.push({
      groupe: "saison",
      cle: cleSaison,
      cibleType: "saison",
      cibleRef: null,
      libelle: `Saison 1 · ${brief.titre}`,
      operation: "creer",
      apres: { titre: brief.titre },
    });
  }

  // 4. Les épisodes du brief, sauf ceux qui existent déjà (même titre) dans cette saison.
  const existants = saison ? etat.episodes.filter((e) => e.seasonId === saison.id) : [];
  const titresExistants = new Set(existants.map((e) => e.titre.trim().toLowerCase()));
  let numero = existants.reduce((m, e) => Math.max(m, e.numero), 0);
  // Les épisodes vides déjà là (un OneShot naît avec le sien) reçoivent les premiers épisodes du brief.
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
      apres: {
        titre: ep.titre,
        resume: ep.resume,
        ...(saison ? { saisonId: saison.id } : { saisonCle: cleSaison }),
      },
    });
  }
  return changements;
}
