import { controlerStructure, extraireBalisesD, type PromptSection } from "../plan-checks";
import type { ChangementBrut } from "./changements";
import { MAX_REFS } from "../plan-checks";
import { ajouterReference, compacterImages, nomDepuisCode, retirerReference } from "../references";
import { SECTIONS_FICHE, estSectionFiche, type ApresFiche, type PassageFiche, type RefFiche, type SectionsFiche } from "./fiches";
import type { Avertissement, DiagnosticIteration } from "./types";

/** `iteration-plan` : corriger un plan APRÈS visionnage de son rendu (agents/skills/iteration-plan/SKILL.md).
 * Règles PURES (sans base, disque ni Next), partagées par le contrôleur sémantique (lib/llm/controles.ts), la
 * conversion en proposition (worker/agents/postTraitement.ts), la revue et les tests. Voir docs/FRICTIONS.md,
 * « iteration-plan branché » (2026-10-02).
 *
 * Choix du contrat (le plus simple et robuste) : le modèle voit le prompt FINAL (labels `<Subject N>`,
 * `<Picture N>`, `<Audio N>`, `[Shot N]`, `<d>`) et propose des remplacements de PASSAGES (`avant` recopié
 * exactement → `apres`) ; le code les applique et contrôle que :
 * - chaque `avant` se retrouve UNE fois dans sa section (exact, ou aux blancs près) ;
 * - les labels cités par `apres` existent (plan_refs, `<Subject N>` déjà présents) ;
 * - les répliques sont libres (le prompt est leur seule source) ;
 * - la structure des shots ne se dégrade pas (lib/plan-checks.ts, `controlerStructure`) : alerte seulement.
 * Le résultat est une écriture PARTIELLE de la fiche (seulement les sections touchées, sans `refs` ni durée). */

export const CATEGORIES_ITERATION = ["decoupage-scenario", "cadence", "vocabulaire", "negation", "etat-arrivee", "camera", "lumiere", "duree", "reference", "mise-en-scene", "modele", "autre"] as const;

/** Écart toléré entre la durée réelle du fichier (ffprobe) et la durée voulue : au-delà, le rendu a été généré
 * à une autre durée, tous ses temps sont comprimés ou étirés : aucun diagnostic d'écriture n'est valable. */
export const TOLERANCE_DUREE_SECONDES = 0.5;

/** Plafond de vignettes demandé pour une planche (une par seconde, plafond de durée d'un plan). */
export const MAX_VIGNETTES_ITERATION = 15;

export type ChangementIteration = { section: string; avant: string; apres: string };

/** Références à ajouter ou à retirer (par CODE du registre) : le code pose les labels et renumérote, jamais le modèle.
 * Une référence ajoutée se cite dans les passages par son marqueur `[[CODE]]`, que le code remplace par son label. */
export type OpsReferences = { ajouter?: { asset: string; nom: string; role?: string }[]; retirer?: string[] };

export type SortieIterationPlan = {
  dureeCoherente: boolean;
  symptome: string;
  cause: string;
  categorie?: string;
  confiance: "haute" | "moyenne" | "faible";
  changements: ChangementIteration[];
  /** Références du plan à ajouter (depuis le registre) ou à retirer ; absent = les références ne bougent pas. */
  references?: OpsReferences;
  verification?: string;
  entreeLexique?: { symptome: string; cause: string; formulationQuiTient: string };
  abandon: { propose: boolean; raison: string };
  /** Assets que l'agent SUGGÈRE de créer (aucun n'existe au registre pour ce rôle) : jamais créés par l'itération ; l'utilisateur les crée,
   * génère leur image, puis itère de nouveau pour les ajouter en référence. */
  assetsManquants?: { code: string; type: string; parent?: string; description: string; raison: string }[];
  /** La NOUVELLE description (intention) du plan, en français, terminée par « État en fin de plan : … » : à fournir quand la correction change
   * ce qui se passe dans le plan, ou l'état (position, orientation, feu…) qu'il laisse au plan suivant. Écrite avec la fiche. */
  nouvelleDescription?: string;
  /** La consigne change CE QUI SE PASSE dans le plan : ce n'est plus une retouche de passages mais une réécriture du plan. Les `changements`
   * sont ignorés ; la fiche est réécrite à part (`plan-h3`, depuis `nouvelleDescription`). */
  reecriture?: boolean;
};

/** Ce que les contrôles et la conversion savent du plan : son prompt, ses labels déclarés, sa durée. */
export type ContexteIteration = {
  /** Toutes les consignes françaises de ce plan (l'actuelle, puis celles des corrections déjà tentées). */
  consignes?: string[];
  /** Les mots du prompt de RÉFÉRENCE du plan (son premier essai, écrit en anglais par plan-h3 et jamais retouché) : ce qui y est déjà est de l'anglais. */
  motsAnglais?: string[];
  /** La consigne de l'utilisateur (ses mots, en français) : de quoi repérer un mot recopié tel quel dans le prompt anglais. */
  consigne?: string;
  /** La description (intention) actuelle du plan, avec son « État en fin de plan » : de quoi voir si la correction la change. */
  description?: string;
  /** Contenu actuel par section (absente = vide). */
  sections: Partial<Record<string, string>>;
  /** Références du plan (plan_refs : images, sons, vidéos), avec l'asset et le rôle quand on les connaît. */
  refs: { type: "picture" | "audio" | "video"; slot: number; asset?: string | null; role?: string | null; retention?: string | null }[];
  /** Les assets du projet (code, type) : ce que `references.ajouter` a le droit de citer. */
  registre?: { code: string; type: string }[];
  dureeGenerationSecondes: number;
  /** Durée réelle du fichier rendu (ffprobe), si elle est connue au moment du contrôle. */
  dureeReelleSecondes?: number | null;
};

export type PlanPourIteration = ContexteIteration & { uuid: string; titre: string };

export type ProblemeIteration = { niveau: "erreur" | "alerte" | "info"; regle: string; message: string };

const TYPE_LABEL = { picture: "Picture", audio: "Audio", video: "Video" } as const;
const RE_LABEL = /<(Subject|Picture|Audio|Video)\s+(\d+)>/g;

const extrait = (s: string, max = 70) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const arrondi = (n: number) => Math.round(n * 100) / 100;
const secondes = (n: number) => `${String(arrondi(n)).replace(".", ",")} s`;

/** Ce que le plan laisse au suivant : la phrase après « État en fin de plan : » (vide si elle manque). */
export function etatEnFinDePlan(description: string | undefined | null): string {
  const m = /[ée]tat en fin de plan\s*:([\s\S]*)$/i.exec(description ?? "");
  return (m?.[1] ?? "").replace(/\s+/g, " ").trim();
}

const norm = (t: string) => t.replace(/\s+/g, " ").trim();
const descriptionChangee = (sortie: SortieIterationPlan, ctx: ContexteIteration): boolean =>
  !!sortie.nouvelleDescription?.trim() && norm(sortie.nouvelleDescription) !== norm(ctx.description ?? "");

/** Les mots de la CONSIGNE qui se retrouvent tels quels dans les passages écrits (hors balise `<d>`, seule à garder le français) et qui n'étaient pas
 * déjà dans le prompt : le modèle a recopié « sagement » au lieu de le traduire. Un signal « à vérifier » (un mot identique dans les deux langues
 * peut être légitime), jamais un blocage. Pur, testé. */
export function motsRecopiesDeLaConsigne(consigne: string | undefined, passages: string[], promptActuel: string): string[] {
  if (!consigne?.trim()) return [];
  const mots = (t: string) => new Set((t.toLowerCase().match(/\p{L}{5,}/gu) ?? []));
  const dits = mots(consigne);
  const avant = mots(promptActuel);
  const apres = mots(passages.map((p) => p.replace(/<d>[\s\S]*?<\/d>/gi, " ")).join(" "));
  return [...apres].filter((m) => dits.has(m) && !avant.has(m)).sort();
}

const ACCENTUES_ADMIS = new Set(["café", "résumé", "naïve", "fiancé", "fiancée", "cliché", "façade", "décor", "entrée", "décolleté", "déjà"]);
const sansBalises = (t: string) => t.replace(/<d>[\s\S]*?<\/d>/gi, " ").replace(/<\s*(?:Subject|Picture|Audio|Video)\s*\d+\s*>/g, " ");

/** Les mots du prompt de référence : de l'anglais (lettres seules, 5 ou plus, en minuscules). */
export function motsDeReference(prompt: string): string[] {
  return [...new Set(sansBalises(prompt).toLowerCase().match(/\p{L}{5,}/gu) ?? [])];
}

/** Les mots d'un prompt qui ne sont PAS de l'anglais (hors balise `<d>`, seule à garder le français), pour vérifier dès la première correction que tout est
 * traduit : (A) un mot en minuscules qui porte un accent français ; (B) un mot des consignes françaises du plan qui n'est pas dans le prompt de référence
 * (« sagement » recopié tel quel, puis laissé par les corrections suivantes). Les noms propres (majuscule) sont écartés. Pur, testé. */
export function motsNonTraduits(sections: Record<string, string>, consignes: string[] | undefined, reference: string[] | undefined): string[] {
  const texte = sansBalises(Object.values(sections).join(" "));
  const jetons = texte.match(/\p{L}+/gu) ?? [];
  const connus = new Set(reference ?? []);
  const dits = new Set((consignes ?? []).flatMap((c) => c.toLowerCase().match(/\p{L}{5,}/gu) ?? []));
  const trouves = new Set<string>();
  for (const j of jetons) {
    if (j !== j.toLowerCase()) continue; // nom propre ou début de phrase : on ne juge pas sur la casse
    if (/[àâäçéèêëîïôöùûüÿœ]/.test(j) && !ACCENTUES_ADMIS.has(j)) trouves.add(j);
    else if (reference && j.length >= 5 && dits.has(j) && !connus.has(j)) trouves.add(j);
  }
  return [...trouves].sort();
}

export function dureesCoherentes(voulueSecondes: number, reelleSecondes: number): boolean {
  return Math.abs(reelleSecondes - voulueSecondes) <= TOLERANCE_DUREE_SECONDES;
}

/** Les labels qu'un passage corrigé a le droit de citer : `Picture:1`, `Audio:2` (plan_refs, voix comprises), `Subject:3`
 * (déjà présents dans le prompt : une correction ne crée pas de sujet, elle ne touche pas aux références). */
export function labelsConnus(ctx: ContexteIteration): Set<string> {
  const connus = new Set<string>();
  for (const r of ctx.refs) connus.add(`${TYPE_LABEL[r.type]}:${r.slot}`);
  for (const texte of Object.values(ctx.sections)) {
    for (const m of (texte ?? "").matchAll(RE_LABEL)) if (m[1] === "Subject") connus.add(`Subject:${m[2]}`);
  }
  return connus;
}

type Trouve = { debut: number; fin: number } | "absent" | "ambigu";

/** Où est `avant` dans `texte` : exactement (une seule occurrence), sinon aux blancs près (retours à la ligne,
 * espaces doublés : un modèle recopie rarement les blancs à l'identique). Jamais plus tolérant que ça. */
export function trouverPassage(texte: string, avant: string): Trouve {
  const occurrences: number[] = [];
  for (let i = texte.indexOf(avant); i >= 0; i = texte.indexOf(avant, i + 1)) occurrences.push(i);
  if (occurrences.length === 1) return { debut: occurrences[0]!, fin: occurrences[0]! + avant.length };
  if (occurrences.length > 1) return "ambigu";
  const morceaux = avant.trim().split(/\s+/).filter(Boolean);
  if (morceaux.length === 0) return "absent";
  const re = new RegExp(morceaux.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "g");
  const tolerants = [...texte.matchAll(re)];
  if (tolerants.length === 1) return { debut: tolerants[0]!.index!, fin: tolerants[0]!.index! + tolerants[0]![0].length };
  return tolerants.length > 1 ? "ambigu" : "absent";
}

export type ResultatApplication = {
  /** Sections dont le texte final DIFFÈRE de l'actuel (écriture partielle). */
  sections: SectionsFiche;
  passages: PassageFiche[];
  problemes: ProblemeIteration[];
};

/** Applique les remplacements, dans l'ordre (deux passages d'une même section s'enchaînent). Pur. */
export function appliquerChangements(sectionsActuelles: Partial<Record<string, string>>, changements: ChangementIteration[]): ResultatApplication {
  const finales: Record<string, string> = {};
  const passages: PassageFiche[] = [];
  const problemes: ProblemeIteration[] = [];
  for (const [i, c] of changements.entries()) {
    const n = `Changement ${i + 1}`;
    if (!estSectionFiche(c.section)) {
      problemes.push({ niveau: "erreur", regle: "section-inconnue", message: `${n} : section inconnue « ${c.section} » (sections permises : ${SECTIONS_FICHE.join(", ")}).` });
      continue;
    }
    if (c.avant === c.apres) {
      problemes.push({ niveau: "info", regle: "sans-effet", message: `${n} (${c.section}) : « avant » et « après » sont identiques, ignoré.` });
      continue;
    }
    const courant = finales[c.section] ?? sectionsActuelles[c.section] ?? "";
    if (!c.avant.trim()) {
      if (!courant.trim()) {
        finales[c.section] = c.apres;
        passages.push({ section: c.section, avant: "", apres: c.apres });
      } else {
        problemes.push({ niveau: "erreur", regle: "passage-vide", message: `${n} (${c.section}) : « avant » est vide alors que la section a du texte ; recopie le passage exact à remplacer.` });
      }
      continue;
    }
    const t = trouverPassage(courant, c.avant);
    if (t === "absent") {
      problemes.push({
        niveau: "erreur",
        regle: "passage-introuvable",
        message: `${n} (${c.section}) : le passage « ${extrait(c.avant)} » n'existe pas dans le prompt actuel ; recopie-le exactement depuis promptActuel.`,
      });
      continue;
    }
    if (t === "ambigu") {
      problemes.push({ niveau: "erreur", regle: "passage-ambigu", message: `${n} (${c.section}) : le passage « ${extrait(c.avant)} » apparaît plusieurs fois ; allonge-le pour qu'il soit unique.` });
      continue;
    }
    passages.push({ section: c.section, avant: courant.slice(t.debut, t.fin), apres: c.apres });
    finales[c.section] = courant.slice(0, t.debut) + c.apres + courant.slice(t.fin);
  }
  const sections: SectionsFiche = {};
  for (const [k, v] of Object.entries(finales)) if (v !== (sectionsActuelles[k] ?? "")) (sections as Record<string, string>)[k] = v;
  return { sections, passages, problemes };
}

const toutes = (sections: Partial<Record<string, string>>, par?: SectionsFiche): PromptSection[] =>
  SECTIONS_FICHE.map((section) => ({ section, contenu: (par as Record<string, string> | undefined)?.[section] ?? sections[section] ?? "" }));

/** Pourquoi AUCUNE écriture n'est proposée, ou null : la durée du rendu ne correspond pas (mesurée par le code ou
 * jugée par l'agent), l'agent propose d'abandonner, la cause n'est pas dans le prompt, aucun passage, ou des
 * passages qui ne changent rien / qu'on ne retrouve pas. */
export function raisonSansEcriture(sortie: SortieIterationPlan, ctx: ContexteIteration): string | null {
  const reelle = ctx.dureeReelleSecondes;
  if (reelle != null && !dureesCoherentes(ctx.dureeGenerationSecondes, reelle)) {
    return `La durée réelle du fichier (${secondes(reelle)}) ne correspond pas à la durée voulue (${secondes(ctx.dureeGenerationSecondes)}) : c'est un problème de génération, pas d'écriture. Relance la génération avant de corriger le prompt.`;
  }
  if (!sortie.dureeCoherente) return "L'agent juge la durée du rendu incohérente avec la durée voulue : aucune correction d'écriture n'est proposée.";
  if (sortie.abandon?.propose) return `L'agent propose d'abandonner ce mouvement plutôt qu'une correction de plus${sortie.abandon.raison?.trim() ? ` : ${sortie.abandon.raison.trim()}` : "."}`;
  const avecRefs = aDesOpsReferences(sortie);
  // Réécriture : la consigne change ce qui se passe dans le plan, la fiche est réécrite à part (aucune retouche de passages).
  if (sortie.reecriture) {
    return sortie.nouvelleDescription?.trim()
      ? "Le plan est à réécrire : la consigne change ce qui s'y passe. Sa fiche est réécrite à partir de la nouvelle description de l'agent."
      : "L'agent a bien compris qu'il faut réécrire le plan mais n'a pas écrit la nouvelle description (un défaut du modèle, pas de la consigne) : rien n'est écrit. Relance la correction ; si cela se répète, découpe la consigne en deux étapes.";
  }
  // « Découpage ou scénario » n'interdit que les sorties VIDES : si le modèle a quand même écrit des passages du prompt (consigne qui
  // change ce qui se passe dans le plan), c'est une correction de ce plan, la consigne de l'utilisateur prime sur l'étiquette.
  if (sortie.categorie === "decoupage-scenario" && (sortie.changements ?? []).length === 0 && !avecRefs) return "La cause n'est pas dans le prompt (découpage ou scénario) : rien n'est écrit. Revois le découpage du plan, puis réécris sa fiche.";
  if ((sortie.changements ?? []).length === 0 && !avecRefs && !descriptionChangee(sortie, ctx)) {
    const manquants = (sortie.assetsManquants ?? []).map((a) => a.code).filter(Boolean);
    if (manquants.length > 0) return `Aucune modification du prompt : l'agent suggère de créer ${manquants.join(", ")} (aucun asset du registre ne convient). Crée-le, génère son image, puis itère de nouveau pour l'ajouter en référence.`;
    return "L'agent ne propose aucune modification du prompt.";
  }
  const a = appliquerChangements(ctx.sections, sortie.changements ?? []);
  if (Object.keys(a.sections).length === 0 && !avecRefs && !descriptionChangee(sortie, ctx)) {
    const erreurs = a.problemes.filter((p) => p.niveau === "erreur");
    return erreurs.length
      ? `Aucun passage proposé n'a pu être appliqué au prompt actuel (${erreurs.map((e) => e.message).join(" ; ")}) : rien n'est écrit. Affine en le signalant.`
      : "Les passages proposés ne changent rien au prompt actuel.";
  }
  return null;
}

/** Contrôles SÉMANTIQUES d'une sortie déjà conforme au schéma. Les ERREURS déclenchent un renvoi au modèle (lib/llm/
 * controles.ts) : section inconnue, passage introuvable ou ambigu, label inexistant, marqueur de brouillon `[[…]]`,
 * réplique modifiée. Les alertes (structure des shots, durée) se lisent à la revue. Une sortie qui n'écrira rien
 * (durée incohérente, abandon, découpage) n'est pas contrôlée passage par passage : ses changements seront ignorés. */
export function controlerSortieIterationPlan(sortie: SortieIterationPlan, ctx: ContexteIteration): ProblemeIteration[] {
  const problemes: ProblemeIteration[] = [];
  const changements = sortie.changements ?? [];
  const reelle = ctx.dureeReelleSecondes;
  if (reelle != null) {
    const ok = dureesCoherentes(ctx.dureeGenerationSecondes, reelle);
    if (!ok && sortie.dureeCoherente) {
      problemes.push({ niveau: "alerte", regle: "duree", message: `Durée réelle ${secondes(reelle)} pour ${secondes(ctx.dureeGenerationSecondes)} voulues : le rendu n'est pas à la bonne durée, le diagnostic d'écriture ne vaut pas.` });
    }
    if (ok && !sortie.dureeCoherente) {
      problemes.push({ niveau: "alerte", regle: "duree", message: `L'agent juge la durée incohérente alors que le fichier dure ${secondes(reelle)} pour ${secondes(ctx.dureeGenerationSecondes)} voulues.` });
    }
  }
  // La nouvelle description doit finir par l'état laissé au plan suivant (le suivi d'état est ce qui porte la continuité) ; une réécriture
  // sans nouvelle description n'a rien à réécrire. Erreurs : renvoi au modèle.
  if (sortie.nouvelleDescription?.trim() && !/[ée]tat en fin de plan\s*:/i.test(sortie.nouvelleDescription)) {
    problemes.push({ niveau: "erreur", regle: "description-etat", message: "nouvelleDescription doit se terminer par « État en fin de plan : … » (où se tiennent les personnages qui comptent et vers quoi ils sont tournés, par rapport aux repères fixes du lieu et non à la caméra ; l'état de ce qui a changé)." });
  }
  if (sortie.reecriture && !sortie.nouvelleDescription?.trim()) {
    problemes.push({ niveau: "erreur", regle: "reecriture-sans-description", message: "reecriture est vrai mais nouvelleDescription est absente : donne la nouvelle description complète du plan (en français)." });
  }
  if (sortie.reecriture) return problemes;
  if (changements.length > 0 || aDesOpsReferences(sortie)) {
    if (!sortie.dureeCoherente) problemes.push({ niveau: "alerte", regle: "ignores", message: "Durée jugée incohérente : les changements proposés sont ignorés." });
    else if (sortie.abandon?.propose) problemes.push({ niveau: "alerte", regle: "ignores", message: "Abandon proposé : les changements proposés sont ignorés." });
  }
  // Rien ne sera écrit : pas de contrôle passage par passage (ni de renvoi pour du texte qui sera ignoré).
  if ((changements.length === 0 && !aDesOpsReferences(sortie) && !descriptionChangee(sortie, ctx)) || !sortie.dureeCoherente || sortie.abandon?.propose) return problemes;
  if (reelle != null && !dureesCoherentes(ctx.dureeGenerationSecondes, reelle)) return problemes;

  const a = appliquerChangements(ctx.sections, changements);
  problemes.push(...a.problemes);

  // Tout le prompt doit être en anglais (hors <d>), y compris ce qu'une correction précédente a laissé : erreur, donc renvoi au modèle.
  const nonTraduits = motsNonTraduits({ ...ctx.sections, ...a.sections }, ctx.consignes, ctx.motsAnglais);
  if (nonTraduits.length > 0) {
    problemes.push({ niveau: "erreur", regle: "non-traduit", message: `Le prompt contient des mots qui ne sont pas de l'anglais (hors balise <d>) : ${nonTraduits.join(", ")}. Traduis-les dans tes passages, même s'ils sont hors de la zone que tu retouches (ex. « sagement » devient « calmly »).` });
  }

  // Références : codes du registre, six images au plus ; le code pose les labels et renumérote.
  problemes.push(...controlerReferences(sortie.references, ctx));
  const codesAjoutes = new Set((sortie.references?.ajouter ?? []).map((r) => r.asset));

  // Labels : seuls ceux qui existent déjà ; un marqueur [[CODE]] seulement pour une référence AJOUTÉE par cette correction.
  const connus = labelsConnus(ctx);
  const signales = new Set<string>();
  for (const [i, c] of changements.entries()) {
    for (const m of c.apres.matchAll(/\[\[\s*([^\]]*?)\s*\]\]/g)) {
      if (codesAjoutes.has(m[1]!)) continue;
      problemes.push({
        niveau: "erreur",
        regle: "marqueur",
        message: `Changement ${i + 1} (${c.section}) : le marqueur [[${m[1]}]] ne désigne pas une référence ajoutée par cette correction (references.ajouter) ; cite une référence existante par son label, ou décris en prose.`,
      });
    }
    for (const m of c.apres.matchAll(RE_LABEL)) {
      const cle = `${m[1]}:${m[2]}`;
      if (connus.has(cle) || signales.has(cle)) continue;
      signales.add(cle);
      problemes.push({
        niveau: "erreur",
        regle: "label-inconnu",
        message: `Changement ${i + 1} (${c.section}) : le label <${m[1]} ${m[2]}> n'existe pas dans ce plan ; n'utilise que les labels de references et les <Subject N> déjà définis.`,
      });
    }
  }

  // Répliques : le prompt est leur seule source (2026-10-14), une balise <d> change librement.
  const avant = toutes(ctx.sections);
  const apres = toutes(ctx.sections, a.sections);

  // Une parole écrite entre guillemets, hors balise <d> : le modèle vidéo la dirait sans que le plan la sache (ni la prise, ni le contrôle des
  // dialogues). Erreur, donc renvoi au modèle : les paroles s'écrivent `<d>[Langue] texte</d>`.
  const RE_PAROLE_NUE = /\b(?:says?|said|replies|replying|responds?|answers?|whispers?|asks?|calls?|shouts?|murmurs?|declares?|speaks?)\b[^.\n<]{0,60}?[:,]?\s*['"“«‘]/i;
  changements.forEach((c, i) => {
    if (RE_PAROLE_NUE.test(c.apres.replace(/<d>[\s\S]*?<\/d>/gi, ""))) {
      problemes.push({
        niveau: "erreur",
        regle: "parole-sans-balise",
        message: `Changement ${i + 1} (${c.section}) : une parole est écrite entre guillemets ; écris-la \`<d>[Français] texte exact</d>\` (balise <d>, langue entre crochets), sans guillemets autour.`,
      });
    }
  });

  // Structure des shots : seules les dégradations APPORTÉES par la correction sont signalées.
  if (a.sections.detailed_description !== undefined) {
    const deja = new Set(controlerStructure(avant, ctx.dureeGenerationSecondes).map((p) => p.message));
    for (const p of controlerStructure(apres, ctx.dureeGenerationSecondes)) {
      if (!deja.has(p.message)) problemes.push({ niveau: "alerte", regle: "structure", message: `Structure des shots : ${p.message}` });
    }
  }
  return problemes;
}

function versAvertissement(p: ProblemeIteration): Avertissement {
  if (p.niveau === "info") return { type: "info", texte: p.message };
  if (p.niveau === "erreur") return { type: "bloque_controle", texte: `Contrat non tenu (après renvoi au modèle) : ${p.message}` };
  return { type: "alerte_controle", texte: p.message };
}

/** La sortie d'`iteration-plan` → les changements d'une proposition, EN CODE : une écriture PARTIELLE de la fiche
 * (cible `fiche`, seulement les sections corrigées, avec les passages pour la revue), ou rien du tout quand
 * `raisonSansEcriture` dit pourquoi (la revue affiche alors le diagnostic seul). Une erreur de contrat qui
 * persiste après le renvoi BLOQUE la fiche (non cochable) : pas d'écriture partielle d'une correction à moitié
 * appliquée. `entreeLexique` n'est jamais écrite : la revue la montre comme candidate. L'écrasement (le plan a un
 * rendu, ses sections ont du texte) est évalué par l'applicateur `fiche` (lib/agents/fiches.ts). Pur, testé. */
export function depuisIterationPlan(sortie: SortieIterationPlan, plan: PlanPourIteration): ChangementBrut[] {
  if (raisonSansEcriture(sortie, plan)) return [];
  const a = appliquerChangements(plan.sections, sortie.changements ?? []);
  const avertissements: Avertissement[] = [];
  const ajouter = (x: Avertissement) => {
    if (!avertissements.some((y) => y.type === x.type && y.texte === x.texte)) avertissements.push(x);
  };
  if (sortie.confiance === "faible") {
    ajouter({ type: "alerte_controle", texte: `Confiance faible de l'agent dans ce diagnostic${sortie.verification?.trim() ? ` ; à vérifier : ${sortie.verification.trim()}` : ""}.` });
  }
  for (const p of controlerSortieIterationPlan(sortie, plan)) ajouter(versAvertissement(p));
  const recopies = motsRecopiesDeLaConsigne(plan.consigne, a.passages.map((p) => p.apres), Object.values(plan.sections).join(" "));
  if (recopies.length > 0) ajouter({ type: "info", texte: `Mots de ta consigne recopiés tels quels dans le prompt anglais : ${recopies.join(", ")} (à vérifier : ils doivent être traduits).` });
  const description = descriptionChangee(sortie, plan) ? { description: sortie.nouvelleDescription!.trim() } : {};
  if (description.description && etatEnFinDePlan(description.description) !== etatEnFinDePlan(plan.description)) {
    ajouter({ type: "info", texte: "L'état de fin du plan a changé : le plan suivant n'a pas été revérifié." });
  }
  let apres: ApresFiche = { sections: a.sections, passages: a.passages, ...description };
  if (aDesOpsReferences(sortie)) {
    // Références : le code applique les passages, puis retire/ajoute, renumérote et résout les marqueurs ; l'écriture
    // porte alors la liste COMPLÈTE des références (picture/audio) et les sections touchées.
    const r = appliquerOpsReferences({ ...plan.sections, ...a.sections }, plan.refs, plan.registre ?? [], sortie.references ?? {});
    for (const p of r.problemes) ajouter(versAvertissement(p));
    const touchees = Object.fromEntries(Object.entries(r.sections).filter(([k, v]) => v !== (plan.sections[k] ?? "")));
    apres = { sections: touchees as SectionsFiche, passages: a.passages, ...description, ...(r.refs ? { refs: r.refs } : {}) };
    for (const l of r.resume) ajouter({ type: "info", texte: l });
  }
  return [
    {
      groupe: "fiches",
      cibleType: "fiche",
      cibleRef: plan.uuid,
      libelle: `Fiche de plan · ${plan.titre} · correction après visionnage`,
      operation: "modifier",
      apres,
      avertissements,
    },
  ];
}

const aDesOpsReferences = (s: Pick<SortieIterationPlan, "references">): boolean => (s.references?.ajouter?.length ?? 0) + (s.references?.retirer?.length ?? 0) > 0;

/** Les contrôles propres aux références : codes du registre (une image, ni voix ni son), pas déjà au plan, six images au plus. */
function controlerReferences(ops: OpsReferences | undefined, ctx: ContexteIteration): ProblemeIteration[] {
  const problemes: ProblemeIteration[] = [];
  if (!ops) return problemes;
  const images = ctx.refs.filter((r) => r.type === "picture");
  const codesImages = new Set(images.map((r) => r.asset).filter((c): c is string => !!c));
  const registre = new Map((ctx.registre ?? []).map((a) => [a.code, a.type]));
  for (const code of ops.retirer ?? []) {
    if (!codesImages.has(code)) problemes.push({ niveau: "erreur", regle: "retrait-inconnu", message: `references.retirer : ${code} n'est pas une référence d'image de ce plan.` });
  }
  const retires = new Set(ops.retirer ?? []);
  const ajoutes = new Set<string>();
  for (const r of ops.ajouter ?? []) {
    const type = registre.get(r.asset);
    if (type == null) problemes.push({ niveau: "erreur", regle: "ajout-inconnu", message: `references.ajouter : ${r.asset} n'existe pas au registre ; n'utilise que des codes du registre (la création d'un asset se propose à part).` });
    else if (type === "voix" || type === "sfx") problemes.push({ niveau: "erreur", regle: "ajout-nature", message: `references.ajouter : ${r.asset} (${type}) n'est pas une référence d'image.` });
    else if (codesImages.has(r.asset) && !retires.has(r.asset)) problemes.push({ niveau: "erreur", regle: "ajout-doublon", message: `references.ajouter : ${r.asset} est déjà une référence de ce plan.` });
    else if (ajoutes.has(r.asset)) problemes.push({ niveau: "erreur", regle: "ajout-doublon", message: `references.ajouter : ${r.asset} est cité deux fois.` });
    ajoutes.add(r.asset);
  }
  const total = images.length - [...retires].filter((c) => codesImages.has(c)).length + ajoutes.size;
  if (total > MAX_REFS.picture) problemes.push({ niveau: "erreur", regle: "trop-d-images", message: `${total} images de référence après la correction : ${MAX_REFS.picture} au plus ; retires-en une.` });
  return problemes;
}

const echapperRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Applique des ajouts et retraits de références à un prompt DÉJÀ ASSEMBLÉ (`sections`, passages de la correction compris) :
 * les images restantes sont renumérotées 1..n, les lignes de définition et de rétention suivent, les mentions en prose
 * d'une référence retirée reprennent son nom, et le marqueur `[[CODE]]` d'une référence ajoutée devient son `<Subject N>`.
 * Renvoie les sections finales et la liste COMPLÈTE des références picture/audio (celle que l'applicateur `fiche` écrit),
 * ou `refs: null` si une référence actuelle n'a pas d'asset (rien n'est alors modifié côté références). Pur, testé. */
export function appliquerOpsReferences(
  sections: Partial<Record<string, string>>,
  refsActuelles: ContexteIteration["refs"],
  registre: { code: string; type: string }[],
  ops: OpsReferences,
): { sections: Record<string, string>; refs: RefFiche[] | null; problemes: ProblemeIteration[]; resume: string[] } {
  const problemes: ProblemeIteration[] = [];
  const resume: string[] = [];
  let courant: Record<string, string> = Object.fromEntries(SECTIONS_FICHE.map((k) => [k, sections[k] ?? ""]));
  const utiles = refsActuelles.filter((r) => r.type === "picture" || r.type === "audio");
  if (utiles.some((r) => !r.asset)) {
    problemes.push({ niveau: "erreur", regle: "ref-sans-asset", message: "Une référence actuelle du plan n'est liée à aucun asset : l'agent ne peut pas modifier les références (corrige-les à la main)." });
    return { sections: courant, refs: null, problemes, resume };
  }
  const connus = new Set(registre.map((a) => a.code));
  let images = utiles.filter((r) => r.type === "picture").sort((a, b) => a.slot - b.slot);
  const sons = utiles.filter((r) => r.type === "audio");

  // Retraits : lignes retirées, mentions reprises en prose, images restantes renumérotées comme dans la base.
  for (const code of ops.retirer ?? []) {
    const r = images.find((x) => x.asset === code);
    if (!r) continue;
    const restantes = images.filter((x) => x !== r);
    const renum = compacterImages(restantes.map((x) => x.slot));
    courant = retirerReference(courant, { type: "picture", slot: r.slot, nom: nomDepuisCode(code) }, renum);
    images = restantes.map((x) => ({ ...x, slot: renum.get(x.slot)! }));
    resume.push(`Référence retirée : ${code} (les images restantes sont renumérotées).`);
  }
  // Ajouts : prochain slot libre, lignes de définition et de rétention ; le marqueur [[CODE]] devient son label.
  for (const a of ops.ajouter ?? []) {
    if (!connus.has(a.asset) || images.some((x) => x.asset === a.asset)) continue;
    const slot = images.length + 1;
    const nom = (a.nom ?? "").trim() || nomDepuisCode(a.asset);
    courant = ajouterReference(courant, { type: "picture", slot, nom, vfx: a.asset.startsWith("VFX_") });
    images = [...images, { type: "picture", slot, asset: a.asset, role: a.role ?? null }];
    const marqueur = new RegExp(`\\[\\[\\s*${echapperRe(a.asset)}\\s*\\]\\]`, "g");
    courant = Object.fromEntries(Object.entries(courant).map(([k, v]) => [k, v.replace(marqueur, `<Subject ${slot}>`)]));
    resume.push(`Référence ajoutée : ${a.asset} → <Subject ${slot}> / <Picture ${slot}>${(a.role ?? "").trim() ? ` (${a.role!.trim()})` : ""}.`);
  }
  const refs: RefFiche[] = [
    ...images.map((r) => ({ type: "picture" as const, slot: r.slot, asset: r.asset!, role: r.role ?? null, retention: null })),
    ...sons.map((r) => ({ type: "audio" as const, slot: r.slot, asset: r.asset!, role: r.role ?? null, retention: r.retention ?? null })),
  ];
  return { sections: courant, refs, problemes, resume };
}

/** Le diagnostic à afficher, depuis le JSON validé du skill (agent_runs.resultat) ; null s'il n'en a pas la forme. */
export function diagnosticIteration(json: unknown): DiagnosticIteration | null {
  if (!json || typeof json !== "object") return null;
  const s = json as Partial<SortieIterationPlan>;
  if (typeof s.symptome !== "string" || typeof s.cause !== "string" || typeof s.dureeCoherente !== "boolean") return null;
  const confiance = s.confiance === "haute" || s.confiance === "moyenne" || s.confiance === "faible" ? s.confiance : "faible";
  const l = s.entreeLexique;
  return {
    symptome: s.symptome,
    cause: s.cause,
    categorie: typeof s.categorie === "string" ? s.categorie : null,
    confiance,
    verification: typeof s.verification === "string" && s.verification.trim() ? s.verification.trim() : null,
    dureeCoherente: s.dureeCoherente,
    nbPassages: Array.isArray(s.changements) ? s.changements.length : 0,
    entreeLexique: l && typeof l.symptome === "string" && typeof l.cause === "string" && typeof l.formulationQuiTient === "string" ? l : null,
    abandon: s.abandon && typeof s.abandon.propose === "boolean" ? { propose: s.abandon.propose, raison: s.abandon.raison ?? "" } : null,
    reecriture: s.reecriture === true && typeof s.nouvelleDescription === "string" && s.nouvelleDescription.trim() ? { description: s.nouvelleDescription.trim() } : null,
    assetsSuggeres: (Array.isArray(s.assetsManquants) ? s.assetsManquants : [])
      .filter((a): a is NonNullable<SortieIterationPlan["assetsManquants"]>[number] => !!a && typeof a.code === "string" && typeof a.type === "string")
      .map((a) => ({ code: a.code, type: a.type, ...(typeof a.parent === "string" && a.parent.trim() ? { parent: a.parent.trim() } : {}), raison: typeof a.raison === "string" ? a.raison : "" })),
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

/** L'historique depuis les propositions `iteration-plan` du plan (les plus anciennes d'abord, les `max` dernières)
 * et les dates de fin de ses rendus. Une proposition sans diagnostic (échouée, en cours) n'en fait pas partie. */
export function historiqueIteration(
  propositions: { createdAt: Date; appliedAt: Date | null; statut: string; consigne: string; resultat: unknown; nbChangements: number }[],
  rendusTermines: Date[],
  max = 8,
): CorrectionPassee[] {
  const lignes: CorrectionPassee[] = [];
  for (const p of [...propositions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const d = diagnosticIteration(p.resultat);
    if (!d) continue;
    const appliquee = (p.statut === "appliquee" || p.statut === "partielle") && p.appliedAt != null;
    lignes.push({
      le: p.createdAt.toISOString().slice(0, 16).replace("T", " "),
      ceQuiAvaitEteVu: p.consigne,
      symptome: d.symptome,
      cause: d.cause,
      categorie: d.categorie,
      issue: appliquee ? "appliquee" : p.nbChangements === 0 ? "sans_ecriture" : "non_appliquee",
      renduDepuis: appliquee && rendusTermines.some((r) => r.getTime() > p.appliedAt!.getTime()),
    });
  }
  return lignes.slice(-max);
}

/** Le contexte de contrôle depuis l'ENTRÉE du skill (celle que le worker envoie, voir entreeIterationPlan) : le
 * contrôleur sémantique n'a que ça. */
export function contexteDepuisEntree(entree: unknown): ContexteIteration {
  const e = (entree ?? {}) as {
    promptActuel?: Record<string, unknown>;
    references?: { type?: string; slot?: number; asset?: string | null; role?: string | null; retention?: string | null }[];
    registre?: { code?: string; type?: string }[];
    plan?: { dureeVoulueSecondes?: number; intention?: string };
    rendu?: { dureeReelleSecondes?: number };
  };
  const sections: Record<string, string> = {};
  for (const [k, v] of Object.entries(e.promptActuel ?? {})) if (typeof v === "string") sections[k] = v;
  const refs: ContexteIteration["refs"] = [];
  for (const r of e.references ?? []) {
    if (typeof r.slot !== "number") continue;
    if (r.type === "picture" || r.type === "audio" || r.type === "video") refs.push({ type: r.type, slot: r.slot, asset: r.asset ?? null, role: r.role ?? null, retention: r.retention ?? null });
  }
  return {
    description: e.plan?.intention,
    consigne: (e as { retourVisionnage?: string }).retourVisionnage,
    consignes: [(e as { retourVisionnage?: string }).retourVisionnage ?? "", ...(((e as { historique?: { ceQuiAvaitEteVu?: string }[] }).historique ?? []).map((h) => h.ceQuiAvaitEteVu ?? ""))].filter((c) => c.trim()),
    motsAnglais: Array.isArray((e as { motsDeReference?: unknown }).motsDeReference) ? ((e as { motsDeReference: string[] }).motsDeReference) : undefined,
    sections,
    refs,
    registre: (e.registre ?? []).filter((a): a is { code: string; type: string } => typeof a.code === "string" && typeof a.type === "string"),
    dureeGenerationSecondes: e.plan?.dureeVoulueSecondes ?? 0,
    dureeReelleSecondes: typeof e.rendu?.dureeReelleSecondes === "number" ? e.rendu.dureeReelleSecondes : null,
  };
}
