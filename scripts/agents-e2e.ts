import "dotenv/config";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { agentRuns, assets, briefs, episodes, plans, projects, seasons } from "../db/schema";
import { enregistrerChangements } from "../lib/agents/proposition-db";
import * as s from "../lib/agents/service";
import { lireBrief, lireConversation, lireProposition, listerPropositions } from "../lib/queries-agents";
import type { executerSkill } from "../lib/llm/executer";
import { traiterTacheLlm } from "../worker/llm";

/**
 * Essai de bout en bout du système d'agents, SANS interface et SANS modèle : un FAUX
 * exécuteur rejoue des sorties de skills, le vrai worker (`traiterTacheLlm`) les prend et les
 * convertit en messages / brouillon de brief / changements, dans la base de dev. Tout est
 * supprimé à la fin (les projets de test partent en cascade).
 *
 *   npm run agents:e2e
 */

const echecs: string[] = [];
let nb = 0;
function ok(cond: unknown, msg: string) {
  nb++;
  if (!cond) {
    echecs.push(msg);
    console.error(`  ✖ ${msg}`);
  } else console.log(`  ✔ ${msg}`);
}

// --- le faux modèle ---------------------------------------------------------

const BRIEF = {
  titre: "TEST Le Phare de Sel",
  source: "pitch",
  arc: "Iris garde un phare couvert de sel ; quelque chose revient avec la marée.",
  genreTon: "Mystère calme",
  style: { nom: "Live-action cinématographique", clause: "Cinematic live-action, desaturated blue-grey palette, golden light." },
  langueDialogues: "French",
  dureeEpisodeSecondes: 90,
  episodes: [
    { titre: "Le sel", resume: "Le pont est couvert de sel." },
    { titre: "La marée", resume: "Le bateau revient." },
  ],
  personnages: [{ nom: "Iris", role: "gardienne", reconnaissable: "Cheveux gris attachés", statut: "fourni" }],
  lieux: [{ nom: "Le phare", description: "Tour blanche rongée par le sel", statut: "deduit" }],
  continuite: [],
  rimes: [],
  progressions: [],
  pieges: [],
  inventions: ["Le capitaine est une silhouette"],
  questionsOuvertes: [],
  statuts: { arc: "fourni", style: "a_valider" },
};

let tours = 0;
let dureePlanInsere = 5;
let echouerPromptAsset = false;

const faux = (async (skill: string, entree: unknown) => {
  let json: unknown;
  if (skill === "conversation-agent") {
    tours += 1;
    json = { reponse: tours === 1 ? "Voici mon arc en deux phrases… Style : live-action ?" : "Parfait, le briefing peut être généré.", briefPret: tours >= 2 };
  } else if (skill === "brief-projet") json = BRIEF;
  else if (skill === "prompt-asset") {
    if (echouerPromptAsset) throw new Error("Serveur LLM en panne (simulé)");
    json = { methode: "generation", raisonMethode: "Pas de parent.", promptGeneration: `Nouveau prompt ${Date.now() % 1000}`, remarques: [] };
  } else if (skill === "scenario-episode") {
    const type = (entree as { portee?: { type?: string } }).portee?.type;
    json = {
      episode: { titre: "Ep", resume: "r" },
      scenes: [{ titre: "Scène", fonction: "f", plans: [{ titre: "Plan de coupe", description: "Gros plan sur la main d'Iris.", dureeSecondes: type === "plan-a-inserer" ? dureePlanInsere : 6, repliques: [] }] }],
      inventions: [],
      notes: "",
    };
  } else throw new Error(`Skill inattendu : ${skill}`);
  return { json, reponse: {} as never, usage: { entree: 0, sortie: 0 }, dureeMs: 1, renvois: 0, modele: "faux", skill: { nom: skill, caracteres: 0, jetonsEstimes: 0 } };
}) as unknown as typeof executerSkill;

async function traiter(runUuid: string | null) {
  if (!runUuid) throw new Error("Pas de tâche à traiter.");
  const [run] = await db.select().from(agentRuns).where(eq(agentRuns.uuid, runUuid));
  await traiterTacheLlm(run!, { executer: faux, joignable: async () => true });
  const [apres] = await db.select().from(agentRuns).where(eq(agentRuns.uuid, runUuid));
  return apres!;
}

async function main() {
  const [p1] = await db.insert(projects).values({ nom: "TEST_AGENTS_E2E", type: "serie" }).returning();
  const [p2] = await db.insert(projects).values({ nom: "TEST_AGENTS_E2E_2", type: "serie" }).returning();
  const ids = [p1!.id, p2!.id];
  try {
    // ── A. Création de projet : conversation → brief → squelette → application ──
    console.log("\nA. Création de projet (profondeur complète)");
    const o1 = await s.ouvrirConversation(p1!.id, "projet", null);
    if (!o1.ok) throw new Error(o1.erreur);
    const o1bis = await s.ouvrirConversation(p1!.id, "projet", null);
    ok(!o1.reprise && o1bis.ok && o1bis.reprise && o1bis.conversationUuid === o1.conversationUuid, "rouvrir la même cible reprend la conversation");
    const uuid = o1.conversationUuid;

    const m1 = await s.envoyerMessage(uuid, "Un phare où le sel recouvre tout.");
    ok(m1.ok, "premier message envoyé (tâche posée)");
    ok(!(await s.envoyerMessage(uuid, "Autre chose ?")).ok, "un second tour est refusé tant que le premier tourne");
    const r1 = await traiter(m1.ok ? m1.runUuid : null);
    ok(r1.statut === "termine", "le worker traite le tour");
    let conv = await lireConversation(uuid);
    ok(conv?.messages.length === 2 && conv.messages[1]!.role === "assistant" && conv.briefPret === false, "la réponse de l'agent rejoint la conversation, brief pas prêt");
    const m2 = await s.envoyerMessage(uuid, "Oui, live-action.");
    await traiter(m2.ok ? m2.runUuid : null);
    conv = await lireConversation(uuid);
    ok(conv?.briefPret === true && conv.messages.length === 4, "deuxième tour : l'agent estime le brief prêt");

    const gb = await s.genererBrief(uuid);
    const rb = await traiter(gb.ok ? gb.runUuid : null);
    ok(rb.statut === "termine", "le brief est généré");
    let brief = await lireBrief(p1!.id);
    ok(brief?.statut === "brouillon" && brief.contenu.titre === BRIEF.titre, "un BROUILLON de brief existe");
    ok(brief?.sections.find((x) => x.cle === "arc")?.statut === "fourni" && brief.sections.find((x) => x.cle === "style")?.statut === "a_valider", "les statuts déclarés par l'agent sont conservés");
    ok(!("statuts" in (brief?.contenu ?? {})), "les statuts ne polluent pas le contenu du brief");
    ok((await s.modifierChampBrief(p1!.id, "titre", "TEST Le Phare de Sel 2")).ok, "correction à la main d'une section");
    ok(!(await s.modifierChampBrief(p1!.id, "dureeEpisodeSecondes", "abc")).ok, "une valeur hors schéma est refusée");
    ok(!(await s.modifierChampBrief(p1!.id, "nimportequoi", 1)).ok, "une section inconnue est refusée");
    brief = await lireBrief(p1!.id);
    ok(brief?.sections.find((x) => x.cle === "titre")?.statut === "fourni", "une section corrigée passe à « fourni »");

    // rejeter le brouillon revient à la conversation ; on le régénère ensuite
    ok((await s.rejeterBrief(uuid)).ok && (await lireBrief(p1!.id)) === null, "rejeterBrief : brouillon abandonné");
    conv = await lireConversation(uuid);
    ok(conv?.etape === "conversation" && conv.messages.length === 4, "…conversation conservée, retour à l'étape conversation");
    const gb2 = await s.genererBrief(uuid);
    await traiter(gb2.ok ? gb2.runUuid : null);

    const gp = await s.genererProposition(uuid);
    ok(gp.ok && gp.runUuid === null, "squelette construit en code (aucune tâche LLM)");
    let prop = gp.ok ? await lireProposition(gp.propositionUuid) : null;
    ok(prop?.statut === "prete" && prop.compteurs.total === 4, "proposition prête : brief (qui porte la clause de style), saison, 2 épisodes");
    ok(prop?.compteurs.selectionnes === 4 && prop.groupes.map((g) => g.id).join() === "brief,saison,episodes", "créations cochées, groupes dans l'ordre, plus de groupe « projet »");
    const nb2 = await s.cocherChangements(gp.ok ? gp.propositionUuid : "", { groupe: "episodes" }, false);
    ok(nb2.ok && nb2.modifies === 2, "décocher un groupe entier");
    const ap1 = await s.appliquerSelection(gp.ok ? gp.propositionUuid : "");
    ok(ap1.ok && ap1.statut === "partielle" && ap1.appliques === 2, "application partielle (2 appliqués, 2 écartés)");
    const sais = await db.select().from(seasons).where(eq(seasons.projectId, p1!.id));
    ok(sais.length === 1 && sais[0]!.titre === BRIEF.titre, "la saison existe");
    ok((await db.select().from(episodes).where(eq(episodes.seasonId, sais[0]!.id))).length === 0, "les épisodes écartés n'existent pas");
    const [pr] = await db.select().from(projects).where(eq(projects.id, p1!.id));
    ok(pr!.clauseStyle.startsWith("Cinematic live-action"), "la clause de style du projet suit le brief appliqué");
    brief = await lireBrief(p1!.id);
    ok(brief?.statut === "valide", "le brief devient la référence du projet (valide)");
    ok(!(await s.appliquerSelection(gp.ok ? gp.propositionUuid : "")).ok, "une proposition appliquée ne se réapplique pas");
    ok(!(await s.rejeterBrief(uuid)).ok, "un brief validé ne se rejette pas");
    ok(!(await s.genererBrief(uuid)).ok, "…ni ne se régénère par-dessus");

    // régénérer : la saison existe, les épisodes manquent → application complète
    const gp2 = await s.genererProposition(uuid);
    prop = gp2.ok ? await lireProposition(gp2.propositionUuid) : null;
    ok(prop?.compteurs.total === 2 && prop.groupes.map((g) => g.id).join() === "episodes", "régénéré : seuls les épisodes manquent (saison et brief réutilisés)");
    const ap2 = await s.appliquerSelection(gp2.ok ? gp2.propositionUuid : "");
    ok(ap2.ok && ap2.statut === "appliquee", "application complète");
    const eps = await db.select().from(episodes).where(eq(episodes.seasonId, sais[0]!.id)).orderBy(asc(episodes.numero));
    ok(eps.length === 2 && eps[0]!.titre === "Le sel" && eps[1]!.numero === 2, "les deux épisodes sont créés, numérotés");
    ok((await listerPropositions(p1!.id)).length === 2, "l'historique liste les propositions");

    const neuve = await s.nouvelleConversation(p1!.id, "projet", null);
    ok(neuve.ok && neuve.conversationUuid !== uuid && (await lireConversation(uuid)) === null, "nouvelle conversation : l'ancienne est écrasée");
    ok((await listerPropositions(p1!.id)).length === 2, "…mais l'historique des propositions survit");
    ok(neuve.ok && (await s.reinitialiser(neuve.conversationUuid)).ok, "réinitialiser");

    // ── B. Asset : écrasement d'un validé, confirmation, affinage, portée, échec ──
    console.log("\nB. Prompt d'un asset (profondeur courte)");
    await db.insert(assets).values([
      { projectId: p1!.id, code: "CHAR_e2e", type: "personnage", statut: "valide", description: "Une gardienne", promptGeneration: "old prompt" },
      { projectId: p1!.id, code: "CHAR_autre", type: "personnage", description: "Un autre", promptGeneration: "autre" },
    ]);
    const oa = await s.ouvrirConversation(p1!.id, "asset", { code: "CHAR_e2e" });
    if (!oa.ok) throw new Error(oa.erreur);
    ok((await lireConversation(oa.conversationUuid))?.cible?.code === "CHAR_e2e", "la vue de conversation expose la cible réutilisable ({ code })");
    ok(!(await s.genererProposition(oa.conversationUuid)).ok, "une portée courte exige une consigne");
    const ga = await s.genererProposition(oa.conversationUuid, { consigne: "Regard plus dur" });
    ok(ga.ok && ga.runUuid !== null, "tâche de proposition posée");
    await traiter(ga.ok ? ga.runUuid : null);
    let pa = ga.ok ? await lireProposition(ga.propositionUuid) : null;
    ok(pa?.statut === "prete" && pa.compteurs.total === 1, "proposition d'asset prête");
    const chA = pa!.groupes[0]!.changements[0]!;
    ok(pa!.groupes[0]!.id === "ecrasement" && chA.ecrase !== null && chA.coche === false, "asset validé : section « risque d'écrasement », décoché par défaut");
    ok(pa!.contexte.length > 0 && pa!.contexte.some((c) => c.type === "asset"), "le contexte utilisé est exposé");
    ok(!(await s.appliquerSelection(ga.ok ? ga.propositionUuid : "")).ok, "rien de coché : refusé");
    ok((await s.cocherChangement(chA.id, true)).ok, "cocher l'écrasement");
    const sans = await s.appliquerSelection(ga.ok ? ga.propositionUuid : "");
    ok(!sans.ok && !sans.ok && (sans as { confirmationRequise?: unknown[] }).confirmationRequise?.length === 1, "sans confirmation : refus avec la liste de ce qui sera perdu");
    const avec = await s.appliquerSelection(ga.ok ? ga.propositionUuid : "", { confirmeEcrasement: true });
    ok(avec.ok && avec.statut === "appliquee", "avec confirmation : appliqué");
    const [aAvant] = await db.select().from(assets).where(and(eq(assets.projectId, p1!.id), eq(assets.code, "CHAR_e2e")));
    ok(aAvant!.promptGeneration?.startsWith("Nouveau prompt"), "le prompt de l'asset est remplacé");

    const gb3 = await s.genererProposition(oa.conversationUuid, { consigne: "Plus court" });
    await traiter(gb3.ok ? gb3.runUuid : null);
    const af = await s.affiner(gb3.ok ? gb3.propositionUuid : "", "Garde le regard, rends-le plus court");
    ok(af.ok, "affiner : nouvelle proposition dérivée");
    await traiter(af.ok ? af.runUuid : null);
    const pAf = af.ok ? await lireProposition(af.propositionUuid) : null;
    const pParent = gb3.ok ? await lireProposition(gb3.propositionUuid) : null;
    ok(pAf?.statut === "prete" && pAf.parentUuid === (gb3.ok ? gb3.propositionUuid : null) && pAf.retour?.includes("regard") === true, "…prête, avec son parent et le retour");
    ok(pParent?.statut === "rejetee", "…la précédente est rejetée");

    // verrou de portée : une proposition sur CHAR_e2e ne touche pas CHAR_autre
    const [autre] = await db.select().from(assets).where(eq(assets.code, "CHAR_autre"));
    const [cible] = await db.select().from(assets).where(eq(assets.code, "CHAR_e2e"));
    const bidon = await s.nouvelleConversation(p1!.id, "asset", { code: "CHAR_e2e" });
    const [conv3] = await db.select().from((await import("../db/schema")).agentConversations).where(eq((await import("../db/schema")).agentConversations.uuid, bidon.ok ? bidon.conversationUuid : ""));
    const [propBidon] = await db.insert((await import("../db/schema")).propositions).values({ conversationId: conv3!.id, projectId: p1!.id, skill: "prompt-asset", portee: "asset", cibleId: cible!.id }).returning();
    await db.transaction((tx) =>
      enregistrerChangements(tx, propBidon!.id, p1!.id, { type: "asset", cibleId: cible!.id }, [
        { groupe: "assets", cibleType: "asset", cibleRef: String(autre!.id), libelle: "CHAR_autre · prompt", operation: "modifier", apres: { promptGeneration: "piraté" } },
        { groupe: "plans", cibleType: "plan", cibleRef: "00000000-0000-0000-0000-000000000000", libelle: "Plan fantôme", operation: "modifier", apres: { description: "x" } },
        { groupe: "assets", cibleType: "asset", cibleRef: String(cible!.id), libelle: "CHAR_e2e · prompt", operation: "modifier", apres: { promptGeneration: "légitime" } },
        { groupe: "assets", cibleType: "asset", cibleRef: null, libelle: "Voix", operation: "creer", apres: { type: "voix", suffixe: "x" } },
      ]),
    );
    const pb = await lireProposition(propBidon!.uuid);
    const refus = pb!.groupes.flatMap((g) => g.changements).filter((c) => c.refuseRaison);
    ok(refus.length === 3 && refus.some((c) => /Hors portée/.test(c.refuseRaison ?? "")), "verrou de portée : hors portée, cible introuvable et voix refusés d'office");
    ok(refus.every((c) => !c.coche), "…jamais cochés");
    ok(!(await s.cocherChangement(refus[0]!.id, true)).ok, "…et non cochables");
    const legitime = pb!.groupes.flatMap((g) => g.changements).find((c) => c.libelle === "CHAR_e2e · prompt")!;
    ok(legitime.coche === false && legitime.ecrase !== null, "…le changement légitime écrase un asset validé : décoché par défaut");
    await s.cocherChangement(legitime.id, true);
    const apB = await s.appliquerSelection(propBidon!.uuid, { confirmeEcrasement: true });
    ok(apB.ok && apB.statut === "partielle" && apB.refuses === 3, "seul le changement légitime est appliqué");
    const [autreApres] = await db.select().from(assets).where(eq(assets.code, "CHAR_autre"));
    ok(autreApres!.promptGeneration === "autre", "l'asset hors portée n'a pas bougé");

    // échec de la tâche
    echouerPromptAsset = true;
    const oa2 = await s.nouvelleConversation(p1!.id, "asset", { code: "CHAR_autre" });
    const gf = await s.genererProposition(oa2.ok ? oa2.conversationUuid : "", { consigne: "Test d'échec" });
    const rf = await traiter(gf.ok ? gf.runUuid : null);
    pa = gf.ok ? await lireProposition(gf.propositionUuid) : null;
    ok(rf.statut === "echoue" && pa?.statut === "echouee" && /panne/.test(pa.erreur ?? ""), "échec du modèle : la proposition passe « échouée » avec la raison");
    echouerPromptAsset = false;

    // ── C. Insertion d'un plan à une position ──
    console.log("\nC. Insertion d'un plan dans un épisode");
    const ep1 = eps[0]!;
    const base = [0, 1, 2].map((i) => ({ projectId: p1!.id, episodeId: ep1.id, ordre: i, titre: `P${i + 1}`, dureeMontageSecondes: 6, dureeGenerationSecondes: 6 }));
    const crees = await db.insert(plans).values(base).returning();
    const oe = await s.ouvrirConversation(p1!.id, "episode", { id: ep1.id });
    if (!oe.ok) throw new Error(oe.erreur);
    dureePlanInsere = 17;
    const gi = await s.genererProposition(oe.conversationUuid, { consigne: "Un plan de coupe sur la main d'Iris", position: { apresPlanUuid: crees[1]!.uuid } });
    ok(gi.ok, "insertion demandée après le plan 2 (par uuid)");
    await traiter(gi.ok ? gi.runUuid : null);
    let pi = gi.ok ? await lireProposition(gi.propositionUuid) : null;
    let chI = pi!.groupes.flatMap((g) => g.changements).find((c) => c.cibleType === "plan")!;
    ok(chI.operation === "creer" && "apresPlanUuid" in (chI.position ?? {}), "changement : créer un plan, avec sa position")
    ok(chI.rangsDeplaces.length === 1 && chI.rangsDeplaces[0]!.titre === "P3" && chI.rangsDeplaces[0]!.rangAvant === 3 && chI.rangsDeplaces[0]!.rangApres === 4, "la revue indique les rangs qui bougent (P3 : 3 → 4)");
    ok(chI.bloque && !chI.coche, "durée de 17 s : bloqué par le contrôle, décoché");
    ok(!(await s.cocherChangement(chI.id, true)).ok, "…non cochable tant que ce n'est pas corrigé");
    ok(!(await s.corrigerChangement(chI.id, { dureeGenerationSecondes: 16 })).ok, "…une correction encore trop longue est refusée");
    ok((await s.corrigerChangement(chI.id, { dureeGenerationSecondes: 12 })).ok, "…corrigé sur place (12 s)");
    pi = gi.ok ? await lireProposition(gi.propositionUuid) : null;
    chI = pi!.groupes.flatMap((g) => g.changements).find((c) => c.cibleType === "plan")!;
    ok(!chI.bloque && chI.coche, "…débloqué et coché");
    const api = await s.appliquerSelection(gi.ok ? gi.propositionUuid : "");
    ok(api.ok && api.statut === "appliquee", "plan inséré");
    const ordre = await db.select({ titre: plans.titre, ordre: plans.ordre, duree: plans.dureeGenerationSecondes }).from(plans).where(eq(plans.episodeId, ep1.id)).orderBy(asc(plans.ordre));
    ok(ordre.map((x) => x.titre).join() === "P1,P2,Plan de coupe,P3", "le plan est après P2, avant P3 (rien n'est renuméroté)");
    ok(ordre.map((x) => x.ordre).join() === "0,1,2,3" && ordre[2]!.duree === 12, "ordre dense, durée corrigée appliquée");
    const verrou = (await s.ouvrirConversation(p1!.id, "plan", { id: crees[0]!.id }));
    ok(verrou.ok && (await lireConversation(verrou.conversationUuid))?.cible?.uuid === crees[0]!.uuid, "rouvrir un plan par son id interne fonctionne, et la vue renvoie son uuid");

    // ── D. Brouillon rejeté sur un autre projet ──
    console.log("\nD. Brouillon de brief rejeté (projet 2)");
    const od = await s.ouvrirConversation(p2!.id, "projet", null);
    if (!od.ok) throw new Error(od.erreur);
    tours = 1;
    await traiter((await s.envoyerMessage(od.conversationUuid, "Une série sur un phare.")).ok ? ((await db.select().from(agentRuns).where(and(eq(agentRuns.projectId, p2!.id), eq(agentRuns.statut, "en_attente"))))[0]!.uuid) : null);
    const gd = await s.genererBrief(od.conversationUuid);
    await traiter(gd.ok ? gd.runUuid : null);
    ok((await lireBrief(p2!.id))?.statut === "brouillon", "brouillon généré");
    ok((await s.rejeterBrief(od.conversationUuid)).ok && (await lireBrief(p2!.id)) === null, "rejeterBrief : brouillon supprimé");
    ok((await db.select().from(briefs).where(eq(briefs.projectId, p2!.id))).length === 0, "…aucune ligne de brief ne subsiste");

    // ── E. Le brief est la source unique de la clause de style et des notes ──
    console.log("\nE. Clause de style et notes : source unique = brief (projet 2)");
    const clauseMain = "Flat 2D, bold outlines, limited palette.";
    const e1 = await s.modifierChampBrief(p2!.id, "style", { nom: "2D à plat", clause: clauseMain });
    ok(e1.ok, "éditer le style d'un projet SANS brief crée un brief partiel");
    let b2 = await lireBrief(p2!.id);
    ok(b2?.statut === "partiel" && b2.source === "reconstitue" && b2.sections.map((x) => x.cle).join() === "style,notes", "brief partiel : seules les sections style et notes sont montrées");
    ok(b2?.sections.find((x) => x.cle === "style")?.statut === "fourni", "…le style est « fourni »");
    let [q2] = await db.select().from(projects).where(eq(projects.id, p2!.id));
    ok(q2!.clauseStyle === clauseMain, "projects.clause_style est synchronisée depuis le brief (la génération d'images lit toujours la colonne)");
    ok((await s.modifierChampBrief(p2!.id, "notes", "Rappel : jamais de logo à l'image.")).ok, "les notes se posent aussi");
    [q2] = await db.select().from(projects).where(eq(projects.id, p2!.id));
    ok(q2!.notes === "Rappel : jamais de logo à l'image.", "projects.notes est synchronisée");

    ok(!(await s.genererProposition(od.conversationUuid)).ok, "un brief partiel n'est pas un brief : « génère d'abord le brief »");
    const ge = await s.genererBrief(od.conversationUuid);
    ok(ge.ok, "on peut rédiger le brief par-dessus un brief partiel");
    await traiter(ge.ok ? ge.runUuid : null);
    b2 = await lireBrief(p2!.id);
    ok(b2?.statut === "brouillon" && b2.contenu.style.clause === clauseMain, "le brouillon de l'agent respecte la clause posée à la main (elle gagne sur la sienne)");
    ok(b2?.sections.find((x) => x.cle === "style")?.statut === "fourni", "…et reste « fourni »");
    [q2] = await db.select().from(projects).where(eq(projects.id, p2!.id));
    ok(q2!.clauseStyle === clauseMain && !q2!.clauseStyle.startsWith("Cinematic"), "un brouillon ne synchronise rien : le projet garde sa clause");

    ok((await s.rejeterBrief(od.conversationUuid)).ok, "rejeter le brouillon…");
    b2 = await lireBrief(p2!.id);
    ok(b2?.statut === "partiel" && b2.contenu.style.clause === clauseMain && b2.contenu.arc === "", "…ne perd pas ce qui a été posé à la main : retour en brief partiel (le contenu de l'agent disparaît)");

    const ge2 = await s.genererBrief(od.conversationUuid);
    await traiter(ge2.ok ? ge2.runUuid : null);
    const nc = await s.nouvelleConversation(p2!.id, "projet", null);
    b2 = await lireBrief(p2!.id);
    ok(nc.ok && b2?.statut === "partiel" && b2.contenu.style.clause === clauseMain, "une nouvelle conversation abandonne le brouillon sans perdre le style posé");

    // application : le brief devient la référence, la clause suit
    const ge3 = nc.ok ? await s.envoyerMessage(nc.conversationUuid, "Une série sur un phare.") : null;
    await traiter(ge3 && ge3.ok ? ge3.runUuid : null);
    const ge4 = nc.ok ? await s.genererBrief(nc.conversationUuid) : null;
    await traiter(ge4 && ge4.ok ? ge4.runUuid : null);
    const gpe = nc.ok ? await s.genererProposition(nc.conversationUuid) : null;
    const pe = gpe && gpe.ok ? await lireProposition(gpe.propositionUuid) : null;
    ok(!!pe && !pe.groupes.some((g) => g.id === "projet"), "la proposition ne contient aucun changement « projet »");
    const ape = gpe && gpe.ok ? await s.appliquerSelection(gpe.propositionUuid) : null;
    ok(!!ape && ape.ok, "application de la proposition");
    b2 = await lireBrief(p2!.id);
    [q2] = await db.select().from(projects).where(eq(projects.id, p2!.id));
    ok(b2?.statut === "valide" && b2.contenu.style.clause === clauseMain && q2!.clauseStyle === clauseMain, "brief validé : la clause posée à la main est conservée dans le brief ET dans le projet");

    // édition directe d'un brief validé : la copie suit (un seul chemin d'écriture)
    ok((await s.modifierChampBrief(p2!.id, "style", { nom: "2D à plat", clause: "Cel-shaded 2D, thick ink lines." })).ok, "édition directe de la clause d'un brief validé");
    [q2] = await db.select().from(projects).where(eq(projects.id, p2!.id));
    ok(q2!.clauseStyle === "Cel-shaded 2D, thick ink lines.", "projects.clause_style suit immédiatement");
  } finally {
    await db.delete(agentRuns).where(inArray(agentRuns.projectId, ids));
    await db.delete(projects).where(inArray(projects.id, ids));
    const reste = await db.select({ id: projects.id }).from(projects).where(inArray(projects.id, ids));
    console.log(reste.length === 0 ? "\nNettoyage : projets de test supprimés." : "\n⚠ Nettoyage incomplet !");
  }
  console.log(`\n${nb - echecs.length}/${nb} vérifications réussies.`);
  if (echecs.length) {
    console.error(`Échecs :\n- ${echecs.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
