import { DUREE_GENERATION_MAX, DUREE_GENERATION_MIN, MAX_REFS } from "../plan-checks";
import { dureeEffectiveSecondes } from "../grille-images";
import { CREATIVITES, LIBELLE_CREATIVITE, MISES_EN_SCENE, RESUME_STYLE_CAMERA, STYLE_AUCUN, estCreativite, estMiseEnScene, type ChoixMiseEnScene } from "../h3ir/reglages";
import type { DecisionsAffichees, DecisionsIteration, DiagnosticIteration } from "./types";
import { raisonDescriptionIncomplete, repliquesPerdues, sansEtatDeFin } from "../intent";

/** `iteration-plan` : ANALYSER la consigne d'un plan après visionnage (agents/skills/iteration-plan/SKILL.md). Règles PURES (sans base, disque ni
 * Next), partagées par le contrôleur sémantique (lib/llm/controles.ts), le post-traitement (worker/agents/postTraitement.ts), la vue de la
 * proposition (lib/queries-agents.ts) et les tests.
 *
 * Contrat (2026-11-09) : l'agent n'écrit plus de prompt. Il diagnostique, puis DÉCIDE sur les seules sources de vérité du plan : son intent
 * (`plans.description`, texte COMPLET qui remplace l'actuel), sa durée, ses références (`plan_refs`, par code du registre) et ses réglages
 * Open H3 IR (`plans.creativite`, `plans.style_camera` : la nouvelle valeur REMPLACE celle du plan). Pas de directive libre persistante. Le
 * prompt vidéo est ensuite TOUJOURS recompilé par Open H3 IR (lib/agents/service.ts, `genererReecriturePlan`) et les décisions s'écrivent avec la
 * fiche compilée, dans la même application : si la compilation échoue, rien n'est écrit. */

export const CATEGORIES_ITERATION = ["decoupage-scenario", "cadence", "vocabulaire", "negation", "etat-arrivee", "camera", "lumiere", "duree", "reference", "mise-en-scene", "modele", "autre"] as const;

/** Écart toléré entre la durée réelle du fichier (ffprobe) et la durée voulue : au-delà, le rendu a été généré
 * à une autre durée, tous ses temps sont comprimés ou étirés : aucun diagnostic d'écriture n'est valable. */
export const TOLERANCE_DUREE_SECONDES = 0.5;

/** Plafond de vignettes demandé pour une planche (une par seconde, plafond de durée d'un plan). */
export const MAX_VIGNETTES_ITERATION = 15;

/** Au plus deux assets manquants suggérés par itération (décision 2026-11-09). */
export const MAX_MANQUANTS_ITERATION = 2;

/** Début du résumé d'une proposition qui ne recompile rien (postTraitement) : la décision d'« Itérer » s'arrête là (lib/fiche-plan.ts). */
export const PREFIXE_SANS_ECRITURE = "Diagnostic sans écriture.";

export type AssetManquant = { code: string; type: string; parent?: string; description: string; raison: string };

/** Le bloc `decisions` de la sortie du skill. `null` / `""` / liste vide = ne change pas. */
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

/** Ce que les contrôles savent du plan au moment de la consigne (l'entrée du skill). */
export type ContexteIteration = {
  /** La description (intent) actuelle du plan. */
  description?: string;
  /** Références du plan (plan_refs : images, sons, vidéos), avec le code de l'asset. */
  refs: { type: "picture" | "audio" | "video"; slot: number; asset?: string | null }[];
  /** Les assets du projet : ce que `references.ajouter` a le droit de citer ; `image` : son fichier existe (absent = inconnu). */
  registre?: { code: string; type: string; image?: boolean }[];
  dureeGenerationSecondes: number;
  /** Durée réelle du fichier rendu (ffprobe), si elle est connue au moment du contrôle. */
  dureeReelleSecondes?: number | null;
  /** Réglages Open H3 IR EFFECTIFS du plan (résolus plan > scène > projet) : `"aucun"` = pas de style. */
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

/** Le bloc `decisions`, lu sans confiance (un résultat ancien ou abîmé n'a pas la forme) : toujours un objet complet. */
export function lireDecisions(brut: unknown): DecisionsSortie {
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

/** La nouvelle description, telle qu'elle serait ÉCRITE : sans l'ancien « État en fin de plan » (il n'est plus produit). */
const descriptionPropre = (d: DecisionsSortie): string => sansEtatDeFin(d.nouvelleDescription).trim();

/** La durée réelle du fichier correspond à la durée voulue : à la nominale, OU à la durée EFFECTIVE de la grille d'images (lib/grille-images.ts : 6 s → 6,583 s, 10 s →
 * 10,125 s). Sans cela, un plan de 6 s correctement rendu (écart de 0,58 s à la nominale) ferait refuser toute correction. */
export function dureesCoherentes(voulueSecondes: number, reelleSecondes: number): boolean {
  return (
    Math.abs(reelleSecondes - voulueSecondes) <= TOLERANCE_DUREE_SECONDES ||
    Math.abs(reelleSecondes - dureeEffectiveSecondes(voulueSecondes)) <= TOLERANCE_DUREE_SECONDES
  );
}

/** Les décisions EFFECTIVES (ce qui change vraiment, validé) : une valeur invalide, identique à l'actuelle ou un fragment d'intent est écarté.
 * `null` quand rien ne change (rien à recompiler). Pur, testé. */
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
    // retirer puis rajouter le même code ne change rien
    const neutres = new Set(ajouter.filter((c) => retirer.includes(c)));
    const a = ajouter.filter((c) => !neutres.has(c));
    const r = retirer.filter((c) => !neutres.has(c));
    if (a.length + r.length > 0) out.references = { ajouter: a, retirer: r };
  }
  const reglages: NonNullable<DecisionsIteration["reglages"]> = {};
  const c = d.reglages.creativite;
  if (c && estCreativite(c) && c !== ctx.reglages?.creativite) reglages.creativite = c;
  const s = d.reglages.styleMiseEnScene;
  if (s && (estMiseEnScene(s) || s === STYLE_AUCUN) && s !== (ctx.reglages?.styleMiseEnScene ?? STYLE_AUCUN)) reglages.styleCamera = s;
  if (Object.keys(reglages).length) out.reglages = reglages;
  return Object.keys(out).length ? out : null;
}

/** Les contrôles propres aux références : codes du registre (une image, ni voix ni son), pas déjà au plan, six images au plus, une au moins. */
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
    else if (type === "voix" || type === "sfx") problemes.push({ niveau: "erreur", regle: "ajout-nature", message: `decisions.references.ajouter : ${code} (${type}) n'est pas une référence d'image.` });
    else if (codesImages.has(code) && !retires.has(code)) problemes.push({ niveau: "erreur", regle: "ajout-doublon", message: `decisions.references.ajouter : ${code} est déjà une référence de ce plan.` });
    else if (ajoutes.has(code)) problemes.push({ niveau: "erreur", regle: "ajout-doublon", message: `decisions.references.ajouter : ${code} est cité deux fois.` });
    ajoutes.add(code);
  }
  const total = images.length - [...retires].filter((c) => codesImages.has(c)).length + ajoutes.size;
  if (total > MAX_REFS.picture) problemes.push({ niveau: "erreur", regle: "trop-d-images", message: `${total} images de référence après la correction : ${MAX_REFS.picture} au plus ; retires-en une.` });
  if (images.length > 0 && total < 1) problemes.push({ niveau: "erreur", regle: "plus-d-image", message: "Après la correction le plan n'aurait plus aucune image de référence : garde-en au moins une." });
  return problemes;
}

/** Pourquoi RIEN n'est recompilé, ou null : la durée du rendu ne correspond pas (mesurée par le code ou jugée par l'agent), l'agent propose
 * d'abandonner, la cause n'est pas dans le plan, ou aucune décision effective (avec, s'il y en a, les assets à créer). */
export function raisonSansEcriture(sortie: SortieIterationPlan, ctx: ContexteIteration): string | null {
  const reelle = ctx.dureeReelleSecondes;
  if (reelle != null && !dureesCoherentes(ctx.dureeGenerationSecondes, reelle)) {
    return `La durée réelle du fichier (${secondes(reelle)}) ne correspond pas à la durée voulue (${secondes(ctx.dureeGenerationSecondes)}) : c'est un problème de génération, pas d'écriture. Relance la génération avant de corriger le plan.`;
  }
  if (!sortie.dureeCoherente) return "L'agent juge la durée du rendu incohérente avec la durée voulue : aucune correction n'est proposée.";
  if (sortie.abandon?.propose) return `L'agent propose d'abandonner ce mouvement plutôt qu'une correction de plus${sortie.abandon.raison?.trim() ? ` : ${sortie.abandon.raison.trim()}` : "."}`;
  if (decisionsEffectives(sortie, ctx)) return null;
  const d = lireDecisions(sortie.decisions);
  // Un texte réduit à l'ancien « État en fin de plan » n'a plus rien une fois nettoyé : c'est un fragment, dit comme tel.
  const incomplete = d.nouvelleDescription.trim() ? raisonDescriptionIncomplete(descriptionPropre(d), ctx.description) : null;
  if (incomplete) return `La nouvelle description de l'agent est incomplète (${incomplete}) : rien n'est écrit, la description du plan reste telle quelle. Relance la correction.`;
  const manquants = d.manquants.map((a) => a.code).filter(Boolean);
  if (manquants.length > 0) return `Aucune décision applicable : l'agent suggère de créer ${manquants.join(", ")} (aucun asset du registre ne convient). Crée-le, génère son image, puis itère de nouveau pour l'ajouter en référence.`;
  if (sortie.categorie === "decoupage-scenario") return "La cause n'est pas dans ce plan (découpage ou scénario) : rien n'est écrit. Revois le découpage, puis réécris le plan.";
  return "L'agent ne propose aucune décision (ni intent, ni durée, ni références, ni réglages).";
}

/** Contrôles SÉMANTIQUES d'une sortie déjà conforme au schéma. Les ERREURS déclenchent un renvoi au modèle (lib/llm/controles.ts) : intent
 * réduit à un fragment, référence inventée ou en double, plus de six images, plus de deux assets manquants, réglage inconnu. Les alertes se
 * lisent sur l'essai. Une sortie qui ne recompilera rien (durée incohérente, abandon) n'est pas contrôlée décision par décision. */
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

  // L'intent REMPLACE l'actuel : il doit être complet (un fragment effacerait le récit). Une réplique perdue : alerte (la consigne peut la retirer).
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
  // Une image ajoutée sans fichier : la recompilation sera refusée (« images manquantes ») tant qu'elle n'est pas générée. Signalé, pas renvoyé (le
  // bon asset peut simplement attendre son image).
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

/** Les décisions telles que la page du plan les affiche (avant → après). */
export function decisionsAffichees(dec: DecisionsIteration | null, ctx: ContexteIteration, manquants: AssetManquant[] = []): DecisionsAffichees | null {
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

/** Les décisions en phrases courtes, gardées sur l'essai qu'elles produisent (`jobs.alertes_iteration`). */
export function notesDecisions(a: DecisionsAffichees | null): string[] {
  if (!a) return [];
  const notes: string[] = [];
  if (a.intent) notes.push("Intent du plan réécrit par l'agent (l'ancien reste dans l'essai précédent).");
  if (a.duree) notes.push(`Durée : ${a.duree.avant} s → ${a.duree.apres} s.`);
  if (a.referencesAjoutees.length || a.referencesRetirees.length) {
    notes.push(`Références : ${[...a.referencesAjoutees.map((c) => `+ ${c}`), ...a.referencesRetirees.map((c) => `− ${c}`)].join(", ")}.`);
  }
  for (const r of a.reglages) notes.push(`${r.libelle} du plan : ${r.avant} → ${r.apres}.`);
  if (a.manquants.length) notes.push(`L'agent suggère de créer ${a.manquants.map((m) => m.code).join(", ")} (non créé${a.manquants.length > 1 ? "s" : ""}) : crée-le, génère son image, puis itère de nouveau.`);
  return notes;
}

/** Le diagnostic à afficher, depuis le JSON validé du skill (agent_runs.resultat) ; null s'il n'en a pas la forme. `entree` (agent_runs.entree) : le plan
 * tel que l'agent l'a vu, pour ne garder que les décisions effectives (un intent réduit à un fragment est écarté). Un résultat de l'ancien contrat
 * (`changements[]`, avant 2026-11-09) a un diagnostic sans décisions. */
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

/** Une correction déjà tentée sur ce plan, telle que l'agent la lit (`historique`) : minimal et honnête. */
export type CorrectionPassee = {
  le: string;
  ceQuiAvaitEteVu: string;
  symptome: string;
  cause: string;
  categorie: string | null;
  /** appliquée (en tout ou partie) / proposée mais non appliquée / sans écriture (diagnostic seul). */
  issue: "appliquee" | "non_appliquee" | "sans_ecriture";
  /** Un rendu terminé est arrivé après l'application : la correction a été mise à l'épreuve. */
  renduDepuis: boolean;
};

/** L'historique depuis les propositions `iteration-plan` du plan (les plus anciennes d'abord, les `max` dernières) et les dates de fin de ses rendus. Une
 * proposition sans diagnostic (échouée, en cours) n'en fait pas partie. `appliedAt` : quand ses décisions ont été écrites (avec la fiche recompilée,
 * dont la proposition est distincte depuis 2026-11-09 : l'appelant la retrouve par la demande). */
export function historiqueIteration(
  propositions: { createdAt: Date; appliedAt: Date | null; statut: string; consigne: string; resultat: unknown; nbChangements: number; entree?: unknown }[],
  rendusTermines: Date[],
  max = 8,
): CorrectionPassee[] {
  const lignes: CorrectionPassee[] = [];
  for (const p of [...propositions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const d = diagnosticIteration(p.resultat, p.entree);
    if (!d) continue;
    const appliquee = (p.statut === "appliquee" || p.statut === "partielle") && p.appliedAt != null;
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

/** Le contexte de contrôle depuis l'ENTRÉE du skill (celle que le worker envoie, voir entreeIterationPlan) : le contrôleur sémantique n'a que ça. */
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
    if (r.type === "picture" || r.type === "audio" || r.type === "video") refs.push({ type: r.type, slot: r.slot, asset: r.asset ?? null });
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
