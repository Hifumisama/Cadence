import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetsTree, getFirstEpisodeId, getProject } from "@/lib/queries";
import { AjouterAssetForm } from "@/components/assets/AjouterAssetForm";
import { AssetCard, type FichierEtat, type MediaKind } from "@/components/assets/AssetCard";
import { AssetFiltres } from "@/components/assets/AssetFiltres";
import { TYPES_ASSET } from "@/lib/assetCode";
import { cheminAssetMedia, estAudio, estVideo, fichierMediaExiste } from "@/lib/media";
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

function infosMedia(type: string, fichier: string | null): { kind: MediaKind; etat: FichierEtat; src: string | null } {
  if (!fichier) return { kind: "image", etat: "aucun", src: null };
  const kind: MediaKind = type === "voix" || type === "sfx" || estAudio(fichier) ? "audio" : estVideo(fichier) ? "video" : "image";
  if (!fichierMediaExiste(fichier)) return { kind, etat: "manquant", src: null };
  return { kind, etat: "ok", src: `/api/media/${cheminAssetMedia(fichier)}` };
}

export default async function AssetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { projectId } = await params;
  const { type: typeBrut } = await searchParams;
  const typeActif = (TYPES_ASSET as readonly string[]).includes(typeBrut ?? "") ? (typeBrut as string) : null;
  const pid = Number(projectId);
  const [projet, masters, premierEpisodeId] = await Promise.all([
    getProject(pid),
    getAssetsTree(pid),
    getFirstEpisodeId(pid),
  ]);
  if (!projet) notFound();

  const compteurs: Record<string, number> = {};
  for (const m of masters) compteurs[m.type] = (compteurs[m.type] ?? 0) + 1;
  const visibles = typeActif ? masters.filter((m) => m.type === typeActif) : masters;

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
          <AssetFiltres base={`/p/${pid}/assets`} actif={typeActif} compteurs={compteurs} total={masters.length} />
          <div className="asset-grid">
            {visibles.map((m) => {
              const { kind, etat, src } = infosMedia(m.type, m.fichier);
              return (
                <AssetCard
                  key={m.id}
                  href={`/p/${pid}/assets/${m.code}`}
                  code={m.code}
                  type={m.type}
                  description={m.description}
                  critique={m.critique}
                  nbDerives={m.derives.length}
                  statut={m.statut}
                  fichier={m.fichier}
                  kind={kind}
                  etat={etat}
                  src={src}
                />
              );
            })}
          </div>
          {masters.length === 0 ? (
            <p className="tiny-note" style={{ padding: "var(--sp-4)" }}>
              Aucun asset en base. Lancer <code>npm run db:import</code> ou en ajouter un
              ci-dessus.
            </p>
          ) : visibles.length === 0 ? (
            <p className="tiny-note" style={{ padding: "var(--sp-4)" }}>Aucun sujet de ce type.</p>
          ) : null}
        </section>
      </main>
    </>
  );
}
