import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { agentRuns } from "../db/schema";
import { listerSkills } from "../lib/llm/skills";

/** Queues an LLM call in the worker's queue (table `agent_runs`), without interface:
 *   npm run llm:task -- <skill> [--entree fichier.json|.txt] [--projet <id>]
 *                                      [--modele X] [--variante V] [--suivre]
 * The worker (`npm run dev:all`) must be running: it picks up the task when the GPU is
 * free (image, then LLM, then video), unloads ComfyUI if needed, calls the
 * model and writes the result. `--suivre` (follow) shows the progress until the end.
 * The task also appears in the header panel. */

function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const valeurs = new Set(["--entree", "--projet", "--modele", "--variante"].map((n) => arg(n)).filter(Boolean));
  const skill = process.argv.slice(2).find((a) => !a.startsWith("--") && !valeurs.has(a));
  if (!skill) {
    console.error("Usage : npm run llm:task -- <skill> [--entree fichier] [--projet id] [--modele X] [--suivre]");
    console.error(`Skills : ${listerSkills().join(", ")}`);
    return 2;
  }
  if (!listerSkills().includes(skill)) {
    console.error(`Skill inconnu : « ${skill} ». Skills : ${listerSkills().join(", ")}`);
    return 2;
  }
  const fichier = arg("--entree");
  const entree = fichier ? readFileSync(fichier, "utf-8") : null;
  if (entree == null) {
    console.error(`Pas d'entrée fictive intégrée pour « ${skill} » : passe --entree <fichier>.`);
    return 2;
  }
  const projet = arg("--projet");
  const modele = arg("--modele");
  const variante = arg("--variante");

  const [run] = await db
    .insert(agentRuns)
    .values({
      skill,
      entree: fichier?.endsWith(".json") ? JSON.parse(entree) : entree,
      options: modele || variante ? { ...(modele ? { modele } : {}), ...(variante ? { variante } : {}) } : null,
      projectId: projet ? Number(projet) : null,
    })
    .returning();
  console.log(`Tâche posée : llm:${run!.uuid} (id ${run!.id}, skill ${skill}) — le worker la prendra quand le GPU sera libre.`);

  if (!process.argv.includes("--suivre")) return 0;
  let dernier = "";
  for (;;) {
    const [r] = await db.select().from(agentRuns).where(eq(agentRuns.id, run!.id));
    const ligne = `${r!.statut}${r!.progressionJetons != null ? ` · ${r!.progressionJetons} jetons` : ""}`;
    if (ligne !== dernier) {
      console.log(ligne);
      dernier = ligne;
    }
    if (r!.statut === "termine") {
      console.log(JSON.stringify(r!.resultat, null, 2).slice(0, 1500));
      return 0;
    }
    if (r!.statut === "echoue" || r!.statut === "annulee") {
      if (r!.erreur) console.error(r!.erreur);
      return r!.statut === "annulee" ? 0 : 1;
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(2);
  });
