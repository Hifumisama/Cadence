import { lireEtatImages } from "@/lib/assets/queries-images";
import { etapesSuivantes, prochaineEtape } from "@/lib/assets/project-images";
import { BandeauProchaineEtape } from "./ProjectImages";

/** « Prochaine étape » banner of a project (server): reads the state once, then the client polls it. Nothing as long as everything is done. */
export async function ProchaineEtape({ projectId }: { projectId: number }) {
  const images = await lireEtatImages(projectId);
  if (!prochaineEtape(etapesSuivantes(projectId, images))) return null;
  return <BandeauProchaineEtape projectId={projectId} initial={images} />;
}
