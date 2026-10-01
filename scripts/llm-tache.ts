import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { agentRuns } from "../db/schema";
import { listerSkills } from "../lib/llm/skills";
import { PITCH_FICTIF } from "./entrees-fictives";

/** Pose un appel LLM dans la file du worker (table `agent_runs`), sans interface :
 *   npm run llm:tache -- brief-projet [--entree fichier.json|.txt] [--projet <id>]
 *                                      [--modele X] [--suivre]
 * Le worker (`npm run dev:all`) doit tourner : il prend la tâche quand le GPU est
 * libre (image, puis LLM, puis vidéo), décharge ComfyUI si besoin, appelle le
 * modèle et écrit le résultat. `--suivre` affiche l'avancement jusqu'à la fin.
 * La tâche apparaît aussi dans le panneau du header. */

function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const valeurs = new Set(["--entree", "--projet", "--modele"].map((n) => arg(n)).filter(Boolean));
  const skill = process.argv.slice(2).find((a) => !a.startsWith("--") && !valeurs.has(a));
  if (!skill) {
    console.error("Usage : npm run llm:tache -- <skill> [--entree fichier] [--projet id] [--modele X] [--suivre]");
    console.error(`Skills : ${listerSkills().join(", ")}`);
    return 2;
  }
  if (!listerSkills().includes(skill)) {
    console.error(`Skill inconnu : « ${skill} ». Skills : ${listerSkills().join(", ")}`);
    return 2;
  }
  const fichier = arg("--entree");
  const entree = fichier ? readFileSync(fichier, "utf-8") : skill === "brief-projet" ? PITCH_FICTIF : null;
  if (entree == null) {
    console.error(`Pas d'entrée fictive intégrée pour « ${skill} » : passe --entree <fichier>.`);
    return 2;
  }
  const projet = arg("--projet");
  const modele = arg("--modele");

  const [run] = await db
    .insert(agentRuns)
    .values({
      skill,
      entree: fichier?.endsWith(".json") ? JSON.parse(entree) : entree,
      options: modele ? { modele } : null,
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
