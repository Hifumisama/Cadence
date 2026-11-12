import { libelleAsset } from "../assets/assetCode";
import { correspondances } from "../agents/similar-codes";
import { sansConsigneAuteur, sansEtatDeFin } from "../clips/intent";
import { MAX_REFS_VISUELLES } from "../clips/clip-continuity";
import { ROLE_PAR_TYPE, estVoixOff, separerDescription, trouverPersonnage } from "./brief";

/** The choice of a clip's references (step 5 of Open H3 IR, docs/PLAN_INTEGRATION_OPEN_H3_IR.md): which registry assets a new clip sends to the
 * compiler. The code decides alone when the description is explicit; otherwise it returns its DOUBTS, and only that case calls the small skill
 * `references-plan` (lib/agents/references-clip.ts), which completes or corrects the list. Pure: no database or disk access (lib/h3ir/references-clip-db.ts loads).
 *
 * Rules, in order:
 *  1. a code cited as-is in the description (`CHAR_x`, `PROP_y`…) is taken by default (a miscopied code is matched by `correspondances`);
 *  2. each speaker of a line (« NOM : « … » ») is resolved to a character (`trouverPersonnage`); their images come first;
 *  3. characters, objects, effects and keyframes NAMED in the narration (label or code without prefix, words in order; linking words and plurals
 *     ignored; text between « » does not count: it is speech or on-screen text). A name included in a longer name cited at the same place
 *     is erased (« l'avatar en flammes » = the state, not the subject). A subject whose STATE (derived asset) is evoked without being named = doubt;
 *  4. set: a single named set (the words of the set, even scattered) => taken; otherwise, « suite » clip in the same scene => the previous clip's set;
 *     otherwise doubt;
 *  5. 6 images at most (`MAX_REFS_VISUELLES`), a single face per character, in order: speakers, other characters, objects, effects, keyframes, set;
 *  6. the role comes from the type (`ROLE_PAR_TYPE`). Voices (a character's field) and posters are never candidates. */

export type CandidatReference = {
  code: string;
  type: string;
  label?: string | null;
  description?: string | null;
  /** The code of the asset this one is a state of (`deriveDeId`), or null. */
  parent?: string | null;
  aUneImage?: boolean;
};

export type EntreeReferencesPlan = {
  /** The clip's description as stored: the old « État en fin de plan » and the « Consigne de l'auteur » are removed here (lib/clips/intent.ts). */
  description: string;
  /** `suite` + `precedent.memeScene`: the previous clip's set serves when the description does not name a single one. */
  liaison: string;
  precedent: { memeScene: boolean; decor: string | null } | null;
  /** The project's registry (posters and unknown types are set aside here). */
  candidats: CandidatReference[];
  /** The brief's effects and objects (`brief.elements`): an element evoked without a matching asset is a doubt. */
  elements?: { nom: string; nature: string }[];
};

type TypeDoute =
  | "sans_narration"
  | "code_inconnu"
  | "locuteur_introuvable"
  | "nom_inconnu"
  | "ambiguite_etat"
  | "decor_introuvable"
  | "decor_ambigu"
  | "element_sans_asset"
  | "trop_de_candidats";

export type Doute = { type: TypeDoute; detail: string };
export type ReferenceChoisie = { code: string; type: string; role: string; pourquoi: string };
export type ResultatReferencesPlan = {
  references: ReferenceChoisie[];
  doutes: Doute[];
  /** True when the code has no doubt: the skill is not called. */
  suffit: boolean;
  /** What the code read: the narration (without lines, end state or directive) and the speakers, for the skill's entry. */
  narration: string;
  locuteurs: string[];
};

export const LIMITE_IMAGES_PLAN = MAX_REFS_VISUELLES;

/** Words that distinguish nothing in a name (linking words, articles), in French and in English. */
const VIDES = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "un", "une", "et", "au", "aux", "en", "a", "the", "of", "an", "and"]);

/** A comparable word: lowercase, without accents, simple plural removed (« flammes » = « flamme », « remparts » = « rempart »). */
const radical = (m: string): string => (m.length > 3 && /[sx]$/.test(m) ? m.slice(0, -1) : m);

/** The significant words of a text, in order. */
export function motsDe(texte: string): string[] {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((m) => m && !VIDES.has(m))
    .map(radical);
}

/** The text in which we search for names: without what is between « » (speech, on-screen text). */
const sansCitations = (texte: string): string => texte.replace(/«[^»]*»/g, " ");

/** The name keys of a candidate: its label, its code without prefix (both if they differ). */
function clesDe(c: CandidatReference): string[][] {
  const cles = [c.label?.trim() ? motsDe(c.label) : [], motsDe(c.code.replace(/^[A-Z]+_/, ""))].filter((k) => k.length > 0);
  return cles.filter((k, i) => cles.findIndex((x) => x.join(" ") === k.join(" ")) === i);
}

/** The positions where the key appears, words in order and contiguous: `[début, fin)`. */
function occurrences(mots: string[], cle: string[]): [number, number][] {
  const r: [number, number][] = [];
  for (let i = 0; i + cle.length <= mots.length; i++) if (cle.every((m, k) => mots[i + k] === m)) r.push([i, i + cle.length]);
  return r;
}

/** All the key's words appear (in any order): the first position of the first word found, or -1. */
function tousLesMots(mots: string[], cle: string[]): number {
  if (!cle.every((m) => mots.includes(m))) return -1;
  return Math.min(...cle.map((m) => mots.indexOf(m)));
}

const RANG_TYPE: Record<string, number> = { personnage: 1, prop: 2, oth: 2, vfx: 3, keyframe: 4, decor: 5 };
const CODE_CITE = /\b(?:CHAR|DEC|PROP|VFX|KEY|OTH)_[A-Za-z0-9_]+/g;

/** Capitalised words not at the start of a sentence (probable proper nouns) that no retained candidate's name explains. */
function nomsPropresInconnus(texte: string, expliques: Set<string>): string[] {
  const inconnus: string[] = [];
  for (const m of texte.matchAll(/(\p{Lu}[\p{L}\p{N}]{2,})/gu)) {
    const brut = texte.slice(0, m.index);
    if (/[\p{L}\p{N}]$/u.test(brut)) continue; // in the middle of a word (« McNeil », acronym…)
    const avant = brut.replace(/[\s  ]+$/, "");
    if (!avant || /[.!?…:;—–-]$/.test(avant) || /\n[\s  ]*$/.test(brut)) continue; // start of a sentence or line
    const mots = motsDe(m[1]!);
    if (mots.length === 0 || mots.every((x) => expliques.has(x))) continue;
    if (!inconnus.includes(m[1]!)) inconnus.push(m[1]!);
  }
  return inconnus;
}

export function choisirReferences(entree: EntreeReferencesPlan): ResultatReferencesPlan {
  const doutes: Doute[] = [];
  const douter = (type: TypeDoute, detail: string) => {
    if (!doutes.some((d) => d.type === type && d.detail === detail)) doutes.push({ type, detail });
  };
  const candidats = entree.candidats.filter((c) => c.type in ROLE_PAR_TYPE);
  const parCode = new Map(candidats.map((c) => [c.code, c]));

  const sansEtat = sansEtatDeFin(entree.description);
  const { narration, repliques } = separerDescription(sansConsigneAuteur(sansEtat));
  if (!narration.trim()) douter("sans_narration", "La description du plan n'a pas de récit (hors répliques) : rien ne dit qui ou quoi est à l'image.");

  /** The retained ones, with their sort group and the position of their first mention. */
  type Retenu = { c: CandidatReference; groupe: number; position: number; pourquoi: string };
  const retenus = new Map<string, Retenu>();
  const retenir = (c: CandidatReference, groupe: number, position: number, pourquoi: string) => {
    const deja = retenus.get(c.code);
    if (!deja) retenus.set(c.code, { c, groupe, position, pourquoi });
    else if (groupe < deja.groupe) retenus.set(c.code, { c, groupe, position: Math.min(position, deja.position), pourquoi });
  };
  const groupeDe = (c: CandidatReference) => RANG_TYPE[c.type] ?? 4;

  // --- 1. Codes cited as-is (including in the author's directive: it is the most explicit request) ---
  const cites = [...new Set([...sansEtat.matchAll(CODE_CITE)].map((m) => m[0]))];
  const proches = correspondances(cites, candidats.map((c) => c.code));
  cites.forEach((brut, i) => {
    const code = parCode.has(brut) ? brut : proches.get(brut);
    const c = code ? parCode.get(code) : undefined;
    if (!c) return douter("code_inconnu", `${brut} est cité dans la description mais n'est pas au registre.`);
    retenir(c, groupeDe(c), -1000 + i, code === brut ? "cité par son code" : `cité par son code (${brut})`);
  });

  // --- 2. Speakers ---
  const personnages = candidats.filter((c) => c.type === "personnage");
  const locuteurs: string[] = [];
  for (const r of repliques) {
    if (estVoixOff(r.nom) || locuteurs.includes(r.nom)) continue;
    locuteurs.push(r.nom);
    const p = trouverPersonnage(r.nom, personnages);
    if (!p) douter("locuteur_introuvable", `Le locuteur « ${r.nom} » n'est pas au registre.`);
    else retenir(p, 0, locuteurs.length, `locuteur « ${r.nom} »`);
  }

  // --- 3. Names in the narration (excluding quotes) ---
  // The cited codes are already handled (rule 1): removed, they pass neither as names nor as proper nouns (« DEC »).
  const texte = sansCitations(narration).replace(CODE_CITE, " ");
  const mots = motsDe(texte);
  type Mention = { c: CandidatReference; debut: number; fin: number };
  const mentions: Mention[] = [];
  for (const c of candidats.filter((x) => x.type !== "decor")) {
    for (const cle of clesDe(c)) for (const [debut, fin] of occurrences(mots, cle)) mentions.push({ c, debut, fin });
  }
  // A name included in a longer name at the same place is erased: « bâton long » is not also « bâton ».
  const gardees = mentions.filter((m) => !mentions.some((o) => o !== m && o.c.code !== m.c.code && o.debut <= m.debut && o.fin >= m.fin && o.fin - o.debut > m.fin - m.debut));
  const nommes = new Map<string, number>();
  for (const m of gardees) nommes.set(m.c.code, Math.min(nommes.get(m.c.code) ?? Infinity, m.debut));
  for (const [code, position] of nommes) {
    const c = parCode.get(code)!;
    retenir(c, groupeDe(c), position, `nommé dans le récit (« ${libelleAsset(c)} »)`);
  }
  // A named subject whose state is evoked (the state's own words are there) without being named: which one to show?
  for (const code of nommes.keys()) {
    for (const etat of candidats.filter((x) => x.parent === code && !nommes.has(x.code))) {
      const propres = clesDe(etat).map((k) => k.filter((m) => !clesDe(parCode.get(code)!).some((kp) => kp.includes(m))));
      if (propres.some((k) => k.length > 0 && k.every((m) => mots.includes(m)))) {
        douter("ambiguite_etat", `Le récit nomme ${code} et évoque son état ${etat.code} : lequel est à l'image ?`);
      }
    }
  }

  // --- Brief elements evoked: their asset, otherwise a doubt ---
  for (const e of entree.elements ?? []) {
    const cle = motsDe(e.nom);
    if (cle.length === 0 || (cle.length === 1 ? !mots.includes(cle[0]!) : tousLesMots(mots, cle) < 0)) continue;
    const types = e.nature === "vfx" ? ["vfx"] : ["prop", "oth"];
    const possibles = candidats.filter((c) => types.includes(c.type) && clesDe(c).some((k) => k.some((m) => cle.includes(m))));
    if (possibles.some((c) => retenus.has(c.code))) continue;
    if (possibles.length === 1) retenir(possibles[0]!, groupeDe(possibles[0]!), tousLesMots(mots, cle), `élément du brief « ${e.nom} »`);
    else if (possibles.length === 0) douter("element_sans_asset", `L'élément du brief « ${e.nom} » (${e.nature}) est évoqué mais aucun asset ne le porte.`);
    else douter("element_sans_asset", `L'élément du brief « ${e.nom} » peut être ${possibles.map((c) => c.code).join(" ou ")}.`);
  }

  // --- 4. Set ---
  const decorsCites = [...retenus.values()].filter((r) => r.c.type === "decor");
  if (decorsCites.length === 0) {
    const nommesDecor = candidats
      .filter((c) => c.type === "decor")
      .map((c) => ({ c, position: Math.min(...clesDe(c).map((k) => (k.length === 1 ? mots.indexOf(k[0]!) : tousLesMots(mots, k))).map((p) => (p < 0 ? Infinity : p))) }))
      .filter((d) => Number.isFinite(d.position));
    // A set whose name is contained in another named set's name is erased (« temple » before « temple secret »).
    const distincts = nommesDecor.filter((d) => !nommesDecor.some((o) => o !== d && clesDe(o.c).some((ko) => clesDe(d.c).some((kd) => kd.length < ko.length && kd.every((m) => ko.includes(m))))));
    const precedent = entree.precedent?.decor && entree.liaison === "suite" && entree.precedent.memeScene ? parCode.get(entree.precedent.decor) : undefined;
    if (distincts.length === 1) retenir(distincts[0]!.c, groupeDe(distincts[0]!.c), distincts[0]!.position, "seul décor nommé dans le récit");
    else if (precedent?.type === "decor") retenir(precedent, groupeDe(precedent), Infinity, "décor du plan précédent (le plan est une suite dans la même scène)");
    else if (distincts.length === 0) douter("decor_introuvable", "Aucun décor du registre n'est nommé dans le récit.");
    else douter("decor_ambigu", `Plusieurs décors sont nommés : ${distincts.map((d) => d.c.code).join(", ")}.`);
  } else if (decorsCites.length > 1) {
    douter("decor_ambigu", `Plusieurs décors sont cités : ${decorsCites.map((d) => d.c.code).join(", ")}.`);
  }

  // --- Proper nouns that nothing explains ---
  const expliques = new Set([...retenus.values()].flatMap((r) => clesDe(r.c).flat()));
  for (const nom of nomsPropresInconnus(texte, expliques)) douter("nom_inconnu", `« ${nom} » ressemble à un nom propre, mais aucun asset retenu ne le porte.`);

  // --- 5. Order, one face per character, limit ---
  let tries = [...retenus.values()].sort((a, b) => a.groupe - b.groupe || a.position - b.position);
  const famille = (c: CandidatReference) => c.parent ?? c.code;
  const visages = new Map<string, string>();
  tries = tries.filter((r) => {
    if (r.c.type !== "personnage") return true;
    const deja = visages.get(famille(r.c));
    if (!deja) {
      visages.set(famille(r.c), r.c.code);
      return true;
    }
    douter("ambiguite_etat", `${deja} et ${r.c.code} sont le même personnage : un seul visage par personnage, ${r.c.code} est écarté.`);
    return false;
  });
  if (tries.length > LIMITE_IMAGES_PLAN) {
    douter("trop_de_candidats", `${tries.length} références pour ${LIMITE_IMAGES_PLAN} images au plus : ${tries.slice(LIMITE_IMAGES_PLAN).map((r) => r.c.code).join(", ")} écarté(s).`);
    tries = tries.slice(0, LIMITE_IMAGES_PLAN);
  }

  return {
    references: tries.map((r) => ({ code: r.c.code, type: r.c.type, role: ROLE_PAR_TYPE[r.c.type]!, pourquoi: r.pourquoi })),
    doutes,
    suffit: doutes.length === 0,
    narration,
    locuteurs,
  };
}
