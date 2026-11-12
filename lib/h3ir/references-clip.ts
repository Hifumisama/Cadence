import { libelleAsset } from "../assets/assetCode";
import { correspondances } from "../agents/similar-codes";
import { sansConsigneAuteur, sansEtatDeFin } from "../clips/intent";
import { MAX_REFS_VISUELLES } from "../clips/clip-continuity";
import { ROLE_PAR_TYPE, estVoixOff, separerDescription, trouverPersonnage } from "./brief";

/** Le choix des références d'un plan (étape 5 d'Open H3 IR, docs/PLAN_INTEGRATION_OPEN_H3_IR.md) : quels assets du registre un plan neuf envoie au
 * compilateur. Le code décide seul quand la description est explicite ; sinon il rend ses DOUTES, et seul ce cas appelle le petit skill
 * `references-plan` (lib/agents/references-clip.ts), qui complète ou corrige la liste. Pur : aucun accès base ni disque (lib/h3ir/references-clip-db.ts charge).
 *
 * Règles, dans l'ordre :
 *  1. un code cité tel quel dans la description (`CHAR_x`, `PROP_y`…) est pris d'office (un code mal recopié est rapproché par `correspondances`) ;
 *  2. chaque locuteur d'une réplique (« NOM : « … » ») est résolu en personnage (`trouverPersonnage`) ; leurs images viennent en tête ;
 *  3. personnages, objets, effets et keyframes NOMMÉS dans la narration (libellé ou code sans préfixe, mots dans l'ordre ; mots de liaison et pluriels
 *     ignorés ; le texte entre « » ne compte pas : c'est de la parole ou un texte à l'écran). Un nom inclus dans un nom plus long cité au même endroit
 *     s'efface (« l'avatar en flammes » = l'état, pas le sujet). Un sujet dont un ÉTAT (asset dérivé) est évoqué sans être nommé = doute ;
 *  4. décor : un seul décor nommé (les mots du décor, même dispersés) => pris ; sinon, plan « suite » dans la même scène => décor du plan précédent ;
 *     sinon doute ;
 *  5. 6 images au plus (`MAX_REFS_VISUELLES`), un seul visage par personnage, dans l'ordre : locuteurs, autres personnages, objets, effets, keyframes, décor ;
 *  6. le rôle vient du type (`ROLE_PAR_TYPE`). Les voix (champ du personnage) et les affiches ne sont jamais candidats. */

export type CandidatReference = {
  code: string;
  type: string;
  label?: string | null;
  description?: string | null;
  /** Le code de l'asset dont celui-ci est un état (`deriveDeId`), ou null. */
  parent?: string | null;
  aUneImage?: boolean;
};

export type EntreeReferencesPlan = {
  /** La description du plan telle qu'en base : l'ancien « État en fin de plan » et la « Consigne de l'auteur » sont retirés ici (lib/clips/intent.ts). */
  description: string;
  /** `suite` + `precedent.memeScene` : le décor du plan précédent sert quand la description n'en nomme pas un seul. */
  liaison: string;
  precedent: { memeScene: boolean; decor: string | null } | null;
  /** Le registre du projet (les affiches et types inconnus sont écartés ici). */
  candidats: CandidatReference[];
  /** Les effets et objets du brief (`brief.elements`) : un élément évoqué sans asset correspondant est un doute. */
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
  /** Vrai quand le code n'a aucun doute : le skill n'est pas appelé. */
  suffit: boolean;
  /** Ce que le code a lu : la narration (sans répliques, état de fin ni consigne) et les locuteurs, pour l'entrée du skill. */
  narration: string;
  locuteurs: string[];
};

export const LIMITE_IMAGES_PLAN = MAX_REFS_VISUELLES;

/** Mots qui ne distinguent rien dans un nom (liaison, articles), en français et en anglais. */
const VIDES = new Set(["de", "du", "des", "la", "le", "les", "l", "d", "un", "une", "et", "au", "aux", "en", "a", "the", "of", "an", "and"]);

/** Un mot comparable : minuscules, sans accents, pluriel simple retiré (« flammes » = « flamme », « remparts » = « rempart »). */
const radical = (m: string): string => (m.length > 3 && /[sx]$/.test(m) ? m.slice(0, -1) : m);

/** Les mots significatifs d'un texte, dans l'ordre. */
export function motsDe(texte: string): string[] {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((m) => m && !VIDES.has(m))
    .map(radical);
}

/** Le texte où l'on cherche des noms : sans ce qui est entre « » (parole, texte à l'écran). */
const sansCitations = (texte: string): string => texte.replace(/«[^»]*»/g, " ");

/** Les clés de nom d'un candidat : son libellé, son code sans préfixe (les deux s'ils diffèrent). */
function clesDe(c: CandidatReference): string[][] {
  const cles = [c.label?.trim() ? motsDe(c.label) : [], motsDe(c.code.replace(/^[A-Z]+_/, ""))].filter((k) => k.length > 0);
  return cles.filter((k, i) => cles.findIndex((x) => x.join(" ") === k.join(" ")) === i);
}

/** Les positions où la clé apparaît, mots dans l'ordre et contigus : `[début, fin)`. */
function occurrences(mots: string[], cle: string[]): [number, number][] {
  const r: [number, number][] = [];
  for (let i = 0; i + cle.length <= mots.length; i++) if (cle.every((m, k) => mots[i + k] === m)) r.push([i, i + cle.length]);
  return r;
}

/** Tous les mots de la clé apparaissent (dans n'importe quel ordre) : la première position du premier mot trouvé, ou -1. */
function tousLesMots(mots: string[], cle: string[]): number {
  if (!cle.every((m) => mots.includes(m))) return -1;
  return Math.min(...cle.map((m) => mots.indexOf(m)));
}

const RANG_TYPE: Record<string, number> = { personnage: 1, prop: 2, oth: 2, vfx: 3, keyframe: 4, decor: 5 };
const CODE_CITE = /\b(?:CHAR|DEC|PROP|VFX|KEY|OTH)_[A-Za-z0-9_]+/g;

/** Les mots en capitale initiale hors début de phrase (noms propres probables) qu'aucun nom de candidat retenu n'explique. */
function nomsPropresInconnus(texte: string, expliques: Set<string>): string[] {
  const inconnus: string[] = [];
  for (const m of texte.matchAll(/(\p{Lu}[\p{L}\p{N}]{2,})/gu)) {
    const brut = texte.slice(0, m.index);
    if (/[\p{L}\p{N}]$/u.test(brut)) continue; // au milieu d'un mot (« McNeil », sigle…)
    const avant = brut.replace(/[\s  ]+$/, "");
    if (!avant || /[.!?…:;—–-]$/.test(avant) || /\n[\s  ]*$/.test(brut)) continue; // début de phrase ou de ligne
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

  /** Les retenus, avec leur groupe de tri et la position de leur première mention. */
  type Retenu = { c: CandidatReference; groupe: number; position: number; pourquoi: string };
  const retenus = new Map<string, Retenu>();
  const retenir = (c: CandidatReference, groupe: number, position: number, pourquoi: string) => {
    const deja = retenus.get(c.code);
    if (!deja) retenus.set(c.code, { c, groupe, position, pourquoi });
    else if (groupe < deja.groupe) retenus.set(c.code, { c, groupe, position: Math.min(position, deja.position), pourquoi });
  };
  const groupeDe = (c: CandidatReference) => RANG_TYPE[c.type] ?? 4;

  // --- 1. Codes cités tels quels (y compris dans la consigne de l'auteur : c'est la demande la plus explicite) ---
  const cites = [...new Set([...sansEtat.matchAll(CODE_CITE)].map((m) => m[0]))];
  const proches = correspondances(cites, candidats.map((c) => c.code));
  cites.forEach((brut, i) => {
    const code = parCode.has(brut) ? brut : proches.get(brut);
    const c = code ? parCode.get(code) : undefined;
    if (!c) return douter("code_inconnu", `${brut} est cité dans la description mais n'est pas au registre.`);
    retenir(c, groupeDe(c), -1000 + i, code === brut ? "cité par son code" : `cité par son code (${brut})`);
  });

  // --- 2. Locuteurs ---
  const personnages = candidats.filter((c) => c.type === "personnage");
  const locuteurs: string[] = [];
  for (const r of repliques) {
    if (estVoixOff(r.nom) || locuteurs.includes(r.nom)) continue;
    locuteurs.push(r.nom);
    const p = trouverPersonnage(r.nom, personnages);
    if (!p) douter("locuteur_introuvable", `Le locuteur « ${r.nom} » n'est pas au registre.`);
    else retenir(p, 0, locuteurs.length, `locuteur « ${r.nom} »`);
  }

  // --- 3. Noms dans la narration (hors citations) ---
  // Les codes cités sont déjà traités (règle 1) : retirés, ils ne passent ni pour des noms ni pour des noms propres (« DEC »).
  const texte = sansCitations(narration).replace(CODE_CITE, " ");
  const mots = motsDe(texte);
  type Mention = { c: CandidatReference; debut: number; fin: number };
  const mentions: Mention[] = [];
  for (const c of candidats.filter((x) => x.type !== "decor")) {
    for (const cle of clesDe(c)) for (const [debut, fin] of occurrences(mots, cle)) mentions.push({ c, debut, fin });
  }
  // Un nom inclus dans un nom plus long au même endroit s'efface : « bâton long » n'est pas aussi « bâton ».
  const gardees = mentions.filter((m) => !mentions.some((o) => o !== m && o.c.code !== m.c.code && o.debut <= m.debut && o.fin >= m.fin && o.fin - o.debut > m.fin - m.debut));
  const nommes = new Map<string, number>();
  for (const m of gardees) nommes.set(m.c.code, Math.min(nommes.get(m.c.code) ?? Infinity, m.debut));
  for (const [code, position] of nommes) {
    const c = parCode.get(code)!;
    retenir(c, groupeDe(c), position, `nommé dans le récit (« ${libelleAsset(c)} »)`);
  }
  // Un sujet nommé dont un état est évoqué (les mots propres à l'état sont là) sans être nommé : lequel montrer ?
  for (const code of nommes.keys()) {
    for (const etat of candidats.filter((x) => x.parent === code && !nommes.has(x.code))) {
      const propres = clesDe(etat).map((k) => k.filter((m) => !clesDe(parCode.get(code)!).some((kp) => kp.includes(m))));
      if (propres.some((k) => k.length > 0 && k.every((m) => mots.includes(m)))) {
        douter("ambiguite_etat", `Le récit nomme ${code} et évoque son état ${etat.code} : lequel est à l'image ?`);
      }
    }
  }

  // --- Éléments du brief évoqués : leur asset, sinon un doute ---
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

  // --- 4. Décor ---
  const decorsCites = [...retenus.values()].filter((r) => r.c.type === "decor");
  if (decorsCites.length === 0) {
    const nommesDecor = candidats
      .filter((c) => c.type === "decor")
      .map((c) => ({ c, position: Math.min(...clesDe(c).map((k) => (k.length === 1 ? mots.indexOf(k[0]!) : tousLesMots(mots, k))).map((p) => (p < 0 ? Infinity : p))) }))
      .filter((d) => Number.isFinite(d.position));
    // Un décor dont le nom est contenu dans celui d'un autre décor nommé s'efface (« temple » devant « temple secret »).
    const distincts = nommesDecor.filter((d) => !nommesDecor.some((o) => o !== d && clesDe(o.c).some((ko) => clesDe(d.c).some((kd) => kd.length < ko.length && kd.every((m) => ko.includes(m))))));
    const precedent = entree.precedent?.decor && entree.liaison === "suite" && entree.precedent.memeScene ? parCode.get(entree.precedent.decor) : undefined;
    if (distincts.length === 1) retenir(distincts[0]!.c, groupeDe(distincts[0]!.c), distincts[0]!.position, "seul décor nommé dans le récit");
    else if (precedent?.type === "decor") retenir(precedent, groupeDe(precedent), Infinity, "décor du plan précédent (le plan est une suite dans la même scène)");
    else if (distincts.length === 0) douter("decor_introuvable", "Aucun décor du registre n'est nommé dans le récit.");
    else douter("decor_ambigu", `Plusieurs décors sont nommés : ${distincts.map((d) => d.c.code).join(", ")}.`);
  } else if (decorsCites.length > 1) {
    douter("decor_ambigu", `Plusieurs décors sont cités : ${decorsCites.map((d) => d.c.code).join(", ")}.`);
  }

  // --- Noms propres que rien n'explique ---
  const expliques = new Set([...retenus.values()].flatMap((r) => clesDe(r.c).flat()));
  for (const nom of nomsPropresInconnus(texte, expliques)) douter("nom_inconnu", `« ${nom} » ressemble à un nom propre, mais aucun asset retenu ne le porte.`);

  // --- 5. Ordre, un visage par personnage, limite ---
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
