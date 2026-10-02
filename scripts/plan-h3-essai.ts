import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { agentRuns, agentTraces, episodes, planPromptSections, plans, seasons } from "../db/schema";
import { entreePlanH3 } from "../lib/agents/contexte";
import { executerSkill } from "../lib/llm/executer";
import { controleurPourSkill } from "../lib/llm/controles";
import { assemblerPlanH3 } from "../lib/agents/plan-h3-assemblage";
import { controlerSortiePlanH3, resumeControles, type ProblemeH3, type SortiePlanH3 } from "../lib/agents/plan-h3-controles";

/** Essai de QUALITÉ de `plan-h3` sur des plans réels d'un projet, pour savoir si le modèle local suffit
 * avant de construire l'étape 3. Chaque plan passe par la FILE du worker (le GPU reste sérialisé) ; le
 * worker (`npm run dev:all`) doit donc tourner. Le rapport (Markdown) compare, pour chaque plan, la sortie
 * du modèle à la fiche écrite à la main quand elle existe, et applique les contrôles automatiques du
 * contrat (lib/agents/plan-h3-controles.ts).
 *
 *   npm run plan-h3:essai -- --projet 1 [--episode <id>] [--n 4] [--plans uuid,uuid]
 *                            [--modele gemma4-26b-A4B] [--consigne "…"] [--direct]
 * `--direct` : n'utilise PAS le worker. Le skill s'exécute dans le script (même exécuteur : validation,
 * renvoi, contrôles) et la réflexion (jaune) comme la réponse (vert) s'affichent EN DIRECT ; rien n'est posé
 * en file ni en base, pas de trace. Sert à vérifier ce que le serveur renvoie vraiment.
 * Rien n'est écrit dans le projet : les résultats vivent dans `agent_runs` (supprimés à la fin, sauf
 * --garder) et dans le rapport `data/_essais/plan-h3-<date>.md`. */

function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const drapeau = (nom: string) => process.argv.includes(nom);
const TIMEOUT_MS = 20 * 60 * 1000;

async function attendre(runId: number): Promise<typeof agentRuns.$inferSelect> {
  const debut = Date.now();
  let dernier = "";
  for (;;) {
    const [r] = await db.select().from(agentRuns).where(eq(agentRuns.id, runId));
    const ligne = `${r!.statut}${r!.progressionJetons != null && r!.statut === "en_cours" ? ` · ${r!.progressionJetons} jetons` : ""}`;
    if (ligne !== dernier) {
      process.stdout.write(`   ${ligne}\n`);
      dernier = ligne;
    }
    if (r!.statut === "termine" || r!.statut === "echoue" || r!.statut === "annulee") return r!;
    if (Date.now() - debut > TIMEOUT_MS) throw new Error("Délai dépassé (20 min) : le worker tourne-t-il ? (npm run dev:all)");
    await new Promise((res) => setTimeout(res, 2000));
  }
}

async function main(): Promise<number> {
  const projectId = Number(arg("--projet"));
  if (!Number.isInteger(projectId) || projectId <= 0) {
    console.error("Usage : npm run plan-h3:essai -- --projet <id> [--episode <id>] [--n 4] [--plans uuid,uuid] [--modele X] [--consigne \"…\"]");
    return 2;
  }
  const modele = arg("--modele");
  const consigne = arg("--consigne") ?? "Écris la fiche de plan complète.";
  const n = Math.max(1, Number(arg("--n") ?? 4));

  // les plans à essayer
  const demandes = arg("--plans")?.split(",").map((x) => x.trim()).filter(Boolean);
  let cibles: { id: number; uuid: string; titre: string; description: string | null; duree: number | null }[];
  if (demandes?.length) {
    cibles = await db
      .select({ id: plans.id, uuid: plans.uuid, titre: plans.titre, description: plans.description, duree: plans.dureeGenerationSecondes })
      .from(plans)
      .where(and(eq(plans.projectId, projectId), inArray(plans.uuid, demandes)));
  } else {
    let episodeId = arg("--episode") ? Number(arg("--episode")) : null;
    if (episodeId == null) {
      const [ep] = await db
        .select({ id: episodes.id })
        .from(episodes)
        .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
        .where(eq(seasons.projectId, projectId))
        .orderBy(asc(seasons.numero), asc(episodes.numero))
        .limit(1);
      episodeId = ep?.id ?? null;
    }
    if (episodeId == null) {
      console.error("Ce projet n'a pas d'épisode.");
      return 2;
    }
    const tous = await db
      .select({ id: plans.id, uuid: plans.uuid, titre: plans.titre, description: plans.description, duree: plans.dureeGenerationSecondes })
      .from(plans)
      .where(and(eq(plans.projectId, projectId), eq(plans.episodeId, episodeId)))
      .orderBy(asc(plans.ordre), asc(plans.id));
    const utiles = tous.filter((p) => (p.description ?? "").trim());
    // répartis sur tout l'épisode : début, milieu, fin (variété d'intensité, de dialogue, de durée)
    cibles = utiles.length <= n ? utiles : Array.from({ length: n }, (_, k) => utiles[Math.round((k * (utiles.length - 1)) / (n - 1 || 1))]!);
  }
  if (cibles.length === 0) {
    console.error("Aucun plan à essayer (il faut une description de plan).");
    return 2;
  }
  console.log(`${cibles.length} plan(s) à essayer, un par un dans la file du worker${modele ? ` (modèle ${modele})` : ""}.\n`);

  const lignes: string[] = [];
  const bilan: { titre: string; statut: string; duree: number | null; jetons: number; erreurs: number; alertes: number }[] = [];
  const runsPoses: number[] = [];

  for (const [i, c] of cibles.entries()) {
    console.log(`[${i + 1}/${cibles.length}] ${c.titre}`);
    const e = await entreePlanH3(db, projectId, c.uuid, consigne);
    if (!e) {
      console.log("   plan illisible, ignoré");
      continue;
    }
    let fin: { statut: string; resultat: unknown; erreur: string | null };
    let jetons: number;
    let duree: number | null;
    if (drapeau("--direct")) {
      const debut = Date.now();
      const ecrire = (couleur: string, titre: string) => process.stdout.write(`\n\x1b[${couleur}m── ${titre} ──\x1b[0m\n`);
      let mode = "";
      try {
        const r = await executerSkill("plan-h3", e.entree as object, {
          projectId,
          modele,
          enregistrer: null,
          controler: controleurPourSkill("plan-h3", e.entree),
          surFlux: (ev) => {
            if (ev.type === "debut") {
              mode = "";
              ecrire("36", "appel au serveur");
              return;
            }
            if (mode !== ev.type) ecrire(ev.type === "reflexion" ? "33" : "32", ev.type === "reflexion" ? "RÉFLEXION" : "RÉPONSE");
            mode = ev.type;
            process.stdout.write(ev.texte);
          },
        });
        process.stdout.write(`\n\n   (${r.renvois} renvoi(s))\n`);
        fin = { statut: "termine", resultat: r.json, erreur: null };
        jetons = r.usage.entree + r.usage.sortie;
      } catch (err) {
        process.stdout.write("\n");
        fin = { statut: "echoue", resultat: null, erreur: (err as Error).message };
        jetons = 0;
      }
      duree = Math.round((Date.now() - debut) / 1000);
    } else {
      const [run] = await db
        .insert(agentRuns)
        .values({ skill: "plan-h3", entree: e.entree, options: modele ? { modele } : null, projectId })
        .returning();
      runsPoses.push(run!.id);
      const fini = await attendre(run!.id);
      fin = { statut: fini.statut, resultat: fini.resultat, erreur: fini.erreur };
      const [trace] = fini.traceId ? await db.select().from(agentTraces).where(eq(agentTraces.id, fini.traceId)) : [];
      jetons = (trace?.tokensEntree ?? 0) + (trace?.tokensSortie ?? 0);
      duree = trace?.dureeMs != null ? Math.round(trace.dureeMs / 1000) : null;
    }

    const registre = (e.entree as { registre: { code: string; type: string }[]; repliques: { texte: string }[] }).registre;
    const repliques = (e.entree as { repliques: { texte: string }[] }).repliques;
    let problemes: ProblemeH3[] = [];
    if (fin.statut === "termine") problemes = controlerSortiePlanH3(fin.resultat as SortiePlanH3, { registre, repliques });
    const r = resumeControles(problemes);
    console.log(`   → ${fin.statut}${duree != null ? ` en ${duree} s` : ""} · ${r.erreurs} erreur(s), ${r.alertes} alerte(s)\n`);
    bilan.push({ titre: c.titre, statut: fin.statut, duree, jetons, erreurs: r.erreurs, alertes: r.alertes });

    // la fiche écrite à la main (vérité terrain), si elle existe
    const humain = await db.select().from(planPromptSections).where(eq(planPromptSections.planId, c.id)).orderBy(asc(planPromptSections.ordre));
    const hum = (s: string) => humain.find((x) => x.section === s)?.contenu.trim() ?? "";

    lignes.push(`## ${i + 1}. ${c.titre}`, "");
    lignes.push(`- Durée visée : ${c.duree ?? "?"} s · registre : ${registre.length} assets · répliques : ${repliques.length}`);
    lignes.push(`- Résultat : **${fin.statut}**${duree != null ? ` en ${duree} s` : ""}, ${jetons} jetons${fin.erreur ? ` · ${fin.erreur}` : ""}`);
    lignes.push(`- Contrôles : **${r.erreurs} erreur(s)**, ${r.alertes} alerte(s), ${r.infos} info(s)`, "");
    lignes.push(`**Intention du plan** : ${(c.description ?? "").trim()}`, "");
    if (problemes.length) {
      lignes.push("**Contrôles automatiques**", "");
      for (const p of problemes) lignes.push(`- [${p.niveau}] (${p.regle}) ${p.message}`);
      lignes.push("");
    }
    if (fin.statut === "termine") {
      const s = fin.resultat as SortiePlanH3;
      // les voix occupent les premiers slots audio (comme à l'application d'une fiche, sans les lire en base ici)
      const a = assemblerPlanH3(s, { slotsAudioPris: repliques.map((_, k) => k + 1) });
      lignes.push(`### Sortie du modèle (${s.dureeSecondes} s, ${s.references.length} références, ${s.shots.length} shots)`, "");
      lignes.push("Références : " + s.references.map((x) => `${x.asset} (${x.nature}) — ${x.nom}, ${x.definition}`).join(" | "), "");
      lignes.push("**Prompt assemblé**", "", "```text", a.texte, "```", "");
      for (const p of a.problemes) lignes.push(`- [assemblage ${p.niveau}] (${p.regle}) ${p.message}`);
      if (a.problemes.length) lignes.push("");
      if (s.assetsManquants?.length) lignes.push("**Assets manquants** : " + s.assetsManquants.map((m) => `${m.code} (${m.type})`).join(", "), "");
      if (s.notes?.trim()) lignes.push(`**notes** : ${s.notes.trim()}`, "");
    }
    if (humain.length) {
      lignes.push("### Fiche écrite à la main (vérité terrain)", "");
      lignes.push("**summary**", "", "```", hum("summary"), "```", "", "**detailed_description**", "", "```", hum("detailed_description"), "```", "");
    }
  }

  const entete = [
    `# Essai de qualité plan-h3 — projet ${projectId}`,
    "",
    `Modèle : ${modele ?? "(par défaut du serveur)"} · ${new Date().toLocaleString("fr-FR")}`,
    "",
    "| Plan | Résultat | Durée | Jetons | Erreurs | Alertes |",
    "|---|---|---|---|---|---|",
    ...bilan.map((b) => `| ${b.titre} | ${b.statut} | ${b.duree ?? "?"} s | ${b.jetons} | ${b.erreurs} | ${b.alertes} |`),
    "",
  ];
  mkdirSync(join("data", "_essais"), { recursive: true });
  const fichier = join("data", "_essais", `plan-h3-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.md`);
  writeFileSync(fichier, [...entete, ...lignes].join("\n"), "utf-8");
  console.log(`Rapport : ${fichier}`);
  const total = bilan.reduce((a, b) => a + (b.duree ?? 0), 0);
  console.log(`${bilan.length} plan(s), ${total} s de génération au total, ${bilan.reduce((a, b) => a + b.erreurs, 0)} erreur(s) de contrat.`);

  if (!drapeau("--garder") && runsPoses.length) await db.delete(agentRuns).where(inArray(agentRuns.id, runsPoses));
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(2);
  });
