import { COUPE_RETIRABLE, MAX_AUDIOS, MAX_IMAGES, type ProblemeH3, type SortiePlanH3 } from "./plan-h3-controles";

/** ASSEMBLAGE du prompt H3 à partir du brouillon de `plan-h3` (voir agents/skills/plan-h3/regles.md).
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
  const ouverture = marqueurs(espaces(sortie.ouverture ?? ""));
  const detailed_description = [ouverture, ...rendus].filter(Boolean).join(" ");

  // 4. subject_definitions
  const ligneDef = (a: RefAssemblee, r: SortiePlanH3["references"][number]) => {
    const def = espaces((r.definition ?? "").replace(/^[\s,]+/, ""));
    const nom = espaces(r.nom);
    return a.nature === "image"
      ? `${a.label} is ${nom} from <Picture ${a.slot}>${def ? `, ${def}` : ""}`.replace(/\.$/, "") + "."
      : `${a.label} is ${nom}${def ? `, ${def}` : ""}`.replace(/\.$/, "") + ".";
  };
  const posees = [...parCode.values()].filter((x) => x.a.label != null);
  const ordre = [...posees.filter((x) => x.a.nature === "image"), ...posees.filter((x) => x.a.nature === "son")];
  const subject_definitions = ordre.map((x) => ligneDef(x.a, x.r)).join("\n");

  // 5. retention_analysis
  const retention_analysis = ordre
    .map(({ r, a }) => {
      const nom = espaces(r.nom);
      const note = espaces(r.retentionNote ?? "") || noteParDefaut(nom, a.retention);
      if (a.nature === "son") return `${a.label}: ${a.retention} - ${finir(note)}`;
      const dans = shots.map((_, i) => i).filter((i) => citeDans(r.asset, corps[i]!)).map((i) => `[Shot ${i + 1}]`);
      return `${a.label} (${dans.length ? `appears in ${dans.join(", ")}` : "not cited in a shot"}): ${a.retention} - ${finir(note)}`;
    })
    .join("\n");

  // 6. summary et ambiance
  const tout = (texte: string, titre: string) => marqueurs(espaces(texte)).replace(new RegExp(`^${titre}\\s*:\\s*`, "i"), "");
  const prefixe = posees.some((x) => x.a.nature === "son") ? "[reference generation + audio reference]" : "[reference generation]";
  const resume = marqueurs(espaces(sortie.summary ?? "")).replace(/^\s*\[(?!\[)[^\]]*\]\s*/, "");
  const summary = `${prefixe} ${resume}`;
  const overall_soundscape = tout(sortie.overall_soundscape ?? "", "overall_soundscape");
  const non_diegetic_music = tout(sortie.non_diegetic_music ?? "", "non_diegetic_music");

  // 7. ce qui doit rester après assemblage : aucun marqueur, aucun label hors des nôtres
  const sections = { subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music };
  const texte = (Object.entries(sections) as [string, string][]).map(([nom, v]) => `${nom}:\n${v}`).join("\n\n");
  const posesLabels = new Set(ordre.flatMap((x) => (x.a.nature === "image" ? [x.a.label, `<Picture ${x.a.slot}>`] : [x.a.label])));
  for (const m of texte.matchAll(/<\s*(Subject|Picture|Audio|Video)\s*(\d+)\s*>/gi)) {
    const l = `<${m[1]![0]!.toUpperCase()}${m[1]!.slice(1).toLowerCase()} ${m[2]}>`;
    if (!posesLabels.has(l)) signaler("alerte", "label-residuel", `Le label ${l} est présent sans correspondre à une référence posée.`);
  }
  return { sections, texte, refs, problemes };
}
