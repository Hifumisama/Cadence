import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { LAB_ROOT } from "./files";
import { datasetNames, writePage } from "./page";
import { reportOfDataset, reportOfRun } from "./report";
import { launch, planRun } from "./run";

const USAGE = `Usage : npm run labo -- <commande>
  export  <jeu> --projects 259,261,264        fige un jeu depuis la base (lecture seule)
  report  <jeu>                               mesures sur les appels historiques (sans modèle)
  run     <jeu> [--variants A] [--reps 1] [--only 261,264-s2-t1930] [--model X] [--body '{}'] [--launch]
                                              sans --launch : montre ce qui serait fait, n'appelle rien
  compare <dossier d'essai>                   refait le rapport d'un essai
  page    [<jeu>]                             génère la page à ouvrir dans le navigateur`;

function write(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log(`Rapport : ${file}`);
}

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      projects: { type: "string" },
      variants: { type: "string", default: "A" },
      reps: { type: "string", default: "1" },
      only: { type: "string" },
      model: { type: "string" },
      body: { type: "string" },
      launch: { type: "boolean", default: false },
    },
  });
  const [command, target] = positionals;
  if (command === "page") {
    // Without a name, the only dataset there is.
    const names = datasetNames();
    const name = target ?? (names.length === 1 ? names[0] : undefined);
    if (!name) throw new Error(names.length ? `Précise le jeu : ${names.join(", ")}.` : "Aucun jeu dans labo/datasets : lance d'abord « export ».");
    console.log(`Page : ${writePage(name)}`);
    return 0;
  }
  if (!command || !target) {
    console.error(USAGE);
    return 2;
  }
  if (command === "export") {
    const projects = (values.projects ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (projects.length === 0) throw new Error("--projects est obligatoire (ex. --projects 259,261,264).");
    const { exportDataset } = await import("./export");
    console.log(await exportDataset(target, projects));
  } else if (command === "report") {
    write(resolve(LAB_ROOT, "reports", `${target}-historique.md`), reportOfDataset(target));
  } else if (command === "run") {
    const plan = planRun({
      dataset: target,
      variants: values.variants!.split(","),
      repetitions: Number(values.reps),
      only: values.only?.split(","),
      model: values.model,
      body: values.body ? (JSON.parse(values.body) as Record<string, unknown>) : undefined,
    });
    const paired = plan.conditionalCalls ? `, plus jusqu'à ${plan.conditionalCalls} relances de durée` : "";
    console.log(`${plan.cases.length} cas × ${plan.variants.length} variante(s) × ${plan.manifest.repetitions} répétition(s) : ${plan.calls - plan.conditionalCalls} appels${paired} (hors renvois de production)`);
    console.log(`Modèle : ${plan.manifest.model}\nCorps ajouté : ${JSON.stringify(plan.manifest.body)}`);
    if (!values.launch) {
      console.log("Rien n'a été appelé. Ajoute --launch pour lancer (consomme le GPU).");
      return 0;
    }
    const folder = await launch(plan, (line) => console.log(line));
    write(join(folder, "report.md"), reportOfRun(folder));
  } else if (command === "compare") {
    const folder = resolve(target);
    write(join(folder, "report.md"), reportOfRun(folder));
  } else {
    console.error(USAGE);
    return 2;
  }
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error((e as Error).message);
    process.exit(1);
  },
);
