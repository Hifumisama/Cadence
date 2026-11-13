import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN, MAX_REFS } from "../clips/clip-checks";
import { dureeEffectiveSecondes } from "../renders/image-grid";
import { CREATIVITES, LIBELLE_CREATIVITE, MISES_EN_SCENE, RESUME_STYLE_CAMERA, STYLE_AUCUN, estCreativite, estMiseEnScene, type ChoixMiseEnScene } from "../h3ir/settings";
import type { DecisionsAffichees, DecisionsIteration, DiagnosticIteration } from "./types";
import { raisonDescriptionIncomplete, repliquesPerdues, sansEtatDeFin } from "../clips/intent";
import { retenirManquants } from "../h3ir/preparation";

/** Tolerated gap between the file's real duration (ffprobe) and the wanted duration: beyond it, the render was generated
 * at another duration, all its timings are compressed or stretched: no write diagnosis is valid. */
const TOLERANCE_DUREE_SECONDES = 0.5;

/** Contact-sheet thumbnail cap requested for a sheet (one per second, the clip's maximum duration cap). */
export const MAX_VIGNETTES_ITERATION = 15;

/** At most two missing assets suggested per iteration (decision 2026-11-09). */
const MAX_MANQUANTS_ITERATION = 2;

// `PREFIXE_SANS_ECRITURE` et `notesDecisions` live in iteration-notes.ts (no server dependency, read by the client components).
export { PREFIXE_SANS_ECRITURE, notesDecisions } from "./iteration-notes";

type AssetManquant = { code: string; type: string; parent?: string; description: string; raison: string };

/** The `decisions` block of the skill output. `null` / `""` / empty list = unchanged. */
export type DecisionsSortie = {
  nouvelleDescription: string;
  dureeSecondes: number | null;
  references: { ajouter: string[]; retirer: string[] };
  manquants: AssetManquant[];
  reglages: { creativite: string | null; styleMiseEnScene: string | null };
};

export type SortieIterationPlan = {
  dureeCoherente: boolean;
  symptome: string;
  cause: string;
  categorie?: string;
  confiance: "haute" | "moyenne" | "faible";
  verification?: string;
  entreeLexique?: { symptome: string; cause: string; formulationQuiTient: string };
  abandon: { propose: boolean; raison: string };
  decisions: DecisionsSortie;
};

/** What the checks know about the clip at the time of the instruction (the skill input). */
export type ContexteIteration = {
  /** The clip's current description (intent). */
  description?: string;
  /** The clip's references (plan_refs: images, sounds, videos), with the asset's code. */
  refs: { type: "picture" | "video"; slot: number; asset?: string | null }[];
  /** The project's assets: what `references.ajouter` may cite; `image`: its file exists (absent = unknown). */
  registre?: { code: string; type: string; image?: boolean }[];
  dureeGenerationSecondes: number;
  /** Real duration of the rendered file (ffprobe), if known at the time of the check. */
  dureeReelleSecondes?: number | null;
  /** The clip's EFFECTIVE Open H3 IR settings (resolved clip > scene > project): `"aucun"` = no style. */
  reglages?: { creativite: string; styleMiseEnScene: string };
};

export type ProblemeIteration = { niveau: "erreur" | "alerte" | "info"; regle: string; message: string };

const extrait = (s: string, max = 70) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const arrondi = (n: number) => Math.round(n * 100) / 100;
const secondes = (n: number) => `${String(arrondi(n)).replace(".", ",")} s`;
const norm = (t: string) => t.replace(/\s+/g, " ").trim();
const chaines = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : []);

/** The `decisions` block, read without trust (an old or damaged result does not have the shape): always a complete object. */
function lireDecisions(brut: unknown): DecisionsSortie {
  const d = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const refs = (d.references && typeof d.references === "object" ? d.references : {}) as Record<string, unknown>;
  const reg = (d.reglages && typeof d.reglages === "object" ? d.reglages : {}) as Record<string, unknown>;
  const manquants = (Array.isArray(d.manquants) ? d.manquants : []).filter(
    (a): a is AssetManquant => !!a && typeof a === "object" && typeof (a as AssetManquant).code === "string" && typeof (a as AssetManquant).type === "string",
  );
  return {
    nouvelleDescription: typeof d.nouvelleDescription === "string" ? d.nouvelleDescription : "",
    dureeSecondes: typeof d.dureeSecondes === "number" ? d.dureeSecondes : null,
    references: { ajouter: chaines(refs.ajouter), retirer: chaines(refs.retirer) },
    manquants: manquants.map((a) => ({ code: a.code, type: a.type, ...(typeof a.parent === "string" && a.parent.trim() ? { parent: a.parent.trim() } : {}), description: typeof a.description === "string" ? a.description : "", raison: typeof a.raison === "string" ? a.raison : "" })),
    reglages: { creativite: typeof reg.creativite === "string" ? reg.creativite : null, styleMiseEnScene: typeof reg.styleMiseEnScene === "string" ? reg.styleMiseEnScene : null },
  };
}

/** The new description, as it would be WRITTEN: without the old "État en fin de plan" (it is no longer produced). */
const descriptionPropre = (d: DecisionsSortie): string => sansEtatDeFin(d.nouvelleDescription).trim();

/** The file's real duration matches the wanted duration: at the nominal one, OR at the EFFECTIVE duration of the image grid (lib/renders/image-grid.ts: 6 s → 6,583 s, 10 s →
 * 10,125 s). Without this, a correctly rendered 6 s clip (a 0.58 s gap from nominal) would refuse every correction. */
export function dureesCoherentes(voulueSecondes: number, reelleSecondes: number): boolean {
  return (
    Math.abs(reelleSecondes - voulueSecondes) <= TOLERANCE_DUREE_SECONDES ||
    Math.abs(reelleSecondes - dureeEffectiveSecondes(voulueSecondes)) <= TOLERANCE_DUREE_SECONDES
  );
}

/** The EFFECTIVE decisions (what really changes, validated): an invalid value, one identical to the current one, or an intent fragment is dropped.
 * `null` when nothing changes (nothing to recompile). Pure, tested. */
export function decisionsEffectives(sortie: Pick<SortieIterationPlan, "decisions">, ctx: ContexteIteration): DecisionsIteration | null {
  const d = lireDecisions(sortie.decisions);
  const out: DecisionsIteration = {};
  const nouvelle = descriptionPropre(d);
  if (nouvelle && norm(nouvelle) !== norm(sansEtatDeFin(ctx.description)) && raisonDescriptionIncomplete(nouvelle, ctx.description) == null) out.description = nouvelle;
  const duree = d.dureeSecondes;
  if (duree != null && Number.isInteger(duree) && duree >= DUREE_GENERATION_MIN && duree <= DUREE_GENERATION_MAX && duree !== ctx.dureeGenerationSecondes) out.dureeSecondes = duree;
  if (controlerReferences(d.references, ctx).filter((p) => p.niveau === "erreur").length === 0) {
    const images = new Set(ctx.refs.filter((r) => r.type === "picture" && r.asset).map((r) => r.asset!));
    const retirer = [...new Set(d.references.retirer)].filter((c) => images.has(c));
    const ajouter = [...new Set(d.references.ajouter)].filter((c) => !images.has(c) || retirer.includes(c));
    // removing then re-adding the same code changes nothing
    const neutres = new Set(ajouter.filter((c) => retirer.includes(c)));
    const a = ajouter.filter((c) => !neutres.has(c));
    const r = retirer.filter((c) => !neutres.has(c));
    if (a.length + r.length > 0) out.references = { ajouter: a, retirer: r };
  }
  // The missing assets (two at most): created outright before the recompilation, then added to the references (wave 4a). A code already in the registry is
  // just one more reference; an invalid or excess code is dropped.
  if (d.manquants.length) {
    const images = ctx.refs.filter((r) => r.type === "picture").length - (out.references?.retirer.length ?? 0) + (out.references?.ajouter.length ?? 0);
    const m = retenirManquants(d.manquants, ctx.registre ?? [], { max: MAX_MANQUANTS_ITERATION, place: Math.max(0, MAX_REFS.picture - images) });
    if (m.retenus.length) out.manquants = m.retenus;
  }
  const reglages: NonNullable<DecisionsIteration["reglages"]> = {};
  const c = d.reglages.creativite;
  if (c && estCreativite(c) && c !== ctx.reglages?.creativite) reglages.creativite = c;
  const s = d.reglages.styleMiseEnScene;
  if (s && (estMiseEnScene(s) || s === STYLE_AUCUN) && s !== (ctx.reglages?.styleMiseEnScene ?? STYLE_AUCUN)) reglages.styleCamera = s;
  if (Object.keys(reglages).length) out.reglages = reglages;
  return Object.keys(out).length ? out : null;
}

/** The checks specific to references: registry codes (an image, neither voice nor sound), not already on the clip, six images at most, at least one. */
function controlerReferences(ops: DecisionsSortie["references"], ctx: ContexteIteration): ProblemeIteration[] {
  const problemes: ProblemeIteration[] = [];
  const images = ctx.refs.filter((r) => r.type === "picture");
  const codesImages = new Set(images.map((r) => r.asset).filter((c): c is string => !!c));
  const registre = new Map((ctx.registre ?? []).map((a) => [a.code, a.type]));
  for (const code of ops.retirer) {
    if (!codesImages.has(code)) problemes.push({ niveau: "erreur", regle: "retrait-inconnu", message: `decisions.references.retirer : ${code} n'est pas une référence d'image de ce plan.` });
  }
  const retires = new Set(ops.retirer);
  const ajoutes = new Set<string>();
  for (const code of ops.ajouter) {
    const type = registre.get(code);
    if (type == null) problemes.push({ niveau: "erreur", regle: "ajout-inconnu", message: `decisions.references.ajouter : ${code} n'existe pas au registre ; n'utilise que des codes du registre (un asset à créer va dans decisions.manquants).` });
    else if (type === "voix") problemes.push({ niveau: "erreur", regle: "ajout-nature", message: `decisions.references.ajouter : ${code} (${type}) n'est pas une référence d'image.` });
    else if (codesImages.has(code) && !retires.has(code)) problemes.push({ niveau: "erreur", regle: "ajout-doublon", message: `decisions.references.ajouter : ${code} est déjà une référence de ce plan.` });
    else if (ajoutes.has(code)) problemes.push({ niveau: "erreur", regle: "ajout-doublon", message: `decisions.references.ajouter : ${code} est cité deux fois.` });
    ajoutes.add(code);
  }
  const total = images.length - [...retires].filter((c) => codesImages.has(c)).length + ajoutes.size;
  if (total > MAX_REFS.picture) problemes.push({ niveau: "erreur", regle: "trop-d-images", message: `${total} images de référence après la correction : ${MAX_REFS.picture} au plus ; retires-en une.` });
  if (images.length > 0 && total < 1) problemes.push({ niveau: "erreur", regle: "plus-d-image", message: "Après la correction le plan n'aurait plus aucune image de référence : garde-en au moins une." });
  return problemes;
}

/** Why NOTHING is recompiled, or null: the render's duration does not match (measured by the code or judged by the agent), the agent proposes
 * giving up, the cause is not in the clip, or no effective decision (with, if any, the assets to create). */
export function raisonSansEcriture(sortie: SortieIterationPlan, ctx: ContexteIteration): string | null {
  const reelle = ctx.dureeReelleSecondes;
  if (reelle != null && !dureesCoherentes(ctx.dureeGenerationSecondes, reelle)) {
    return `La durée réelle du fichier (${secondes(reelle)}) ne correspond pas à la durée voulue (${secondes(ctx.dureeGenerationSecondes)}) : c'est un problème de génération, pas d'écriture. Relance la génération avant de corriger le plan.`;
  }
  if (!sortie.dureeCoherente) return "L'agent juge la durée du rendu incohérente avec la durée voulue : aucune correction n'est proposée.";
  if (sortie.abandon?.propose) return `L'agent propose d'abandonner ce mouvement plutôt qu'une correction de plus${sortie.abandon.raison?.trim() ? ` : ${sortie.abandon.raison.trim()}` : "."}`;
  if (decisionsEffectives(sortie, ctx)) return null;
  const d = lireDecisions(sortie.decisions);
  // A text reduced to the old "État en fin de plan" has nothing left once cleaned: it is a fragment, said as such.
  const incomplete = d.nouvelleDescription.trim() ? raisonDescriptionIncomplete(descriptionPropre(d), ctx.description) : null;
  if (incomplete) return `La nouvelle description de l'agent est incomplète (${incomplete}) : rien n'est écrit, la description du plan reste telle quelle. Relance la correction.`;
  const manquants = d.manquants.map((a) => a.code).filter(Boolean);
  if (manquants.length > 0) return `Aucune décision applicable : les assets que l'agent veut créer (${manquants.join(", ")}) ne sont pas valides (type ou code) ou ne tiennent pas dans les six images. Crée-les à la main, puis itère de nouveau.`;
  if (sortie.categorie === "decoupage-scenario") return "La cause n'est pas dans ce plan (découpage ou scénario) : rien n'est écrit. Revois le découpage, puis réécris le plan.";
  return "L'agent ne propose aucune décision (ni intent, ni durée, ni références, ni réglages).";
}

/** SEMANTIC checks of an output already conforming to the schema. ERRORS trigger a re-prompt to the model (lib/llm/checks.ts): intent
 * reduced to a fragment, invented or duplicated reference, more than six images, more than two missing assets, unknown setting. The alerts are
 * read on the attempt. An output that will recompile nothing (incoherent duration, giving up) is not checked decision by decision. */
export function controlerSortieIterationPlan(sortie: SortieIterationPlan, ctx: ContexteIteration): ProblemeIteration[] {
  const problemes: ProblemeIteration[] = [];
  const d = lireDecisions(sortie.decisions);
  const reelle = ctx.dureeReelleSecondes;
  if (reelle != null) {
    const ok = dureesCoherentes(ctx.dureeGenerationSecondes, reelle);
    if (!ok && sortie.dureeCoherente) {
      problemes.push({ niveau: "alerte", regle: "duree", message: `Durée réelle ${secondes(reelle)} pour ${secondes(ctx.dureeGenerationSecondes)} voulues : le rendu n'est pas à la bonne durée, le diagnostic ne vaut pas.` });
    }
    if (ok && !sortie.dureeCoherente) {
      problemes.push({ niveau: "alerte", regle: "duree", message: `L'agent juge la durée incohérente alors que le fichier dure ${secondes(reelle)} pour ${secondes(ctx.dureeGenerationSecondes)} voulues.` });
    }
  }
  const ignorees = !sortie.dureeCoherente || sortie.abandon?.propose || (reelle != null && !dureesCoherentes(ctx.dureeGenerationSecondes, reelle));
  if (ignorees) {
    if (decisionsEffectives(sortie, ctx)) problemes.push({ niveau: "alerte", regle: "ignores", message: `${sortie.abandon?.propose ? "Abandon proposé" : "Durée incohérente"} : les décisions proposées sont ignorées.` });
    return problemes;
  }

  // The intent REPLACES the current one: it must be complete (a fragment would erase the story). A lost line of dialogue: alert (the instruction may remove it).
  const nouvelle = descriptionPropre(d);
  if (d.nouvelleDescription.trim()) {
    const incomplete = raisonDescriptionIncomplete(nouvelle, ctx.description);
    if (incomplete) problemes.push({ niveau: "erreur", regle: "description-incomplete", message: `decisions.nouvelleDescription : ${incomplete}. Recopie la description actuelle (plan.intention) en entier et n'y change que ce que la consigne demande.` });
    const perdues = repliquesPerdues(nouvelle, ctx.description);
    if (!incomplete && perdues.length > 0) {
      problemes.push({ niveau: "alerte", regle: "description-repliques", message: `La nouvelle description ne reprend plus ${perdues.length > 1 ? "les répliques" : "la réplique"} ${perdues.map((r) => `« ${extrait(r, 40)} »`).join(", ")} : à vérifier, sauf si ta consigne demandait de ${perdues.length > 1 ? "les" : "la"} retirer.` });
    }
  }
  if (d.dureeSecondes != null && (!Number.isInteger(d.dureeSecondes) || d.dureeSecondes < DUREE_GENERATION_MIN || d.dureeSecondes > DUREE_GENERATION_MAX)) {
    problemes.push({ niveau: "erreur", regle: "duree-invalide", message: `decisions.dureeSecondes : ${d.dureeSecondes} n'est pas une durée valide (entier de ${DUREE_GENERATION_MIN} à ${DUREE_GENERATION_MAX}, ou null).` });
  }
  problemes.push(...controlerReferences(d.references, ctx));
  // An image added without a file: the recompilation will be refused ("images manquantes") until it is generated. Flagged, not re-prompted (the
  // right asset may simply be waiting for its image).
  const sansImage = d.references.ajouter.filter((c) => (ctx.registre ?? []).find((a) => a.code === c)?.image === false);
  if (sansImage.length) problemes.push({ niveau: "alerte", regle: "ajout-sans-image", message: `${sansImage.join(", ")} n'${sansImage.length > 1 ? "ont" : "a"} pas encore d'image : la fiche ne sera recompilée qu'une fois ${sansImage.length > 1 ? "leurs images générées" : "son image générée"}.` });

  if (d.manquants.length > MAX_MANQUANTS_ITERATION) {
    problemes.push({ niveau: "erreur", regle: "trop-de-manquants", message: `decisions.manquants : ${d.manquants.length} assets suggérés, ${MAX_MANQUANTS_ITERATION} au plus ; garde les plus utiles à la consigne.` });
  }
  const codesRegistre = new Set((ctx.registre ?? []).map((a) => a.code));
  for (const m of d.manquants) {
    if (codesRegistre.has(m.code)) problemes.push({ niveau: "erreur", regle: "manquant-existe", message: `decisions.manquants : ${m.code} existe déjà au registre ; mets-le dans decisions.references.ajouter.` });
  }
  const c = d.reglages.creativite;
  if (c != null && !estCreativite(c)) problemes.push({ niveau: "erreur", regle: "reglage-inconnu", message: `decisions.reglages.creativite : « ${c} » inconnu (${CREATIVITES.join(", ")}, ou null).` });
  const s = d.reglages.styleMiseEnScene;
  if (s != null && !estMiseEnScene(s) && s !== STYLE_AUCUN) problemes.push({ niveau: "erreur", regle: "reglage-inconnu", message: `decisions.reglages.styleMiseEnScene : « ${s} » inconnu (${[...MISES_EN_SCENE, STYLE_AUCUN].join(", ")}, ou null).` });
  return problemes;
}

const libelleCreativite = (v: string | null | undefined): string => (v && estCreativite(v) ? LIBELLE_CREATIVITE[v] : "Équilibrée");
const libelleStyle = (v: string | null | undefined): string => (v && estMiseEnScene(v) ? RESUME_STYLE_CAMERA[v as ChoixMiseEnScene] : "aucun style");

/** The decisions as the clip's page displays them (before → after). */
function decisionsAffichees(dec: DecisionsIteration | null, ctx: ContexteIteration, suggeres: AssetManquant[] = []): DecisionsAffichees | null {
  // The retained missing assets (created outright) when there are decisions; otherwise what the agent suggested (nothing will be created).
  const manquants = dec?.manquants ?? (dec ? [] : suggeres);
  if (!dec && manquants.length === 0) return null;
  return {
    intent: dec?.description ? { avant: sansEtatDeFin(ctx.description).trim(), apres: dec.description } : null,
    duree: dec?.dureeSecondes != null ? { avant: ctx.dureeGenerationSecondes, apres: dec.dureeSecondes } : null,
    referencesAjoutees: dec?.references?.ajouter ?? [],
    referencesRetirees: dec?.references?.retirer ?? [],
    reglages: [
      ...(dec?.reglages?.creativite ? [{ libelle: "Créativité", avant: libelleCreativite(ctx.reglages?.creativite), apres: libelleCreativite(dec.reglages.creativite) }] : []),
      ...(dec?.reglages?.styleCamera ? [{ libelle: "Style de mise en scène", avant: libelleStyle(ctx.reglages?.styleMiseEnScene), apres: libelleStyle(dec.reglages.styleCamera) }] : []),
    ],
    manquants: manquants.map((m) => ({ code: m.code, raison: m.raison })),
  };
}

/** The diagnosis to display, from the skill's validated JSON (agent_runs.resultat); null if it does not have that shape. `entree` (agent_runs.entree): the clip
 * as the agent saw it, to keep only the effective decisions (an intent reduced to a fragment is dropped). A result of the old contract
 * (`changements[]`, before 2026-11-09) has a diagnosis without decisions. */
export function diagnosticIteration(json: unknown, entree?: unknown): DiagnosticIteration | null {
  if (!json || typeof json !== "object") return null;
  const s = json as Partial<SortieIterationPlan>;
  if (typeof s.symptome !== "string" || typeof s.cause !== "string" || typeof s.dureeCoherente !== "boolean") return null;
  const confiance = s.confiance === "haute" || s.confiance === "moyenne" || s.confiance === "faible" ? s.confiance : "faible";
  const l = s.entreeLexique;
  const ctx = contexteDepuisEntree(entree);
  const complet = s as SortieIterationPlan;
  const abandon = s.abandon && typeof s.abandon.propose === "boolean" ? { propose: s.abandon.propose, raison: s.abandon.raison ?? "" } : null;
  const ecrit = s.dureeCoherente && !abandon?.propose;
  const decisions = ecrit && s.decisions ? decisionsEffectives(complet, ctx) : null;
  const manquants = s.decisions ? lireDecisions(s.decisions).manquants.slice(0, MAX_MANQUANTS_ITERATION) : [];
  return {
    symptome: s.symptome,
    cause: s.cause,
    categorie: typeof s.categorie === "string" ? s.categorie : null,
    confiance,
    verification: typeof s.verification === "string" && s.verification.trim() ? s.verification.trim() : null,
    dureeCoherente: s.dureeCoherente,
    entreeLexique: l && typeof l.symptome === "string" && typeof l.cause === "string" && typeof l.formulationQuiTient === "string" ? l : null,
    abandon,
    decisions,
    affichage: decisionsAffichees(decisions, ctx, manquants),
    assetsSuggeres: manquants.map((a) => ({ code: a.code, type: a.type, ...(a.parent ? { parent: a.parent } : {}), raison: a.raison })),
  };
}

/** A correction already attempted on this clip, as the agent reads it (`historique`): minimal and honest. */
export type CorrectionPassee = {
  le: string;
  ceQuiAvaitEteVu: string;
  symptome: string;
  cause: string;
  categorie: string | null;
  /** applied (in whole or in part) / proposed but not applied / no write (diagnosis only). */
  issue: "appliquee" | "non_appliquee" | "sans_ecriture";
  /** A finished render arrived after the application: the correction has been put to the test. */
  renduDepuis: boolean;
};

/** The history from the clip's `iteration-plan` proposals (oldest first, the last `max`) and the end dates of its renders. A
 * proposal with no diagnosis (failed, running) is not part of it. `appliedAt`: when its decisions were written (with the recompiled sheet,
 * whose proposal has been separate since 2026-11-09: the caller finds it by the request). */
export function historiqueIteration(
  propositions: { createdAt: Date; appliedAt: Date | null; statut: string; consigne: string; resultat: unknown; nbChangements: number; entree?: unknown }[],
  rendusTermines: Date[],
  max = 8,
): CorrectionPassee[] {
  const lignes: CorrectionPassee[] = [];
  for (const p of [...propositions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const d = diagnosticIteration(p.resultat, p.entree);
    if (!d) continue;
    const appliquee = p.statut === "appliquee" && p.appliedAt != null;
    lignes.push({
      le: p.createdAt.toISOString().slice(0, 16).replace("T", " "),
      ceQuiAvaitEteVu: p.consigne,
      symptome: d.symptome,
      cause: d.cause,
      categorie: d.categorie,
      issue: appliquee ? "appliquee" : p.nbChangements === 0 && !d.decisions ? "sans_ecriture" : "non_appliquee",
      renduDepuis: appliquee && rendusTermines.some((r) => r.getTime() > p.appliedAt!.getTime()),
    });
  }
  return lignes.slice(-max);
}

/** The check context from the skill's INPUT (the one the worker sends, see entreeIterationPlan): the semantic checker has only that. */
export function contexteDepuisEntree(entree: unknown): ContexteIteration {
  const e = (entree ?? {}) as {
    references?: { type?: string; slot?: number; asset?: string | null }[];
    registre?: { code?: string; type?: string; image?: boolean }[];
    plan?: { dureeVoulueSecondes?: number; intention?: string };
    rendu?: { dureeReelleSecondes?: number };
    reglages?: { creativite?: { actuelle?: string }; styleMiseEnScene?: { actuel?: string } };
  };
  const refs: ContexteIteration["refs"] = [];
  for (const r of e.references ?? []) {
    if (typeof r.slot !== "number") continue;
    if (r.type === "picture" || r.type === "video") refs.push({ type: r.type, slot: r.slot, asset: r.asset ?? null });
  }
  const creativite = e.reglages?.creativite?.actuelle;
  const style = e.reglages?.styleMiseEnScene?.actuel;
  return {
    description: e.plan?.intention,
    refs,
    registre: (e.registre ?? [])
      .filter((a): a is { code: string; type: string; image?: boolean } => typeof a.code === "string" && typeof a.type === "string")
      .map((a) => ({ code: a.code, type: a.type, ...(typeof a.image === "boolean" ? { image: a.image } : {}) })),
    dureeGenerationSecondes: e.plan?.dureeVoulueSecondes ?? 0,
    dureeReelleSecondes: typeof e.rendu?.dureeReelleSecondes === "number" ? e.rendu.dureeReelleSecondes : null,
    ...(typeof creativite === "string" || typeof style === "string" ? { reglages: { creativite: typeof creativite === "string" ? creativite : "balanced", styleMiseEnScene: typeof style === "string" ? style : STYLE_AUCUN } } : {}),
  };
}
