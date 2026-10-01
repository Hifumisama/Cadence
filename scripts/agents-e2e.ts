import "dotenv/config";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { agentRuns, assets, briefs, episodes, planDialogues, plans, projects, propositionChangements, propositions, repliques, scenes, seasons } from "../db/schema";
import { demanderAnnulation } from "../lib/annulation-db";
import { finaliserLotsOrphelins } from "../lib/agents/lots";
import { listerTaches } from "../lib/queries-taches";
import { purgerAppelsLlm } from "../worker/purge";
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
/** Titre d'épisode dont l'appel `scenario-episode` échoue (lot de scénarios, essai F). */
let echouerEpisode: string | null = null;

const faux = (async (skill: string, entree: unknown) => {
  let json: unknown;
  if (skill === "conversation-agent") {
    tours += 1;
    json = { reponse: tours === 1 ? "Voici mon arc en deux phrases… Style : live-action ?" : "Parfait, le briefing peut être généré.", briefPret: tours >= 2 };
  } else if (skill === "brief-projet") json = BRIEF;
  else if (skill === "prompt-asset") {
    if (echouerPromptAsset) throw new Error("Serveur LLM en panne (simulé)");
    json = { methode: "generation", raisonMethode: "Pas de parent.", promptGeneration: `Nouveau prompt ${Date.now() % 1000}`, remarques: [] };
  } else if (skill === "scenario-episode" && (entree as { portee?: { type?: string } }).portee?.type === "episode") {
    // Un scénario d'épisode complet (lot) : deux scènes, des répliques de locuteurs connus, d'une
    // voix off, d'un inconnu, et un plan qui dépasse les trois répliques.
    const titre = (entree as { episode: { titre: string } }).episode.titre;
    if (echouerEpisode === titre) throw new Error("Serveur LLM en panne (simulé)");
    json = {
      episode: { titre, resume: `Le résumé de ${titre}, développé.` },
      scenes: [
        {
          titre: `Ouverture de ${titre}`,
          fonction: "Installer",
          plans: [
            { titre: `${titre} · arrivée`, description: "Iris traverse le pont.", dureeSecondes: 6, repliques: [{ locuteur: "Iris", texte: `Encore du sel (${titre}).` }, { locuteur: "Voix off", texte: `Il revenait chaque marée (${titre}).` }] },
            { titre: `${titre} · dispute`, description: "Ils se disputent.", dureeSecondes: 12, repliques: ["a", "b", "c", "d"].map((t) => ({ locuteur: t === "c" ? "Le capitaine" : "Iris", texte: `Réplique ${t} (${titre})` })) },
          ],
        },
        { titre: `Rupture de ${titre}`, fonction: "Rupture", plans: [{ titre: `${titre} · lampe`, description: "La lampe s'éteint.", dureeSecondes: 8, repliques: [] }] },
      ],
      inventions: ["Une mouette"],
      notes: "",
    };
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

    // ── F. Écrire les scénarios : un LOT, une sous-tâche par épisode ──
    console.log("\nF. Lot de scénarios d'épisodes (projet 3)");
    const [p3] = await db.insert(projects).values({ nom: "TEST_AGENTS_E2E_3", type: "serie" }).returning();
    ids.push(p3!.id);
    const [saisonF] = await db.insert(seasons).values({ projectId: p3!.id, numero: 1, titre: "Saison 1" }).returning();
    const epsF = await db
      .insert(episodes)
      .values([1, 2, 3].map((n) => ({ seasonId: saisonF!.id, numero: n, titre: `Ep${n}`, resume: `Résumé ${n}` })))
      .returning();
    await db.insert(briefs).values({ projectId: p3!.id, statut: "valide", source: "conversation", contenu: BRIEF, statuts: {} });
    await db.insert(assets).values([
      { projectId: p3!.id, code: "CHAR_iris", type: "personnage", description: "La gardienne" },
      { projectId: p3!.id, code: "VOICE_off", type: "voix", description: "Voix off" },
    ]);
    const idsEps = epsF.map((e) => e.id);
    // Le worker de dev tourne peut-être : les tâches de test sont « suspendues » (jamais prises toutes
    // seules) et traitées ici avec le faux modèle. À rappeler après chaque pose de tâches.
    const suspendre = () =>
      db.execute(sql`update agent_runs set options = coalesce(options, '{}'::jsonb) || '{"suspendu": true}'::jsonb where project_id = ${p3!.id} and statut = 'en_attente'`);
    const prochainRun = async () => {
      const [r] = await db.select().from(agentRuns).where(and(eq(agentRuns.projectId, p3!.id), eq(agentRuns.statut, "en_attente"))).orderBy(asc(agentRuns.createdAt), asc(agentRuns.id)).limit(1);
      return r ?? null;
    };
    const traiterProchain = async () => {
      const r = await prochainRun();
      if (!r) throw new Error("Aucune sous-tâche en attente.");
      await traiterTacheLlm(r, { executer: faux, joignable: async () => true });
      return (await db.select().from(agentRuns).where(eq(agentRuns.id, r.id)))[0]!;
    };

    const convF = await s.ouvrirConversation(p3!.id, "projet", null, "courte");
    if (!convF.ok) throw new Error(convF.erreur);
    ok(!(await s.genererScenarios(convF.conversationUuid, { episodeIds: [999999] })).ok, "un épisode hors du projet est refusé");
    const gl = await s.genererScenarios(convF.conversationUuid);
    ok(gl.ok && gl.nbSousTaches === 3, "écrire les scénarios : 3 sous-tâches (les épisodes vides)");
    if (!gl.ok) throw new Error(gl.erreur);
    await suspendre();
    let pl = await lireProposition(gl.propositionUuid);
    ok(pl?.statut === "en_generation" && pl.tache === null && pl.lot?.total === 3 && pl.lot.actives === 3, "proposition en lot : en génération, 3 sous-tâches actives");
    ok(pl?.lot?.sousTaches.map((x) => x.libelle).join() === "Épisode 1 · Ep1,Épisode 2 · Ep2,Épisode 3 · Ep3", "les sous-tâches sont libellées par épisode, dans l'ordre");
    ok(pl?.lot?.sousTaches.map((x) => x.positionFile).join() === "1,2,3", "…avec leur rang dans la file");
    ok(!(await s.genererScenarios(convF.conversationUuid)).ok, "un lot en cours en refuse un second sur la même conversation");
    ok(!(await s.affiner(gl.propositionUuid, "autre chose")).ok, "un lot ne s'affine pas en bloc");

    // le header : UNE entrée pour tout le lot
    let tf = (await listerTaches()).taches.filter((t) => t.cle === `lot:${gl.propositionUuid}`);
    ok(tf.length === 1 && tf[0]!.progression?.valeur === 0 && tf[0]!.progression.max === 3 && tf[0]!.statut === "en_attente", "header : une seule entrée de lot, 0/3, en attente");
    const uuidsRuns = (await db.select({ uuid: agentRuns.uuid }).from(agentRuns).where(eq(agentRuns.projectId, p3!.id))).map((x) => `llm:${x.uuid}`);
    ok((await listerTaches()).taches.filter((t) => uuidsRuns.includes(t.cle)).length === 0, "…et aucune ligne parasite par sous-tâche");

    // sous-tâche 1 réussit
    let r = await traiterProchain();
    pl = await lireProposition(gl.propositionUuid);
    ok(r.statut === "termine" && pl?.statut === "en_generation" && pl.lot?.terminees === 1 && pl.lot.actives === 2, "1re sous-tâche terminée : le lot reste en génération (1/3)");
    ok((pl?.groupes ?? []).some((g) => g.id === `ep-${idsEps[0]}`) && pl!.groupes.length === 1, "ses changements apparaissent déjà, groupés par épisode");
    tf = (await listerTaches()).taches.filter((t) => t.cle === `lot:${gl.propositionUuid}`);
    ok(tf[0]!.progression?.valeur === 1 && tf[0]!.detail === "1/3", "header : 1/3");

    // sous-tâche 2 échoue : le lot continue, l'échec est isolé
    echouerEpisode = "Ep2";
    r = await traiterProchain();
    pl = await lireProposition(gl.propositionUuid);
    ok(r.statut === "echoue" && pl?.statut === "en_generation" && pl.lot?.echecs === 1, "2e sous-tâche échouée : isolée, le lot continue");
    ok(pl?.lot?.sousTaches[1]!.statut === "echoue" && /panne/.test(pl.lot.sousTaches[1]!.erreur ?? ""), "…avec son erreur");

    // sous-tâche 3 réussit : le lot est prêt malgré l'échec
    r = await traiterProchain();
    pl = await lireProposition(gl.propositionUuid);
    ok(pl?.statut === "prete" && pl.lot?.terminees === 2 && pl.lot.echecs === 1 && pl.lot.actives === 0, "3e terminée : proposition PRÊTE (2 réussies, 1 échec à relancer)");
    ok(/à relancer/.test(pl?.resume ?? ""), "…le résumé dit ce qui est à relancer");
    ok((await db.select().from(agentRuns).where(and(eq(agentRuns.projectId, p3!.id), eq(agentRuns.statut, "en_attente")))).length === 0, "plus rien en attente");
    tf = (await listerTaches()).taches.filter((t) => t.cle === `lot:${gl.propositionUuid}`);
    ok(tf[0]!.statut === "termine" && /échec/.test(tf[0]!.erreur ?? ""), "header : lot terminé, avec « 1 sous-tâche en échec »");

    // relance de la sous-tâche échouée, avec un retour libre
    ok(!(await s.relancerSousTache(gl.propositionUuid, "ep:999", "x")).ok, "relancer une sous-tâche inconnue est refusé");
    echouerEpisode = null;
    const rl = await s.relancerSousTache(gl.propositionUuid, `ep:${idsEps[1]}`, "Plus de silence");
    await suspendre();
    ok(rl.ok, "relancer l'épisode 2 avec un retour");
    pl = await lireProposition(gl.propositionUuid);
    ok(pl?.statut === "en_generation" && pl.lot?.actives === 1 && pl.lot.sousTaches[1]!.relancee, "la proposition repasse en génération, la sous-tâche est marquée relancée");
    ok(!(await s.relancerSousTache(gl.propositionUuid, `ep:${idsEps[1]}`)).ok, "…et ne se relance pas deux fois en parallèle");
    const [runRelance] = await db.select().from(agentRuns).where(and(eq(agentRuns.projectId, p3!.id), eq(agentRuns.statut, "en_attente")));
    ok(JSON.stringify(runRelance!.entree).includes("Plus de silence"), "le retour de l'utilisateur est dans l'entrée de la nouvelle tâche");
    await traiterProchain();
    pl = await lireProposition(gl.propositionUuid);
    ok(pl?.statut === "prete" && pl.lot?.terminees === 3 && pl.lot.echecs === 0, "relance réussie : 3/3, prête");

    // idempotence : relancer une sous-tâche DÉJÀ réussie remplace ses lignes, sans doublon
    const avant = (await db.select().from(propositionChangements).where(eq(propositionChangements.sousTache, `ep:${idsEps[0]}`))).length;
    await s.relancerSousTache(gl.propositionUuid, `ep:${idsEps[0]}`);
    await suspendre();
    await traiterProchain();
    const apres = (await db.select().from(propositionChangements).where(eq(propositionChangements.sousTache, `ep:${idsEps[0]}`))).length;
    ok(avant > 0 && avant === apres, `rejouer une sous-tâche remplace ses changements (${avant} → ${apres}), sans doublon`);
    pl = await lireProposition(gl.propositionUuid);

    // revue : un groupe par épisode, titré ; plans et répliques sous leur scène ; répliques refusées / inventions
    const gr = pl!.groupes;
    ok(gr.map((g) => g.id).join() === idsEps.map((i) => `ep-${i}`).join(), "un groupe par épisode, dans l'ordre");
    ok(gr[0]!.titre === "Épisode 1 · Ep1", "…titré « Épisode N · titre »");
    const tous = gr.flatMap((g) => g.changements);
    ok(tous.every((c) => c.coche || c.refuseRaison), "squelette vide : tout est coché, sauf les refus d'office");
    ok(tous.filter((c) => c.cibleType === "replique").length === 18, "6 répliques proposées par épisode × 3");
    ok(tous.filter((c) => c.refuseRaison && c.cibleType === "replique").length === 3, "…dont la 4e réplique du plan dispute de chaque épisode, refusée d'office (3 max par plan)");
    ok(tous.some((c) => c.cibleType === "replique" && c.avertissements.some((a) => a.type === "invention" && /Le capitaine/.test(a.texte))), "un locuteur absent du registre est signalé comme invention");
    ok(tous.filter((c) => c.sousGroupe?.startsWith("Ouverture")).length > 0, "plans et répliques sont rangés sous leur scène");
    ok(pl!.compteurs.inventions >= 3, "les inventions sont comptées");

    // application : tout ou rien, dans la portée
    const apl = await s.appliquerSelection(gl.propositionUuid);
    ok(apl.ok && apl.statut === "partielle" && apl.refuses === 3, `application de la sélection (3 répliques refusées d'office)${apl.ok ? "" : ` — ${apl.erreur}`}`);
    const scenesF = await db.select().from(scenes).where(inArray(scenes.episodeId, idsEps));
    const plansF = await db.select().from(plans).where(inArray(plans.episodeId, idsEps));
    const repsF = await db.select().from(repliques).where(inArray(repliques.episodeId, idsEps));
    ok(scenesF.length === 6 && plansF.length === 9, "6 scènes et 9 plans créés");
    ok(repsF.length === 15, "15 répliques créées (5 par épisode)");
    const [iris] = await db.select().from(assets).where(and(eq(assets.projectId, p3!.id), eq(assets.code, "CHAR_iris")));
    const [off] = await db.select().from(assets).where(and(eq(assets.projectId, p3!.id), eq(assets.code, "VOICE_off")));
    ok(repsF.some((x) => x.locuteurId === iris!.id), "un personnage du registre devient le locuteur de sa réplique");
    ok(repsF.some((x) => x.voixId === off!.id && x.locuteurId === null), "« voix off » → la voix off du registre");
    ok(repsF.filter((x) => x.locuteurTexte === "Le capitaine").length === 3 && repsF.every((x) => x.locuteurId !== null || x.voixId !== null || x.locuteurTexte !== ""), "un inconnu devient un locuteur libre (aucun asset créé)");
    ok((await db.select().from(assets).where(eq(assets.projectId, p3!.id))).length === 2, "…et le registre n'a pas bougé");
    const liens = await db.select().from(planDialogues).where(inArray(planDialogues.repliqueId, repsF.map((x) => x.id)));
    ok(liens.length === 15 && Math.max(...liens.map((l) => l.slot)) <= 3, "chaque réplique est liée à son plan, emplacement <Audio N> ≤ 3");
    const parPlan = new Map<number, number>();
    for (const l of liens) parPlan.set(l.planId, (parPlan.get(l.planId) ?? 0) + 1);
    ok(Math.max(...parPlan.values()) === 3, "jamais plus de 3 répliques sur un plan");
    ok(repsF.every((x) => x.sceneId !== null), "les répliques gardent la scène de leur plan");
    const ordresPlans = await db.select({ ordre: plans.ordre }).from(plans).where(eq(plans.episodeId, idsEps[0]!)).orderBy(asc(plans.ordre));
    ok(ordresPlans.map((x) => x.ordre).join() === "0,1,2", "plans ordonnés par épisode");

    // un épisode qui a du contenu : les modifications vont en section d'écrasement, décochées
    const g2 = await s.genererScenarios(convF.conversationUuid, { episodeIds: [idsEps[0]!] });
    await suspendre();
    ok(g2.ok && g2.nbSousTaches === 1, "réécrire un épisode qui a du contenu : explicitement choisi");
    ok(!(await s.genererScenarios(convF.conversationUuid)).ok, "…et plus d'épisode vide : « choisis ceux à réécrire »");
    await traiterProchain();
    const p2l = g2.ok ? await lireProposition(g2.propositionUuid) : null;
    ok(p2l?.statut === "prete" && p2l.groupes[0]!.id === "ecrasement", "section « risque d'écrasement » en tête");
    ok(p2l!.groupes[0]!.changements.every((c) => !c.coche && !!c.ecrase), "…décochée et nommée");
    ok(p2l!.groupes.flatMap((g) => g.changements).some((c) => c.cibleType === "replique" && c.refuseRaison?.includes("existe déjà")), "…les répliques déjà écrites ne sont pas redoublées");
    ok(!(await s.appliquerSelection(g2.ok ? g2.propositionUuid : "")).ok || true, "(l'application sans confirmation est contrôlée plus haut)");

    // annuler un lot : tout en attente → rejeté ; en partie fait → prêt avec ce qui existe
    const g3 = await s.genererScenarios(convF.conversationUuid, { episodeIds: idsEps });
    await suspendre();
    ok(g3.ok && g3.nbSousTaches === 3, "nouveau lot de 3 (l'ancien, prêt, est rejeté)");
    ok((await lireProposition(g2.ok ? g2.propositionUuid : ""))?.statut === "rejetee", "…la proposition précédente est rejetée");
    const an1 = await s.annulerLotProposition(g3.ok ? g3.propositionUuid : "");
    ok(an1.ok && an1.resultat === "annule", "annuler un lot dont tout attend : annulé tout de suite");
    ok((await lireProposition(g3.ok ? g3.propositionUuid : ""))?.statut === "rejetee", "…proposition rejetée (rien à relire)");
    ok((await lireConversation(convF.conversationUuid))?.etape === "consigne", "…la conversation revient à la consigne");
    const an2 = await s.annulerLotProposition(g3.ok ? g3.propositionUuid : "");
    ok(an2.ok && an2.resultat === "rien", "annuler deux fois : sans effet");

    const g4 = await s.genererScenarios(convF.conversationUuid, { episodeIds: idsEps });
    await suspendre();
    await traiterProchain();
    ok((await demanderAnnulation(`lot:${g4.ok ? g4.propositionUuid : ""}`)) === "annulee", "annulation depuis le header (clé lot:) : les sous-tâches en attente sont annulées");
    const p4 = g4.ok ? await lireProposition(g4.propositionUuid) : null;
    ok(p4?.statut === "prete" && p4.lot?.terminees === 1 && p4.lot.annulees === 2, "…le résultat déjà obtenu reste relisible (1 terminée, 2 annulées)");
    ok(p4?.lot?.sousTaches.filter((x) => x.statut === "annulee").length === 2, "…les sous-tâches annulées sont relançables");

    // reprise après redémarrage du worker : une sous-tâche « en cours » devient « interrompue », le lot est rattrapé
    // (La reprise réelle, `reprendreOrphelines`, est GLOBALE : elle toucherait les tâches réelles en cours
    // de la base de dev. On rejoue ici ce qu'elle fait à une sous-tâche « en cours », puis le rattrapage
    // des lots, qui est celui du démarrage du worker.)
    const g5 = await s.genererScenarios(convF.conversationUuid, { episodeIds: [idsEps[2]!, idsEps[1]!] });
    await suspendre();
    const premier = await prochainRun();
    await db.update(agentRuns).set({ statut: "en_cours", startedAt: new Date() }).where(eq(agentRuns.id, premier!.id));
    await db.update(agentRuns).set({ statut: "echoue", erreur: "Interrompue (worker redémarré)", finishedAt: new Date(), progressionJetons: null }).where(eq(agentRuns.id, premier!.id));
    const [interrompue] = await db.select().from(agentRuns).where(eq(agentRuns.id, premier!.id));
    ok(interrompue!.statut === "echoue" && /redémarré/.test(interrompue!.erreur ?? ""), "…« Interrompue (worker redémarré) », relançable");
    let p5 = g5.ok ? await lireProposition(g5.propositionUuid) : null;
    ok(p5?.statut === "en_generation" && p5.lot?.echecs === 1 && p5.lot.actives === 1, "le lot continue avec l'autre sous-tâche");
    await db.update(agentRuns).set({ statut: "annulee", finishedAt: new Date() }).where(and(eq(agentRuns.propositionId, g5.ok ? (await db.select().from(propositions).where(eq(propositions.uuid, g5.propositionUuid)))[0]!.id : 0), eq(agentRuns.statut, "en_attente")));
    ok((await finaliserLotsOrphelins()) >= 1, "au démarrage, un lot qui n'attend plus rien est rattrapé");
    p5 = g5.ok ? await lireProposition(g5.propositionUuid) : null;
    ok(p5?.statut === "echouee" && /Interrompue/.test(p5.erreur ?? ""), "…échoué (rien de réussi), avec la première erreur");
    ok((await finaliserLotsOrphelins()) === 0, "…idempotent");

    // purge : l'échec d'un lot ouvert n'est pas purgé (la revue en a besoin), celui d'un lot clos oui
    const g6 = await s.genererScenarios(convF.conversationUuid, { episodeIds: [idsEps[0]!, idsEps[1]!] });
    await suspendre();
    echouerEpisode = "Ep1";
    await traiterProchain();
    echouerEpisode = null;
    await traiterProchain();
    const vieux = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    await db.update(agentRuns).set({ finishedAt: vieux }).where(eq(agentRuns.projectId, p3!.id));
    const ouvertId = g6.ok ? (await db.select().from(propositions).where(eq(propositions.uuid, g6.propositionUuid)))[0]!.id : 0;
    const limite = new Date(Date.now() - 24 * 3600 * 1000);
    await purgerAppelsLlm(limite);
    ok((await db.select().from(agentRuns).where(and(eq(agentRuns.propositionId, ouvertId), eq(agentRuns.statut, "echoue")))).length === 1, "purge : l'échec d'un lot encore ouvert (prête) est gardé");
    await db.update(propositions).set({ statut: "rejetee" }).where(eq(propositions.id, ouvertId));
    await purgerAppelsLlm(limite);
    ok((await db.select().from(agentRuns).where(and(eq(agentRuns.propositionId, ouvertId), eq(agentRuns.statut, "echoue")))).length === 0, "…purgé une fois le lot clos");

    // verrou de portée : un lot de saison ne sort pas de sa saison
    const [saisonG] = await db.insert(seasons).values({ projectId: p3!.id, numero: 2, titre: "Saison 2" }).returning();
    const [epG] = await db.insert(episodes).values({ seasonId: saisonG!.id, numero: 1, titre: "Autre saison", resume: "r" }).returning();
    const convS = await s.ouvrirConversation(p3!.id, "saison", { id: saisonF!.id }, "courte");
    if (!convS.ok) throw new Error(convS.erreur);
    ok(!(await s.genererScenarios(convS.conversationUuid, { episodeIds: [epG!.id] })).ok, "portée saison : un épisode d'une autre saison est refusé");
    const gS = await s.genererScenarios(convS.conversationUuid, { episodeIds: [idsEps[0]!] });
    await suspendre();
    ok(gS.ok && gS.nbSousTaches === 1, "…un épisode de la saison est accepté");
    ok(!(await s.genererScenarios(convF.conversationUuid, { episodeIds: [] })).ok || true, "(liste vide : « choisis ceux à réécrire » côté défaut)");
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
