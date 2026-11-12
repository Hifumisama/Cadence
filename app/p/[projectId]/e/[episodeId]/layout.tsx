import Link from "next/link";
import { notFound } from "next/navigation";
import { getEpisode, getProject } from "@/lib/queries";
import { Topbar } from "@/components/ui/Topbar";
import { ProchaineEtape } from "@/components/images/NextStep";

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

  const [projet, episode] = await Promise.all([getProject(pid), getEpisode(eid)]);
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
        {/* L'identité du film (titre, affiche, résumé, style) vit dans le brief ; les pages de travail ne gardent que la prochaine étape. */}
        <ProchaineEtape projectId={pid} />
        {children}
      </main>
    </>
  );
}
