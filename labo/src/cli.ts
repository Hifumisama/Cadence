import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { REASONING_CAMPAIGN } from "./campaign";
import { duelReport, writeDuels, type DuelKey, type DuelVotes } from "./duel";
import { serveDuels } from "./duel-server";
import { awaitsReading, LAB_ROOT, readDataset, readRun } from "./files";
import { lightReport, technicalReport, writeLightDuels } from "./light";
import { datasetNames, writePage } from "./page";
import { serverProbes } from "./probes";
import { writeReading, type ReadingKey } from "./reading";
import { reportOfDataset, reportOfRun } from "./report";
import { launch, planRun } from "./run";
import { scoreReport, type Votes } from "./score";
import { pilotReport, reasoningVerdict } from "./score-reasoning";

const USAGE = `Usage : npm run labo -- <commande>
  export  <jeu> --projects 259,261,264        fige un jeu depuis la base (lecture seule)
  report  <jeu>                               mesures sur les appels historiques (sans modèle)
  run     <jeu> [--variants A] [--reps 1] [--only 261,264-s2-t1930] [--model X] [--body '{}'] [--launch]
                                              sans --launch : montre ce qui serait fait, n'appelle rien
  run     <jeu> --campaign 02 --base A|B|C [--pilot] [--launch]
                                              campagne 02 (réflexion) ; --pilot : 3 scènes, avec réflexion
  run     <jeu> --campaign 04 --reuse <essai de la campagne 01> [--launch]
                                              expérience 04 : une scène, T1 et T2, premières réponses
  compare <dossier d'essai>                   refait le rapport d'un essai
  read    <dossier d'essai>                   prépare la lecture à l'aveugle
  score   <dossier d'essai> --votes <fichier> applique la règle de décision aux notes
  duels   <dossier d'essai> [--port 4750]     duels à l'aveugle : sert la page et enregistre les réponses (ne s'arrête qu'ensuite)
  duels-score <dossier d'essai>               rapport des réponses (confirmation : avec son seuil)
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
      variants: { type: "string" },
      reps: { type: "string" },
      only: { type: "string" },
      model: { type: "string" },
      body: { type: "string" },
      campaign: { type: "string" },
      base: { type: "string" },
      pilot: { type: "boolean", default: false },
      votes: { type: "string" },
      port: { type: "string" },
      reuse: { type: "string" },
      launch: { type: "boolean", default: false },
    },
  });
  const [command, target] = positionals;
  if (command === "page") {
    // Without a name, the only dataset there is.
    const names = datasetNames();
    const name = target ?? (names.length === 1 ? names[0] : undefined);
    if (!name) throw new Error(names.length ? `Précise le jeu : ${names.join(", ")}.` : "Aucun jeu dans labo/datasets : lance d'abord « export ».");
    const page = writePage(name);
    console.log(`Page : ${page.file}`);
    if (page.hidden) console.log(`${page.hidden} essai(s) masqué(s) : lecture à l'aveugle pas encore notée.`);
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
    if (values.campaign && !["01", "02", "04"].includes(values.campaign)) throw new Error(`Campagne inconnue : « ${values.campaign} » (01, 02 ou 04).`);
    const light = values.campaign === "04";
    const reasoning = values.campaign === "02" || light;
    const plan = planRun({
      dataset: target,
      variants: values.variants?.split(",") ?? (reasoning ? [] : ["A"]),
      repetitions: Number(values.reps ?? (values.campaign === "02" && !values.pilot ? REASONING_CAMPAIGN.repetitions : 1)),
      only: values.only?.split(","),
      model: values.model,
      body: values.body ? (JSON.parse(values.body) as Record<string, unknown>) : undefined,
      ...(reasoning ? { campaign: light ? ("04" as const) : ("02" as const) } : {}),
      base: values.base,
      pilot: values.pilot,
      reuse: values.reuse ? basename(resolve(values.reuse)) : undefined,
    });
    const paired = plan.conditionalCalls ? `, plus jusqu'à ${plan.conditionalCalls} relances de durée` : "";
    console.log(`${plan.cases.length} cas × ${plan.variants.length} variante(s) × ${plan.manifest.repetitions} répétition(s) : ${plan.calls - plan.conditionalCalls} appels${paired} (hors renvois de production)`);
    console.log(`Modèle : ${plan.manifest.model}`);
    if (reasoning) {
      if (light) console.log(`Scène ${plan.manifest.cases[0]} ; T0 repris de ${plan.manifest.reuse!.run} (aucun appel)`);
      else console.log(`Base : variante ${plan.manifest.base}${plan.manifest.pilot ? " (pilote)" : ""}`);
      for (const v of plan.manifest.variants) console.log(`${v.id} : ${JSON.stringify(v.body)} · plafond ${v.maxTokens} jetons`);
      if (plan.variants.some((v) => v.ownRetry)) console.log("La base relance les scènes trop courtes : un appel de plus au maximum par scène et par version.");
    } else console.log(`Corps ajouté : ${JSON.stringify(plan.manifest.body)}`);
    if (!values.launch) {
      console.log("Rien n'a été appelé. Ajoute --launch pour lancer (consomme le GPU).");
      return 0;
    }
    const folder = await launch(plan, (line) => console.log(line), undefined, undefined, reasoning ? serverProbes() : {});
    if (light) {
      const { manifest, records } = readRun(folder);
      write(join(folder, "technical.md"), technicalReport(manifest, records));
      console.log(`Essai : ${folder}\nLance « duels » sur ce dossier.`);
    } else if (plan.manifest.pilot) {
      const { manifest, records } = readRun(folder);
      write(join(folder, "report.md"), reportOfRun(folder));
      write(join(folder, "pilot.md"), pilotReport(manifest, records));
    } else if (plan.variants.length > 1) {
      console.log(`Essai : ${folder}\nPas de rapport comparatif avant la lecture à l'aveugle : lance « read » sur ce dossier.`);
    } else write(join(folder, "report.md"), reportOfRun(folder));
  } else if (command === "compare") {
    const folder = resolve(target);
    if (awaitsReading(folder, readRun(folder).manifest)) console.log("Attention : la lecture à l'aveugle n'est pas notée, ce rapport la dévoile.");
    write(join(folder, "report.md"), reportOfRun(folder));
  } else if (command === "read") {
    console.log(`Lecture à l'aveugle : ${writeReading(resolve(target))}`);
  } else if (command === "duels") {
    const folder = resolve(target);
    const light = readRun(folder).manifest.campaign === "04";
    if (light) writeLightDuels(folder);
    else writeDuels(folder);
    const server = await serveDuels(folder, Number(values.port ?? 4750), light ? "duels" : "confirmation");
    console.log(`Duels à ouvrir : ${server.url}`);
    console.log(`Réponses enregistrées : ${await server.saved}`);
  } else if (command === "duels-score") {
    const run = resolve(target);
    const light = readRun(run).manifest.campaign === "04";
    const folder = join(run, light ? "duels" : "confirmation");
    const json = <T>(name: string) => JSON.parse(readFileSync(join(folder, name), "utf8")) as T;
    write(join(folder, "verdict.md"), light ? lightReport(run, json<DuelVotes>("votes.json")) : duelReport(json<DuelKey>("key.json"), json<DuelVotes>("votes.json")));
  } else if (command === "score") {
    if (!values.votes) throw new Error("--votes est obligatoire : le fichier téléchargé depuis la page de lecture.");
    const folder = resolve(target);
    const { manifest, records } = readRun(folder);
    const key = JSON.parse(readFileSync(join(folder, "reading", "key.json"), "utf8")) as ReadingKey;
    const votes = JSON.parse(readFileSync(resolve(values.votes), "utf8")) as Votes;
    const report = manifest.campaign === "02" ? reasoningVerdict(manifest, records, key, votes) : scoreReport(manifest, records, readDataset(manifest.dataset), key, votes);
    // Saved only once they proved complete: from here the run is no longer hidden.
    writeFileSync(join(folder, "reading", "votes.json"), `${JSON.stringify(votes, null, 2)}\n`);
    write(join(folder, "report.md"), reportOfRun(folder));
    write(join(folder, "verdict.md"), report);
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
