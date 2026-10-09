import "dotenv/config";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { agentConversations, agentRuns, assets, briefs, episodes, jobs, planDialogues, planPromptSections, plans, projects, repliques, revisionDecisions, scenes, seasons } from "../db/schema";
import { semerLeSel } from "./semis-le-sel";
import type { SortieAnalyse } from "../lib/agents/revision/analyse";
import { abandonnerRevision, appliquerRevision, appliquerSortieAnalyse, conversationRevisionParUuid, envoyerMessageRevision, lireEtatRevision, ouvrirRevision, reconfirmerDecision, relancerTourRevision, retirerDecision } from "../lib/agents/revision/revision-db";
import type { executerSkill } from "../lib/llm/executer";
import { traiterTacheLlm } from "../worker/llm";

/**
 * Essai de bout en bout du MOTEUR de la révision d'épisode, SANS modèle : les sorties de l'analyse sont écrites à la main (ce que
 * le réalisateur rendrait pour les trois parcours de la maquette), le code les range, calcule les constats et applique le chantier
 * dans la vraie base. Tout est supprimé à la fin.
 *
 *   npm run revision:e2e
 *
 * Écrit dans la base de DATABASE_URL : à lancer sur une base jetable (la migration 0054 doit être appliquée).
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

// --- le faux modèle du réalisateur --------------------------------------------------

/** Ce que le faux modèle a reçu et ce que le contrôleur du worker en a dit (la même sémantique qu'un vrai renvoi). */
const vu: { analyse: Record<string, unknown>[]; reponse: Record<string, unknown>[]; soucis: string[][] } = { analyse: [], reponse: [], soucis: [] };
let prochainesAnalyses: SortieAnalyse[] = [];
let tomberEnPanne = false;

const faux = (async (skill: string, entree: unknown, options?: { controler?: (json: unknown) => string[] }) => {
  let json: unknown;
  if (skill === "realisateur-analyse") {
    if (tomberEnPanne) throw new Error("Serveur LLM en panne (simulé)");
    vu.analyse.push(entree as Record<string, unknown>);
    json = prochainesAnalyses.shift() ?? { decisions: [], retirer: [], pistes: [], retenirPistes: [], narratif: [] };
    vu.soucis.push(options?.controler ? options.controler(json) : []);
  } else if (skill === "realisateur-reponse") {
    vu.reponse.push(entree as Record<string, unknown>);
    json = { reponse: "Réponse du réalisateur (faux modèle)." };
  } else throw new Error(`Skill inattendu : ${skill}`);
  return { json, reponse: {} as never, usage: { entree: 0, sortie: 0 }, dureeMs: 1, renvois: 0, modele: "faux", skill: { nom: skill, caracteres: 0, jetonsEstimes: 0 } };
}) as unknown as typeof executerSkill;

async function traiterProchain(conversationUuid: string) {
  const conv = await conversationRevisionParUuid(db, conversationUuid);
  const [run] = await db.select().from(agentRuns).where(and(eq(agentRuns.conversationId, conv!.id), eq(agentRuns.statut, "en_attente"))).orderBy(desc(agentRuns.id)).limit(1);
  if (!run) throw new Error("Aucune tâche en attente.");
  await traiterTacheLlm(run, { executer: faux, joignable: async () => true });
  return (await db.select().from(agentRuns).where(eq(agentRuns.id, run.id)))[0]!;
}

const sortie = (o: Partial<SortieAnalyse>): SortieAnalyse => ({ decisions: [], retirer: [], pistes: [], retenirPistes: [], narratif: [], ...o });
const coupes = (...n: number[]) => n.map((x) => ({ type: "couper_plan", plan: `P${x}` }));
const tour = async (convUuid: string, s: SortieAnalyse) => {
  const conv = await conversationRevisionParUuid(db, convUuid);
  return db.transaction((tx) => appliquerSortieAnalyse(tx, conv!, s));
};
const ordreDesPlans = async (episodeId: number) => (await db.select({ titre: plans.titre, ordre: plans.ordre }).from(plans).where(eq(plans.episodeId, episodeId)).orderBy(asc(plans.ordre))).map((p) => p.titre);

async function main() {
  const ids: number[] = [];
  try {
    // ── A. Le parcours « ressenti » ───────────────────────────────────────────────
    console.log("\nA. Parcours « ressenti » : pistes, choix, conflit, résolution, application");
    const a = await semerLeSel("TEST_REVISION_E2E_A");
    // La fiche du plan 07 cite sa réplique mot pour mot : l'application doit mettre son dialogue à jour.
    const [p07] = (await db.select({ id: plans.id }).from(plans).where(eq(plans.episodeId, a.episodeId)).orderBy(asc(plans.ordre))).slice(6);
    await db.insert(planPromptSections).values({ planId: p07!.id, section: "detailed_description", ordre: 4, contenu: "He turns and says <d>[Français] Je ne reviendrai jamais.</d> then leaves." });
    ids.push(a.projectId);
    const o1 = await ouvrirRevision(a.projectId, a.episodeId);
    if (!o1.ok) throw new Error(o1.erreur);
    const o2 = await ouvrirRevision(a.projectId, a.episodeId);
    ok(!o1.reprise && o2.ok && o2.reprise && o2.conversationUuid === o1.conversationUuid, "rouvrir la révision d'un épisode reprend la même conversation");
    const e0 = await lireEtatRevision(o1.conversationUuid);
    ok(e0 != null && e0.messages.length === 1 && /14 plans, 2:34.*2:00 visées/.test(e0.messages[0]!.content), "message d'ouverture écrit en code : 14 plans, 2:34, 2:00 visées");
    ok(e0!.duree.actuelle === 154 && e0!.duree.objectif === 120, "durée lue en base : 154 s pour 120 visées");

    const t1 = await tour(
      o1.conversationUuid,
      sortie({
        pistes: [
          { titre: "Couper quatre plans d'ambiance", resume: "05, 10, 02, 08", operations: coupes(5, 10, 2, 8) },
          { titre: "Raccourcir le plan 06", resume: "", operations: [{ type: "duree_plan", plan: "P06", secondes: 12 }] },
          { titre: "Accélérer la scène 1", resume: "durées 5 à 7 s", operations: [{ type: "duree_plan", plan: "P01", secondes: 6 }, { type: "duree_plan", plan: "P03", secondes: 7 }] },
        ],
      }),
    );
    ok(t1.pistes.length === 3 && t1.pistes[0]!.gain === "−35 s" && t1.pistes[0]!.dureeApres === "1:59", "trois pistes, chiffrées par le code (−35 s → 1:59)");
    ok(t1.decisions.length === 0, "un ressenti ne crée aucune décision");

    const t2 = await tour(o1.conversationUuid, sortie({ retenirPistes: [1, 3] }));
    ok(t2.decisions.length === 2 && t2.ceTour.creees.join() === "D1,D2" && t2.ceTour.pistesChoisies.join() === "1,3", "« combine 1 et 3 » : deux décisions créées");
    ok(t2.duree.avecBrouillon === "1:52" && t2.pistes.length === 0, "durée avec le brouillon 1:52, pistes consommées");
    ok(t2.decisions.every((d) => d.statut === "retenue"), "aucun rendu touché : décisions simplement retenues");

    const t3 = await tour(
      o1.conversationUuid,
      sortie({
        decisions: [{ id: null, titre: "Réplique du plan 07 plus sobre", raison: "", operations: [{ type: "remplacer_replique", replique: "R01", texte: "Je ne reviendrai pas." }] }],
        narratif: [{ decision: "D3", niveau: "conflit", texte: "Le plan 08 est coupé parce que la réplique disait ce que l'insert montre." }],
      }),
    );
    const d3 = t3.decisions.find((d) => d.id === "D3");
    ok(d3?.statut === "conflit", "le jugement narratif du modèle met la décision en conflit");
    ok(d3!.constats.some((c) => c.source === "code" && /fiche de P07 cite la réplique mot pour mot/.test(c.texte)) && d3!.constats.some((c) => c.source === "modele"), "constats du code (fiche à resynchroniser) ET du modèle (conflit)");
    const refus1 = await appliquerRevision(o1.conversationUuid);
    ok(!refus1.ok && /en conflit \(D3\)/.test(refus1.ok ? "" : refus1.erreur), "appliquer est refusé tant qu'une décision est en conflit");

    const t4 = await tour(
      o1.conversationUuid,
      sortie({
        decisions: [
          { id: "D1", titre: "Couper trois plans d'ambiance", raison: "le 08 reste", operations: coupes(5, 10, 2) },
          { id: "D3", titre: "Réplique du plan 07 plus sobre", raison: "", operations: [{ type: "remplacer_replique", replique: "R01", texte: "Je ne reviendrai pas." }] },
        ],
      }),
    );
    ok(t4.decisions.find((d) => d.id === "D3")?.statut === "attention", "conflit levé : la décision n'est plus qu'« à surveiller »");
    ok(t4.duree.avecBrouillon === "2:00" && t4.duree.objectifTenu === true, "durée avec le brouillon : 2:00 pile, objectif tenu");

    const avantApplication = await ordreDesPlans(a.episodeId);
    const app = await appliquerRevision(o1.conversationUuid);
    if (!app.ok) console.error("    →", app.erreur);
    ok(app.ok && app.appliquees === 3, "chantier appliqué (3 décisions)");
    const apres = await ordreDesPlans(a.episodeId);
    ok(avantApplication.length === 14 && apres.length === 11 && !apres.includes("Mouettes dans le ciel") && apres.includes("Insert : l'écriture sur le papier"), "3 plans supprimés, le plan 08 reste");
    const lignes = await db.select({ ordre: plans.ordre, duree: plans.dureeGenerationSecondes }).from(plans).where(eq(plans.episodeId, a.episodeId)).orderBy(asc(plans.ordre));
    ok(lignes.every((l, i) => l.ordre === i) && lignes.reduce((x, l) => x + l.duree, 0) === 120, "ordre dense (aucun trou) et 120 s au total");
    const [rep] = await db.select({ texte: repliques.texte }).from(repliques).where(eq(repliques.episodeId, a.episodeId)).orderBy(asc(repliques.ordre));
    ok(rep?.texte === "Je ne reviendrai pas.", "la réplique a été réécrite");
    const [dd] = await db.select({ contenu: planPromptSections.contenu }).from(planPromptSections).where(and(eq(planPromptSections.planId, p07!.id), eq(planPromptSections.section, "detailed_description")));
    ok(dd?.contenu === "He turns and says <d>[Français] Je ne reviendrai pas.</d> then leaves.", "le dialogue de la fiche du plan 07 est mis à jour");
    const [conv] = await db.select().from(agentConversations).where(eq(agentConversations.uuid, o1.conversationUuid));
    ok(conv?.fermeeAt != null && conv.etape === "applique", "la conversation est fermée à l'application");
    const decs = await db.select({ statut: revisionDecisions.statut }).from(revisionDecisions).where(eq(revisionDecisions.conversationId, conv!.id));
    ok(decs.length === 3 && decs.every((d) => d.statut === "appliquee"), "les décisions sont marquées appliquées (historique conservé)");
    const o3 = await ouvrirRevision(a.projectId, a.episodeId);
    ok(o3.ok && !o3.reprise && o3.conversationUuid !== o1.conversationUuid, "une révision neuve peut s'ouvrir sur le même épisode");

    // ── B. La demande technique : écrasement, confirmation, déplacement ────────────
    console.log("\nB. Demande technique : conflit mécanique, écrasement confirmé, déplacement");
    const b = await semerLeSel("TEST_REVISION_E2E_B");
    ids.push(b.projectId);
    const ob = await ouvrirRevision(b.projectId, b.episodeId);
    if (!ob.ok) throw new Error(ob.erreur);
    const tb1 = await tour(ob.conversationUuid, sortie({ decisions: [{ id: null, titre: "Supprimer les plans 04 et 07", raison: "", operations: coupes(4, 7) }] }));
    const db1 = tb1.decisions[0]!;
    ok(db1.statut === "attention", "deux plans à rendu réussi : à surveiller (pas bloqué)");
    ok(db1.constats.filter((c) => /Écrase le rendu réussi/.test(c.texte)).length === 2, "un constat d'écrasement par plan");
    const sansConfirmation = await appliquerRevision(ob.conversationUuid);
    if (!sansConfirmation.ok && !sansConfirmation.confirmationRequise) console.error("    →", sansConfirmation.erreur);
    ok(!sansConfirmation.ok && (sansConfirmation.ok ? 0 : (sansConfirmation.confirmationRequise?.length ?? 0)) === 2, "appliquer demande la confirmation de 2 écrasements");
    const tb2 = await tour(
      ob.conversationUuid,
      sortie({ decisions: [{ id: null, titre: "Ranger le 09 après le 03", raison: "", operations: [{ type: "deplacer_plan", plan: "P09", apres: "P03" }] }] }),
    );
    ok(tb2.decisions.length === 2, "une seconde décision s'empile");
    const tb3 = await tour(
      ob.conversationUuid,
      sortie({ decisions: [{ id: null, titre: "Durée du 07", raison: "", operations: [{ type: "duree_plan", plan: "P07", secondes: 9 }] }] }),
    );
    ok(tb3.decisions.find((d) => d.id === "D3")?.statut === "conflit" && tb3.conflits.length === 1, "couper un plan et le modifier ailleurs : conflit mécanique détecté par le code");
    const tb4 = await tour(ob.conversationUuid, sortie({ retirer: ["D3"] }));
    ok(tb4.decisions.length === 2 && tb4.conflits.length === 0, "retirer la décision en cause lève le conflit");
    const confirmee = await appliquerRevision(ob.conversationUuid, { confirmeEcrasement: true });
    if (!confirmee.ok) console.error("    →", confirmee.erreur);
    ok(confirmee.ok, "appliqué avec la confirmation d'écrasement");
    const ordreB = await ordreDesPlans(b.episodeId);
    ok(ordreB.length === 12 && ordreB.indexOf("Le vieux pêcheur l'observe") === 3, "plans 04 et 07 supprimés ; le plan 09 est devenu le 4e");
    const [plan07] = await db.select().from(plans).where(eq(plans.episodeId, b.episodeId)).limit(1);
    ok(plan07 != null, "l'épisode existe toujours");
    const [replique01] = await db.select({ id: repliques.id }).from(repliques).where(and(eq(repliques.episodeId, b.episodeId), eq(repliques.texte, "Je ne reviendrai jamais.")));
    ok(replique01 != null, "la réplique du plan supprimé reste dans l'épisode (elle existe par elle-même)");

    // ── C. Ce que visait une décision a changé : « à revérifier » ──────────────────
    console.log("\nC. Cible disparue : à revérifier, jamais effacée en silence");
    const c = await semerLeSel("TEST_REVISION_E2E_C");
    ids.push(c.projectId);
    const oc = await ouvrirRevision(c.projectId, c.episodeId);
    if (!oc.ok) throw new Error(oc.erreur);
    await tour(oc.conversationUuid, sortie({ decisions: [{ id: null, titre: "Durée du 05", raison: "", operations: [{ type: "duree_plan", plan: "P05", secondes: 5 }] }, { id: null, titre: "Couper le 10", raison: "", operations: coupes(10) }] }));
    const [p05] = await db.select({ id: plans.id }).from(plans).where(and(eq(plans.episodeId, c.episodeId), eq(plans.titre, "Mouettes dans le ciel")));
    await db.update(plans).set({ dureeGenerationSecondes: 6 }).where(eq(plans.id, p05!.id));
    const ec1 = await lireEtatRevision(oc.conversationUuid);
    const d1c = ec1!.decisions.find((d) => d.id === "D1")!;
    ok(d1c.aReverifier && d1c.constats.some((c) => /a changé depuis qu'elle a été prise/.test(c.texte)), "un plan modifié à la main depuis : la décision est « à revérifier »");
    ok(ec1!.decisions.find((d) => d.id === "D2")?.aReverifier === false, "l'autre décision n'est pas touchée");
    const refus = await appliquerRevision(oc.conversationUuid);
    ok(!refus.ok && /à revérifier \(D1\)/.test(refus.ok ? "" : refus.erreur), "appliquer est refusé tant qu'une décision est à revérifier");
    await reconfirmerDecision(oc.conversationUuid, d1c.uuid);
    const ec2 = await lireEtatRevision(oc.conversationUuid);
    ok(ec2!.decisions.find((d) => d.id === "D1")?.aReverifier === false, "relue et reconfirmée : le drapeau tombe");
    const [p10] = await db.select({ id: plans.id }).from(plans).where(and(eq(plans.episodeId, c.episodeId), eq(plans.titre, "Plan de coupe : la mer")));
    await db.delete(plans).where(eq(plans.id, p10!.id));
    const ec3 = await lireEtatRevision(oc.conversationUuid);
    const d2c = ec3!.decisions.find((d) => d.id === "D2")!;
    ok(d2c.statut === "conflit" && d2c.constats.some((c) => /n'existe plus/.test(c.texte)), "un plan supprimé depuis : la décision est en conflit, avec la raison");
    const sup = await retirerDecision(oc.conversationUuid, d2c.uuid);
    ok(sup.ok && (await lireEtatRevision(oc.conversationUuid))!.decisions.length === 1, "retirer une décision");
    const ab = await abandonnerRevision(oc.conversationUuid);
    const [convC] = await db.select().from(agentConversations).where(eq(agentConversations.uuid, oc.conversationUuid));
    ok(ab.ok && convC?.fermeeAt != null, "abandonner ferme la conversation");
    const restantes = await db.select().from(revisionDecisions).where(eq(revisionDecisions.conversationId, convC!.id));
    ok(restantes.length === 0, "…et vide le brouillon");

    // ── D. Le tour de conversation : analyse → décisions → réponse, avec le vrai worker et un faux modèle ──
    console.log("\nD. Tour de conversation (worker, faux modèle)");
    const d = await semerLeSel("TEST_REVISION_E2E_D");
    ids.push(d.projectId);
    const od = await ouvrirRevision(d.projectId, d.episodeId);
    if (!od.ok) throw new Error(od.erreur);
    ok(!(await envoyerMessageRevision(od.conversationUuid, "   ")).ok, "un message vide est refusé");
    const m1 = await envoyerMessageRevision(od.conversationUuid, "Je trouve l'épisode trop long, et la scène 1 traîne.");
    ok(m1.ok, "le message part : la tâche d'analyse est posée");
    ok(!(await envoyerMessageRevision(od.conversationUuid, "Autre chose ?")).ok, "un second tour est refusé tant que le premier tourne");

    prochainesAnalyses = [
      sortie({
        pistes: [
          { titre: "Couper quatre plans d'ambiance", resume: "05, 10, 02, 08", operations: coupes(5, 10, 2, 8) },
          { titre: "Accélérer la scène 1", resume: "durées 5 à 7 s", operations: [{ type: "duree_plan", plan: "P01", secondes: 6 }, { type: "duree_plan", plan: "P03", secondes: 7 }] },
        ],
      }),
    ];
    const r1 = await traiterProchain(od.conversationUuid);
    ok(r1.statut === "termine", "le worker traite l'analyse");
    const e1 = vu.analyse[0] as { episode: { duree: string; aEconomiserSecondes: number }; plans: { ref: string }[]; limites: { dureePlanMinSecondes: number; dureePlanMaxSecondes: number }; message: string; prochainId: string; decisions: unknown[] };
    ok(e1.plans.length === 14 && e1.plans[0]!.ref === "P01" && e1.plans[13]!.ref === "P14", "le modèle reçoit l'épisode avec ses poignées P01…P14");
    ok(e1.episode.duree === "2:34" && e1.episode.aEconomiserSecondes === 34 && e1.limites.dureePlanMinSecondes === 5 && e1.limites.dureePlanMaxSecondes === 15, "…la durée, ce qu'il reste à économiser et les limites d'un plan");
    ok(e1.message === "Je trouve l'épisode trop long, et la scène 1 traîne." && e1.prochainId === "D1" && e1.decisions.length === 0, "…le message de l'utilisateur, le prochain id, aucun brouillon");
    ok(vu.soucis[0]!.length === 0, "le contrôleur du worker ne voit rien à redire");
    const [suite1] = await db.select().from(agentRuns).where(and(eq(agentRuns.skill, "realisateur-reponse"), eq(agentRuns.statut, "en_attente")));
    ok(suite1 != null, "l'analyse pose la tâche de réponse");
    const faits1 = (suite1!.entree as { faits: { pistes: { gain: string; dureeApres: string }[]; decisions: unknown[] } }).faits;
    ok(faits1.pistes.length === 2 && faits1.pistes[0]!.gain === "−35 s" && faits1.pistes[0]!.dureeApres === "1:59" && faits1.decisions.length === 0, "…avec les faits du code : pistes chiffrées, aucune décision");
    const r2 = await traiterProchain(od.conversationUuid);
    ok(r2.statut === "termine", "le worker traite la réponse");
    const conv1 = await conversationRevisionParUuid(db, od.conversationUuid);
    const msgs = conv1!.messages as { role: string; content: string }[];
    ok(msgs.length === 3 && msgs[1]!.role === "user" && msgs[2]!.role === "assistant" && msgs[2]!.content.startsWith("Réponse du réalisateur"), "la conversation : ouverture, message, réponse");

    // tour 2 : le modèle voit les pistes en attente ; « combine » les transforme en décisions
    await envoyerMessageRevision(od.conversationUuid, "Combine la 1 et la 2.");
    prochainesAnalyses = [sortie({ retenirPistes: [1, 2] })];
    await traiterProchain(od.conversationUuid);
    const e2 = vu.analyse[1] as { pistesEnAttente: { numero: number; gain: string }[]; conversation: { qui: string }[] };
    ok(e2.pistesEnAttente.length === 2 && e2.pistesEnAttente[0]!.gain === "−35 s" && e2.conversation.length === 3 && e2.conversation[0]!.qui === "realisateur" && e2.conversation[1]!.qui === "utilisateur", "tour 2 : le modèle voit les pistes en attente (chiffrées) et la conversation");
    await traiterProchain(od.conversationUuid);
    const etat2 = await lireEtatRevision(od.conversationUuid);
    ok(etat2!.decisions.length === 2 && etat2!.pistes.length === 0 && etat2!.duree.avecBrouillon === 112, "les deux pistes sont devenues deux décisions (112 s)");

    // tour 3 : le modèle relit le brouillon avec les poignées d'aujourd'hui ; une poignée inventée est refusée et signalée
    await envoyerMessageRevision(od.conversationUuid, "Plan 07 : une réplique plus sobre.");
    prochainesAnalyses = [
      sortie({
        decisions: [{ id: null, titre: "Réplique du plan 07 plus sobre", raison: "", operations: [{ type: "remplacer_replique", replique: "R01", texte: "Je ne reviendrai pas." }, { type: "couper_plan", plan: "P99" }] }],
        narratif: [{ decision: "D3", niveau: "conflit", texte: "Le plan 08 est coupé parce que la réplique disait ce qu'il montre." }],
      }),
    ];
    await traiterProchain(od.conversationUuid);
    const e3 = vu.analyse[2] as { plans: { ref: string; brouillon: { coupe?: boolean; dureeSecondes?: number } | null }[]; decisions: { id: string; operations: { type: string; plan?: string }[] }[]; prochainId: string };
    ok(e3.prochainId === "D3" && e3.decisions.length === 2 && e3.decisions[0]!.id === "D1" && e3.decisions[0]!.operations[0]!.plan === "P05", "tour 3 : les décisions reviennent au modèle avec leurs opérations en poignées");
    ok(e3.plans[4]!.brouillon?.coupe === true && e3.plans[0]!.brouillon?.dureeSecondes === 6 && e3.plans[5]!.brouillon === null, "…et le scénario porte le brouillon (P05 coupé, P01 à 6 s)");
    ok(vu.soucis[2]!.length === 1 && /P99/.test(vu.soucis[2]![0]!), "le contrôleur du worker signale la poignée inventée (c'est ce qui déclencherait un renvoi)");
    await traiterProchain(od.conversationUuid);
    const faits3 = (vu.reponse[2] as { faits: { refus: { raison: string }[]; decisions: { id: string; statut: string }[] } }).faits;
    ok(faits3.refus.length === 1 && /P99/.test(faits3.refus[0]!.raison), "…le refus arrive tel quel dans les faits de la réponse");
    ok(faits3.decisions.find((x) => x.id === "D3")?.statut === "conflit", "la décision D3 est en conflit (jugement du modèle)");
    ok(!(await appliquerRevision(od.conversationUuid)).ok, "appliquer reste refusé tant que le conflit n'est pas tranché");

    // une panne du serveur : le message reste, la tâche échoue, on relance
    ok(!(await relancerTourRevision(od.conversationUuid)).ok, "on ne relance pas un tour déjà répondu");
    await envoyerMessageRevision(od.conversationUuid, "Garde le 08.");
    tomberEnPanne = true;
    const panne = await traiterProchain(od.conversationUuid);
    ok(panne.statut === "echoue" && /en panne/.test(panne.erreur ?? ""), "serveur LLM en panne : la tâche échoue avec son message");
    tomberEnPanne = false;
    const relance = await relancerTourRevision(od.conversationUuid);
    ok(relance.ok, "…le tour se relance (le dernier message est celui de l'utilisateur)");
    await traiterProchain(od.conversationUuid);
    await traiterProchain(od.conversationUuid);
    const conv4 = await conversationRevisionParUuid(db, od.conversationUuid);
    ok((conv4!.messages as { role: string }[]).at(-1)!.role === "assistant", "…et le réalisateur répond");

    // une révision fermée n'accepte plus de message
    await abandonnerRevision(od.conversationUuid);
    ok(!(await envoyerMessageRevision(od.conversationUuid, "Encore ?")).ok, "une révision terminée refuse les messages");
  } finally {
    for (const id of ids) await db.delete(projects).where(eq(projects.id, id));
  }
  console.log(`\n${nb - echecs.length}/${nb} vérifications.`);
  if (echecs.length) {
    console.error(`\n${echecs.length} échec(s) :\n- ${echecs.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
