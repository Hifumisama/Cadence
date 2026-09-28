import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getEpisodeUnique, getProjectHierarchy } from "@/lib/queries";
import { totalBuckets } from "@/lib/phase";
import { posterSrc } from "@/lib/media";
import { Topbar } from "@/components/ui/Topbar";
import { SaisonSection } from "@/components/projects/SaisonSection";
import { CreerSaisonButton } from "@/components/projects/CreerSaisonButton";
import { ProjectEditModal } from "@/components/projects/ProjectEditModal";

export const dynamic = "force-dynamic";

export default async function VueSeriePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const id = Number(projectId);
  const hierarchie = await getProjectHierarchy(id);
  if (!hierarchie) notFound();
  const { projet, saisons, buckets, nbEpisodes } = hierarchie;

  // Un OneShot n'a jamais d'écran Saisons — son unique épisode s'ouvre
  // directement (décision du 2026-09-28).
  if (projet.type === "oneshot") {
    const unique = await getEpisodeUnique(id);
    if (!unique) notFound();
    redirect(`/p/${id}/e/${unique.episode.id}/scenario`);
  }

  return (
    <>
      <Topbar
        trail={
          <>
            <Link href="/">Projets</Link>
            <span className="sep">›</span>
            <span className="here">{projet.nom}</span>
          </>
        }
      />
      <main className="page">
        <div className="screen-hd">
          <div>
            <p className="eyebrow" style={{ margin: "0 0 6px" }}>
              Série · {saisons.length} saison{saisons.length > 1 ? "s" : ""}
            </p>
            <h1>{projet.nom}</h1>
            <p>
              Cliquer sur un épisode pour ouvrir son Scénario, ses Assets et ses Shots.
              Chaque épisode numérote ses plans à partir de 010.
            </p>
          </div>
          <div className="actions">
            <ProjectEditModal projectId={id} nom={projet.nom} posterSrc={posterSrc("projects", id, projet.posterFichier)} />
            <CreerSaisonButton projectId={id} />
          </div>
        </div>

        <div className="tally">
          <div className="tally-item">
            <span className="v">{totalBuckets(buckets)}</span>
            <span className="k">Plans</span>
          </div>
          <div className="tally-item is-termine">
            <span className="v">{buckets.termine}</span>
            <span className="k">Terminés</span>
          </div>
          <div className="tally-item is-encours">
            <span className="v">{buckets.actif}</span>
            <span className="k">En cours</span>
          </div>
          <span className="tally-spacer" />
          <div className="tally-item">
            <span className="v" style={{ color: "var(--ink-2)" }}>{nbEpisodes}</span>
            <span className="k">Épisodes</span>
          </div>
        </div>

        {saisons.map((s) => (
          <SaisonSection key={s.id} projectId={id} saison={s} />
        ))}
        {saisons.length === 0 ? (
          <p className="tiny-note" style={{ marginTop: "var(--sp-6)" }}>
            Aucune saison pour l&rsquo;instant.
          </p>
        ) : null}
      </main>
    </>
  );
}
