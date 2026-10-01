import "dotenv/config";
import { readFileSync } from "node:fs";
import { ErreurLlm } from "../lib/llm/types";
import { executerSkill } from "../lib/llm/executer";
import { configLlm, modelePourSkill } from "../lib/llm/config";
import { chargerSkill, listerSkills } from "../lib/llm/skills";
import { PITCH_FICTIF } from "./entrees-fictives";

/** Essai d'un skill d'agent sur le fournisseur configuré (.env) :
 *   npm run llm:essai -- brief-projet [--modele gemma4-26b-A4B] [--sans-contrainte]
 *                                     [--entree fichier.json|.txt] [--sans-trace]
 *   npm run llm:essai -- --skills         (liste les skills et la taille de leur prompt)
 * Entrée fictive intégrée pour `brief-projet` ; les autres skills demandent --entree.
 * Un vrai appel : il occupe le GPU du serveur LLM le temps de la génération. */


function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (process.argv.includes("--skills")) {
    for (const nom of listerSkills()) {
      const s = chargerSkill(nom);
      console.log(`${nom.padEnd(18)} ${String(s.caracteres).padStart(7)} caractères ≈ ${String(s.jetonsEstimes).padStart(6)} jetons (estimation)  ${s.fichiers.length} fichiers`);
    }
    return 0;
  }

  const nom = process.argv.slice(2).find((a) => !a.startsWith("--") && a !== arg("--modele") && a !== arg("--entree"));
  if (!nom) {
    console.error("Usage : npm run llm:essai -- <skill> [--modele X] [--sans-contrainte] [--entree fichier] [--sans-trace] | --skills");
    return 2;
  }
  const fichierEntree = arg("--entree");
  const entree = fichierEntree
    ? readFileSync(fichierEntree, "utf-8")
    : nom === "brief-projet"
      ? PITCH_FICTIF
      : null;
  if (entree == null) {
    console.error(`Pas d'entrée fictive intégrée pour « ${nom} » : passe --entree <fichier>.`);
    return 2;
  }

  const modele = arg("--modele") ?? modelePourSkill(nom);
  const conf = configLlm();
  const skill = chargerSkill(nom);
  console.log(`Skill ${nom} : prompt système ≈ ${skill.jetonsEstimes} jetons estimés (${skill.caracteres} caractères)`);
  console.log(`Serveur ${conf.url} · modèle ${modele} · flux ${conf.flux ? "oui" : "non"} · sortie ${process.argv.includes("--sans-contrainte") ? "NON contrainte" : "contrainte par le schéma"}`);

  let dernierAffiche = 0;
  try {
    const r = await executerSkill(nom, entree, {
      modele,
      contrainte: !process.argv.includes("--sans-contrainte"),
      enregistrer: process.argv.includes("--sans-trace") ? null : undefined,
      surProgres: (n) => {
        if (n - dernierAffiche >= 200) {
          dernierAffiche = n;
          process.stdout.write(`\r… ${n} jetons reçus`);
        }
      },
    });
    process.stdout.write("\r");
    console.log(`\nStatut : VALIDE contre le schéma (renvois : ${r.renvois})`);
    console.log(`Durée ${(r.dureeMs / 1000).toFixed(1)} s · jetons entrée ${r.usage.entree} · sortie ${r.usage.sortie} · ${(r.usage.sortie / Math.max(r.dureeMs / 1000, 0.001)).toFixed(1)} jetons/s (sortie, durée totale incluse)`);
    console.log("\n" + JSON.stringify(r.json, null, 2));
    return 0;
  } catch (e) {
    process.stdout.write("\r");
    if (e instanceof ErreurLlm) {
      console.error(`\nÉCHEC (${e.code}) : ${e.message}`);
      const d = e.details as { erreurs?: string[]; texte?: string } | undefined;
      if (d?.erreurs) console.error(d.erreurs.map((x) => `  - ${x}`).join("\n"));
      if (d?.texte) console.error(`\nDébut de la sortie :\n${d.texte.slice(0, 1500)}`);
    } else {
      console.error(e);
    }
    return 1;
  }
}

main().then((c) => process.exit(c));
