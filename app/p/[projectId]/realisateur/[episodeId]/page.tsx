import Link from "next/link";
import { notFound } from "next/navigation";
import { SalleRevision } from "@/components/revision/SalleRevision";
import { Topbar } from "@/components/ui/Topbar";
import { amorceDePlan, lireVueRevision, nbDecisionsEnCours, ouvrirRevision } from "@/lib/agents/revision/revision-db";
import { getEpisodeWithSeason, getProject } from "@/lib/queries";

export const dynamic = "force-dynamic";

const two = (n: number) => String(n).padStart(2, "0");

/** La révision d'un épisode avec le réalisateur : une conversation libre, des décisions qui s'accumulent en brouillon, une application par
 * glissière. La page ouvre ou reprend la révision de l'épisode ; une révision terminée laisse la place à une neuve. `?plan=<uuid>` vient d'un
 * plan : il propose un début de message, sans rien envoyer. Hors du layout d'épisode (pas de grand panneau) : une salle plein cadre, comme
 * la conception et le casting vocal. Décisions : docs/FRICTIONS.md, 2026-10-09 (révision d'épisode). */
export default async function RealisateurPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; episodeId: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const [{ projectId, episodeId }, { plan }] = await Promise.all([params, searchParams]);
  const pid = Number(projectId);
  const eid = Number(episodeId);
  if (!Number.isInteger(pid) || !Number.isInteger(eid)) notFound();

  const [projet, info] = await Promise.all([getProject(pid), getEpisodeWithSeason(eid)]);
  if (!projet || !info || info.season.projectId !== pid) notFound();
  const { episode, season } = info;

  const ouverture = await ouvrirRevision(pid, eid);
  if (!ouverture.ok) notFound();
  const [vue, amorce, brouillon] = await Promise.all([lireVueRevision(ouverture.conversationUuid), amorceDePlan(eid, plan), nbDecisionsEnCours(pid, eid)]);
  if (!vue) notFound();

  const trail =
    projet.type === "oneshot" ? (
      <>
        <Link href="/">Projets</Link>
        <span className="sep">›</span>
        <Link href={`/p/${pid}/e/${eid}/scenario`}>{projet.nom}</Link>
        <span className="sep">›</span>
        <span className="here">Réalisateur</span>
      </>
    ) : (
      <>
        <Link href="/">Projets</Link>
        <span className="sep">›</span>
        <Link href={`/p/${pid}`}>{projet.nom}</Link>
        <span className="sep">›</span>
        <Link href={`/p/${pid}`}>S{two(season.numero)}</Link>
        <span className="sep">›</span>
        <Link href={`/p/${pid}/e/${eid}/scenario`}>E{two(episode.numero)}</Link>
        <span className="sep">›</span>
        <span className="here">Réalisateur</span>
      </>
    );

  return (
    <>
      <Topbar trail={trail} tabs={{ projectId: pid, episodeBase: `/p/${pid}/e/${eid}`, brouillon }} />
      <main>
        <SalleRevision projectId={pid} episodeId={eid} numeroEpisode={episode.numero} titreEpisode={episode.titre} initial={vue} amorce={amorce} planCible={amorce ? plan ?? null : null} />
      </main>
    </>
  );
}
