import { construireCode } from "../assets/assetCode";
import type { ChangementBrut } from "./changes";
import { correspondances } from "./similar-codes";
import { MAX_REFS_VISUELLES } from "../clips/clip-continuity";
import { TYPES_MANQUANTS, suffixeDeCode } from "./conversion";
import { cleNouvelAsset } from "./sheets";
import type { Avertissement } from "./types";

/** Sortie du skill `inventaire-assets` : les assets que les plans réclament et que le registre n'a pas, et les références
 * de chaque plan (2026-11-09 : un seul appel donne aussi les images de référence de chaque plan, avant les fiches). */
export type SortieInventaire = {
  /** `element` : le nom de l'élément du brief (`brief.elements[].nom`) dont l'asset est tiré, recopié tel quel ; null sinon. */
  assets: { code: string; type: string; parent?: string | null; element?: string | null; description: string; plans: string[]; raison: string }[];
  /** `plan` : la poignée du plan dans l'entrée (« P07 », `episodes[].scenes[].plans[].id`) ; `codes` : ses références, dans l'ordre voulu. */
  references?: { plan: string; codes: string[] }[];
  notes: string;
};

/** Un nom d'élément comparable (casse, accents, espaces). */
const nomComparable = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type AssetRegistre = { code: string; type: string; description?: string };

const MOTS_VIDES = new Set(["le", "la", "les", "un", "une", "de", "du", "des", "d", "l", "et", "the", "of", "a", "an"]);

/** Les mots significatifs d'un suffixe de code (« lampe_huile » → lampe, huile) : sert à repérer un asset
 * qui ressemble à un asset existant. */
function mots(suffixe: string): string[] {
  return suffixe
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 1 && !MOTS_VIDES.has(m));
}

/** L'asset du registre auquel un code proposé ressemble (même type, mots communs), ou null. Ce n'est qu'un
 * signal pour la revue : le rapprochement sémantique (lanterne / lampe) reste celui du modèle, qui voit le registre. */
export function ressemblant(type: string, suffixe: string, registre: AssetRegistre[]): string | null {
  const a = new Set(mots(suffixe));
  if (a.size === 0) return null;
  for (const r of registre) {
    if (r.type !== type) continue;
    const b = new Set(mots(r.code.includes("_") ? r.code.slice(r.code.indexOf("_") + 1) : r.code));
    if (b.size === 0) continue;
    const communs = [...a].filter((m) => b.has(m)).length;
    if (communs > 0 && (communs === a.size || communs === b.size)) return r.code;
  }
  return null;
}

/** Les codes de `codes` cités tels quels dans un texte (hors `sauf`, le code de l'asset lui-même). */
function codesCites(texte: string, codes: Iterable<string>, sauf: string): string[] {
  const t = texte.toLowerCase();
  return [...codes].filter((c) => {
    if (c === sauf) return false;
    // Le code doit être un mot entier : ni précédé ni suivi d'un caractère de code (CHAR_iris ≠ CHAR_iris_blessee).
    const morceaux = t.split(c.toLowerCase());
    return morceaux.slice(0, -1).some((avant, i) => !/[a-z0-9_]$/.test(avant) && !/^[a-z0-9_]/.test(morceaux[i + 1]!));
  });
}

/** La sortie d'`inventaire-assets` → des changements « créer un asset » (sans prompt : il s'écrit ensuite,
 * un asset à la fois). Écarte ce qui existe déjà et les doublons de la sortie ; signale ce qui ressemble à un asset
 * existant sans le refuser. Le parent est un asset existant (`deriveDeCode`) ou créé ici (`deriveDeCle`) ; le
 * registre n'a qu'un niveau, l'application rattache toujours au master. Pur, testé.
 * `elements` : les effets et objets du brief (`brief.elements`, entretien du 2026-11-08). Un VFX n'est accepté que s'il en est tiré. */
export function depuisInventaire(
  sortie: SortieInventaire,
  registre: AssetRegistre[],
  options: { elements?: { nom: string; nature: string }[]; proposes?: AssetRegistre[] } = {},
): ChangementBrut[] {
  const elementsDuBrief = new Map((options.elements ?? []).filter((e) => nomComparable(e.nom ?? "")).map((e) => [nomComparable(e.nom), e]));
  const existants = new Set(registre.map((a) => a.code));
  // Inventaire découpé en groupes de scènes : ce que les AUTRES groupes de la même proposition créent déjà n'est pas recréé, et peut servir de parent.
  const proposes = new Set((options.proposes ?? []).map((a) => a.code).filter((c) => !existants.has(c)));
  const declares = (sortie.assets ?? []).map((m) => ({
    m,
    suffixe: suffixeDeCode(m.code),
    code: codeFinal(m),
  }));
  const codesCrees = new Set(declares.flatMap((d) => (d.code && !existants.has(d.code) && !proposes.has(d.code) ? [d.code] : [])));
  const vus = new Set<string>();
  const typeDeCode = new Map<string, string>([
    ...registre.map((r) => [r.code, r.type] as [string, string]),
    ...(options.proposes ?? []).filter((a) => proposes.has(a.code)).map((a) => [a.code, a.type] as [string, string]),
    ...declares.flatMap((d) => (d.code && codesCrees.has(d.code) ? [[d.code, d.m.type] as [string, string]] : [])),
  ]);
  const sorties: ChangementBrut[] = [];
  for (const { m, suffixe, code } of declares) {
    if (!code || existants.has(code) || proposes.has(code) || vus.has(code)) continue; // inutilisable, déjà au registre, ou déjà proposé
    // Jamais de VFX DEVINÉ par l'inventaire (décision du 2026-11-02) : une image d'effet est suivie trop à la lettre (Open H3 IR la prend pour un sujet à
    // préserver), l'effet se décrit dans le texte du plan. Exception (2026-11-08) : un effet que l'utilisateur a décrit à l'entretien (`brief.elements`,
    // nature vfx) devient son asset ; le plan le reprend en `weak_reference` (lib/agents/conversion.ts). L'utilisateur peut toujours en créer un à la main.
    const element = m.element?.trim() ? elementsDuBrief.get(nomComparable(m.element)) : undefined;
    if (m.type === "vfx" && element?.nature !== "vfx") continue;
    vus.add(code);
    const avert: Avertissement[] = [];
    if (element) {
      avert.push({ type: "info", texte: `Tiré de l'élément du brief « ${element.nom} ».` });
      if (element.nature !== m.type) avert.push({ type: "alerte_controle", texte: `L'élément du brief « ${element.nom} » est un ${element.nature}, l'asset proposé un ${m.type} : vérifie le type avant d'appliquer.` });
    }
    const info = [(m.raison ?? "").trim(), m.plans?.length ? `plans : ${m.plans.join(", ")}` : ""].filter(Boolean).join(" · ");
    if (info) avert.push({ type: "info", texte: info });
    if (code !== m.code) avert.push({ type: "info", texte: `Code proposé « ${m.code} », construit selon la convention du registre : ${code}.` });
    const proche = ressemblant(m.type, suffixe, registre);
    if (proche) avert.push({ type: "alerte_controle", texte: `Ressemble à ${proche}, déjà au registre : vérifie qu'il ne s'agit pas du même asset avant d'appliquer.` });

    const apres: Record<string, unknown> = { type: m.type, suffixe, description: (m.description ?? "").trim() };
    const parent = m.parent?.trim();
    if (parent) {
      if (existants.has(parent)) apres.deriveDeCode = parent;
      else {
        // Un parent proposé ici (ou par un autre groupe de la même proposition) : son code exact, ou le même nom avec un autre préfixe de type.
        const crees = [...codesCrees, ...proposes].find((c) => c === parent || c.endsWith(`_${suffixeDeCode(parent)}`));
        if (crees && crees !== code) apres.deriveDeCle = cleNouvelAsset(crees);
        else avert.push({ type: "alerte_controle", texte: `Parent « ${parent} » introuvable (ni au registre, ni proposé ici) : l'asset est créé sans parent.` });
      }
    }
    // Un état d'un sujet récurrent (personnage, créature, décor, prop) PART du sujet : le modèle l'oublie souvent dans `parent` alors
    // qu'il cite le code du sujet dans sa description ou sa raison. Même type : le parent est posé ici (info) ; autre type : alerte.
    if (!apres.deriveDeCode && !apres.deriveDeCle) {
      const cites = codesCites(`${m.description ?? ""} ${m.raison ?? ""}`, typeDeCode.keys(), code);
      const meme = cites.find((c) => typeDeCode.get(c) === m.type);
      if (meme) {
        if (existants.has(meme)) apres.deriveDeCode = meme;
        else apres.deriveDeCle = cleNouvelAsset(meme);
        avert.push({ type: "info", texte: `Parent ${meme} posé par le code : l'asset le cite comme son sujet (état ou variante de lui) ; retire-le si c'est un asset à part.` });
      } else if (cites.length > 0) {
        avert.push({ type: "alerte_controle", texte: `Cite ${cites.join(", ")} (un autre type) sans parent : si c'est un ÉTAT de ce sujet (forme, stade, éclairage), propose-le du même type avec ce parent ; un VFX est de la matière générique, pas un état.` });
      }
    }
    sorties.push({
      groupe: "assets",
      cle: cleNouvelAsset(code),
      cibleType: "asset",
      cibleRef: null,
      libelle: `${code} · nouvel asset`,
      operation: "creer",
      sousGroupe: null,
      apres,
      avertissements: avert,
    });
  }
  // Un dérivé dont le parent est créé ici vient après lui.
  sorties.sort((a, b) => Number(!!(a.apres as Record<string, unknown>).deriveDeCle) - Number(!!(b.apres as Record<string, unknown>).deriveDeCle));
  return sorties;
}

/** Le code qu'aura l'asset proposé une fois créé (la convention du registre : préfixe du type + suffixe nettoyé), ou null s'il est inutilisable. */
export function codeFinal(m: { code: string; type: string }): string | null {
  const suffixe = suffixeDeCode(m.code ?? "");
  return TYPES_MANQUANTS.has(m.type) && suffixe ? construireCode(m.type, suffixe) : null;
}

// --- références de chaque plan (2026-11-09) --------------------------------------------------------------------
//
// L'inventaire rend aussi, pour chaque plan, les assets à poser en images de référence : elles sont prêtes AVANT les fiches (relues avec les
// intents) et aucun passage du modèle par plan n'est nécessaire pour les choisir. Le CODE contrôle et corrige ce que le modèle rend : codes connus
// (registre ou créés par la même réponse), jamais de son, un seul visage par personnage, un seul décor, une keyframe seulement si l'intent la cite,
// 6 images au plus. Écriture : lib/h3ir/references-write.ts, déclenchée par lib/agents/inventory-db.ts.

/** Un asset que les références peuvent citer : au registre, ou créé par l'inventaire (`aCreer` : il n'existe pas encore en base). `parent` : le
 * sujet dont il est un état (un même personnage à un autre âge partage son visage avec lui). */
export type AssetConnu = { code: string; type: string; parent?: string | null; aCreer?: boolean };
/** Un plan de l'entrée : sa poignée (« P07 »), son uuid (gardé dans les options de la tâche, jamais montré au modèle) et son intention. */
export type PlanInventaire = { id: string; uuid: string; intention?: string };
export type ReferencesPlan = { id: string; uuid: string; codes: string[] };
/** `erreur` : un défaut du contrat (code inconnu, plan oublié…), renvoyé une fois au modèle ; `alerte` : corrigé par le code, pour la revue. */
export type ProblemeReferences = { plan: string | null; niveau: "erreur" | "alerte"; message: string };

/** Les types d'asset qui peuvent être une IMAGE de référence (jamais une voix, qui est un champ du personnage). */
const TYPES_REFERENCE_IMAGE = new Set(["personnage", "decor", "prop", "vfx", "keyframe", "oth"]);
export const MAX_REFERENCES_PLAN = MAX_REFS_VISUELLES;
/** Ordre des références d'un plan : les personnages (les locuteurs d'abord, dans l'ordre du modèle), les objets, les effets, le décor en dernier. */
const RANG_AFFICHAGE: Record<string, number> = { personnage: 0, prop: 1, oth: 2, keyframe: 3, vfx: 4, decor: 5 };
/** Au-delà de 6 images, ce qu'on garde d'abord : les personnages, le décor, puis les objets ; les effets partent les premiers. */
const RANG_GARDE: Record<string, number> = { personnage: 0, decor: 1, prop: 2, oth: 3, keyframe: 4, vfx: 5 };

/** L'intention cite-t-elle cet asset (son code, ou son nom lisible : « KEY_salle_pleine » → « salle pleine ») ? */
function citeDans(intention: string, code: string): boolean {
  const t = nomComparable(intention);
  const nom = nomComparable(code.includes("_") ? code.slice(code.indexOf("_") + 1) : code);
  return t.includes(nomComparable(code)) || (nom.length >= 3 && ` ${t} `.includes(` ${nom} `));
}

/** Les références de chaque plan, contrôlées et corrigées. `alias` : code proposé par le modèle → code final de l'asset créé (`codeFinal`).
 * Un code inconnu ne diffère parfois d'un code connu que par un mot de liaison (`similar-codes.ts`) : il est corrigé. Pur, testé. */
export function controlerReferences(
  sortie: Pick<SortieInventaire, "references">,
  ctx: { plans: PlanInventaire[]; connus: AssetConnu[]; alias?: Map<string, string> },
): { plans: ReferencesPlan[]; problemes: ProblemeReferences[] } {
  const parCode = new Map(ctx.connus.map((a) => [a.code, a]));
  const codesConnus = [...parCode.keys()];
  const plans = new Map(ctx.plans.map((p) => [p.id, p]));
  const problemes: ProblemeReferences[] = [];
  const dit = (plan: string | null, niveau: ProblemeReferences["niveau"], message: string) => problemes.push({ plan, niveau, message });
  const resultat: ReferencesPlan[] = [];
  const vusPlans = new Set<string>();

  for (const entree of sortie.references ?? []) {
    const id = (entree?.plan ?? "").trim();
    const plan = plans.get(id) ?? plans.get(id.toUpperCase());
    if (!plan) {
      dit(id || null, "erreur", `references : le plan « ${id} » n'existe pas dans l'entrée ; recopie la poignée \`id\` du plan (« P07 »).`);
      continue;
    }
    if (vusPlans.has(plan.id)) {
      dit(plan.id, "alerte", `${plan.id} : deux entrées de références ; seule la première est gardée.`);
      continue;
    }
    vusPlans.add(plan.id);

    const gardes: AssetConnu[] = [];
    const visages = new Set<string>();
    let decor: string | null = null;
    for (const brut of entree.codes ?? []) {
      const cite = (brut ?? "").trim();
      if (!cite) continue;
      const alias = ctx.alias?.get(cite) ?? cite;
      const code = parCode.has(alias) ? alias : (correspondances([alias], codesConnus).get(alias) ?? null);
      const a = code ? parCode.get(code)! : null;
      if (!a) {
        dit(plan.id, "erreur", `${plan.id} : « ${cite} » n'est ni au registre ni dans les assets que tu proposes ; recopie un code existant ou retire-le.`);
        continue;
      }
      if (!TYPES_REFERENCE_IMAGE.has(a.type)) {
        dit(plan.id, "erreur", `${plan.id} : ${a.code} (${a.type}) ne peut pas être une référence d'image d'un plan.`);
        continue;
      }
      if (gardes.some((g) => g.code === a.code)) continue; // doublon : sans conséquence
      if (a.type === "keyframe" && !citeDans(plan.intention ?? "", a.code)) {
        dit(plan.id, "alerte", `${plan.id} : la keyframe ${a.code} n'est pas citée par l'intention du plan ; retirée (une pose composée fait perdre l'identité des personnages).`);
        continue;
      }
      if (a.type === "personnage") {
        const racine = a.parent?.trim() || a.code;
        if (visages.has(racine)) {
          dit(plan.id, "alerte", `${plan.id} : ${a.code} est un autre état d'un personnage déjà en référence ; un seul visage par personnage, ${a.code} est retiré.`);
          continue;
        }
        visages.add(racine);
      }
      if (a.type === "decor") {
        if (decor) {
          dit(plan.id, "alerte", `${plan.id} : un seul décor par plan ; ${decor} est gardé, ${a.code} retiré.`);
          continue;
        }
        decor = a.code;
      }
      gardes.push(a);
    }
    let retenus = gardes;
    if (gardes.length > MAX_REFERENCES_PLAN) {
      retenus = gardes
        .map((g, i) => ({ g, i }))
        .sort((x, y) => (RANG_GARDE[x.g.type] ?? 9) - (RANG_GARDE[y.g.type] ?? 9) || x.i - y.i)
        .slice(0, MAX_REFERENCES_PLAN)
        .sort((x, y) => x.i - y.i)
        .map((x) => x.g);
      const retires = gardes.filter((g) => !retenus.includes(g)).map((g) => g.code);
      dit(plan.id, "erreur", `${plan.id} : ${gardes.length} images de référence, ${MAX_REFERENCES_PLAN} au plus ; garde les personnages et le décor (retirés : ${retires.join(", ")}).`);
    }
    const ordonnes = retenus
      .map((g, i) => ({ g, i }))
      .sort((x, y) => (RANG_AFFICHAGE[x.g.type] ?? 9) - (RANG_AFFICHAGE[y.g.type] ?? 9) || x.i - y.i)
      .map((x) => x.g.code);
    resultat.push({ id: plan.id, uuid: plan.uuid, codes: ordonnes });
  }
  const oublies = ctx.plans.filter((p) => !vusPlans.has(p.id)).map((p) => p.id);
  if (oublies.length) dit(null, "erreur", `references : ${oublies.length > 1 ? "les plans" : "le plan"} ${oublies.join(", ")} ${oublies.length > 1 ? "n'ont" : "n'a"} pas d'entrée ; chaque plan de l'entrée en a une (liste vide pour un plan sans image).`);
  return { plans: resultat, problemes };
}

/** Le contexte du contrôle tiré de l'ENTRÉE et de la SORTIE du modèle (sans base) : pour le renvoi automatique (lib/llm/checks.ts). Les codes
 * connus sont le registre, les assets déjà proposés par les groupes précédents et ceux de la sortie (sous le code du modèle comme sous le code final). */
export function contexteReferencesDepuisEntree(entree: unknown, sortie: Pick<SortieInventaire, "assets">): { plans: PlanInventaire[]; connus: AssetConnu[]; alias: Map<string, string> } {
  const e = (entree ?? {}) as Partial<EntreeInventaire>;
  const plans = plansDeLEntree(e).map((p) => ({ id: p.id, uuid: p.id, intention: p.intention }));
  const connus: AssetConnu[] = [...(e.registre ?? []), ...(e.assetsDejaProposes ?? [])].map((a) => ({ code: a.code, type: a.type }));
  const alias = new Map<string, string>();
  for (const m of sortie.assets ?? []) {
    const final = codeFinal(m);
    if (!final) continue;
    alias.set(m.code, final);
    if (!connus.some((c) => c.code === final)) connus.push({ code: final, type: m.type, parent: m.parent ?? null, aCreer: true });
  }
  return { plans, connus, alias };
}

// --- entrée et découpage en groupes de scènes (2026-11-09) ------------------------------------------------------------------

export type PlanEntreeInventaire = { id: string; titre: string; intention: string };
type SceneEntreeInventaire = { titre: string; fonction: string; plans: PlanEntreeInventaire[] };
type EpisodeEntreeInventaire = { episode: string; resume: string | null; scenes: SceneEntreeInventaire[] };
export type EntreeInventaire = {
  registre: { code: string; type: string; description: string }[];
  brief: unknown;
  clauseStyleDuProjet: string;
  episodes: EpisodeEntreeInventaire[];
  consigne: string;
  retourUtilisateur?: string;
  /** Film découpé : « 2/3 » (le modèle ne voit qu'une partie des plans). */
  partie?: string;
  /** Film découpé : les assets que les groupes précédents proposent déjà (pas encore au registre) ; à ne pas reproposer, utilisables en référence. */
  assetsDejaProposes?: { code: string; type: string; description: string }[];
};

/** Les plans de l'entrée, dans l'ordre. */
export function plansDeLEntree(e: Partial<EntreeInventaire>): PlanEntreeInventaire[] {
  return (e.episodes ?? []).flatMap((ep) => (ep.scenes ?? []).flatMap((s) => s.plans ?? []));
}

/** Poignée d'un plan dans l'entrée de l'inventaire (« P07 ») : un repère pour le modèle, résolu en uuid par les options de la tâche (jamais affiché). */
export const poigneePlan = (rang: number): string => `P${String(rang).padStart(2, "0")}`;

/** Budget d'UN appel d'inventaire, en jetons (skill + entrée + sortie attendue). Le contexte du serveur (`LLM_CONTEXTE_TOTAL`, son `--ctx-size`) s'il
 * est plus petit, sinon 32 000 : au-delà, un petit modèle local lit mal une entrée aussi longue, et la sortie (assets + références de chaque plan)
 * grossit avec le film. Un film de 5 min (≈ 50 plans) tient en ≈ 17 000 jetons, un de 10 min (≈ 100 plans) en ≈ 25 000 : un seul appel ;
 * un film de 20-30 min est découpé en 2 à 4 groupes de scènes. */
const PLAFOND_BUDGET_INVENTAIRE = 32_000;
export const budgetInventaire = (contexteTotal: number | null): number => Math.min(contexteTotal ?? PLAFOND_BUDGET_INVENTAIRE, PLAFOND_BUDGET_INVENTAIRE);
/** Sortie attendue : les assets et les notes, plus une ligne de références par plan (≈ 30 jetons : la poignée et 3 à 6 codes). */
const SORTIE_INVENTAIRE_BASE = 2500;
const SORTIE_INVENTAIRE_PAR_PLAN = 30;
/** Place gardée dans chaque groupe pour les assets que les groupes précédents auront proposés (`assetsDejaProposes`, ≈ 60 jetons l'asset). */
const RESERVE_ASSETS_PROPOSES = 3000;

const jetons = (x: unknown) => Math.ceil(JSON.stringify(x ?? {}).length / 4);

/** Jetons qu'occupe un appel d'inventaire sur cette entrée. */
export function estimerInventaire(entree: EntreeInventaire, jetonsSkill: number): number {
  return jetonsSkill + jetons(entree) + SORTIE_INVENTAIRE_BASE + SORTIE_INVENTAIRE_PAR_PLAN * plansDeLEntree(entree).length;
}

export type GroupeInventaire = { numero: number; total: number; libelle: string; entree: EntreeInventaire; planIds: string[] };

/** Découpe l'entrée en groupes de scènes CONSÉCUTIVES quand un seul appel dépasserait le budget (cas d'un long film) ; sinon un seul groupe, l'entrée
 * telle quelle (cas courant). Chaque groupe garde le registre, le brief et la consigne, et réserve la place des assets des groupes précédents. Une scène
 * trop longue pour un groupe à elle seule est coupée entre ses plans. Pur, testé. */
export function decouperInventaire(entree: EntreeInventaire, options: { budgetJetons: number; jetonsSkill: number }): GroupeInventaire[] {
  const tous = plansDeLEntree(entree);
  if (estimerInventaire(entree, options.jetonsSkill) <= options.budgetJetons || tous.length <= 1) {
    return [{ numero: 1, total: 1, libelle: "Tout le film", entree, planIds: tous.map((p) => p.id) }];
  }
  const fixe = options.jetonsSkill + jetons({ ...entree, episodes: [], partie: "10/10" }) + SORTIE_INVENTAIRE_BASE + RESERVE_ASSETS_PROPOSES;
  const place = Math.max(1, options.budgetJetons - fixe);
  // Une unité = une scène (ou un morceau de scène) d'un épisode ; son coût compte l'en-tête de l'épisode (prudence).
  type Unite = { ep: number; scene: SceneEntreeInventaire; cout: number };
  const cout = (ep: EpisodeEntreeInventaire, s: SceneEntreeInventaire) => jetons({ episode: ep.episode, resume: ep.resume }) + jetons(s) + SORTIE_INVENTAIRE_PAR_PLAN * s.plans.length;
  const unites: Unite[] = [];
  entree.episodes.forEach((ep, i) => {
    for (const s of ep.scenes) {
      if (s.plans.length === 0) continue;
      if (cout(ep, s) <= place) {
        unites.push({ ep: i, scene: s, cout: cout(ep, s) });
        continue;
      }
      // Scène trop longue : coupée entre ses plans, chaque morceau garde le titre de la scène.
      let morceau: PlanEntreeInventaire[] = [];
      const pousser = () => {
        if (!morceau.length) return;
        const sc = { ...s, titre: unites.some((u) => u.scene.titre === s.titre && u.ep === i) ? `${s.titre} (suite)` : s.titre, plans: morceau };
        unites.push({ ep: i, scene: sc, cout: cout(ep, sc) });
        morceau = [];
      };
      for (const p of s.plans) {
        if (morceau.length && cout(ep, { ...s, plans: [...morceau, p] }) > place) pousser();
        morceau.push(p);
      }
      pousser();
    }
  });
  const paquets: Unite[][] = [];
  let courant: Unite[] = [];
  let somme = 0;
  for (const u of unites) {
    if (courant.length && somme + u.cout > place) {
      paquets.push(courant);
      courant = [];
      somme = 0;
    }
    courant.push(u);
    somme += u.cout;
  }
  if (courant.length) paquets.push(courant);

  const total = paquets.length;
  return paquets.map((paquet, k) => {
    const episodes: EpisodeEntreeInventaire[] = [];
    for (const u of paquet) {
      const ep = entree.episodes[u.ep]!;
      const dernier = episodes[episodes.length - 1];
      if (dernier && dernier.episode === ep.episode) dernier.scenes.push(u.scene);
      else episodes.push({ ...ep, scenes: [u.scene] });
    }
    const planIds = paquet.flatMap((u) => u.scene.plans.map((p) => p.id));
    const premier = planIds[0]!;
    const dernier = planIds[planIds.length - 1]!;
    return {
      numero: k + 1,
      total,
      libelle: `Groupe ${k + 1}/${total} · ${paquet.length} scène${paquet.length > 1 ? "s" : ""}, plans ${premier} à ${dernier}`,
      entree: { ...entree, episodes, partie: `${k + 1}/${total}` },
      planIds,
    };
  });
}

// --- sous-tâches d'un inventaire découpé ----------------------------------------------------------------------------------

const PREFIXE_CLE_INVENTAIRE = "inv:";
export const cleSousTacheInventaire = (numero: number): string => `${PREFIXE_CLE_INVENTAIRE}${numero}`;
export function groupeInventaireDeCle(cle: string | null | undefined): number | null {
  if (!cle || !cle.startsWith(PREFIXE_CLE_INVENTAIRE)) return null;
  const n = Number(cle.slice(PREFIXE_CLE_INVENTAIRE.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Ce que porte une tâche d'inventaire (`agent_runs.options`) : la poignée → uuid de ses plans et, pour un film découpé, les groupes qui la suivent
 * (le groupe suivant est posé quand celui-ci finit, avec les assets déjà proposés : worker/agents/postTraitement.ts). */
export type OptionsRunInventaire = {
  plans?: Record<string, string>;
  suite?: { cle: string; libelle: string; entree: EntreeInventaire; plans: Record<string, string> }[];
};
