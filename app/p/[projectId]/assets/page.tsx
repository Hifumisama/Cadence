import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetsRegistre, getFirstEpisodeId, getProject } from "@/lib/queries";
import { assetsEnFile, nbImagesEnAttente } from "@/lib/queries-taches";
import { lireEtatImages } from "@/lib/queries-images";
import { PLAFOND_LOT_IMAGES, preparerLot, type AssetPourLot } from "@/lib/generation-lot";
import { AjouterAssetForm } from "@/components/assets/AjouterAssetForm";
import { RegistreAssets } from "@/components/assets/RegistreAssets";
import { TYPES_ASSET, libelleAsset } from "@/lib/assetCode";
import { infosMedia } from "@/lib/assetMedia";
import type { LigneRegistre } from "@/lib/registre-types";
import { Topbar } from "@/components/ui/Topbar";

export const dynamic = "force-dynamic";

export default async function AssetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { projectId } = await params;
  const { type: typeBrut } = await searchParams;
  const typeInitial = (TYPES_ASSET as readonly string[]).includes(typeBrut ?? "") ? (typeBrut as string) : null;
  const pid = Number(projectId);
  const [projet, tous, premierEpisodeId, enFile, nbEnAttente, images] = await Promise.all([
    getProject(pid),
    getAssetsRegistre(pid),
    getFirstEpisodeId(pid),
    assetsEnFile(pid),
    nbImagesEnAttente(),
    lireEtatImages(pid),
  ]);
  if (!projet) notFound();

  // Génération en lot : ce qui peut partir et pourquoi le reste ne peut pas (règles dans lib/generation-lot.ts).
  const pourLot: AssetPourLot[] = tous.map((a) => ({
    id: a.id,
    code: a.code,
    type: a.type,
    promptGeneration: a.promptGeneration,
    methodeGeneration: a.methodeGeneration,
    fichier: a.fichier,
    deriveDeId: a.deriveDeId,
  }));
  const planLot = preparerLot(pourLot, pourLot, enFile, Math.max(0, PLAFOND_LOT_IMAGES - nbEnAttente));
  const raisonPar = new Map(planLot.ecartes.map((e) => [e.assetId, e.raison]));

  const lignes: LigneRegistre[] = tous
    .map((a) => {
      const { kind, etat, src } = infosMedia(a.type, a.fichier);
      return {
        id: a.id,
        code: a.code,
        libelle: libelleAsset(a),
        type: a.type,
        statut: a.statut,
        critique: a.critique,
        description: a.description,
        nbPlans: a.nbPlans,
        voix: a.type === "personnage" ? (a.voixMaster ? { code: "voix fixée" } : null) : undefined,
        kind,
        etat,
        src,
        fichier: a.fichier,
        blocageSuppression: a.citations.length > 0 ? "cité dans une fiche de plan" : null,
        raisonLot: a.type === "sfx" ? "un son se génère depuis sa fiche" : (raisonPar.get(a.id) ?? null),
      };
    });

  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;

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
        tabs={{ projectId: pid, episodeBase }}
      />
      <main className="page">
        <div className="screen-hd">
          <div>
            <p className="eyebrow" style={{ margin: "0 0 6px" }}>
              Registre unique pour tout le projet
            </p>
            <h1>Assets</h1>
            <p>Les images de référence du projet. La voix d'un personnage se règle sur sa fiche.</p>
          </div>
          <div className="actions" style={{ marginLeft: "auto", display: "flex", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 }}>
            <AjouterAssetForm projectId={pid} />
          </div>
        </div>

        <RegistreAssets projectId={pid} lignes={lignes} typeInitial={typeInitial} imagesInitial={images} />
      </main>
    </>
  );
}
