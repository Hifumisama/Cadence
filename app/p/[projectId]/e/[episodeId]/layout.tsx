import Link from "next/link";
import { notFound } from "next/navigation";
import { getEpisodeWithSeason, getEtatPlans, getProject } from "@/lib/queries";
import { nbDecisionsEnCours } from "@/lib/agents/revision/revision-db";
import { posterSrc } from "@/lib/media";
import { Topbar } from "@/components/ui/Topbar";
import { ProchaineEtape } from "@/components/images/ProchaineEtape";
import { EtatPlans } from "@/components/scenario/EtatPlans";
import { EpisodeInfoPanel } from "@/components/projects/EpisodeInfoPanel";

function two(n: number): string {
  return String(n).padStart(2, "0");
}

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

  const [projet, episodeInfo, etat, brouillon] = await Promise.all([getProject(pid), getEpisodeWithSeason(eid), getEtatPlans(eid), nbDecisionsEnCours(pid, eid)]);
  if (!projet || !episodeInfo || episodeInfo.season.projectId !== pid) notFound();
  const { episode, season } = episodeInfo;

  const base = `/p/${pid}/e/${eid}`;

  // Le fil d'Ariane d'un OneShot s'arrête au nom du projet : la saison et
  // l'épisode techniques créés automatiquement n'apparaissent jamais dans
  // la nav (décision du 2026-09-28).
  const trail =
    projet.type === "oneshot" ? (
      <>
        <Link href="/">Projets</Link>
        <span className="sep">›</span>
        <span className="here">{projet.nom}</span>
      </>
    ) : (
      <>
        <Link href="/">Projets</Link>
        <span className="sep">›</span>
        <Link href={`/p/${pid}`}>{projet.nom}</Link>
        <span className="sep">›</span>
        <Link href={`/p/${pid}`}>S{two(season.numero)}</Link>
        <span className="sep">›</span>
        <span className="here">E{two(episode.numero)}</span>
        <span className="ep-t">{episode.titre}</span>
      </>
    );

  return (
    <>
      <Topbar trail={trail} tabs={{ projectId: pid, episodeBase: base, brouillon }} />
      <main className="page">
        {/* Un film n'a pas de page d'accueil (son épisode unique s'ouvre directement) : le bandeau vit ici. Une série l'a sur /p/<id>. */}
        {projet.type === "oneshot" ? <ProchaineEtape projectId={pid} /> : null}
        <EpisodeInfoPanel
          projectId={pid}
          episodeId={episode.id}
          numero={episode.numero}
          resume={episode.resume}
          etatPlans={
            <EtatPlans
              {...etat}
              demandeFiches={{
                projectId: pid,
                portee: "episode",
                cible: { id: eid },
                profondeur: "courte",
                libelle: projet.type === "oneshot" ? projet.nom : `Épisode ${two(episode.numero)}`,
                episodeId: eid,
                vue: "fiches",
              }}
            />
          }
          clauseStyle={projet.clauseStyle}
          oneshot={
            projet.type === "oneshot"
              ? { nom: projet.nom, posterSrc: posterSrc("projects", pid, projet.posterFichier) }
              : null
          }
          titre={episode.titre}
          posterSrc={posterSrc("episodes", episode.id, episode.posterFichier)}
        />
        {children}
      </main>
    </>
  );
}
