import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN, SHOT_MIN_SECONDES } from "../plan-checks";

/** Contrôles AUTOMATIQUES de la sortie de `plan-h3`, avant toute relecture humaine (étape 3 : la fiche
 * de plan). Pur, sans accès base ni disque. Ils vérifient le contrat du skill (agents/skills/plan-h3/
 * regles.md et sortie.schema.json), pas la qualité de la mise en scène : un plan peut passer tous les
 * contrôles et rester médiocre, mais un plan qui en échoue un est à refaire. */

export type SortiePlanH3 = {
  titre: string;
  dureeSecondes: number;
  sujets: { asset: string; role: string; definition: string; retention?: string; retentionNote?: string }[];
  summary: string;
  detailed_description: string;
  overall_soundscape: string;
  non_diegetic_music: string;
  repliques: { repliqueId: string; debutSecondes?: number }[];
  notes: string;
};

export type ProblemeH3 = {
  /** erreur : le contrat est violé (à refaire) ; alerte : suspect ; info : à connaître (assets manquants…). */
  niveau: "erreur" | "alerte" | "info";
  regle: string;
  message: string;
};

export type ContexteControleH3 = {
  /** Codes des assets du registre qu'on a donnés au skill. */
  codesRegistre: string[];
  /** Textes exacts des répliques du plan (verbatim attendu dans le prompt). */
  repliques: { texte: string }[];
};

const MAX_SUJETS = 6;

/** « 00:04.500 » → 4,5 ; null si le format n'est pas celui du prompt H3. */
export function secondesDeTimecode(tc: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(tc.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3].padEnd(3, "0")) / 1000 : 0);
}

const norme = (s: string) => s.replace(/\s+/g, " ").trim();

/** Les shots d'un `detailed_description` : numéro, timecode d'entrée (null pour le premier), texte. */
export function decouperShots(texte: string): { numero: number; timecode: number | null; corps: string; hardCut: boolean }[] {
  const reperes = [...texte.matchAll(/\[Shot\s+(\d+)\]/g)];
  return reperes.map((m, i) => {
    const debut = (m.index ?? 0) + m[0].length;
    const fin = i + 1 < reperes.length ? (reperes[i + 1]!.index ?? texte.length) : texte.length;
    const corps = texte.slice(debut, fin);
    const tc = /\bAt\s+(\d{1,2}:\d{2}(?:\.\d{1,3})?)/.exec(corps);
    return { numero: Number(m[1]), timecode: tc ? secondesDeTimecode(tc[1]!) : null, corps, hardCut: /hard cut/i.test(corps) };
  });
}

export function controlerSortiePlanH3(sortie: SortiePlanH3, ctx: ContexteControleH3): ProblemeH3[] {
  const p: ProblemeH3[] = [];
  const ajouter = (niveau: ProblemeH3["niveau"], regle: string, message: string) => p.push({ niveau, regle, message });

  // 1. durée
  const d = sortie.dureeSecondes;
  if (!Number.isInteger(d) || d < DUREE_GENERATION_MIN || d > DUREE_GENERATION_MAX) {
    ajouter("erreur", "duree", `Durée ${String(d)} s : un plan dure ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX} s entières.`);
  }

  // 2. sujets
  const sujets = sortie.sujets ?? [];
  if (sujets.length === 0) ajouter("alerte", "sujets", "Aucun sujet : un plan en full-reference porte au moins une image de référence.");
  if (sujets.length > MAX_SUJETS) ajouter("erreur", "sujets", `${sujets.length} sujets : ${MAX_SUJETS} au plus (limite des références d'image).`);
  const registre = new Set(ctx.codesRegistre);
  const codesSujets = new Set<string>();
  for (const s of sujets) {
    codesSujets.add(s.asset);
    if (!registre.has(s.asset)) ajouter("erreur", "asset-inconnu", `Le sujet « ${s.asset} » n'est pas dans le registre (un asset manquant se signale dans les notes, il ne s'invente pas).`);
    if (!s.definition?.includes("{picture}")) ajouter("erreur", "definition", `La définition de ${s.asset} ne contient pas le jeton {picture}.`);
    if (/<\s*(Subject|Picture|Audio)\s*\d*\s*>/i.test(s.definition ?? "")) ajouter("erreur", "labels", `La définition de ${s.asset} écrit un label <Subject/Picture N> : c'est le code qui les attribue.`);
  }

  // 3. summary / detailed_description : labels, placeholders
  const textes: [string, string][] = [["summary", sortie.summary ?? ""], ["detailed_description", sortie.detailed_description ?? ""]];
  if (!/^\s*\[reference generation/i.test(sortie.summary ?? "")) ajouter("alerte", "summary", "Le summary ne commence pas par [reference generation].");
  const cites = new Set<string>();
  for (const [nom, t] of textes) {
    if (/<\s*(Subject|Picture|Audio)\s*\d+\s*>/i.test(t)) ajouter("erreur", "labels", `${nom} écrit un label <Subject/Picture N> : désigne les sujets par [[CODE]].`);
    for (const m of t.matchAll(/\[\[([^\]]+)\]\]/g)) {
      cites.add(m[1]!.trim());
      if (!codesSujets.has(m[1]!.trim())) ajouter("erreur", "placeholder", `${nom} cite [[${m[1]!.trim()}]], qui n'est pas dans les sujets du plan.`);
    }
  }
  for (const code of codesSujets) {
    if (!cites.has(code)) ajouter("alerte", "sujet-non-cite", `Le sujet ${code} n'est cité par aucun [[${code}]] : une référence inutilisée.`);
  }

  // 4. shots
  const shots = decouperShots(sortie.detailed_description ?? "");
  if (shots.length === 0) {
    ajouter("erreur", "shots", "Aucun [Shot N] dans la description détaillée.");
  } else {
    shots.forEach((s, i) => {
      if (s.numero !== i + 1) ajouter("erreur", "shots", `Numérotation des shots : [Shot ${s.numero}] en position ${i + 1}.`);
      if (i > 0 && !s.hardCut) ajouter("alerte", "shots", `[Shot ${s.numero}] : « Hard cut » attendu après le premier shot.`);
      if (i > 0 && s.timecode == null) ajouter("erreur", "shots", `[Shot ${s.numero}] : timecode « At MM:SS.mmm » manquant.`);
      if (i === 0 && s.timecode != null && s.timecode > 0) ajouter("alerte", "shots", "Le premier shot ne devrait pas porter de timecode.");
    });
    const tcs = shots.map((s, i) => (i === 0 ? 0 : s.timecode)).filter((x): x is number => x != null);
    for (let i = 1; i < tcs.length; i++) {
      if (tcs[i]! <= tcs[i - 1]!) ajouter("erreur", "shots", "Les timecodes des shots ne sont pas croissants.");
      else if (tcs[i]! - tcs[i - 1]! < SHOT_MIN_SECONDES) ajouter("erreur", "shots", `Un shot dure ${(tcs[i]! - tcs[i - 1]!).toFixed(2)} s : sous ${SHOT_MIN_SECONDES} s, H3 rallonge ou lisse.`);
    }
    const dernier = tcs[tcs.length - 1];
    if (dernier != null && Number.isInteger(d)) {
      if (dernier >= d) ajouter("erreur", "shots", `Un timecode (${dernier.toFixed(2)} s) dépasse la durée du plan (${d} s).`);
      else if (tcs.length > 1 && d - dernier < SHOT_MIN_SECONDES) ajouter("erreur", "shots", `Le dernier shot ne dure que ${(d - dernier).toFixed(2)} s : sous ${SHOT_MIN_SECONDES} s.`);
    }
  }

  // 5. dialogues : verbatim
  const detail = norme(sortie.detailed_description ?? "");
  for (const r of ctx.repliques) {
    if (r.texte.trim() && !detail.includes(norme(r.texte))) ajouter("erreur", "verbatim", `Réplique absente ou altérée dans le prompt : « ${r.texte.slice(0, 60)} ».`);
  }
  if (ctx.repliques.length > 0 && !/<d>/i.test(sortie.detailed_description ?? "")) ajouter("alerte", "dialogue", "Le plan a des répliques mais le prompt n'a aucune balise <d>.");

  // 6. calculs de mots par seconde (retirés du projet)
  if (/\b\d+\s*(words?|mots)\s*(per|par|\/)\s*(second|seconde|sec|s)\b/i.test(`${sortie.summary} ${sortie.detailed_description}`)) {
    ajouter("alerte", "mots-seconde", "Une estimation en mots par seconde : on ne calcule pas la durée d'une réplique ainsi.");
  }

  // 7. notes : assets manquants et arbitrages
  if ((sortie.notes ?? "").trim()) ajouter("info", "notes", `Notes de l'agent : ${sortie.notes.trim().slice(0, 300)}`);
  return p;
}

export function resumeControles(problemes: ProblemeH3[]): { erreurs: number; alertes: number; infos: number } {
  return {
    erreurs: problemes.filter((x) => x.niveau === "erreur").length,
    alertes: problemes.filter((x) => x.niveau === "alerte").length,
    infos: problemes.filter((x) => x.niveau === "info").length,
  };
}
