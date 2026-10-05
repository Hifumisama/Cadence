import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assets, episodes, projects, seasons } from "@/db/schema";
import { GenerationPanel } from "@/components/assets/GenerationPanel";
import { RetirerAfficheButton } from "@/components/affiches/RetirerAfficheButton";
import { Poster } from "@/components/ui/Poster";
import { Topbar } from "@/components/ui/Topbar";
import { TYPE_AFFICHE, cibleDeCodeAffiche, formatAfficheParDefaut } from "@/lib/affiches";
import { posterSrc } from "@/lib/media";
import { getAssetsAvecImage, getGenerationsAsset, imageActuelle } from "@/lib/queries-generations";
import "./affiche.css";

export const dynamic = "force-dynamic";

/** Génération de l'image de présentation d'un projet ou d'un épisode. Même fenêtre, mêmes candidats et même « Utiliser »
 * que pour un asset (l'affiche s'appuie sur un asset d'un type à part, invisible du registre — lib/affiches.ts). La page
 * n'existe que si l'asset a été créé par le bouton « Générer une image » : jamais d'écriture en simple lecture. */
export default async function AffichePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; code: string }>;
  searchParams: Promise<{ generation?: string }>;
}) {
  const { projectId, code } = await params;
  const { generation } = await searchParams;
  const pid = Number(projectId);
  const cible = cibleDeCodeAffiche(code);
  if (!cible) notFound();

  const [[asset], [projet]] = await Promise.all([
    db.select().from(assets).where(and(eq(assets.projectId, pid), eq(assets.code, code), eq(assets.type, TYPE_AFFICHE))),
    db.select().from(projects).where(eq(projects.id, pid)),
  ]);
  if (!asset || !projet) notFound();

  let titre: string;
  let posterFichier: string | null;
  let retour: string;
  if (cible.cible === "projects") {
    if (cible.id !== pid) notFound();
    titre = projet.nom;
    posterFichier = projet.posterFichier;
    retour = `/p/${pid}`;
  } else {
    const [ligne] = await db
      .select({ titre: episodes.titre, poster: episodes.posterFichier })
      .from(episodes)
      .innerJoin(seasons, eq(seasons.id, episodes.seasonId))
      .where(and(eq(episodes.id, cible.id), eq(seasons.projectId, pid)));
    if (!ligne) notFound();
    titre = ligne.titre;
    posterFichier = ligne.poster;
    retour = `/p/${pid}/e/${cible.id}/scenario`;
  }

  const [generations, registre] = await Promise.all([getGenerationsAsset(asset.id), getAssetsAvecImage(pid, asset.id)]);
  const src = posterSrc(cible.cible, cible.id, posterFichier);
  const format = formatAfficheParDefaut(cible.cible);
  const sujet = cible.cible === "projects" ? "du projet" : "de l'épisode";

  return (
    <>
      <Topbar
        trail={
          <>
            <Link href="/">Projets</Link>
            <span className="sep">›</span>
            <Link href={retour}>{projet.nom}</Link>
            <span className="sep">›</span>
            <span className="here">Image de présentation</span>
          </>
        }
      />
      <main className="page">
        <div className="screen-hd">
          <div>
            <h1>Image de présentation</h1>
            <p>
              {sujet} « {titre} »
            </p>
          </div>
          <div className="actions" style={{ marginLeft: "auto" }}>
            <Link className="btn btn-ghost" href={retour}>
              Retour
            </Link>
          </div>
        </div>

        <div className="aff-corps">
          <div className="aff-apercus">
            <div className="aff-apercu">
              <span className="eyebrow">Sur les cartes</span>
              <Poster src={src} titre={titre} cleRepli={cible.cible === "projects" ? `projet:${pid}` : `episode:${cible.id}`} taille="card" />
            </div>
            <div className="aff-apercu">
              <span className="eyebrow">En-tête</span>
              <Poster src={src} titre={titre} cleRepli={cible.cible === "projects" ? `projet:${pid}` : `episode:${cible.id}`} taille="wide" />
            </div>
          </div>

          <div className="aff-actions">
            <p>
              L&rsquo;IA compose l&rsquo;image à partir du titre, du résumé et de la clause de style du projet. Le titre n&rsquo;est pas dans l&rsquo;image : il se superpose à l&rsquo;affichage, comme ci-contre.
            </p>
            <div className="aff-boutons">
              <GenerationPanel
                assetId={asset.id}
                code={asset.code}
                type={asset.type}
                methodeGeneration={asset.methodeGeneration}
                parentCode={null}
                promptInitial={asset.promptGeneration ?? ""}
                raisonBloquee={null}
                defauts={{ aspect: format.aspect, megapixels: format.megapixels, lora: false }}
                registre={registre}
                imageActuelle={imageActuelle(asset)}
                dureeSecondes={null}
                generations={generations}
                generationInitiale={generation ?? null}
                simule={(process.env.COMFYUI_MODE ?? "stub") !== "http"}
                libelleBouton="Générer une image"
              />
              {src ? <RetirerAfficheButton cible={cible.cible} id={cible.id} /> : null}
            </div>
            <p className="tiny-note">
              Chaque génération donne un candidat : ouvre la fenêtre pour les comparer, puis « Utiliser » en fait l&rsquo;image de présentation.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
