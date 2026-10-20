import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assets, episodes, projects } from "@/db/schema";
import { AtelierAsset } from "@/components/assets/AtelierAsset";
import { AfficheZoom } from "@/components/affiches/AfficheZoom";
import { ReglagesAffiche } from "@/components/affiches/ReglagesAffiche";
import { RetirerAfficheButton } from "@/components/affiches/RetirerAfficheButton";
import { Poster } from "@/components/ui/Poster";
import { Topbar } from "@/components/ui/Topbar";
import { lirePersonnagePrincipal } from "@/lib/agents/affiche";
import { TYPE_AFFICHE, cibleDeCodeAffiche, titreDansPrompt } from "@/lib/affiches";
import { posterSrc } from "@/lib/media";
import { getAssetsAvecImage, getGenerationsAsset, imageActuelle } from "@/lib/queries-generations";
import "./affiche.css";

export const dynamic = "force-dynamic";

/** Génération de l'image de présentation d'un projet ou d'un épisode. Le même atelier que la fiche d'un asset (consigne en français,
 * journal d'essais, « Utiliser cet essai » : l'affiche s'appuie sur un asset d'un type à part, invisible du registre — lib/affiches.ts). La page
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
      .where(and(eq(episodes.id, cible.id), eq(episodes.projectId, pid)));
    if (!ligne) notFound();
    titre = ligne.titre;
    posterFichier = ligne.poster;
    retour = `/p/${pid}/e/${cible.id}/scenario`;
  }

  const [generations, registre, principal] = await Promise.all([
    getGenerationsAsset(asset.id),
    getAssetsAvecImage(pid, asset.id),
    lirePersonnagePrincipal(db, pid),
  ]);
  const essais = generations.filter((g) => g.methode === "generation" || g.methode === "edition");
  const joignables = registre.map((a) => ({ id: a.id, libelle: a.code, src: a.src }));
  // Le personnage principal (s'il a une image) est joint d'office à la première consigne : c'est ce qui garde l'affiche cohérente avec le registre.
  const perso = principal?.aImage ? registre.find((r) => r.code === principal.code) : undefined;
  const jointesInitiales = perso ? [{ origine: "asset" as const, assetId: perso.id, cle: `perso-${perso.id}`, src: perso.src, libelle: perso.code }] : [];
  const src = posterSrc(cible.cible, cible.id, posterFichier);
  const sujet = cible.cible === "projects" ? "du projet" : "de l'épisode";
  const cleRepli = cible.cible === "projects" ? `projet:${pid}` : `episode:${cible.id}`;

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
              <span className="eyebrow">Aperçu{src ? " · clique pour agrandir" : ""}</span>
              <AfficheZoom src={src} titre={titre}>
                <Poster src={src} titre={titre} cleRepli={cleRepli} taille="card" />
              </AfficheZoom>
              {asset.promptGeneration ? (
                <details className="aff-prompt">
                  <summary>Prompt de cette affiche</summary>
                  <pre>{asset.promptGeneration}</pre>
                </details>
              ) : null}
            </div>
          </div>

          <div className="aff-actions">
            <p>
              L&rsquo;IA compose l&rsquo;image à partir du titre, du résumé et de la clause de style du projet. Par défaut le titre n&rsquo;est pas dans l&rsquo;image : il se superpose à l&rsquo;affichage, comme ci-contre.
            </p>
            <ReglagesAffiche
              cible={cible.cible}
              id={cible.id}
              titreDansImage={titreDansPrompt(asset.promptGeneration ?? "")}
              personnage={principal ? { nom: principal.nom, aImage: principal.aImage } : null}
            />
            {src ? (
              <div className="aff-boutons">
                <RetirerAfficheButton cible={cible.cible} id={cible.id} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="fa">
          <AtelierAsset
            key={asset.promptGeneration ?? ""}
            assetId={asset.id}
            code={asset.code}
            libelle={`Affiche · ${titre}`}
            imageSrc={imageActuelle(asset)?.src ?? null}
            fichierAt={asset.fichierAt ? asset.fichierAt.getTime() : null}
            valide={false}
            essais={essais}
            essaiInitial={generation ?? null}
            description={asset.description ?? ""}
            plansRendus={0}
            raisonBloquee={null}
            registre={joignables}
            affiche
            jointesInitiales={jointesInitiales}
          />
        </div>
      </main>
    </>
  );
}
