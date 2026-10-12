import { lireEtatImages } from "@/lib/queries-images";
import { etapesSuivantes, prochaineEtape } from "@/lib/images-projet";
import { BandeauProchaineEtape } from "./ImagesProjet";

/** Bandeau « Prochaine étape » d'un projet (serveur) : lit l'état une fois, puis le client le sonde. Rien tant que tout est fait. */
export async function ProchaineEtape({ projectId }: { projectId: number }) {
  const images = await lireEtatImages(projectId);
  if (!prochaineEtape(etapesSuivantes(projectId, images))) return null;
  return <BandeauProchaineEtape projectId={projectId} initial={images} />;
}
