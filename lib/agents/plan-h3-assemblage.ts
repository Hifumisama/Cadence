import { COUPE_RETIRABLE, MAX_AUDIOS, MAX_IMAGES, MAX_IMAGES_AVEC_RACCORD, citeCode, type ProblemeH3, type SortiePlanH3 } from "./plan-h3-controles";

/** ASSEMBLAGE du prompt H3 à partir du brouillon de `plan-h3` (voir agents/skills/plan-h3/SKILL.md).
 * Pur, déterministe : le modèle écrit la prose, le code pose tout ce qui est mécanique :
 * - les labels : `<Subject i>` et `<Picture i>` (images, dans l'ordre de `references`, de 1 à n sans trou),
 *   `<Audio k>` (bruitages, sur les slots que les voix du plan n'occupent pas) ;
 * - `[[CODE]]` → label, `[Shot N]`, timecodes `At MM:SS.mmm` et « Hard cut to » ;
 * - `subject_definitions`, `retention_analysis` (avec « appears in » calculé par shot) et le préfixe du summary.
 * Les voix ne sont jamais des références : elles gardent leurs slots, que le code reçoit en entrée.
 * Rien n'est réparé en silence au-delà de la tolérance de forme (espaces dans `[[ CODE ]]`, préfixes que le
 * code pose lui-même) ; ce que le code ne peut pas résoudre remonte dans `problemes`. */

export type ContexteAssemblage = {
  /** Slots `<Audio N>` déjà pris par les voix du plan (plan_dialogues.slot). */
  slotsAudioPris: number[];
  /** Les voix du plan, avec leur texte exact et, si connu, le code du personnage qui parle : le code écrit leur ligne
   * de définition (`<Audio N> is the voice-timbre reference for <Subject k> (Sx)`) et de rétention. */
  voix?: { slot: number; texte: string; locuteurCode?: string | null }[];
  /** La clause de style du projet (brief) : posée EN TÊTE de l'ouverture par le code, jamais recopiée par le modèle. */
  clauseStyle?: string;
};

export type RefAssemblee = {
  nature: "image" | "son";
  asset: string;
  /** N de `<Picture N>` ou `<Audio N>`, null si la référence n'a pas pu être posée (dégradée en prose). */
  slot: number | null;
  /** `<Subject i>` / `<Audio k>`, null si dégradée. */
  label: string | null;
  role: string;
  retention: string;
};

export type PromptAssemble = {
  sections: {
    subject_definitions: string;
    summary: string;
    retention_analysis: string;
    detailed_description: string;
    overall_soundscape: string;
    non_diegetic_music: string;
  };
  /** Les six sections, au format du guide H3 (« nom:\n…\n\n »). */
  texte: string;
  refs: RefAssemblee[];
  problemes: ProblemeH3[];
};

const espaces = (s: string) => s.replace(/\s+/g, " ").trim();
const finir = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 4,5 → « 00:04.500 ». */
export function timecode(secondes: number): string {
  const ms = Math.round(secondes * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

/** Le shot d'indice i (0 = premier), débarrassé de ce que le code pose lui-même. */
function corpsDeShot(texte: string, premier: boolean): string {
  let t = texte.trim().replace(/^\[Shot\s+\d+[^\]]*\]\s*/i, "");
  if (!premier) {
    // Seule la coupe suivie de « to » / « on » se retire sans casser la phrase ; le reste est signalé par les contrôles.
    t = t.replace(COUPE_RETIRABLE, "");
    if (/^at\s+\d{1,2}:\d{2}/i.test(t)) t = t.replace(/^at\s+\d{1,2}:\d{2}(?:\.\d{1,3})?\s*[,:]?\s*/i, "");
    // « Hard cut to » précède : l'article d'ouverture s'écrit en minuscule (« Hard cut to a close-up… »).
    t = t.replace(/^(A|An|The)\b/, (m) => m.toLowerCase());
  }
  return t.trim();
}

/** L'identifiant `(Sx)` qui précède le `<d>` de cette réplique dans les shots, ou null (réplique absente ou sans locuteur). */
function locuteurDeReplique(corps: string[], texte: string): string | null {
  const cle = espaces(texte).slice(0, 40);
  if (!cle) return null;
  for (const c of corps) {
    const t = espaces(c);
    const i = t.indexOf(cle);
    if (i < 0) continue;
    const d = t.lastIndexOf("<d>", i);
    if (d < 0) continue;
    const avant = t.slice(Math.max(0, t.lastIndexOf("</d>", d) + 1), d);
    const ids = [...avant.matchAll(/\((S\d+(?:\s*,\s*S\d+)*)\)/g)];
    if (ids.length) return ids[ids.length - 1]![1]!.replace(/\s+/g, "");
  }
  return null;
}

/** Note de rétention par défaut, quand le modèle n'en écrit pas : elle suit le niveau choisi. */
function noteParDefaut(nom: string, retention: string): string {
  switch (retention) {
    case "partially_preserved":
      return `${nom} is used with some of its traits changed in this shot`;
    case "attribute_transfer":
      return `some traits of ${nom} are transferred to another subject`;
    case "weak_reference":
      return `only a general resemblance to ${nom} is kept`;
    case "fully_copy":
      return `${nom} is reused as is`;
    case "partially_copy":
      return `part of ${nom} is reused`;
    case "reference":
      return `the character of ${nom} is referenced without copying the signal`;
    default:
      return `the appearance of ${nom} is retained`;
  }
}

/** Le style des exemples du skill (un autre projet) : le modèle le recopie parfois au lieu de la clause du projet. */
const STYLE_DES_EXEMPLES = /\bcinematic anime style,?\s*(?:refined linework,?\s*)?/gi;

const motsDe = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean);

/** L'ouverture finale : la clause de style du projet vient du CODE (en tête), le modèle n'écrit que la lumière et les côtés.
 * Le style des exemples du skill est retiré ; une clause que le modèle a déjà écrite (six mots de suite) n'est pas doublée.
 * Sans clause connue, l'ouverture du modèle reste telle quelle. */
export function poserClauseStyle(ouverture: string, clause?: string): { texte: string; changee: boolean } {
  const brute = espaces(ouverture);
  const c = espaces(clause ?? "");
  if (!c) return { texte: brute, changee: false };
  const propre = brute.replace(STYLE_DES_EXEMPLES, "").replace(/^\s*(?:the\s+)?project'?s\s+style\s*:\s*/i, "").replace(/^[\s,;]+/, "");
  const mc = motsDe(c);
  const mo = motsDe(propre).join(" ");
  const present = mc.length >= 6 ? Array.from({ length: mc.length - 5 }, (_, i) => mc.slice(i, i + 6).join(" ")).some((x) => mo.includes(x)) : mo.includes(mc.join(" "));
  const texte = present ? propre : `${finir(c)} ${propre}`.trim();
  return { texte, changee: texte !== brute };
}

/** Les consignes de la FEUILLE d'un asset (vues multiples, pose neutre, fond uni, gros plan de présentation) n'ont rien à faire
 * dans la définition d'un sujet du prompt vidéo : H3 les prendrait pour des instructions de plan. */
const CONSIGNES_DE_FEUILLE = [
  /,?\s*character has \d+ views?\s*:?[^.]*/gi,
  /,?\s*(?:standing |posed? )?in a neutral pose against a plain background/gi,
  /,?\s*against a plain (?:white |grey |gray )?background/gi,
  /(?:^|(?<=[.,]\s))\s*detailed (?:close-up|single headshot|macro)[^.]*\.?/gi,
];

export function nettoyerDefinition(definition: string): string {
  let t = definition;
  for (const re of CONSIGNES_DE_FEUILLE) t = t.replace(re, "");
  return espaces(t).replace(/\s+([,.])/g, "$1").replace(/^[\s,;]+/, "").replace(/[,;]\s*$/, "");
}

export type RetraitPourRaccord = {
  asset: string;
  nom: string;
  /** Pourquoi cette image part : citée nulle part, citée hors des shots seulement (résumé, ouverture, ambiance), ou matière faible citée dans un shot. */
  raison: "non-citee" | "hors-shots" | "faible";
};

/** Une image qui ne porte pas d'identité : un effet (`VFX_…`) ou une référence `weak_reference` (seul le look général est emprunté). Décrite en
 * prose, elle se rend à peu près pareil ; c'est ce que le skill demande de sacrifier en premier (règle « Six images au plus »). */
export const imageSacrifiable = (r: { retention?: string }, type?: string): boolean => type === "vfx" || r.retention === "weak_reference";

/** Réserve l'emplacement du RACCORD (2026-10-19). Un plan en liaison « suite » reçoit la dernière image du précédent comme `<Picture N>` : il ne peut donc
 * déclarer que `MAX_IMAGES_AVEC_RACCORD` (5) images, sinon `emplacementLibre` n'en trouve pas et le raccord est sauté. Ce qui se retire, dans cet ordre
 * et seulement autant qu'il faut, la dernière déclarée d'abord dans chaque rang : (1) une image déclarée mais citée nulle part, (2) une image citée
 * seulement hors des shots (elle devient de la prose), (3) une matière faible (effet, `weak_reference`) citée dans un shot (elle devient de la prose).
 * Une image qui porte une identité et que les shots montrent ne se retire jamais ici : s'il en reste plus de 5, `restantes` le dit (le contrôle de code
 * renvoie le modèle, puis l'alerte reste). Les labels et les rétentions se calculent à l'assemblage, depuis la liste restante : la renumérotation est
 * donc propre d'office. `typeDe` : le type au registre de chaque code. Pur, testé. */
export function retirerImagesPourRaccord(
  references: SortiePlanH3["references"],
  textes: { shots: string[]; autres: string[] },
  typeDe: ReadonlyMap<string, string> = new Map(),
  max = MAX_IMAGES_AVEC_RACCORD,
): { references: SortiePlanH3["references"]; retirees: RetraitPourRaccord[]; restantes: number } {
  const tousShots = textes.shots.join(" ");
  const tousAutres = textes.autres.join(" ");
  const images = references.filter((r) => r.nature === "image");
  const retirees: RetraitPourRaccord[] = [];
  const rang = (r: SortiePlanH3["references"][number]): { rang: number; raison: RetraitPourRaccord["raison"] } | null => {
    if (!citeCode(r.asset, tousShots)) return citeCode(r.asset, tousAutres) ? { rang: 1, raison: "hors-shots" } : { rang: 0, raison: "non-citee" };
    return imageSacrifiable(r, typeDe.get(r.asset)) ? { rang: 2, raison: "faible" } : null;
  };
  const candidates = [...images]
    .reverse()
    .flatMap((r) => {
      const x = rang(r);
      return x ? [{ r, ...x }] : [];
    })
    .sort((a, b) => a.rang - b.rang); // tri stable : dans un rang, la dernière déclarée d'abord
  for (const x of candidates.slice(0, Math.max(0, images.length - max))) retirees.push({ asset: x.r.asset, nom: x.r.nom, raison: x.raison });
  const sorties = new Set(retirees.map((x) => x.asset));
  return { references: references.filter((r) => !sorties.has(r.asset)), retirees, restantes: images.length - retirees.length };
}

export function assemblerPlanH3(sortie: SortiePlanH3, ctx: ContexteAssemblage): PromptAssemble {
  const problemes: ProblemeH3[] = [];
  const signaler = (niveau: ProblemeH3["niveau"], regle: string, message: string) => problemes.push({ niveau, regle, message });

  // 1. labels : images dans l'ordre, sons sur les slots libres
  const libres = Array.from({ length: MAX_AUDIOS }, (_, i) => i + 1).filter((n) => !ctx.slotsAudioPris.includes(n));
  let imagesPosees = 0;
  const refs: RefAssemblee[] = (sortie.references ?? []).map((r) => {
    let slot: number | null = null;
    if (r.nature === "image") {
      if (imagesPosees < MAX_IMAGES) slot = ++imagesPosees;
      else signaler("alerte", "degradation", `${r.asset} : plus de ${MAX_IMAGES} images, la référence est décrite en prose.`);
    } else {
      slot = libres.shift() ?? null;
      if (slot == null) signaler("alerte", "degradation", `${r.asset} : plus de slot audio libre (la voix prime), le son est décrit en prose.`);
    }
    return {
      nature: r.nature,
      asset: r.asset,
      slot,
      label: slot == null ? null : r.nature === "image" ? `<Subject ${slot}>` : `<Audio ${slot}>`,
      role: r.role,
      retention: r.retention ?? (r.nature === "image" ? "fully_preserved" : "reference"),
    };
  });
  const parCode = new Map(sortie.references.map((r, i) => [r.asset, { r, a: refs[i]! }]));

  // 2. [[CODE]] → label (ou nom si la référence est dégradée)
  const marqueurs = (texte: string): string => {
    let t = texte.replace(/\[\[\s*([^\]]+?)\s*\]\]/g, "[[$1]]");
    const connus = [...parCode.keys()].map(echapper);
    if (connus.length) t = t.replace(new RegExp(`(?<!\\[)\\[(${connus.join("|")})\\](?!\\])`, "g"), "[[$1]]");
    return t.replace(/\[\[([^\]]+)\]\]/g, (tout, code: string) => {
      const x = parCode.get(code);
      if (!x) {
        signaler("erreur", "placeholder", `[[${code}]] n'est pas une référence du plan.`);
        return tout;
      }
      return x.a.label ?? x.r.nom;
    });
  };
  const citeDans = (code: string, texte: string) => new RegExp(`\\[\\[\\s*${echapper(code)}\\s*\\]\\]|(?<!\\[)\\[${echapper(code)}\\](?!\\])`).test(texte);

  // 3. shots
  const shots = sortie.shots ?? [];
  const corps = shots.map((s, i) => corpsDeShot(s.texte ?? "", i === 0));
  const rendus = shots.map((s, i) => {
    const entete = i === 0 ? `[Shot 1]` : `[Shot ${i + 1}] At ${timecode(s.debutSecondes)}, Hard cut to`;
    return `${entete} ${marqueurs(corps[i]!)}`.replace(/\s+/g, " ").trim();
  });
  const style = poserClauseStyle(sortie.ouverture ?? "", ctx.clauseStyle);
  if (style.changee) signaler("info", "style", "La clause de style du projet est posée par le code en tête de l'ouverture (le style des exemples est retiré).");
  const ouverture = marqueurs(style.texte);
  const detailed_description = [ouverture, ...rendus].filter(Boolean).join(" ");

  // 4. subject_definitions
  const ligneDef = (a: RefAssemblee, r: SortiePlanH3["references"][number]) => {
    const brute = espaces((r.definition ?? "").replace(/^[\s,]+/, ""));
    const def = nettoyerDefinition(brute);
    if (def !== brute) signaler("info", "definition-feuille", `${a.asset} : consignes de feuille d'asset (vues, pose neutre, fond uni) retirées de sa définition.`);
    const nom = espaces(r.nom);
    return a.nature === "image"
      ? `${a.label} is ${nom} from <Picture ${a.slot}>${def ? `, ${def}` : ""}`.replace(/\.$/, "") + "."
      : `${a.label} is ${nom}${def ? `, ${def}` : ""}`.replace(/\.$/, "") + ".";
  };
  const posees = [...parCode.values()].filter((x) => x.a.label != null);
  const ordre = [...posees.filter((x) => x.a.nature === "image"), ...posees.filter((x) => x.a.nature === "son")];

  // 4b. les voix du plan : jamais des références du modèle, mais H3 doit savoir ce que chaque `<Audio N>` désigne
  const lignesVoix = (ctx.voix ?? []).map((v) => {
    const sx = locuteurDeReplique(corps, v.texte);
    const sujet = v.locuteurCode ? parCode.get(v.locuteurCode)?.a.label ?? null : null;
    const pour = [sujet ?? (sx ? "the speaker" : null), sx ? `(${sx})` : null].filter(Boolean).join(" ");
    return {
      slot: v.slot,
      definition: `<Audio ${v.slot}> is the voice-timbre reference${pour ? ` for ${pour}` : ""}.`,
      // Le guide officiel n'écrit pas `(Sx)` dans retention_analysis : le locuteur y est nommé par son sujet.
      retention: `<Audio ${v.slot}>: reference - ${sujet ?? "the speaker"} follows the voice timbre and measured delivery of <Audio ${v.slot}> without copying the original signal.`,
    };
  });
  const subject_definitions = [...ordre.map((x) => ligneDef(x.a, x.r)), ...lignesVoix.map((v) => v.definition)].join("\n");

  // 5. retention_analysis
  const retention_analysis = ordre
    .map(({ r, a }) => {
      const nom = espaces(r.nom);
      const note = espaces(r.retentionNote ?? "") || noteParDefaut(nom, a.retention);
      if (a.nature === "son") return `${a.label}: ${a.retention} - ${finir(note)}`;
      const dans = shots.map((_, i) => i).filter((i) => citeDans(r.asset, corps[i]!)).map((i) => `[Shot ${i + 1}]`);
      return `${a.label} (${dans.length ? `appears in ${dans.join(", ")}` : "not cited in a shot"}): ${a.retention} - ${finir(note)}`;
    })
    .concat(lignesVoix.map((v) => v.retention))
    .join("\n");

  // 6. summary et ambiance
  const tout = (texte: string, titre: string) => marqueurs(espaces(texte)).replace(new RegExp(`^${titre}\\s*:\\s*`, "i"), "");
  const prefixe = posees.some((x) => x.a.nature === "son") || lignesVoix.length > 0 ? "[reference generation + audio reference]" : "[reference generation]";
  const resume = marqueurs(espaces(sortie.summary ?? "")).replace(/^\s*\[(?!\[)[^\]]*\]\s*/, "");
  const summary = `${prefixe} ${resume}`;
  const overall_soundscape = tout(sortie.overall_soundscape ?? "", "overall_soundscape");
  const non_diegetic_music = tout(sortie.non_diegetic_music ?? "", "non_diegetic_music");

  // 7. ce qui doit rester après assemblage : aucun marqueur, aucun label hors des nôtres
  const sections = { subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music };
  const texte = (Object.entries(sections) as [string, string][]).map(([nom, v]) => `${nom}:\n${v}`).join("\n\n");
  const posesLabels = new Set(ordre.flatMap((x) => (x.a.nature === "image" ? [x.a.label, `<Picture ${x.a.slot}>`] : [x.a.label])));
  for (const v of lignesVoix) posesLabels.add(`<Audio ${v.slot}>`);
  for (const m of texte.matchAll(/<\s*(Subject|Picture|Audio|Video)\s*(\d+)\s*>/gi)) {
    const l = `<${m[1]![0]!.toUpperCase()}${m[1]!.slice(1).toLowerCase()} ${m[2]}>`;
    if (!posesLabels.has(l)) signaler("alerte", "label-residuel", `Le label ${l} est présent sans correspondre à une référence posée.`);
  }
  return { sections, texte, refs, problemes };
}
