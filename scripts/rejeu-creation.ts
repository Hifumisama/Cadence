import "dotenv/config";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { agentRuns, agentTraces, episodes, planPromptSections, plans, projects, scenes, seasons } from "../db/schema";
import * as s from "../lib/agents/service";
import { lireBrief, lireConversation } from "../lib/queries-agents";
import { ETAPES_CREATION, estFinale, type EtapeCreation } from "../lib/agents/creation";
import { arreterCreation, lancerCreation, lireCreation, piloterCreations } from "../lib/agents/creation-db";
import { traiterTacheLlm } from "../worker/llm";
import { configLlm, creerFournisseur } from "../lib/llm/config";
import { comparerRapports, mesurerEpisode, mesurerFiches, type MesureAppels, type PlanMesure, type RapportRejeu } from "../lib/agents/rejeu-mesures";

/**
 * Rejoue la CRÉATION D'UN PROJET de bout en bout, avec le vrai serveur LLM, pour comparer d'une version des skills à la
 * suivante. Un auteur SIMULÉ (second appel LLM, piloté par une fiche : essais/fiches/<nom>.json) discute avec l'agent
 * jusqu'à ce qu'il dise « prêt », puis l'installateur déroule la chaîne (brief, structure, scénarios…) jusqu'à l'étape
 * demandée. Le script mesure le résultat (durée tenue, découpage, répétitions, caméra et lumière) et le compare au rejeu
 * précédent de la même fiche. Les rapports sont écrits dans essais/rapports/<fiche>/.
 *
 *   npm run agents:rejeu -- essais/fiches/self-made-man.json [--jusqu-a scenarios] [--nettoyer]
 *
 * Un vrai rejeu : il occupe le GPU du serveur LLM (de quelques minutes à plus d'une heure selon l'étape visée). Le projet
 * créé s'appelle « REJEU … » : le worker de dev ne le pilote pas (le script le fait), il reste dans la base pour être relu.
 */

type Fiche = {
  nom: string;
  pitch: string;
  maxEchangesUtilisateur?: number;
  auteur: { description: string; faits: string[]; consignes: string[] };
};

const arg = (nom: string) => {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const heure = () => new Date().toLocaleTimeString("fr-FR");
const log = (m: string) => console.log(`[${heure()}] ${m}`);
const LIMITE_MS = 120 * 60_000;
const relances = new Map<number, number>();

const nomFichierSur = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Traite la prochaine tâche en attente du projet (ordre de la file). false = rien à prendre. */
async function traiterUnRun(projectId: number): Promise<boolean> {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.projectId, projectId), eq(agentRuns.statut, "en_attente")))
    .orderBy(asc(agentRuns.createdAt), asc(agentRuns.id))
    .limit(1);
  if (!run) return false;
  log(`  → ${run.skill}${run.but ? ` (${run.but})` : ""}…`);
  const t0 = Date.now();
  const pris = await traiterTacheLlm(run);
  if (!pris) throw new Error("Serveur LLM injoignable : le rejeu s'arrête (les tâches restent en attente).");
  const [apres] = await db.select({ statut: agentRuns.statut, erreur: agentRuns.erreur }).from(agentRuns).where(eq(agentRuns.id, run.id));
  log(`    ${run.skill} : ${apres?.statut} en ${Math.round((Date.now() - t0) / 1000)} s${apres?.erreur ? ` — ${apres.erreur.slice(0, 160)}` : ""}`);
  // Un accident du serveur (502, flux coupé : le GPU change de modèle, un autre appel passe) n'est pas un résultat à mesurer :
  // on relance la tâche, deux fois au plus.
  const essais = relances.get(run.id) ?? 0;
  if (apres?.statut === "echoue" && /50[0-4]|interrompu|injoignable|fetch failed/i.test(apres.erreur ?? "") && essais < 2) {
    relances.set(run.id, essais + 1);
    log(`    accident serveur : nouvelle tentative (${essais + 1}/2) dans 15 s`);
    await dormir(15_000);
    await db.update(agentRuns).set({ statut: "en_attente", erreur: null, startedAt: null, finishedAt: null }).where(eq(agentRuns.id, run.id));
  }
  return true;
}

async function attendreRun(projectId: number, runUuid: string): Promise<void> {
  const debut = Date.now();
  for (;;) {
    const [r] = await db.select({ statut: agentRuns.statut }).from(agentRuns).where(eq(agentRuns.uuid, runUuid));
    if (!r || ["termine", "echoue", "annulee"].includes(r.statut)) return;
    if (Date.now() - debut > LIMITE_MS) throw new Error("Délai dépassé en attendant une tâche.");
    if (!(await traiterUnRun(projectId))) await dormir(1500);
  }
}

async function viderFile(projectId: number): Promise<void> {
  while (await traiterUnRun(projectId)) {
    /* tant qu'il y a des tâches */
  }
}

/** L'auteur simulé : un appel LLM sans réflexion, qui ne répond qu'à la dernière question de l'agent. */
async function repondreEnAuteur(fiche: Fiche, messages: { role: string; content: string }[]): Promise<string> {
  const systeme = [
    fiche.auteur.description,
    "",
    "Ce que tu sais de ton projet :",
    ...fiche.auteur.faits.map((f) => `- ${f}`),
    "",
    "Règles :",
    ...fiche.auteur.consignes.map((c) => `- ${c}`),
  ].join("\n");
  const transcript = messages.map((m) => `${m.role === "user" ? "Toi" : "Agent"} : ${m.content}`).join("\n\n");
  const r = await creerFournisseur().generer({
    systeme,
    messages: [{ role: "user", content: `Voici la conversation jusqu'ici.\n\n${transcript}\n\nÉcris ta prochaine réponse à l'agent (le texte du message seulement, sans « Toi : »).` }],
    corps: { chat_template_kwargs: { enable_thinking: false } },
    maxTokens: 400,
    temperature: 0.8,
  });
  return r.texte.trim().replace(/^Toi\s*:\s*/i, "");
}

function git(): { sha: string; modifie: boolean } {
  try {
    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
    const modifie = execSync("git status --porcelain", { encoding: "utf-8" }).trim().length > 0;
    return { sha, modifie };
  } catch {
    return { sha: "inconnu", modifie: false };
  }
}

async function mesurer(projectId: number, dureeCible: number | null) {
  const eps = await db
    .select({ id: episodes.id, numero: episodes.numero, titre: episodes.titre })
    .from(episodes)
    .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
    .where(eq(seasons.projectId, projectId))
    .orderBy(asc(episodes.numero));
  const mesures = [];
  const idsPlans: number[] = [];
  for (const e of eps) {
    const lignes = await db
      .select({ id: plans.id, titre: plans.titre, description: plans.description, duree: plans.dureeGenerationSecondes, scene: scenes.titre })
      .from(plans)
      .leftJoin(scenes, eq(scenes.id, plans.sceneId))
      .where(eq(plans.episodeId, e.id))
      .orderBy(asc(plans.ordre), asc(plans.id));
    idsPlans.push(...lignes.map((l) => l.id));
    const pm: PlanMesure[] = lignes.map((l) => ({ titre: l.titre, scene: l.scene ?? "—", dureeSecondes: l.duree, description: l.description ?? "" }));
    mesures.push(mesurerEpisode(`Ép. ${e.numero} · ${e.titre}`, pm, dureeCible));
  }
  // Fiches de plan : le texte complet des sections de prompt de chaque plan (vide = pas encore de fiche).
  const textes: string[] = [];
  for (const id of idsPlans) {
    const secs = await db.select({ contenu: planPromptSections.contenu }).from(planPromptSections).where(eq(planPromptSections.planId, id));
    const t = secs.map((x) => x.contenu).join("\n").trim();
    if (t) textes.push(t);
  }
  return { episodes: mesures, fiches: textes.length ? mesurerFiches(textes) : null };
}

async function appelsDuProjet(projectId: number): Promise<{ appels: MesureAppels[]; empreintes: Record<string, string>; modeles: string[] }> {
  const traces = await db
    .select({ skill: agentTraces.skill, modele: agentTraces.modele, statut: agentTraces.statut, tin: agentTraces.tokensEntree, tout: agentTraces.tokensSortie, ms: agentTraces.dureeMs, renvois: agentTraces.renvois, emp: agentTraces.systemeEmpreinte })
    .from(agentTraces)
    .where(eq(agentTraces.projectId, projectId));
  const parSkill = new Map<string, MesureAppels>();
  const empreintes: Record<string, string> = {};
  for (const t of traces) {
    const m = parSkill.get(t.skill) ?? { skill: t.skill, n: 0, tokensEntree: 0, tokensSortie: 0, secondesMoyennes: 0, renvois: 0, pasOk: 0 };
    m.n++;
    m.tokensEntree += t.tin;
    m.tokensSortie += t.tout;
    m.secondesMoyennes += t.ms / 1000;
    m.renvois += t.renvois;
    if (t.statut !== "ok") m.pasOk++;
    parSkill.set(t.skill, m);
    empreintes[t.skill] = t.emp.slice(0, 10);
  }
  const appels = [...parSkill.values()].map((m) => ({ ...m, secondesMoyennes: Math.round(m.secondesMoyennes / m.n) }));
  return { appels, empreintes, modeles: [...new Set(traces.map((t) => t.modele))] };
}

async function main(): Promise<number> {
  const chemin = process.argv.slice(2).find((a) => !a.startsWith("--") && a !== arg("--jusqu-a"));
  if (!chemin || !existsSync(chemin)) {
    console.error("Usage : npm run agents:rejeu -- <fiche.json> [--jusqu-a <étape>] [--nettoyer]\nÉtapes : " + ETAPES_CREATION.map((e) => e.cle).join(", "));
    return 2;
  }
  const fiche = JSON.parse(readFileSync(chemin, "utf-8")) as Fiche;
  const jusquA = arg("--jusqu-a") ?? "scenarios";
  if (!ETAPES_CREATION.some((e) => e.cle === jusquA)) {
    console.error(`Étape inconnue : « ${jusquA} ». Étapes : ${ETAPES_CREATION.map((e) => e.cle).join(", ")}`);
    return 2;
  }
  const maxEchanges = fiche.maxEchangesUtilisateur ?? 8;
  const t0 = Date.now();
  const conf = configLlm();
  log(`Rejeu « ${fiche.nom} » jusqu'à l'étape « ${jusquA} » — serveur ${conf.url}, modèle ${conf.modeleParDefaut}`);

  const [projet] = await db.insert(projects).values({ nom: `REJEU ${fiche.nom} ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, type: "serie" }).returning();
  const pid = projet!.id;
  log(`Projet « ${projet!.nom} » (id ${pid}) créé.`);
  let etapeAtteinte = "conversation";

  try {
    // ── 1. La conversation, avec l'auteur simulé ──
    const o = await s.ouvrirConversation(pid, "projet", null, "complete");
    if (!o.ok) throw new Error(o.erreur);
    const uuid = o.conversationUuid;
    let message = fiche.pitch;
    let echanges = 0;
    for (;;) {
      log(`Auteur (${echanges + 1}) : ${message.replace(/\s+/g, " ").slice(0, 200)}`);
      const m = await s.envoyerMessage(uuid, message);
      if (!m.ok) throw new Error(m.erreur);
      echanges++;
      await attendreRun(pid, m.runUuid);
      // Si l'agent a dit « prêt », le briefing s'écrit seul et bloque la conversation : un vrai utilisateur attend.
      await viderFile(pid);
      const conv = await lireConversation(uuid);
      if (!conv) throw new Error("Conversation perdue.");
      const dernier = conv.messages[conv.messages.length - 1];
      if (dernier?.role !== "assistant") throw new Error("L'agent n'a pas répondu (tour échoué).");
      log(`Agent : ${dernier.content.replace(/\s+/g, " ").slice(0, 240)} [prêt=${conv.briefPret}, reste=${conv.resteADefinir.length}]`);
      if (conv.briefPret && conv.resteADefinir.length === 0) break;
      if (echanges >= maxEchanges) {
        log(`Limite de ${maxEchanges} messages atteinte : on passe au briefing.`);
        break;
      }
      message = await repondreEnAuteur(fiche, conv.messages);
    }

    // ── 2. Le briefing : la première version s'écrit seule ; on la met à jour si la conversation a continué ──
    await viderFile(pid);
    const conv = await lireConversation(uuid);
    const dernierMessage = [...(conv?.messages ?? [])].reverse().find((x) => x.role === "user")?.at ?? "";
    let brief = await lireBrief(pid);
    if (!brief || brief.statut !== "brouillon" || brief.updatedAt < dernierMessage) {
      log("Mise à jour du briefing à partir de toute la conversation…");
      const g = await s.genererBrief(uuid);
      if (!g.ok) throw new Error(g.erreur);
      await attendreRun(pid, g.runUuid);
      brief = await lireBrief(pid);
    }
    const dureeCible = brief?.contenu.dureeEpisodeSecondes ?? null;
    log(`Briefing prêt : « ${brief?.contenu.titre} », durée visée ${dureeCible ?? "?"} s, ${brief?.contenu.episodes?.length ?? "?"} épisode(s).`);
    etapeAtteinte = "brief";

    // ── 3. L'installateur déroule la chaîne jusqu'à l'étape demandée ──
    const l = await lancerCreation(pid);
    if (!l.ok) throw new Error(l.erreur);
    const vus = new Map<string, string>();
    for (;;) {
      if (Date.now() - t0 > LIMITE_MS) throw new Error("Délai global dépassé.");
      await piloterCreations({ essais: true });
      const c = await lireCreation(pid);
      if (!c) throw new Error("Création perdue.");
      const etapes = c.etapes as EtapeCreation[];
      for (const e of etapes) {
        if (vus.get(e.cle) !== e.statut) {
          vus.set(e.cle, e.statut);
          if (e.statut !== "a_venir") log(`Étape « ${e.cle} » : ${e.statut}${e.erreur ? ` — ${e.erreur.slice(0, 160)}` : ""}`);
        }
        if (estFinale(e) && e.statut !== "echoue") etapeAtteinte = e.cle;
      }
      if (c.statut !== "en_cours") break;
      const cible = etapes.find((e) => e.cle === jusquA);
      if (cible && estFinale(cible)) {
        await arreterCreation(pid);
        break;
      }
      if (!(await traiterUnRun(pid))) await dormir(1500);
    }

    // ── 4. Mesures, rapport, comparaison ──
    const { episodes: eps, fiches } = await mesurer(pid, dureeCible);
    const { appels, empreintes, modeles } = await appelsDuProjet(pid);
    const rapport: RapportRejeu = {
      fiche: fiche.nom,
      date: new Date().toISOString(),
      git: git(),
      modeles,
      echangesUtilisateur: echanges,
      empreintesSkills: empreintes,
      dureeRejeuSecondes: Math.round((Date.now() - t0) / 1000),
      etapeAtteinte,
      episodes: eps,
      fiches,
      appels,
    };
    const dossier = join("essais", "rapports", nomFichierSur(fiche.nom));
    mkdirSync(dossier, { recursive: true });
    const precedents = existsSync(dossier) ? readdirSync(dossier).filter((f) => f.endsWith(".json")).sort() : [];
    const fichier = join(dossier, `${rapport.date.slice(0, 19).replace(/[-:T]/g, "")}-${rapport.git.sha}.json`);
    writeFileSync(fichier, JSON.stringify(rapport, null, 2), "utf-8");

    console.log(`\n══ Rapport (${fichier}) ══`);
    console.log(`Étape atteinte : ${etapeAtteinte} · ${echanges} message(s) de l'auteur · ${rapport.dureeRejeuSecondes} s`);
    for (const e of eps) {
      console.log(`${e.titre} : ${e.totalSecondes} s pour ${e.cibleSecondes ?? "?"} visées (${e.ecartPct == null ? "?" : e.ecartPct + " %"}), ${e.nbPlans} plans (moy. ${e.moyenneSecondes} s, ${e.minSecondes}–${e.maxSecondes} s), sous 5 s : ${e.sousCinq}, fusionnables : ${e.fusionnables}, répétitions : ${e.repetitions.length}`);
      for (const r of e.repetitions) console.log(`   ≈ « ${r.a} » / « ${r.b} » (${r.similarite})`);
    }
    if (fiches) console.log(`Fiches : ${fiches.nbFiches} · caméra dite dans ${fiches.avecCamera}, lumière dans ${fiches.avecLumiere}`);
    for (const a of appels) console.log(`  ${a.skill.padEnd(18)} ${String(a.n).padStart(3)} appel(s) · ${String(a.tokensSortie).padStart(6)} jetons sortis · ${a.secondesMoyennes} s en moyenne · ${a.renvois} renvoi(s) · ${a.pasOk} hors « ok »`);
    const dernierPrecedent = precedents.length ? JSON.parse(readFileSync(join(dossier, precedents[precedents.length - 1]!), "utf-8")) as RapportRejeu : null;
    if (dernierPrecedent) console.log(`\n══ Depuis le rejeu précédent ══\n${comparerRapports(dernierPrecedent, rapport).join("\n")}`);
    else console.log("\n(Premier rejeu de cette fiche : rien à comparer.)");
    console.log(`\nProjet « ${projet!.nom} » conservé dans la base (id ${pid}).`);
    return 0;
  } finally {
    if (process.argv.includes("--nettoyer")) {
      await db.delete(projects).where(eq(projects.id, pid));
      log("Projet supprimé (--nettoyer).");
    }
  }
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
