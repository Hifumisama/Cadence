import { fmtDuree } from "./format";
import type { Constat, StatutDecision } from "./types";

/** Les FAITS que le code donne au tour de réponse (skill `realisateur-reponse`) : tous les chiffres, tous les constats, les refus. Le
 * modèle les formule ; il n'en invente aucun (c'est la règle du skill). Pur, testé. */

export type DecisionPourFaits = {
  id: string;
  titre: string;
  statut: StatutDecision;
  gainSecondes: number;
  constats: Constat[];
  aReverifier: boolean;
};

export type PistePourFaits = { numero: number; titre: string; resume: string; gainSecondes: number; dureeApres: string };

export type FaitsTour = {
  /** Ce qui s'est passé à ce tour. */
  ceTour: { creees: string[]; modifiees: string[]; retirees: string[]; pistesChoisies: number[] };
  decisions: { id: string; titre: string; statut: string; gain: string; constats: { niveau: string; texte: string; source: string }[]; aReverifier: boolean }[];
  duree: { actuelle: string; avecBrouillon: string; objectif: string | null; objectifTenu: boolean | null; ecartSecondes: number | null };
  pistes: { numero: number; titre: string; resume: string; gain: string; dureeApres: string }[];
  /** Ce que le code a refusé (cible inconnue, durée hors limites…), avec la raison : à dire à l'utilisateur. */
  refus: { contexte: string; raison: string }[];
  /** Contradictions mécaniques entre décisions. */
  conflits: string[];
};

const gain = (s: number): string => (s === 0 ? "0 s" : s > 0 ? `−${s} s` : `+${-s} s`);

export function construireFaits(p: {
  ceTour: { creees: string[]; modifiees: string[]; retirees: string[]; pistesChoisies: number[] };
  decisions: DecisionPourFaits[];
  dureeActuelle: number;
  dureeAvecBrouillon: number;
  objectifSecondes: number | null;
  pistes: PistePourFaits[];
  refus: { contexte: string; raison: string }[];
  conflits: string[];
}): FaitsTour {
  const objectif = p.objectifSecondes;
  return {
    ceTour: p.ceTour,
    decisions: p.decisions.map((d) => ({
      id: d.id,
      titre: d.titre,
      statut: d.statut,
      gain: gain(d.gainSecondes),
      constats: d.constats.map((c) => ({ niveau: c.niveau, texte: c.texte, source: c.source })),
      aReverifier: d.aReverifier,
    })),
    duree: {
      actuelle: fmtDuree(p.dureeActuelle),
      avecBrouillon: fmtDuree(p.dureeAvecBrouillon),
      objectif: objectif != null ? fmtDuree(objectif) : null,
      objectifTenu: objectif != null ? p.dureeAvecBrouillon <= objectif : null,
      ecartSecondes: objectif != null ? p.dureeAvecBrouillon - objectif : null,
    },
    pistes: p.pistes.map((x) => ({ numero: x.numero, titre: x.titre, resume: x.resume, gain: gain(x.gainSecondes), dureeApres: x.dureeApres })),
    refus: p.refus,
    conflits: p.conflits,
  };
}
