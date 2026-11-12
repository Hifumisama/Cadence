import { construireCode } from "../assets/assetCode";
import type { ChangementBrut } from "./changes";
import { correspondances } from "./similar-codes";
import { MAX_REFS_VISUELLES } from "../clips/clip-continuity";
import { TYPES_MANQUANTS, suffixeDeCode } from "./conversion";
import { cleNouvelAsset } from "./sheets";
import type { Avertissement } from "./types";

/** Output of the `inventaire-assets` skill: the assets the clips call for that the registry does not have, and the references
 * of each clip (2026-11-09: a single call also gives each clip's reference images, before the sheets). */
export type SortieInventaire = {
  /** `element`: the name of the brief's element (`brief.elements[].nom`) the asset is derived from, copied as is; null otherwise. */
  assets: { code: string; type: string; parent?: string | null; element?: string | null; description: string; plans: string[]; raison: string }[];
  /** `plan`: the clip's handle in the input ("P07", `episodes[].scenes[].plans[].id`); `codes`: its references, in the wanted order. */
  references?: { plan: string; codes: string[] }[];
  notes: string;
};

/** A comparable element name (case, accents, spaces). */
const nomComparable = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type AssetRegistre = { code: string; type: string; description?: string };

const MOTS_VIDES = new Set(["le", "la", "les", "un", "une", "de", "du", "des", "d", "l", "et", "the", "of", "a", "an"]);

/** The meaningful words of a code suffix ("lampe_huile" → lampe, huile): used to spot an asset
 * that resembles an existing asset. */
function mots(suffixe: string): string[] {
  return suffixe
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 1 && !MOTS_VIDES.has(m));
}

/** The registry asset a proposed code resembles (same type, common words), or null. It is only a
 * signal for the review: the semantic matching (lanterne / lampe) remains the model's, which sees the registry. */
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

/** The codes of `codes` cited as they are in a text (except `sauf`, the asset's own code). */
function codesCites(texte: string, codes: Iterable<string>, sauf: string): string[] {
  const t = texte.toLowerCase();
  return [...codes].filter((c) => {
    if (c === sauf) return false;
    // The code must be a whole word: neither preceded nor followed by a code character (CHAR_iris ≠ CHAR_iris_blessee).
    const morceaux = t.split(c.toLowerCase());
    return morceaux.slice(0, -1).some((avant, i) => !/[a-z0-9_]$/.test(avant) && !/^[a-z0-9_]/.test(morceaux[i + 1]!));
  });
}

/** The `inventaire-assets` output → "create an asset" changes (without a prompt: it is written afterwards,
 * one asset at a time). Drops what already exists and the output's duplicates; flags what resembles an existing
 * asset without refusing it. The parent is an existing asset (`deriveDeCode`) or one created here (`deriveDeCle`); the
 * registry has only one level, the application always attaches to the master. Pure, tested.
 * `elements`: the brief's effects and props (`brief.elements`, interview of 2026-11-08). A VFX is accepted only if it is derived from one. */
export function depuisInventaire(
  sortie: SortieInventaire,
  registre: AssetRegistre[],
  options: { elements?: { nom: string; nature: string }[]; proposes?: AssetRegistre[] } = {},
): ChangementBrut[] {
  const elementsDuBrief = new Map((options.elements ?? []).filter((e) => nomComparable(e.nom ?? "")).map((e) => [nomComparable(e.nom), e]));
  const existants = new Set(registre.map((a) => a.code));
  // Inventory split into scene groups: what the OTHER groups of the same proposal already create is not recreated, and can serve as a parent.
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
    if (!code || existants.has(code) || proposes.has(code) || vus.has(code)) continue; // unusable, already in the registry, or already proposed
    // Never a GUESSED VFX from the inventory (decision of 2026-11-02): an effect image is followed too literally (Open H3 IR takes it for a subject to
    // preserve), the effect is described in the clip's text. Exception (2026-11-08): an effect the user described in the interview (`brief.elements`,
    // nature vfx) becomes its asset; the clip takes it up as a `weak_reference` (lib/agents/conversion.ts). The user can always create one by hand.
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
        // A parent proposed here (or by another group of the same proposal): its exact code, or the same name with another type prefix.
        const crees = [...codesCrees, ...proposes].find((c) => c === parent || c.endsWith(`_${suffixeDeCode(parent)}`));
        if (crees && crees !== code) apres.deriveDeCle = cleNouvelAsset(crees);
        else avert.push({ type: "alerte_controle", texte: `Parent « ${parent} » introuvable (ni au registre, ni proposé ici) : l'asset est créé sans parent.` });
      }
    }
    // A state of a recurring subject (character, creature, set, prop) STARTS from the subject: the model often forgets it in `parent` while
    // it cites the subject's code in its description or its reason. Same type: the parent is set here (info); other type: alert.
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
  // A derivative whose parent is created here comes after it.
  sorties.sort((a, b) => Number(!!(a.apres as Record<string, unknown>).deriveDeCle) - Number(!!(b.apres as Record<string, unknown>).deriveDeCle));
  return sorties;
}

/** The code the proposed asset will have once created (the registry convention: type prefix + cleaned suffix), or null if it is unusable. */
export function codeFinal(m: { code: string; type: string }): string | null {
  const suffixe = suffixeDeCode(m.code ?? "");
  return TYPES_MANQUANTS.has(m.type) && suffixe ? construireCode(m.type, suffixe) : null;
}

// --- references of each clip (2026-11-09) --------------------------------------------------------------------
//
// The inventory also returns, for each clip, the assets to place as reference images: they are ready BEFORE the sheets (reviewed with the
// intents) and no per-clip pass by the model is needed to choose them. The CODE checks and corrects what the model returns: known codes
// (registry or created by the same response), never a sound, one face per character, one set, a keyframe only if the intent cites it,
// 6 images at most. Writing: lib/h3ir/references-write.ts, triggered by lib/agents/inventory-db.ts.

/** An asset the references may cite: in the registry, or created by the inventory (`aCreer`: it does not exist in the database yet). `parent`: the
 * subject it is a state of (the same character at another age shares its face with it). */
export type AssetConnu = { code: string; type: string; parent?: string | null; aCreer?: boolean };
/** A clip of the input: its handle ("P07"), its uuid (kept in the task's options, never shown to the model) and its intent. */
export type PlanInventaire = { id: string; uuid: string; intention?: string };
export type ReferencesPlan = { id: string; uuid: string; codes: string[] };
/** `erreur`: a contract defect (unknown code, forgotten clip…), returned once to the model; `alerte`: corrected by the code, for the review. */
export type ProblemeReferences = { plan: string | null; niveau: "erreur" | "alerte"; message: string };

/** The asset types that can be a reference IMAGE (never a voice, which is a character field). */
const TYPES_REFERENCE_IMAGE = new Set(["personnage", "decor", "prop", "vfx", "keyframe", "oth"]);
export const MAX_REFERENCES_PLAN = MAX_REFS_VISUELLES;
/** Order of a clip's references: the characters (the speakers first, in the model's order), the props, the effects, the set last. */
const RANG_AFFICHAGE: Record<string, number> = { personnage: 0, prop: 1, oth: 2, keyframe: 3, vfx: 4, decor: 5 };
/** Beyond 6 images, what is kept first: the characters, the set, then the props; the effects go first. */
const RANG_GARDE: Record<string, number> = { personnage: 0, decor: 1, prop: 2, oth: 3, keyframe: 4, vfx: 5 };

/** Does the intent cite this asset (its code, or its readable name: "KEY_salle_pleine" → "salle pleine")? */
function citeDans(intention: string, code: string): boolean {
  const t = nomComparable(intention);
  const nom = nomComparable(code.includes("_") ? code.slice(code.indexOf("_") + 1) : code);
  return t.includes(nomComparable(code)) || (nom.length >= 3 && ` ${t} `.includes(` ${nom} `));
}

/** Each clip's references, checked and corrected. `alias`: code proposed by the model → final code of the created asset (`codeFinal`).
 * An unknown code sometimes differs from a known one only by a linking word (`similar-codes.ts`): it is corrected. Pure, tested. */
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
      if (gardes.some((g) => g.code === a.code)) continue; // duplicate: no consequence
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

/** The check context drawn from the model's INPUT and OUTPUT (no database): for the automatic re-prompt (lib/llm/checks.ts). The known codes
 * are the registry, the assets already proposed by the previous groups, and those of the output (under the model's code as under the final code). */
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

// --- input and split into scene groups (2026-11-09) ------------------------------------------------------------------

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
  /** Split film: "2/3" (the model only sees part of the clips). */
  partie?: string;
  /** Split film: the assets the previous groups already propose (not yet in the registry); not to be proposed again, usable as references. */
  assetsDejaProposes?: { code: string; type: string; description: string }[];
};

/** The input's clips, in order. */
export function plansDeLEntree(e: Partial<EntreeInventaire>): PlanEntreeInventaire[] {
  return (e.episodes ?? []).flatMap((ep) => (ep.scenes ?? []).flatMap((s) => s.plans ?? []));
}

/** A clip's handle in the inventory input ("P07"): a marker for the model, resolved to a uuid by the task's options (never shown). */
export const poigneePlan = (rang: number): string => `P${String(rang).padStart(2, "0")}`;

/** Budget of ONE inventory call, in tokens (skill + input + expected output). The server context (`LLM_CONTEXTE_TOTAL`, its `--ctx-size`) if it
 * is smaller, otherwise 32 000: beyond that, a small local model reads such a long input badly, and the output (assets + each clip's references)
 * grows with the film. A 5-min film (≈ 50 clips) fits in ≈ 17 000 tokens, a 10-min one (≈ 100 clips) in ≈ 25 000: a single call;
 * a 20-30 min film is split into 2 to 4 scene groups. */
const PLAFOND_BUDGET_INVENTAIRE = 32_000;
export const budgetInventaire = (contexteTotal: number | null): number => Math.min(contexteTotal ?? PLAFOND_BUDGET_INVENTAIRE, PLAFOND_BUDGET_INVENTAIRE);
/** Expected output: the assets and the notes, plus one references line per clip (≈ 30 tokens: the handle and 3 to 6 codes). */
const SORTIE_INVENTAIRE_BASE = 2500;
const SORTIE_INVENTAIRE_PAR_PLAN = 30;
/** Room kept in each group for the assets the previous groups will have proposed (`assetsDejaProposes`, ≈ 60 tokens per asset). */
const RESERVE_ASSETS_PROPOSES = 3000;

const jetons = (x: unknown) => Math.ceil(JSON.stringify(x ?? {}).length / 4);

/** Tokens an inventory call takes up on this input. */
export function estimerInventaire(entree: EntreeInventaire, jetonsSkill: number): number {
  return jetonsSkill + jetons(entree) + SORTIE_INVENTAIRE_BASE + SORTIE_INVENTAIRE_PAR_PLAN * plansDeLEntree(entree).length;
}

export type GroupeInventaire = { numero: number; total: number; libelle: string; entree: EntreeInventaire; planIds: string[] };

/** Splits the input into CONSECUTIVE scene groups when a single call would exceed the budget (case of a feature film); otherwise a single group, the input
 * as is (common case). Each group keeps the registry, the brief and the instruction, and reserves room for the previous groups' assets. A scene
 * too long for a group on its own is cut between its clips. Pure, tested. */
export function decouperInventaire(entree: EntreeInventaire, options: { budgetJetons: number; jetonsSkill: number }): GroupeInventaire[] {
  const tous = plansDeLEntree(entree);
  if (estimerInventaire(entree, options.jetonsSkill) <= options.budgetJetons || tous.length <= 1) {
    return [{ numero: 1, total: 1, libelle: "Tout le film", entree, planIds: tous.map((p) => p.id) }];
  }
  const fixe = options.jetonsSkill + jetons({ ...entree, episodes: [], partie: "10/10" }) + SORTIE_INVENTAIRE_BASE + RESERVE_ASSETS_PROPOSES;
  const place = Math.max(1, options.budgetJetons - fixe);
  // A unit = one scene (or a piece of a scene) of an episode; its cost counts the episode header (cautiously).
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
      // Scene too long: cut between its clips, each piece keeps the scene's title.
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

// --- subtasks of a split inventory ----------------------------------------------------------------------------------

const PREFIXE_CLE_INVENTAIRE = "inv:";
export const cleSousTacheInventaire = (numero: number): string => `${PREFIXE_CLE_INVENTAIRE}${numero}`;
export function groupeInventaireDeCle(cle: string | null | undefined): number | null {
  if (!cle || !cle.startsWith(PREFIXE_CLE_INVENTAIRE)) return null;
  const n = Number(cle.slice(PREFIXE_CLE_INVENTAIRE.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** What an inventory task carries (`agent_runs.options`): the handle → uuid of its clips and, for a split film, the groups that follow it
 * (the next group is set when this one finishes, with the assets already proposed: worker/agents/postProcessing.ts). */
export type OptionsRunInventaire = {
  plans?: Record<string, string>;
  suite?: { cle: string; libelle: string; entree: EntreeInventaire; plans: Record<string, string> }[];
};
