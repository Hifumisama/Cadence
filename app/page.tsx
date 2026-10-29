import { getAllProjects } from "@/lib/queries";
import { phaseDe, totalBuckets } from "@/lib/phase";
import { Topbar } from "@/components/ui/Topbar";
import { ListeProjets } from "@/components/projects/ListeProjets";
import Link from "next/link";
import { Icone } from "@/components/ui/Icone";

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
        <section className="accueil-hero">
          <div className="accueil-hero-texte">
            <p className="accueil-etiquette">Atelier de production</p>
            <h1>Projets</h1>
            <p className="accueil-sous-titre">Un projet, un film : de l&rsquo;entretien à l&rsquo;image finale.</p>
          </div>
          <dl className="accueil-chiffres">
            <div>
              <dd>{projets.length}</dd>
              <dt>Projets</dt>
            </div>
            <div className={enProduction > 0 ? "is-encours" : undefined}>
              <dd>{enProduction}</dd>
              <dt>En production</dt>
            </div>
            <div>
              <dd>{totalPlans}</dd>
              <dt>Plans</dt>
            </div>
            <div>
              <dd>{totalAssets}</dd>
              <dt>Assets</dt>
            </div>
          </dl>
          <Link className="btn btn-gold accueil-cta" href="/nouveau">
            <Icone nom="ajouter" taille={15} /> Nouveau projet
          </Link>
        </section>

        <ListeProjets projets={projets} />
      </main>
    </>
  );
}
