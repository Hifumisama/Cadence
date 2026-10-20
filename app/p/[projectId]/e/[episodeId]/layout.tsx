import Link from "next/link";
import { notFound } from "next/navigation";
import { getEpisode, getEtatPlans, getProject } from "@/lib/queries";
import { posterSrc } from "@/lib/media";
import { Topbar } from "@/components/ui/Topbar";
import { ProchaineEtape } from "@/components/images/ProchaineEtape";
import { EtatPlans } from "@/components/scenario/EtatPlans";
import { EpisodeInfoPanel } from "@/components/projects/EpisodeInfoPanel";

export default async function EpisodeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string; episodeId: string }>;
}) {
  const { projectId, episodeId } = await params;
  const pid = Number(projectId);
  const eid = Number(episodeId);

  const [projet, episode, etat] = await Promise.all([getProject(pid), getEpisode(eid), getEtatPlans(eid)]);
  if (!projet || !episode || episode.projectId !== pid) notFound();

  const base = `/p/${pid}/e/${eid}`;

  // Le fil d'Ariane s'arrête au nom du projet : l'épisode unique du film n'apparaît jamais dans la nav.
  const trail = (
    <>
      <Link href="/">Projets</Link>
      <span className="sep">›</span>
      <span className="here">{projet.nom}</span>
    </>
  );

  return (
    <>
      <Topbar trail={trail} tabs={{ projectId: pid, episodeBase: base }} />
      <main className="page">
        {/* Un film n'a pas de page d'accueil (son épisode unique s'ouvre directement) : le bandeau vit ici. */}
        <ProchaineEtape projectId={pid} />
        <EpisodeInfoPanel
          projectId={pid}
          episodeId={episode.id}
          nom={projet.nom}
          resume={episode.resume}
          etatPlans={
            <EtatPlans
              {...etat}
              demandeFiches={{
                projectId: pid,
                portee: "episode",
                cible: { id: eid },
                profondeur: "courte",
                libelle: projet.nom,
                episodeId: eid,
                vue: "fiches",
              }}
            />
          }
          clauseStyle={projet.clauseStyle}
          posterSrc={posterSrc("projects", pid, projet.posterFichier)}
        />
        {children}
      </main>
    </>
  );
}
