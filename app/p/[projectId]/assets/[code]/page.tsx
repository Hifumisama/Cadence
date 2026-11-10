import { getPlansPerimes, nbPlansRendusCitant } from "@/lib/plans-perimes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetsRegistre, getFirstEpisodeId, getProject } from "@/lib/queries";
import { AtelierAsset } from "@/components/assets/AtelierAsset";
import { EnteteAsset, FicheProvider } from "@/components/assets/FicheAsset";
import { OngletsAsset, type OngletAsset } from "@/components/assets/OngletsAsset";
import { BlocVoix } from "@/components/voix/BlocVoix";
import { getVoixPersonnage } from "@/lib/queries-master-voix";
import { getAssetsAvecImage, getGenerationsAsset, imageActuelle } from "@/lib/queries-generations";
import { METHODE_MASTER_VOIX } from "@/lib/asset-generation";
import { Topbar } from "@/components/ui/Topbar";
import { delierRef } from "@/app/assets/actions";
import { libelleAsset } from "@/lib/assetCode";
import { Icone } from "@/components/ui/Icone";
import "@/components/assets/fiche-asset.css";
import "@/components/assets/fiche-asset-mise-en-page.css";

export const dynamic = "force-dynamic";

/** La fiche d'un asset : l'en-tête (nom, type, état, description, apparitions) puis des ONGLETS, un par chose que l'asset sait faire — l'image
 * (l'atelier : image en grand, consigne en français, journal d'essais), la voix d'un personnage. Chaque texte se corrige au
 * clic, sur place. Maquette : docs/maquettes/fiche-asset.html. */
export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; code: string }>;
  searchParams: Promise<{ generation?: string; onglet?: string }>;
}) {
  const { projectId, code } = await params;
  const { generation: generationBrute, onglet: ongletBrut } = await searchParams;
  const pid = Number(projectId);
  const [projet, tous, premierEpisodeId] = await Promise.all([getProject(pid), getAssetsRegistre(pid), getFirstEpisodeId(pid)]);
  if (!projet) notFound();
  const noeud = tous.find((a) => a.code === code);
  if (!noeud) notFound();

  const generations = await getGenerationsAsset(noeud.id);
  // Les essais de voix (vidéos de test) ont leur onglet : ils ne se mêlent pas aux essais d'image.
  const generationsImages = generations.filter((g) => g.methode !== METHODE_MASTER_VOIX);
  const voixPerso = noeud.type === "personnage" ? await getVoixPersonnage(pid, noeud.id) : null;
  const blocage = noeud.citations.length > 0 ? "Encore cité par une fiche de plan : délie-le d'abord (pastilles « Apparaît dans »)." : null;
  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;
  const perimes = await getPlansPerimes({ assetId: noeud.id });
  const plansRendus = await nbPlansRendusCitant(noeud.id);
  // Précédent / suivant : l'ordre du registre, pour parcourir les fiches sans repasser par la liste.
  const rang = tous.findIndex((a) => a.id === noeud.id);
  const precedent = rang > 0 ? tous[rang - 1] : null;
  const suivant = rang < tous.length - 1 ? tous[rang + 1] : null;
  const libellesParId = new Map(tous.map((a) => [a.id, libelleAsset(a)]));
  const registreJoignable = (await getAssetsAvecImage(pid, noeud.id)).map((a) => ({ id: a.id, libelle: libellesParId.get(a.id) ?? a.code, src: a.src }));

  // ---- Les onglets : un par chose que cet asset sait faire ----
  const onglets: OngletAsset[] = [];
  const essaisImages = generationsImages.filter((g) => g.methode === "generation" || g.methode === "edition");
  onglets.push({
    id: "image",
    libelle: "Image",
    icone: "image",
    compte: essaisImages.length || undefined,
    contenu: (
      <AtelierAsset
        assetId={noeud.id}
        code={noeud.code}
        libelle={libelleAsset(noeud)}
        imageSrc={imageActuelle(noeud)?.src ?? null}
        fichierAt={noeud.fichierAt ? noeud.fichierAt.getTime() : null}
        valide={noeud.statut === "valide"}
        essais={essaisImages}
        essaiInitial={generationBrute ?? null}
        description={noeud.description ?? ""}
        plansRendus={noeud.fichier ? plansRendus : 0}
        registre={registreJoignable}
      />
    ),
  });

  if (noeud.type === "personnage" && voixPerso) {
    onglets.push({
      id: "voix",
      libelle: "Voix",
      icone: "son",
      point: voixPerso.masterSrc != null,
      contenu: (
        <BlocVoix
          personnageId={noeud.id}
          nom={libelleAsset(noeud)}
          initial={{ description: voixPerso.description, repliqueBase: voixPerso.repliqueBase }}
          master={{ src: voixPerso.masterSrc, videoSrc: voixPerso.videoSrc, portraitSrc: voixPerso.portraitSrc }}
          generations={generations}
          generationInitiale={generationBrute ?? null}
        />
      ),
    });
  }

  // L'onglet d'arrivée : celui de l'adresse, ou celui de l'essai qu'on vient ouvrir depuis l'indicateur des tâches.
  const vientDeLaVoix = generationBrute != null && generations.some((g) => g.uuid === generationBrute && g.methode === METHODE_MASTER_VOIX);
  const initial = ongletBrut ?? (vientDeLaVoix ? "voix" : onglets[0]!.id);

  return (
    <>
      <Topbar
        trail={
          <>
            <Link href="/">Projets</Link>
            <span className="sep">›</span>
            <span className="here">{projet.nom}</span>
            <span className="sep">›</span>
            <Link href={`/p/${pid}/assets`}>Assets</Link>
            <span className="sep">›</span>
            <span className="here">{libelleAsset(noeud)}</span>
          </>
        }
        tabs={{ projectId: pid, episodeBase }}
      />
      <main className="page">
        <FicheProvider>
          <div className="fa">
            <nav className="voisins" aria-label="Fiche précédente et suivante">
              {precedent ? (
                <Link href={`/p/${pid}/assets/${precedent.code}`} rel="prev" title={precedent.code}>
                  ‹ {libelleAsset(precedent)}
                </Link>
              ) : null}
              <span className="rang num">
                {rang + 1} / {tous.length}
              </span>
              {suivant ? (
                <Link href={`/p/${pid}/assets/${suivant.code}`} rel="next" title={suivant.code}>
                  {libelleAsset(suivant)} ›
                </Link>
              ) : null}
            </nav>

            <EnteteAsset
              projectId={pid}
              assetId={noeud.id}
              code={noeud.code}
              libelle={libelleAsset(noeud)}
              type={noeud.type}
              statut={noeud.statut}
              critique={noeud.critique}
              description={noeud.description ?? ""}
              aImage={noeud.fichier != null}
              blocageSuppression={blocage}
              redirectTo={`/p/${pid}/assets`}
            >
              {/* Apparitions : les plans qui citent cet asset (délier : un clic, sans confirmation) */}
              <div className="apparus">
                <span>Apparaît dans</span>
                {noeud.citations.length > 0 ? (
                  noeud.citations.map((c, i) => (
                    <span
                      key={`${c.refId}-${c.planUuid}`}
                      className={`citation${perimes.has(c.planId) ? " perime" : ""}`}
                      style={{ "--i": i } as React.CSSProperties}
                      title={perimes.has(c.planId) ? "Périmé : l'image a changé depuis le dernier rendu de ce plan" : undefined}
                    >
                      <Link href={`/p/${pid}/e/${c.episodeId}/montage/${c.planUuid}`} className="num">
                        E{String(c.episodeNumero).padStart(2, "0")} · {String(c.position).padStart(2, "0")}
                      </Link>
                      <form
                        action={async () => {
                          "use server";
                          await delierRef(c.refId);
                        }}
                      >
                        <button type="submit" className="x" title="Délier de ce plan" aria-label="Délier de ce plan">
                          <Icone nom="fermer" />
                        </button>
                      </form>
                    </span>
                  ))
                ) : (
                  <span className="aucun">Aucun plan ne l&rsquo;utilise encore.</span>
                )}
              </div>
            </EnteteAsset>

            <OngletsAsset onglets={onglets} initial={initial} />
          </div>
        </FicheProvider>
      </main>
    </>
  );
}
