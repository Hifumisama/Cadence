import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN, SHOT_MIN_SECONDES } from "../plan-checks";

/** Contrôles AUTOMATIQUES du BROUILLON rendu par `plan-h3`, avant assemblage et avant toute relecture
 * humaine (étape 3 : la fiche de plan). Pur, sans accès base ni disque. Ils vérifient le contrat du skill
 * (agents/skills/plan-h3/SKILL.md et sortie.schema.json), pas la qualité de la mise en scène : un plan
 * peut passer tous les contrôles et rester médiocre, mais un plan qui en échoue un est à refaire.
 * Le prompt final (labels, timecodes, sections) est produit par lib/agents/plan-h3-assemblage.ts. */

export type ReferenceH3 = {
  asset: string;
  nature: "image" | "son";
  role: string;
  nom: string;
  definition: string;
  retention?: string;
  retentionNote?: string;
};

export type AssetManquantH3 = { code: string; type: string; parent?: string; description: string; raison: string };

export type SortiePlanH3 = {
  titre: string;
  dureeSecondes: number;
  references: ReferenceH3[];
  summary: string;
  ouverture: string;
  shots: { debutSecondes: number; texte: string }[];
  overall_soundscape: string;
  non_diegetic_music: string;
  repliques: { repliqueId: string; debutSecondes?: number }[];
  assetsManquants: AssetManquantH3[];
  notes: string;
};

export type ProblemeH3 = {
  /** erreur : le contrat est violé (à refaire) ; alerte : suspect ; info : à connaître (assets manquants…). */
  niveau: "erreur" | "alerte" | "info";
  regle: string;
  message: string;
};

export type ContexteControleH3 = {
  /** Les assets du registre qu'on a donnés au skill (code et type). */
  registre: { code: string; type: string }[];
  /** Textes exacts des répliques du plan (verbatim attendu dans le prompt). */
  repliques: { texte: string }[];
  /** Slots `<Audio N>` déjà pris par les voix du plan ; par défaut, un par réplique. */
  slotsAudioPris?: number[];
  /** Textes des exemples du skill : une phrase de 10 mots ou plus recopiée d'un exemple donne une alerte. */
  corpusExemples?: string[];
};

export const MAX_IMAGES = 6;
export const MAX_AUDIOS = 3;

/** « 00:04.500 » → 4,5 ; null si le format n'est pas celui du prompt H3. */
export function secondesDeTimecode(tc: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(tc.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3].padEnd(3, "0")) / 1000 : 0);
}

const norme = (s: string) => s.replace(/\s+/g, " ").trim();
const LABEL = /<\s*(Subject|Picture|Audio|Video)\s*\d*\s*>/i;

/** Ce que le modèle écrit parfois lui-même en tête d'un shot, alors que le code pose « At MM:SS.mmm, Hard cut to » :
 * « At 00:05.000, », « Hard cut to », « a hard cut to », « a sudden cut to », « the shot cuts to »… */
const TIMECODE_EN_TETE = String.raw`(?:at\s+\d{1,2}:\d{2}(?:\.\d{1,3})?\s*[,:]?\s*)?`;
const COUPE = String.raw`(?:(?:a|an|the)\s+)?(?:shot\s+)?(?:(?:sudden|final|sharp|hard|abrupt|immediate|clean|quick)\s+)*cuts?`;
/** Une coupe annoncée en tête de shot (retirable ou non). */
export const COUPE_EN_TETE = new RegExp(`^\\s*${TIMECODE_EN_TETE}${COUPE}\\b`, "i");
/** Le cas retirable sans casser la phrase : la coupe est suivie de « to » ou « on » (« a hard cut to an extreme close-up »). */
export const COUPE_RETIRABLE = new RegExp(`^\\s*${TIMECODE_EN_TETE}${COUPE}\\s+(?:directly\\s+|straight\\s+)?(?:to|on)\\b\\s*[,:.—-]?\\s*`, "i");
const TIMECODE_SEUL = /^\s*at\s+\d{1,2}:\d{2}/i;

const RETENTIONS_IMAGE = ["fully_preserved", "partially_preserved", "attribute_transfer", "weak_reference"];
const RETENTIONS_SON = ["fully_copy", "partially_copy", "reference", "weak_reference"];

const mots = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}'’\s-]/gu, " ").split(/\s+/).filter(Boolean);
const TAILLE_RECOPIE = 10;

/** Séquences de `TAILLE_RECOPIE` mots d'un texte, pour repérer une phrase recopiée d'un exemple. */
export function sequencesDeMots(texte: string): Set<string> {
  const m = mots(texte);
  const s = new Set<string>();
  for (let i = 0; i + TAILLE_RECOPIE <= m.length; i++) s.add(m.slice(i, i + TAILLE_RECOPIE).join(" "));
  return s;
}

/** Les shots d'un `detailed_description` ASSEMBLÉ : numéro, timecode d'entrée (null pour le premier), texte. */
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

  // 2. références
  const references = sortie.references ?? [];
  const typeDe = new Map(ctx.registre.map((a) => [a.code, a.type]));
  const images = references.filter((r) => r.nature === "image");
  const sons = references.filter((r) => r.nature === "son");
  const audiosLibres = MAX_AUDIOS - (ctx.slotsAudioPris?.length ?? ctx.repliques.length);
  if (references.length === 0) ajouter("alerte", "references", "Aucune référence : un plan en full-reference porte au moins une image de référence.");
  if (images.length > MAX_IMAGES) ajouter("erreur", "references", `${images.length} images de référence : ${MAX_IMAGES} au plus.`);
  if (sons.length > Math.max(0, audiosLibres)) {
    ajouter("erreur", "references", `${sons.length} références sonores : ${Math.max(0, audiosLibres)} au plus (3 audio, dont ${MAX_AUDIOS - Math.max(0, audiosLibres)} pour les voix du plan ; la voix prime).`);
  }
  const codes = new Set<string>();
  for (const r of references) {
    if (codes.has(r.asset)) ajouter("alerte", "doublon", `L'asset ${r.asset} est référencé deux fois.`);
    codes.add(r.asset);
    const type = typeDe.get(r.asset);
    if (type == null) ajouter("erreur", "asset-inconnu", `La référence « ${r.asset} » n'est pas dans le registre (un asset manquant se déclare dans assetsManquants, il ne s'invente pas).`);
    else if (r.nature === "son" && type !== "sfx") ajouter("erreur", "nature", `${r.asset} est de type ${type} : seule une référence de type sfx a la nature « son ».`);
    else if (r.nature === "image" && (type === "sfx" || type === "voix")) ajouter("erreur", "nature", `${r.asset} est de type ${type} : il n'a pas d'image, sa nature est « son » (ou ce n'est pas une référence).`);
    if (r.retention && !(r.nature === "image" ? RETENTIONS_IMAGE : RETENTIONS_SON).includes(r.retention)) {
      ajouter("erreur", "retention", `${r.asset} : « ${r.retention} » ne va pas à une référence de nature ${r.nature} (${(r.nature === "image" ? RETENTIONS_IMAGE : RETENTIONS_SON).join(", ")}).`);
    }
    if (/^\s*(is|are)\b/i.test(r.definition ?? "")) ajouter("erreur", "definition", `La définition de ${r.asset} commence par « is » : la fiche l'écrit déjà, donne directement ce que fait l'asset.`);
    for (const [champ, t] of [["nom", r.nom], ["definition", r.definition]] as const) {
      if (LABEL.test(t ?? "")) ajouter("erreur", "labels", `${champ} de ${r.asset} écrit un label <Subject/Picture/Audio N> : c'est le code qui les attribue.`);
      if (/\{picture\}|\[\[/.test(t ?? "")) ajouter("erreur", "jeton", `${champ} de ${r.asset} contient un jeton ({picture}, [[CODE]]) : écris du texte simple.`);
    }
  }

  // 3. textes : labels, marqueurs [[CODE]], fuites
  const manquants = new Set((sortie.assetsManquants ?? []).map((a) => a.code));
  const textes: [string, string][] = [
    ["summary", sortie.summary ?? ""],
    ["ouverture", sortie.ouverture ?? ""],
    ...(sortie.shots ?? []).map((s, i): [string, string] => [`shots[${i + 1}]`, s.texte ?? ""]),
    ["overall_soundscape", sortie.overall_soundscape ?? ""],
    ["non_diegetic_music", sortie.non_diegetic_music ?? ""],
  ];
  const cites = new Set<string>();
  for (const [nom, t] of textes) {
    if (LABEL.test(t)) ajouter("erreur", "labels", `${nom} écrit un label <Subject/Picture/Audio N> : désigne l'asset par [[CODE]].`);
    if (/(overall_soundscape|non_diegetic_music|subject_definitions|retention_analysis|detailed_description)\s*:/i.test(t)) {
      ajouter("erreur", "fuite", `${nom} recopie un titre de section : l'ambiance, la musique et les définitions ont chacune leur champ.`);
    }
    if (/\[Shot\s+\d+/i.test(t)) ajouter("erreur", "shots", `${nom} écrit un repère [Shot N] : le code les pose.`);
    for (const m of t.matchAll(/\[\[\s*([^\]]+?)\s*\]\]/g)) {
      const code = m[1]!;
      cites.add(code);
      if (manquants.has(code)) ajouter("erreur", "placeholder", `${nom} cite [[${code}]], un asset manquant : décris-le en prose, sans marqueur.`);
      else if (!codes.has(code)) ajouter("erreur", "placeholder", `${nom} cite [[${code}]], qui n'est pas dans les références du plan.`);
    }
  }
  if ((sortie.ouverture ?? "").includes("[[")) ajouter("alerte", "ouverture", "L'ouverture cite un asset : elle ne pose que le style.");
  for (const r of references) {
    if (!cites.has(r.asset)) ajouter("alerte", "reference-non-citee", `La référence ${r.asset} n'est citée par aucun [[${r.asset}]] : une référence inutilisée.`);
  }

  // 4. shots (structurés : le code pose les numéros et les timecodes)
  const shots = sortie.shots ?? [];
  if (shots.length === 0) {
    ajouter("erreur", "shots", "Aucun shot.");
  } else {
    if (shots[0]!.debutSecondes !== 0) ajouter("erreur", "shots", `Le premier shot commence à ${shots[0]!.debutSecondes} s : il commence à 0.`);
    for (let i = 1; i < shots.length; i++) {
      const ecart = shots[i]!.debutSecondes - shots[i - 1]!.debutSecondes;
      if (ecart <= 0) ajouter("erreur", "shots", `Les débuts des shots ne sont pas croissants (shot ${i + 1}).`);
      // Conseil fort, pas un blocage (utilisateur, 2026-10-02) : une coupe très courte peut être voulue.
      else if (ecart < SHOT_MIN_SECONDES) ajouter("alerte", "shot-court", `Le shot ${i} dure ${ecart.toFixed(2)} s : sous ${SHOT_MIN_SECONDES} s, H3 rallonge ou lisse souvent.`);
    }
    const dernier = shots[shots.length - 1]!.debutSecondes;
    if (Number.isInteger(d)) {
      if (dernier >= d) ajouter("erreur", "shots", `Un shot commence à ${dernier.toFixed(2)} s, au-delà de la durée du plan (${d} s).`);
      else if (shots.length > 1 && d - dernier < SHOT_MIN_SECONDES) ajouter("alerte", "shot-court", `Le dernier shot ne dure que ${(d - dernier).toFixed(2)} s : sous ${SHOT_MIN_SECONDES} s, H3 rallonge ou lisse souvent.`);
    }
    shots.forEach((s, i) => {
      const t = s.texte ?? "";
      if (i === 0) return;
      if (COUPE_EN_TETE.test(t) && !COUPE_RETIRABLE.test(t)) {
        ajouter("erreur", "balisage", `Le shot ${i + 1} commence par une coupe (« ${t.trim().slice(0, 40)}… ») : le code écrit déjà « Hard cut to », commence par le cadre (« a close-up of… »).`);
      } else if (COUPE_RETIRABLE.test(t) || TIMECODE_SEUL.test(t)) {
        ajouter("alerte", "balisage", `Le shot ${i + 1} écrit lui-même son timecode ou sa coupe : le code les pose (retirés à l'assemblage), commence par le cadre.`);
      }
    });
  }

  // 5. dialogues : verbatim
  const detail = norme(shots.map((s) => s.texte ?? "").join(" "));
  for (const r of ctx.repliques) {
    if (r.texte.trim() && !detail.includes(norme(r.texte))) ajouter("erreur", "verbatim", `Réplique absente ou altérée dans les shots : « ${r.texte.slice(0, 60)} ».`);
  }
  if (ctx.repliques.length > 0 && !/<d>/i.test(detail)) ajouter("alerte", "dialogue", "Le plan a des répliques mais les shots n'ont aucune balise <d>.");
  // Chaque voix produite porte un locuteur (S1), (S2)… dans le shot qui la dit : c'est lui qui lie la parole à la voix de
  // référence. Sans lui, le modèle vidéo invente une voix (voire parle deux fois : la sienne et celle de la référence).
  shots.forEach((s, i) => {
    if (/<d>/i.test(s.texte ?? "") && !/\(S\d\)/.test(s.texte ?? "")) {
      ajouter("alerte", "locuteur", `Le shot ${i + 1} a un dialogue <d> sans locuteur « (S1) » : ajoute-le à celui qui parle (voix off comprise).`);
    }
  });

  // 6. calculs de mots par seconde (retirés du projet)
  if (/\b\d+\s*(words?|mots)\s*(per|par|\/)\s*(second|seconde|sec|s)\b/i.test(`${sortie.summary} ${detail}`)) {
    ajouter("alerte", "mots-seconde", "Une estimation en mots par seconde : on ne calcule pas la durée d'une réplique ainsi.");
  }

  // 6 bis. phrases recopiées des exemples (les exemples montrent la forme, jamais le contenu)
  if (ctx.corpusExemples?.length) {
    const connues = new Set(ctx.corpusExemples.flatMap((e) => [...sequencesDeMots(e)]));
    for (const [nom, t] of textes) {
      // L'ouverture reprend la clause de style du projet, identique d'un plan à l'autre : la recopier est voulu.
      if (nom === "ouverture") continue;
      const m = mots(t);
      let debut = -1;
      for (let i = 0; i + TAILLE_RECOPIE <= m.length; i++) {
        if (connues.has(m.slice(i, i + TAILLE_RECOPIE).join(" "))) {
          debut = i;
          break;
        }
      }
      if (debut >= 0) ajouter("alerte", "recopie", `${nom} recopie une phrase d'un exemple (« ${m.slice(debut, debut + TAILLE_RECOPIE).join(" ")}… ») : les exemples montrent la forme, pas le contenu.`);
    }
  }

  // 7. assets manquants et notes
  for (const a of sortie.assetsManquants ?? []) {
    if (typeDe.has(a.code)) ajouter("alerte", "manquant-existant", `${a.code} est déclaré manquant mais existe au registre.`);
    else ajouter("info", "asset-manquant", `Asset manquant : ${a.code} (${a.type}) — ${a.raison}`.slice(0, 300));
  }
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
