// Banc de generer-plan.mjs : passe les intentions de intentions.json à un ou plusieurs modèles et compte les JSON valides.
//   node tester-generation.mjs [modèle …]        (sans argument : le petit modèle par défaut)
// Écrit sortie/llm/<modèle>/<id>.json (le plan, ou les essais refusés) et sortie/llm/<modèle>/rapport.json.
// « Valide » = accepté par schema.mjs. La fidélité à l'intention se juge à la lecture (ou au rendu) : ce banc ne la mesure pas.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RACINE } from "./schema.mjs";
import { MODELE_PAR_DEFAUT, genererPlan } from "./generer-plan.mjs";

const intentions = JSON.parse(readFileSync(join(RACINE, "intentions.json"), "utf8"));
const modeles = process.argv.slice(2).length ? process.argv.slice(2) : [MODELE_PAR_DEFAUT];

for (const modele of modeles) {
  const dossier = join(RACINE, "sortie", "llm", modele.replace(/[^A-Za-z0-9._-]+/g, "_"));
  mkdirSync(dossier, { recursive: true });
  const lignes = [];
  console.log(`\n== ${modele} ==`);
  for (const { id, duree, texte } of intentions) {
    let ligne;
    try {
      const { plan, essais } = await genererPlan({ intention: texte, duree, id, modele });
      ligne = {
        id,
        premierEssai: essais[0].erreurs.length === 0,
        valide: plan != null,
        essais: essais.length,
        secondes: essais.map((e) => +(e.ms / 1000).toFixed(1)),
        erreurs: essais.flatMap((e) => e.erreurs),
        corrections: essais.at(-1).avertissements,
      };
      writeFileSync(join(dossier, `${id}.json`), `${JSON.stringify(plan ?? { refuse: essais }, null, 2)}\n`);
    } catch (e) {
      ligne = { id, premierEssai: false, valide: false, essais: 0, secondes: [], erreurs: [`appel impossible : ${e.message}`], corrections: [] };
    }
    lignes.push(ligne);
    console.log(`${ligne.premierEssai ? "1er essai" : ligne.valide ? "2e essai " : "REFUSÉ   "}  ${id}  ${ligne.secondes.join(" + ")} s`);
    for (const x of ligne.erreurs) console.log(`    erreur : ${x}`);
    for (const x of ligne.corrections) console.log(`    corrigé : ${x}`);
  }
  const n = lignes.length;
  const bilan = { modele, premierEssai: lignes.filter((l) => l.premierEssai).length, apresReprise: lignes.filter((l) => l.valide).length, total: n };
  writeFileSync(join(dossier, "rapport.json"), `${JSON.stringify({ ...bilan, lignes }, null, 2)}\n`);
  console.log(`→ ${modele} : ${bilan.premierEssai}/${n} valides au premier essai, ${bilan.apresReprise}/${n} après reprise`);
}
