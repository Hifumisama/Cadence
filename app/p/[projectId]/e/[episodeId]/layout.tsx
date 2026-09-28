import Link from "next/link";
import { notFound } from "next/navigation";
import { getEpisodeWithSeason, getProject } from "@/lib/queries";
import { Topbar } from "@/components/ui/Topbar";

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

  const [projet, episodeInfo] = await Promise.all([getProject(pid), getEpisodeWithSeason(eid)]);
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
      <Topbar trail={trail} tabs={{ projectId: pid, episodeBase: base }} />
      <main className="page">{children}</main>
    </>
  );
}
