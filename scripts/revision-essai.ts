import "dotenv/config";
import { configLlm, modelePourSkill } from "../lib/llm/config";
import { controleurPourSkill } from "../lib/llm/controles";
import { executerSkill } from "../lib/llm/executer";
import { chargerSkill } from "../lib/llm/skills";
import { interpreterAnalyse, type EtatAvantTour, type SortieAnalyse } from "../lib/agents/revision/analyse";
import { construireEntreeAnalyse, entreeReponse } from "../lib/agents/revision/entrees";
import { vueLeSel } from "../lib/agents/revision/fixture-le-sel";
import { tourPur } from "../lib/agents/revision/tour-pur";
import type { MessageConversation } from "../lib/agents/types";

/**
 * Essai du RÉALISATEUR sur le modèle configuré (.env), SANS base de données : l'épisode d'essai « Le sel » de la maquette
 * (lib/agents/revision/fixture-le-sel.ts, 14 plans, 2:34 pour 2:00 visées), une conversation tenue en mémoire, les deux skills
 * (`realisateur-analyse` puis `realisateur-reponse`) appelés pour de vrai à chaque tour.
 *
 *   npm run revision:essai                       les trois parcours de la maquette, l'un après l'autre
 *   npm run revision:essai -- --parcours ressenti|precise|melange
 *   npm run revision:essai -- "Un message" "Un autre message"    ta propre conversation, tour par tour
 *   options : --modele X (les deux skills)  --sans-reponse (n'appelle que l'analyse)  --json (affiche aussi la sortie brute de l'analyse)
 *
 * Un vrai appel par skill et par tour : il occupe le GPU du serveur LLM. Les constats sont ceux du code SANS les aperçus de la base
 * (écrasements de rendus, refus des applicateurs) : on juge ce que le MODÈLE propose, pas l'application complète.
 */

const PARCOURS: Record<string, string[]> = {
  ressenti: ["Je trouve l'épisode trop long, et la scène 1 traîne.", "Combine la 1 et la 3.", "Plan 07 : une réplique plus sobre.", "Garde le 08 et prends la formulation sobre."],
  precise: ["Supprime le plan 04 et le plan 07.", "Coupe seulement le 04.", "La scène 1 est aussi trop lente."],
  melange: ["C'est trop long, mais ne touche pas à la scène 2. Et supprime le plan 04.", "Les deux, scène 2 intacte."],
};

function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function conversation(titre: string, messagesUtilisateur: string[]) {
  console.log(`\n══ ${titre} ══`);
  const vue = vueLeSel();
  const modele = arg("--modele");
  let etat: EtatAvantTour = { vue, decisions: [], pistes: [], ordreSuivant: 1 };
  let decisions: ReturnType<typeof tourPur>["decisions"] = [];
  const historique: MessageConversation[] = [{ role: "assistant", content: "Bonjour. J'ai relu l'épisode : 14 plans, 2:34 pour 2:00 visées. Dis-moi ce qui ne va pas.", at: "" }];

  for (const [i, texte] of messagesUtilisateur.entries()) {
    historique.push({ role: "user", content: texte, at: "" });
    console.log(`\n── tour ${i + 1} · toi : « ${texte} »`);
    const { entree, controle } = construireEntreeAnalyse({ vue, decisions, prochainOrdre: etat.ordreSuivant, pistes: etat.pistes, messages: historique, brief: { arc: "Maya quitte le port où elle a grandi.", dureeEpisodeSecondes: 120, rythme: "soutenu" } });
    const debut = Date.now();
    const analyse = await executerSkill("realisateur-analyse", entree, { modele: modele ?? modelePourSkill("realisateur-analyse"), enregistrer: null, controler: controleurPourSkill("realisateur-analyse", controle) });
    const sortie = analyse.json as SortieAnalyse;
    console.log(`   analyse : ${Math.round((Date.now() - debut) / 1000)} s · ${analyse.usage.entree}+${analyse.usage.sortie} jetons · ${analyse.renvois} renvoi(s)`);
    if (process.argv.includes("--json")) console.log(JSON.stringify(sortie, null, 2));

    const res = interpreterAnalyse({ ...etat, decisions: etat.decisions }, sortie);
    const { decisions: nouvelles, faits } = tourPur(vue, res);
    for (const d of faits.decisions) {
      console.log(`   ${d.id} [${d.statut}] ${d.titre} (${d.gain})`);
      for (const c of d.constats.filter((x) => x.niveau !== "ok")) console.log(`        ${c.niveau === "bloquant" ? "✖" : "!"} ${c.texte}${c.source === "modele" ? "  (jugement du modèle)" : ""}`);
    }
    for (const p of faits.pistes) console.log(`   piste ${p.numero} : ${p.titre} (${p.gain} → ${p.dureeApres})`);
    for (const r of faits.refus) console.log(`   ⚠ refusé — ${r.contexte} : ${r.raison}`);
    console.log(`   durée avec le brouillon : ${faits.duree.avecBrouillon} (visé ${faits.duree.objectif ?? "—"})`);

    etat = { vue, decisions: res.decisions, pistes: res.pistes, ordreSuivant: res.ordreSuivant };
    decisions = nouvelles;

    if (!process.argv.includes("--sans-reponse")) {
      const reponse = await executerSkill("realisateur-reponse", entreeReponse({ episode: { numero: vue.numero, titre: vue.titre }, messages: historique, faits }), {
        modele: modele ?? modelePourSkill("realisateur-reponse"),
        enregistrer: null,
      });
      const texteReponse = (reponse.json as { reponse: string }).reponse;
      historique.push({ role: "assistant", content: texteReponse, at: "" });
      console.log(`\n   réalisateur : ${texteReponse.replace(/\n/g, "\n                 ")}`);
    }
  }
}

async function main(): Promise<number> {
  const conf = configLlm();
  for (const nom of ["realisateur-analyse", "realisateur-reponse"]) {
    const s = chargerSkill(nom);
    console.log(`Skill ${nom} : prompt système ≈ ${s.jetonsEstimes} jetons (${s.caracteres} caractères) · modèle ${arg("--modele") ?? modelePourSkill(nom)}`);
  }
  console.log(`Serveur ${conf.url}`);

  const libres = process.argv.slice(2).filter((a, i, l) => !a.startsWith("--") && l[i - 1] !== "--modele" && l[i - 1] !== "--parcours");
  if (libres.length > 0) await conversation("Ta conversation", libres);
  else {
    const choisi = arg("--parcours");
    const noms = choisi ? [choisi] : Object.keys(PARCOURS);
    for (const nom of noms) {
      if (!PARCOURS[nom]) {
        console.error(`Parcours inconnu : « ${nom} ». Parcours : ${Object.keys(PARCOURS).join(", ")}`);
        return 2;
      }
      await conversation(`Parcours « ${nom} »`, PARCOURS[nom]!);
    }
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
