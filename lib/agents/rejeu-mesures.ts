/** Mesures d'un rejeu de création de projet (scripts/rejeu-creation.ts) : de quoi comparer, d'une version des skills à la
 * suivante, ce qui évolue — durée tenue, découpage, répétitions, présence de caméra et de lumière. Pur : aucune base,
 * aucun appel, tout est testé. */

export type PlanMesure = { titre: string; scene: string; dureeSecondes: number; description: string };

/** Plus la valeur de similarité est haute, plus deux descriptions se ressemblent (0 à 1). */
export function similarite(a: string, b: string): number {
  const mots = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((m) => m.length > 3),
    );
  const A = mots(a);
  const B = mots(b);
  if (A.size === 0 || B.size === 0) return 0;
  let commun = 0;
  for (const m of A) if (B.has(m)) commun++;
  return commun / (A.size + B.size - commun);
}

export type Repetition = { a: string; b: string; similarite: number };

/** Paires de plans d'un épisode dont les descriptions se recoupent trop (une action « répétée »). */
export function repetitions(plans: PlanMesure[], seuil = 0.45): Repetition[] {
  const r: Repetition[] = [];
  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      const s = similarite(plans[i]!.description, plans[j]!.description);
      if (s >= seuil) r.push({ a: plans[i]!.titre, b: plans[j]!.titre, similarite: Math.round(s * 100) / 100 });
    }
  }
  return r;
}

export type MesureEpisode = {
  titre: string;
  cibleSecondes: number | null;
  totalSecondes: number;
  /** Écart au total visé, en % (null sans cible). */
  ecartPct: number | null;
  nbPlans: number;
  moyenneSecondes: number;
  minSecondes: number;
  maxSecondes: number;
  /** Plans de moins de 5 s : une erreur du skill (« jamais sous 5 secondes »). */
  sousCinq: number;
  /** Plans consécutifs de la même scène dont la somme tient en 15 s : fusionnables (surdécoupage). */
  fusionnables: number;
  repetitions: Repetition[];
};

export function mesurerEpisode(titre: string, plans: PlanMesure[], cibleSecondes: number | null): MesureEpisode {
  const durees = plans.map((p) => p.dureeSecondes);
  const total = durees.reduce((s, d) => s + d, 0);
  let fusionnables = 0;
  for (let i = 1; i < plans.length; i++) {
    if (plans[i]!.scene === plans[i - 1]!.scene && durees[i]! + durees[i - 1]! <= 15) fusionnables++;
  }
  return {
    titre,
    cibleSecondes,
    totalSecondes: total,
    ecartPct: cibleSecondes ? Math.round(((total - cibleSecondes) / cibleSecondes) * 100) : null,
    nbPlans: plans.length,
    moyenneSecondes: plans.length ? Math.round((total / plans.length) * 10) / 10 : 0,
    minSecondes: plans.length ? Math.min(...durees) : 0,
    maxSecondes: plans.length ? Math.max(...durees) : 0,
    sousCinq: durees.filter((d) => d < 5).length,
    fusionnables,
    repetitions: repetitions(plans),
  };
}

const MOTS_CAMERA = /\b(pan|tilt|dolly|track(?:ing)?|push[- ]in|pull[- ]out|zoom|crane|orbit|handheld|steadicam|close[- ]?up|wide shot|medium shot|over[- ]the[- ]shoulder|low angle|high angle|pov|static shot|plan (?:large|serré|moyen)|gros plan|travelling|panoramique)\b/i;
const MOTS_LUMIERE = /\b(light(?:ing)?|lit|sunlight|sunset|sunrise|dusk|dawn|golden hour|overcast|backlit|shadow|neon|daylight|noon|morning|evening|night|lumière|éclairage|contre-jour|ombre|crépuscule|aube|soleil)\b/i;

export type MesureFiches = { nbFiches: number; avecCamera: number; avecLumiere: number };

/** Part des fiches de plan (texte complet du prompt) qui disent une caméra et une lumière. */
export function mesurerFiches(textes: string[]): MesureFiches {
  return {
    nbFiches: textes.length,
    avecCamera: textes.filter((t) => MOTS_CAMERA.test(t)).length,
    avecLumiere: textes.filter((t) => MOTS_LUMIERE.test(t)).length,
  };
}

export type MesureAppels = { skill: string; n: number; tokensEntree: number; tokensSortie: number; secondesMoyennes: number; renvois: number; pasOk: number };

export type RapportRejeu = {
  fiche: string;
  date: string;
  git: { sha: string; modifie: boolean };
  modeles: string[];
  /** Messages de l'utilisateur simulé avant que le briefing soit prêt. */
  echangesUtilisateur: number;
  /** Empreinte du prompt système de chaque skill utilisé : change dès qu'un fichier de skill change. */
  empreintesSkills: Record<string, string>;
  dureeRejeuSecondes: number;
  etapeAtteinte: string;
  episodes: MesureEpisode[];
  fiches: MesureFiches | null;
  appels: MesureAppels[];
};

const signe = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Lecture côte à côte de deux rapports : ce qui a bougé depuis le rejeu précédent (même fiche). */
export function comparerRapports(avant: RapportRejeu, apres: RapportRejeu): string[] {
  const l: string[] = [];
  l.push(`Avant : ${avant.date} (${avant.git.sha}${avant.git.modifie ? "+" : ""}) · Après : ${apres.date} (${apres.git.sha}${apres.git.modifie ? "+" : ""})`);
  const changes = Object.keys(apres.empreintesSkills).filter((s) => avant.empreintesSkills[s] !== apres.empreintesSkills[s]);
  l.push(`Skills modifiés : ${changes.length ? changes.join(", ") : "aucun"}`);
  l.push(`Échanges avant « prêt » : ${avant.echangesUtilisateur} → ${apres.echangesUtilisateur}`);
  for (const e of apres.episodes) {
    const a = avant.episodes.find((x) => x.titre === e.titre);
    if (!a) continue;
    const ecart = (m: MesureEpisode) => (m.ecartPct == null ? "?" : `${signe(m.ecartPct)} %`);
    l.push(
      `${e.titre} : durée ${a.totalSecondes} → ${e.totalSecondes} s (écart ${ecart(a)} → ${ecart(e)}), plans ${a.nbPlans} → ${e.nbPlans}, moyenne ${a.moyenneSecondes} → ${e.moyenneSecondes} s, sous 5 s ${a.sousCinq} → ${e.sousCinq}, fusionnables ${a.fusionnables} → ${e.fusionnables}, répétitions ${a.repetitions.length} → ${e.repetitions.length}`,
    );
  }
  if (avant.fiches && apres.fiches) l.push(`Fiches avec caméra ${avant.fiches.avecCamera}/${avant.fiches.nbFiches} → ${apres.fiches.avecCamera}/${apres.fiches.nbFiches} ; avec lumière ${avant.fiches.avecLumiere}/${avant.fiches.nbFiches} → ${apres.fiches.avecLumiere}/${apres.fiches.nbFiches}`);
  const jetons = (r: RapportRejeu) => r.appels.reduce((s, x) => s + x.tokensSortie, 0);
  l.push(`Jetons de sortie (réflexion comprise) : ${jetons(avant)} → ${jetons(apres)} ; durée du rejeu ${avant.dureeRejeuSecondes} → ${apres.dureeRejeuSecondes} s`);
  return l;
}
