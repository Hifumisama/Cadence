import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetsTree, getFirstEpisodeId, getProject, type AssetNode } from "@/lib/queries";
import { assetsEnFile, nbImagesEnAttente } from "@/lib/queries-taches";
import { PLAFOND_LOT_IMAGES, preparerLot, type AssetPourLot } from "@/lib/generation-lot";
import { AjouterAssetForm } from "@/components/assets/AjouterAssetForm";
import { RegistreAssets } from "@/components/assets/RegistreAssets";
import { TYPES_ASSET } from "@/lib/assetCode";
import { infosMedia } from "@/lib/assetMedia";
import type { LigneRegistre } from "@/lib/registre-types";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import { Topbar } from "@/components/ui/Topbar";

export const dynamic = "force-dynamic";

/** Le registre est PLAT : un asset est un asset, qu'il serve d'image de départ à d'autres ou non (`deriveDeId` n'est plus
 * qu'une indication de départ pour la génération, il ne range plus rien). */
const aplatir = (noeuds: AssetNode[]): AssetNode[] => noeuds.flatMap((n) => [n, ...aplatir(n.derives)]);

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
  const [projet, racines, premierEpisodeId, enFile, nbEnAttente] = await Promise.all([
    getProject(pid),
    getAssetsTree(pid),
    getFirstEpisodeId(pid),
    assetsEnFile(pid),
    nbImagesEnAttente(),
  ]);
  if (!projet) notFound();

  const tous = aplatir(racines).sort((a, b) => a.code.localeCompare(b.code));

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

  // Les voix vivent au casting : elles ne figurent pas dans la grille, un lien y renvoie.
  const nbVoix = tous.filter((a) => a.type === "voix").length;
  const lignes: LigneRegistre[] = tous
    .filter((a) => a.type !== "voix")
    .map((a) => {
      const { kind, etat, src } = infosMedia(a.type, a.fichier);
      const citationsReelles = a.citations.filter((c) => !c.deduite);
      return {
        id: a.id,
        code: a.code,
        type: a.type,
        statut: a.statut,
        critique: a.critique,
        description: a.description,
        nbPlans: new Set(a.citations.map((c) => c.planUuid)).size,
        voix: a.type === "personnage" ? (a.voix ? { code: a.voix.code } : null) : undefined,
        kind,
        etat,
        src,
        fichier: a.fichier,
        blocageSuppression:
          citationsReelles.length > 0
            ? "cité dans une fiche de plan"
            : a.nbRepliques > 0
              ? `locuteur de ${a.nbRepliques} réplique${a.nbRepliques > 1 ? "s" : ""}`
              : null,
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
            <p>Les images de référence du projet. Les voix se gèrent au casting.</p>
          </div>
          <div className="actions">
            <AjouterAssetForm projectId={pid} />
            <BoutonAgent
              className="btn btn-ghost"
              libelle="Créer le registre depuis le brief"
              demande={{ projectId: pid, portee: "projet", cible: null, profondeur: "complete", libelle: projet.nom, vue: "registre" }}
              titre="L'agent écrit le prompt de chaque personnage et lieu du brief et crée les assets qui manquent"
            />
          </div>
        </div>

        <RegistreAssets projectId={pid} lignes={lignes} nbVoix={nbVoix} typeInitial={typeInitial} />
      </main>
    </>
  );
}
