import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefDossier } from "@/components/brief/BriefDossier";
import { BriefVide } from "@/components/brief/BriefVide";
import { Topbar } from "@/components/ui/Topbar";
import { lireBriefOuVide } from "@/lib/queries-agents";
import { getFirstEpisodeId, getProject } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Le brief du projet : la référence que l'agent lit pour toutes ses demandes (ton, style,
 * personnages, durée…). Modifiable ici comme dans la popup ; une demande à l'agent peut aussi
 * le faire évoluer (la revue le montre comme un changement du brief). */
export default async function BriefPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  const [projet, premierEpisodeId] = await Promise.all([getProject(pid), getFirstEpisodeId(pid)]);
  if (!projet) notFound();
  const brief = await lireBriefOuVide(pid, projet.nom);
  // « partiel » : pas de brief rédigé, seuls le style et les notes ont pu être posés à la main.
  const redige = brief.statut !== "partiel";
  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;

  return (
    <>
      <Topbar
        trail={
          <>
            <Link href="/">Projets</Link>
            <span className="sep">›</span>
            {projet.type === "serie" ? <Link href={`/p/${pid}`}>{projet.nom}</Link> : <span className="here">{projet.nom}</span>}
            <span className="sep">›</span>
            <span className="here">Brief</span>
          </>
        }
        tabs={{ projectId: pid, episodeBase }}
      />
      <main className="page">
        {redige ? <BriefDossier projectId={pid} nomProjet={projet.nom} brief={brief} /> : <BriefVide projectId={pid} nomProjet={projet.nom} brief={brief} />}
      </main>
    </>
  );
}
