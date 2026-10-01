import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetsTree, getFirstEpisodeId, getProject, type AssetNode } from "@/lib/queries";
import { StatutSelector } from "@/components/assets/StatutSelector";
import { AssetTree } from "@/components/assets/AssetTree";
import { AssetPreview } from "@/components/assets/AssetPreview";
import { UploadFichierForm } from "@/components/assets/UploadFichierForm";
import { GenerationPanel } from "@/components/assets/GenerationPanel";
import { getAssetsAvecImage, getGenerationsAsset, imageActuelle } from "@/lib/queries-generations";
import { formatParDefaut, loraParDefaut, raisonNonGenerable } from "@/lib/asset-generation";
import { AssetFicheEditor } from "@/components/assets/AssetFicheEditor";
import { SupprimerAssetButton } from "@/components/assets/SupprimerAssetButton";
import { Topbar } from "@/components/ui/Topbar";
import { TYPES_ASSET } from "@/lib/assetCode";
import { AssignerVoix } from "@/components/assets/AssignerVoix";
import { delierRef } from "@/app/assets/actions";

export const dynamic = "force-dynamic";

function trouverNoeud(masters: AssetNode[], code: string): AssetNode | null {
  for (const m of masters) {
    if (m.code === code) return m;
    const trouve = trouverNoeud(m.derives, code);
    if (trouve) return trouve;
  }
  return null;
}

function aplatir(masters: AssetNode[]): AssetNode[] {
  return masters.flatMap((m) => [m, ...aplatir(m.derives)]);
}

function trouverMasterDe(masters: AssetNode[], code: string): AssetNode | null {
  for (const m of masters) {
    if (m.code === code) return m;
    if (contientCode(m.derives, code)) return m;
  }
  return null;
}

function contientCode(noeuds: AssetNode[], code: string): boolean {
  return noeuds.some((n) => n.code === code || contientCode(n.derives, code));
}

function trouverParentCode(masters: AssetNode[], code: string, parent: string | null = null): string | null {
  for (const m of masters) {
    if (m.code === code) return parent;
    const trouve = trouverParentCode(m.derives, code, m.code);
    if (trouve !== null) return trouve;
  }
  return null;
}

const STATUTS_FILTRABLES = ["valide", "en_cours", "a_produire"];

export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; code: string }>;
  searchParams: Promise<{ statut?: string; type?: string }>;
}) {
  const { projectId, code } = await params;
  const { statut: statutBrut, type: typeBrut } = await searchParams;
  const filtres = {
    statut: STATUTS_FILTRABLES.includes(statutBrut ?? "") ? (statutBrut as string) : null,
    type: (TYPES_ASSET as readonly string[]).includes(typeBrut ?? "") ? (typeBrut as string) : null,
  };
  const pid = Number(projectId);
  const [projet, masters, premierEpisodeId] = await Promise.all([
    getProject(pid),
    getAssetsTree(pid),
    getFirstEpisodeId(pid),
  ]);
  if (!projet) notFound();
  const master = trouverMasterDe(masters, code);
  if (!master) notFound();

  const noeud = trouverNoeud([master], code) ?? master;
  const parentCode = trouverParentCode(masters, noeud.code);
  const [generations, registreImages] =
    noeud.type === "voix" ? [[], []] : await Promise.all([getGenerationsAsset(noeud.id), getAssetsAvecImage(pid, noeud.id)]);
  // Voix du catalogue pas encore rattachées à un personnage — ce que « Assigner
  // une voix » propose (la voix actuelle du personnage s'y ajoute d'elle-même).
  const voixLibres = aplatir(masters)
    .filter((n) => n.type === "voix" && n.personnageCode == null)
    .map((n) => ({ id: n.id, code: n.code }));
  // Une voix « citée » par ses répliques ne bloque rien (citation déduite) ; un
  // personnage qui porte des répliques, si.
  const citationsReelles = noeud.citations.filter((c) => !c.deduite);
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
            <Link href={`/p/${pid}/assets`}>Assets</Link>
            <span className="sep">›</span>
            <span className="here">{noeud.code}</span>
          </>
        }
        tabs={{ projectId: pid, episodeBase }}
      />
      <main className="page">
        <div className="crumbs">
          <Link href={`/p/${pid}/assets`} style={{ color: "var(--or)" }}>
            Assets
          </Link>
          <span>/</span>
          <Link href={`/p/${pid}/assets/${master.code}`} className="num" style={{ color: noeud.id === master.id ? "var(--ink)" : "var(--or)" }}>
            {master.code}
          </Link>
          {noeud.id !== master.id ? (
            <>
              <span>/</span>
              <span className="num" style={{ color: "var(--ink)" }}>{noeud.code}</span>
            </>
          ) : null}
        </div>

        <section className="panel" style={{ marginBottom: "var(--sp-5)" }}>
          <div className="panel-hd">
            <h1 className="master-code">{noeud.code}</h1>
            <div className="fiche-actions">
              <span className="type-tag">{noeud.type}</span>
              {noeud.type !== "voix" && parentCode ? (
                <span className="type-tag" title="Méthode de fabrication de l'image">
                  {noeud.methodeGeneration === "edition" ? "édition" : noeud.methodeGeneration === "generation" ? "génération" : "méthode ?"}
                </span>
              ) : null}
              {noeud.type === "voix" ? (
                <Link href={`/p/${pid}/voix/${noeud.code}`} className="btn btn-gold btn-mini">
                  Modifier au casting
                </Link>
              ) : null}
              {noeud.critique ? <span className="crit-tag">Critique</span> : null}
              <StatutSelector assetId={noeud.id} statut={noeud.statut} />
              <SupprimerAssetButton
                assetId={noeud.id}
                code={noeud.code}
                bloque={noeud.derives.length > 0 || citationsReelles.length > 0 || noeud.nbRepliques > 0}
                raisonBlocage={
                  noeud.derives.length > 0
                    ? `A encore ${noeud.derives.length} dérivé(s) — supprime-les d'abord.`
                    : citationsReelles.length > 0
                      ? "Encore cité dans une fiche de plan — délie-le ci-dessous d'abord."
                      : noeud.nbRepliques > 0
                        ? `Locuteur de ${noeud.nbRepliques} réplique${noeud.nbRepliques > 1 ? "s" : ""} — change leur locuteur ou supprime-les d'abord.`
                        : null
                }
                redirectTo={parentCode ? `/p/${pid}/assets/${parentCode}` : `/p/${pid}/assets`}
              />
            </div>
          </div>
          <div className="panel-bd asset-fiche-body">
            <div className="asset-fiche-media">
              <AssetPreview type={noeud.type} fichier={noeud.fichier} taille="lg" />
              {noeud.type === "voix" ? null : (
                <div className="asset-fiche-actions">
                  <UploadFichierForm assetId={noeud.id} code={noeud.code} />
                  <GenerationPanel
                    assetId={noeud.id}
                    code={noeud.code}
                    type={noeud.type}
                    methodeGeneration={noeud.methodeGeneration}
                    parentCode={parentCode}
                    promptInitial={noeud.promptGeneration ?? ""}
                    raisonBloquee={raisonNonGenerable(noeud)}
                    defauts={{ aspect: formatParDefaut(noeud.type).aspect, megapixels: formatParDefaut(noeud.type).megapixels, lora: loraParDefaut(noeud.type) && parentCode == null }}
                    registre={registreImages}
                    imageActuelle={imageActuelle(noeud)}
                    generations={generations}
                    simule={(process.env.COMFYUI_MODE ?? "stub") !== "http"}
                  />
                </div>
              )}
              {noeud.fichier ? <span className="tiny-note num">{noeud.fichier}</span> : null}
            </div>
            <div className="asset-fiche-info">
              <AssetFicheEditor
                assetId={noeud.id}
                type={noeud.type}
                parentCode={parentCode}
                description={noeud.description ?? ""}
                promptGeneration={noeud.promptGeneration ?? ""}
                methodeGeneration={noeud.methodeGeneration}
                critique={noeud.critique}
              />
              {noeud.type === "personnage" ? (
                <AssignerVoix
                  projectId={pid}
                  personnageId={noeud.id}
                  voixActuelle={noeud.voix}
                  voixLibres={voixLibres}
                  nbRepliques={noeud.nbRepliques}
                />
              ) : null}
              {noeud.type === "voix" && noeud.personnageCode ? (
                <div className="field-group">
                  <label>Personnage</label>
                  <div className="voix-lien">
                    <Link href={`/p/${pid}/assets/${noeud.personnageCode}`} className="type-tag">
                      {noeud.personnageCode}
                    </Link>
                  </div>
                </div>
              ) : null}
              <div className="field-group">
                <label>Plans d&rsquo;apparition</label>
                {noeud.citations.length > 0 ? (
                  <div className="chips">
                    {noeud.citations.map((c) => (
                      <span key={`${c.refId ?? "voix"}-${c.planUuid}`} className="chip-citation">
                        <Link href={`/p/${pid}/e/${c.episodeId}/plans/${c.planUuid}`}>E{String(c.episodeNumero).padStart(2, "0")} · {String(c.position).padStart(2, "0")}</Link>
                        {c.refId != null ? (
                          <form
                            action={async () => {
                              "use server";
                              await delierRef(c.refId!);
                            }}
                          >
                            <button type="submit" title="Délier de ce plan">
                              ×
                            </button>
                          </form>
                        ) : null}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="chip-none">Aucun plan pour l&rsquo;instant.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-hd">
            <h2>Arborescence</h2>
            <span className="eyebrow">sujet {master.code}</span>
          </div>
          <div className="panel-bd">
            <AssetTree
              projectId={pid}
              master={master}
              actifCode={noeud.code}
              filtres={filtres}
              base={`/p/${pid}/assets/${noeud.code}`}
            />
          </div>
        </section>
      </main>
    </>
  );
}
