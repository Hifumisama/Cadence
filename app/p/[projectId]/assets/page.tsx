import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetsTree, getFirstEpisodeId, getProject } from "@/lib/queries";
import { AjouterAssetForm } from "@/components/assets/AjouterAssetForm";
import { AssetPreview } from "@/components/assets/AssetPreview";
import { Topbar } from "@/components/ui/Topbar";

export const dynamic = "force-dynamic";

function compterTout(masters: Awaited<ReturnType<typeof getAssetsTree>>): number {
  return masters.reduce((acc, m) => acc + 1 + compterTout(m.derives), 0);
}

function compterValides(masters: Awaited<ReturnType<typeof getAssetsTree>>): number {
  return masters.reduce(
    (acc, m) => acc + (m.statut === "valide" ? 1 : 0) + compterValides(m.derives),
    0,
  );
}

function compterCritiques(masters: Awaited<ReturnType<typeof getAssetsTree>>): number {
  return masters.reduce(
    (acc, m) => acc + (m.critique ? 1 : 0) + compterCritiques(m.derives),
    0,
  );
}

export default async function AssetsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  const [projet, masters, premierEpisodeId] = await Promise.all([
    getProject(pid),
    getAssetsTree(pid),
    getFirstEpisodeId(pid),
  ]);
  if (!projet) notFound();

  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;

  return (
    <>
      <Topbar
        trail={
          <>
            <Link href="/">Projets</Link>
            <span className="sep">›</span>
            {projet.type === "serie" ? <Link href={`/p/${pid}`}>{projet.nom}</Link> : <span className="here">{projet.nom}</span>}
            {projet.type === "serie" ? (
              <>
                <span className="sep">›</span>
                <span className="here">Assets</span>
              </>
            ) : null}
          </>
        }
        tabs={{ projectId: pid, episodeBase }}
      />
      <main className="page">
        <div className="screen-hd">
          <div>
            <p className="eyebrow" style={{ margin: "0 0 6px" }}>
              Registre unique pour tout le projet
            </p>
            <h1>Assets</h1>
            <p>
              Un sujet = un master et ses dérivés. Cliquer sur un sujet pour voir son
              arbre complet et les plans où il apparaît.
            </p>
          </div>
        </div>

        <div className="tally">
          <div className="tally-item">
            <span className="v">{compterTout(masters)}</span>
            <span className="k">Assets</span>
          </div>
          <div className="tally-item">
            <span className="v" style={{ color: "var(--ecarlate-glow)" }}>{compterCritiques(masters)}</span>
            <span className="k">Critiques</span>
          </div>
          <div className="tally-item is-termine">
            <span className="v">{compterValides(masters)}</span>
            <span className="k">Validés</span>
          </div>
          <span className="tally-spacer" />
          <div className="tally-item">
            <span className="v" style={{ color: "var(--ink-2)" }}>{masters.length}</span>
            <span className="k">Sujets</span>
          </div>
        </div>

        <AjouterAssetForm projectId={pid} />

        <section className="panel">
          <div className="panel-hd">
            <h2>Sujets</h2>
          </div>
          <div>
            {masters.map((m) => (
              <Link key={m.id} href={`/p/${pid}/assets/${m.code}`} className="subj-row">
                <AssetPreview type={m.type} fichier={m.fichier} taille="sm" />
                <span className="asset-code">
                  {m.code}
                  {m.critique ? <span className="crit-tag" style={{ marginLeft: 8 }}>Critique</span> : null}
                </span>
                <span className="type-tag">{m.type}</span>
                <span className="subj-desc">{m.description ?? "—"}</span>
                <span className="subj-kids">
                  {m.derives.length > 0 ? `${m.derives.length} dérivé${m.derives.length > 1 ? "s" : ""}` : "aucun dérivé"}
                </span>
                <span className={`badge ${m.statut === "valide" ? "b-termine" : m.statut === "en_cours" ? "b-rejoue" : "b-attente"}`}>
                  <i />
                  {m.statut === "valide" ? "Validé" : m.statut === "en_cours" ? "En cours" : "À produire"}
                </span>
              </Link>
            ))}
            {masters.length === 0 ? (
              <p className="tiny-note" style={{ padding: "var(--sp-4)" }}>
                Aucun asset en base. Lancer <code>npm run db:import</code> ou en ajouter un
                ci-dessus.
              </p>
            ) : null}
          </div>
        </section>
      </main>
    </>
  );
}
