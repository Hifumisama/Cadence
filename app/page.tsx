import { getAllProjects } from "@/lib/queries";
import { phaseDe, totalBuckets } from "@/lib/phase";
import { Topbar } from "@/components/ui/Topbar";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { GrilleProjets } from "@/components/projects/GrilleProjets";
import { SupprimerProjetBouton } from "@/components/projects/SupprimerProjetBouton";
import { NouveauProjetModal } from "@/components/projects/NouveauProjetModal";

export const dynamic = "force-dynamic";

export default async function AccueilPage() {
  const projets = await getAllProjects();

  const totalPlans = projets.reduce((acc, p) => acc + totalBuckets(p.buckets), 0);
  const totalAssets = projets.reduce((acc, p) => acc + p.nbAssets, 0);
  const enProduction = projets.filter((p) => phaseDe(p.buckets) === "prod").length;

  return (
    <>
      <Topbar trail={<span className="here">Projets</span>} />
      <main className="page">
        <div className="screen-hd">
          <h1>Projets</h1>
          <div className="actions" style={{ marginLeft: "auto" }}>
            <NouveauProjetModal />
          </div>
        </div>

        <div className="tally">
          <div className="tally-item">
            <span className="v">{projets.length}</span>
            <span className="k">Projets</span>
          </div>
          <div className="tally-item is-encours">
            <span className="v">{enProduction}</span>
            <span className="k">En production</span>
          </div>
          <span className="tally-spacer" />
          <div className="tally-item">
            <span className="v" style={{ color: "var(--ink-2)" }}>{totalPlans}</span>
            <span className="k">Plans</span>
          </div>
          <div className="tally-item">
            <span className="v" style={{ color: "var(--ink-2)" }}>{totalAssets}</span>
            <span className="k">Assets</span>
          </div>
        </div>

        <GrilleProjets>
          {projets.map((p) => (
            <div key={p.id} className="proj-cell">
              <ProjectCard projet={p} />
              <SupprimerProjetBouton projectId={p.id} nom={p.nom} compact />
            </div>
          ))}
        </GrilleProjets>

        {projets.length === 0 ? (
          <p className="tiny-note" style={{ marginTop: "var(--sp-6)" }}>
            Aucun projet en base. Crée-en un ci-dessus pour commencer.
          </p>
        ) : null}
      </main>
    </>
  );
}
