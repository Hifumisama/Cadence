import "dotenv/config";
import { semerLeSel } from "./semis-le-sel";

/**
 * Sème l'épisode « Le sel » de la maquette (14 plans, 3 répliques, rendus sur deux plans, brief à 2:00) dans la base de DATABASE_URL
 * et affiche l'adresse de la page du réalisateur, pour essayer l'interface avec le vrai modèle sans toucher aux projets réels.
 *
 *   npm run revision:semer
 */
async function main() {
  const { projectId, episodeId } = await semerLeSel(`Le sel (essai réalisateur ${new Date().toISOString().slice(0, 16)})`);
  console.log(`\nProjet ${projectId}, épisode ${episodeId} semés.\nPage : http://localhost:3000/p/${projectId}/realisateur/${episodeId}\n`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
