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

  // The breadcrumb stops at the project name: the film's single episode never appears in the nav.
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
        {/* The film's identity (title, poster, summary, style) lives in the brief; the work pages only keep the next step. */}
        <ProchaineEtape projectId={pid} />
        {children}
      </main>
    </>
  );
}
