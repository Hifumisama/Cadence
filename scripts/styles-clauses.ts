import "dotenv/config";
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { executerSkill } from "../lib/llm/executer";
import { configLlm, modelePourSkill } from "../lib/llm/config";
import { modeleEffectifPourSkill } from "../lib/llm/modele-choisi";
import { ErreurLlm } from "../lib/llm/types";
import { MEDIA_ROOT } from "../lib/media";
import { bibliothequeStyles } from "../lib/styles/bibliotheque";
import { controlerClause } from "../lib/styles/clause";

/** Produit la clause courte (vidéo) de chaque style de la bibliothèque avec le skill `style-clause`, sur le LLM local, et l'écrit
 * dans `lib/styles/clauses.json` (identifiant → clause). Chaque clause passe par un contrôle automatique (longueur, pas de nom propre,
 * pas de sujet ni de cadrage : lib/styles/clause.ts) ; un défaut déclenche jusqu'à deux renvois. Les clauses qui échouent encore ne sont
 * PAS écrites : elles figurent dans le rapport. Ce fichier se relit et se corrige à la main.
 *
 *   npm run styles:clauses [-- --only ghibli-style,van-gogh-style] [--limite 10] [--force] [--modele X] [--liste]
 *
 * - Reprise : une clause déjà écrite est sautée (sauf --force). Le fichier est relu avant chaque écriture : tes corrections manuelles
 *   et le tri de la bibliothèque ne sont jamais écrasés.
 * - Le modèle suit le choix du header (pastille LLM) sauf --modele. Un vrai appel : il occupe le GPU du serveur LLM. */

function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const drapeau = (nom: string) => process.argv.includes(nom);

const FICHIER = resolve("lib/styles/clauses.json");
const duree = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60_000)} min ${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")} s`);

function lireClauses(): Record<string, string> {
  return existsSync(FICHIER) ? (JSON.parse(readFileSync(FICHIER, "utf-8")) as Record<string, string>) : {};
}
function ecrireClause(id: string, clause: string) {
  const courantes = lireClauses();
  courantes[id] = clause;
  const trie = Object.fromEntries(Object.entries(courantes).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(`${FICHIER}.partiel`, JSON.stringify(trie, null, 2) + "\n");
  renameSync(`${FICHIER}.partiel`, FICHIER); // écriture atomique
}

async function main() {
  const tous = bibliothequeStyles();
  const only = arg("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  if (only) {
    const inconnus = only.filter((id) => !tous.some((s) => s.id === id));
    if (inconnus.length) throw new Error(`Identifiants inconnus : ${inconnus.join(", ")}`);
  }
  const force = drapeau("--force");
  const faites = lireClauses();
  const cibles = tous.filter((s) => !only || only.includes(s.id));
  const limite = arg("--limite") ? Number(arg("--limite")) : Infinity;
  const aFaire = cibles.filter((s) => force || !faites[s.id]).slice(0, limite);
  console.log(`${tous.length} styles, ${cibles.length} ciblés, ${cibles.filter((s) => faites[s.id]).length} déjà faits, ${aFaire.length} à produire.`);
  if (drapeau("--liste")) {
    for (const s of cibles) console.log(`${faites[s.id] ? "✓" : "·"} ${s.id}${faites[s.id] ? `  ${faites[s.id]}` : ""}`);
    return;
  }
  if (!aFaire.length) return;

  let modele = arg("--modele");
  if (!modele) {
    try {
      modele = await modeleEffectifPourSkill("style-clause");
    } catch {
      modele = modelePourSkill("style-clause");
    }
  }
  console.log(`Serveur ${configLlm().url} · modèle ${modele} · skill style-clause (sans réflexion)\n`);

  const rejets: { id: string; clause: string; erreurs: string[] }[] = [];
  const echecs: { id: string; erreur: string }[] = [];
  const debut = Date.now();
  let faits = 0;
  let interrompu = false;
  process.on("SIGINT", () => {
    if (interrompu) process.exit(130);
    interrompu = true;
    console.log("\nInterruption demandée : fin du style en cours, puis arrêt.");
  });

  for (const [i, s] of aFaire.entries()) {
    if (interrompu) break;
    const t0 = Date.now();
    try {
      const r = await executerSkill("style-clause", { nom: s.nom, descriptor: s.descriptor }, {
        modele,
        enregistrer: null,
        maxRenvois: 2,
        controler: (json) => controlerClause(String((json as { clause?: unknown })?.clause ?? ""), s),
      });
      const clause = String((r.json as { clause: string }).clause).trim();
      const erreurs = controlerClause(clause, s);
      if (erreurs.length) {
        rejets.push({ id: s.id, clause, erreurs });
        console.log(`[${i + 1}/${aFaire.length}] ${s.id} REJETÉE : ${erreurs.join(" ")}`);
      } else {
        ecrireClause(s.id, clause);
        faits++;
        const moyenne = (Date.now() - debut) / (faits + rejets.length + echecs.length);
        console.log(`[${i + 1}/${aFaire.length}] ${s.id} (${duree(Date.now() - t0)}, reste ≈ ${duree(moyenne * (aFaire.length - i - 1))})\n    ${clause}`);
      }
    } catch (e) {
      const erreur = e instanceof ErreurLlm ? `${e.code} : ${e.message}` : e instanceof Error ? e.message : String(e);
      echecs.push({ id: s.id, erreur });
      console.error(`[${i + 1}/${aFaire.length}] ${s.id} ÉCHEC : ${erreur}`);
      // Serveur injoignable : inutile d'enchaîner les 245 échecs.
      if (e instanceof ErreurLlm && /injoignable|unreachable|indispon/i.test(`${e.code} ${e.message}`)) break;
    }
  }

  console.log(`\nTerminé : ${faits} clause(s) écrite(s) en ${duree(Date.now() - debut)}, ${rejets.length} rejetée(s), ${echecs.length} échec(s)${interrompu ? ", interrompu" : ""}.`);
  if (rejets.length || echecs.length) {
    const dossier = join(MEDIA_ROOT, "_essais");
    mkdirSync(dossier, { recursive: true });
    const chemin = join(dossier, `styles-clauses-${new Date().toISOString().slice(0, 10)}.md`);
    const rapport = [
      `# Clauses de style non écrites (${new Date().toISOString()})`,
      "",
      ...rejets.map((r) => `## ${r.id} (rejetée)\n\n> ${r.clause}\n\n${r.erreurs.map((e) => `- ${e}`).join("\n")}\n`),
      ...echecs.map((e) => `## ${e.id} (échec)\n\n${e.erreur}\n`),
    ].join("\n");
    writeFileSync(chemin, rapport);
    console.log(`Rapport : ${chemin}`);
    console.log(`Relancer : npm run styles:clauses -- --only ${[...rejets.map((r) => r.id), ...echecs.map((e) => e.id)].join(",")} --force`);
    process.exitCode = 1;
  }
  void dirname;
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
