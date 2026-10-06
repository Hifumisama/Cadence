import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetsTree, getFirstEpisodeId, getProject, type AssetNode } from "@/lib/queries";
import { Sommaire, type EntreeSommaire } from "@/components/brief/Sommaire";
import { AssetPreview } from "@/components/assets/AssetPreview";
import { UploadFichierForm } from "@/components/assets/UploadFichierForm";
import { GenerationPanel } from "@/components/assets/GenerationPanel";
import { AssignerVoix } from "@/components/assets/AssignerVoix";
import { NouvelAssetDepuis } from "@/components/assets/NouvelAssetDepuis";
import { BlocTexte, BoutonCopier, EnteteAsset, FicheProvider, RendusAsset, ReglagesAsset } from "@/components/assets/FicheAsset";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import { getAssetsAvecImage, getGenerationsAsset, imageActuelle } from "@/lib/queries-generations";
import { formatParDefaut, loraParDefaut, raisonAudioNonGenerable, raisonNonGenerable } from "@/lib/asset-generation";
import { Topbar } from "@/components/ui/Topbar";
import { delierRef } from "@/app/assets/actions";
import { Icone } from "@/components/ui/Icone";

export const dynamic = "force-dynamic";

/** Le registre est plat : `derives` n'est plus un rang mais la liste des assets dont l'image PART de celui-ci. */
const aplatir = (noeuds: AssetNode[]): AssetNode[] => noeuds.flatMap((n) => [n, ...aplatir(n.derives)]);

const nbMots = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** La fiche d'un asset : une pile de blocs, comme le brief — l'image d'abord (c'est le sujet), puis la génération, les
 * apparitions dans les plans et, pour un personnage, sa voix. Chaque texte se corrige au clic, sur place. */
export default async function AssetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; code: string }>;
  searchParams: Promise<{ generation?: string }>;
}) {
  const { projectId, code } = await params;
  const { generation: generationBrute } = await searchParams;
  const pid = Number(projectId);
  const [projet, racines, premierEpisodeId] = await Promise.all([getProject(pid), getAssetsTree(pid), getFirstEpisodeId(pid)]);
  if (!projet) notFound();
  const tous = aplatir(racines);
  const noeud = tous.find((a) => a.code === code);
  if (!noeud) notFound();

  const depart = noeud.deriveDeId != null ? (tous.find((a) => a.id === noeud.deriveDeId) ?? null) : null;
  const servis = noeud.derives;
  const sonOuVoix = noeud.type === "voix" || noeud.type === "sfx";

  // Un son n'a pas besoin du registre d'images (sources du mode « images »).
  const [generations, registreImages] =
    noeud.type === "voix"
      ? [[], []]
      : await Promise.all([
          getGenerationsAsset(noeud.id),
          noeud.type === "sfx" ? Promise.resolve([] as Awaited<ReturnType<typeof getAssetsAvecImage>>) : getAssetsAvecImage(pid, noeud.id),
        ]);
  // Voix du catalogue pas encore rattachées à un personnage — ce que « Assigner une voix » propose.
  const voixLibres = tous.filter((n) => n.type === "voix" && n.personnageCode == null).map((n) => ({ id: n.id, code: n.code }));
  // Une voix « citée » par ses répliques ne bloque rien (citation déduite) ; un personnage qui porte des répliques, si.
  const citationsReelles = noeud.citations.filter((c) => !c.deduite);
  const blocage =
    citationsReelles.length > 0
      ? "Encore cité dans une fiche de plan : délie-le d'abord (badges « Apparaît dans »)."
      : noeud.nbRepliques > 0
        ? `Locuteur de ${noeud.nbRepliques} réplique${noeud.nbRepliques > 1 ? "s" : ""} : change leur locuteur ou supprime-les d'abord.`
        : null;
  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;
  const promptVide = !(noeud.promptGeneration ?? "").trim();

  const entrees: EntreeSommaire[] = [
    { id: "as-haut", label: "Vue d'ensemble" },
    { id: "as-image", label: sonOuVoix ? "Son" : "Image" },
    ...(noeud.type === "voix" ? [] : [{ id: "as-generation", label: "Génération" }]),
    ...(noeud.type === "personnage" ? [{ id: "as-voix", label: "Voix" }] : []),
  ];

  const Titre = ({ titre }: { titre: string }) => (
    <div className="bf-section-hd">
      <h2>{titre}</h2>
      <hr className="bf-rule" />
    </div>
  );

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
        <FicheProvider>
          <div className="bf-page">
            <div className="bf-layout">
              <Sommaire entrees={entrees} libelle="Sections de la fiche" />

              <div className="bf-contenu">
                <EnteteAsset
                  projectId={pid}
                  assetId={noeud.id}
                  code={noeud.code}
                  type={noeud.type}
                  statut={noeud.statut}
                  critique={noeud.critique}
                  description={noeud.description ?? ""}
                  departCode={depart?.code ?? null}
                  blocageSuppression={blocage}
                  redirectTo={`/p/${pid}/assets`}
                  casting={noeud.type === "voix" ? `/p/${pid}/voix/${noeud.code}` : null}
                >
                  {/* Apparitions : les plans qui citent cet asset */}
                  <div className="as-apparus">
                    <span>Apparaît dans</span>
                    {noeud.citations.length > 0 ? (
                      <div className="as-plans">
                        {noeud.citations.map((c) => (
                          <span key={`${c.refId ?? "voix"}-${c.planUuid}`} className="chip-citation">
                            <Link href={`/p/${pid}/e/${c.episodeId}/plans/${c.planUuid}`}>
                              E{String(c.episodeNumero).padStart(2, "0")} · {String(c.position).padStart(2, "0")}
                            </Link>
                            {c.refId != null ? (
                              <form
                                action={async () => {
                                  "use server";
                                  await delierRef(c.refId!);
                                }}
                              >
                                <button type="submit" title="Délier de ce plan" aria-label="Délier de ce plan">
                                  <Icone nom="fermer" />
                                </button>
                              </form>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="bf-vide">aucun plan pour l&rsquo;instant</span>
                    )}
                  </div>
                </EnteteAsset>

                {/* ---- Image (ou son) : le sujet de la page ---- */}
                <section id="as-image" className="bf-section">
                  <Titre titre={sonOuVoix ? "Son" : "Image"} />
                  <div className="as-media">
                    <AssetPreview type={noeud.type} fichier={noeud.fichier} taille="lg" />
                    <div className="as-cote">
                      <div className="as-actions">
                        <UploadFichierForm assetId={noeud.id} code={noeud.code} />
                        {sonOuVoix ? null : <NouvelAssetDepuis projectId={pid} departId={noeud.id} departCode={noeud.code} departType={noeud.type} />}
                      </div>
                      <dl className="as-infos">
                        <dt>Fichier</dt>
                        <dd>{noeud.fichier ?? "aucun"}</dd>
                        {depart ? (
                          <>
                            <dt>Départ</dt>
                            <dd>
                              <Link href={`/p/${pid}/assets/${depart.code}`}>{depart.code}</Link>
                            </dd>
                          </>
                        ) : null}
                        {servis.length > 0 ? (
                          <>
                            <dt>Sert de départ à</dt>
                            <dd>
                              <span className="as-liens">
                                {servis.map((s) => (
                                  <Link key={s.id} href={`/p/${pid}/assets/${s.code}`}>
                                    {s.code}
                                  </Link>
                                ))}
                              </span>
                            </dd>
                          </>
                        ) : null}
                        {noeud.type === "voix" && noeud.personnageCode ? (
                          <>
                            <dt>Personnage</dt>
                            <dd>
                              <Link href={`/p/${pid}/assets/${noeud.personnageCode}`}>{noeud.personnageCode}</Link>
                            </dd>
                          </>
                        ) : null}
                      </dl>
                    </div>
                  </div>
                </section>

                {/* ---- Génération : le prompt, les réglages, les candidats ---- */}
                {noeud.type === "voix" ? null : (
                  <section id="as-generation" className="bf-section">
                    <Titre titre="Génération" />
                    <div className="as-gen">
                      <BlocTexte
                        assetId={noeud.id}
                        champ="promptGeneration"
                        libelle={noeud.type === "sfx" ? "Description du son" : "Prompt de génération"}
                        valeur={noeud.promptGeneration ?? ""}
                        vide="Aucun prompt. Clique pour l'écrire, ou demande-le à l'agent."
                        mono
                        meta={promptVide ? undefined : `${nbMots(noeud.promptGeneration ?? "")} mots`}
                      >
                        <BoutonAgent
                          className="btn btn-ghost btn-sm"
                          libelle={promptVide ? "Écrire avec l'agent" : "Réécrire avec l'agent"}
                          demande={{ projectId: pid, portee: "asset", cible: { code: noeud.code }, profondeur: "courte", libelle: noeud.code }}
                          titre="Demander à l'agent d'écrire ou de réécrire le prompt de cet asset"
                        />
                        <BoutonCopier texte={noeud.promptGeneration ?? ""} libelle="Copier le prompt" />
                      </BlocTexte>

                      <div className="as-gen-deux">
                        <ReglagesAsset
                          assetId={noeud.id}
                          type={noeud.type}
                          methodeGeneration={noeud.methodeGeneration}
                          departCode={depart?.code ?? null}
                          dureeSecondes={noeud.dureeSecondes ?? null}
                          promptVide={promptVide}
                        >
                          <GenerationPanel
                            assetId={noeud.id}
                            code={noeud.code}
                            type={noeud.type}
                            methodeGeneration={noeud.methodeGeneration}
                            parentCode={depart?.code ?? null}
                            promptInitial={noeud.promptGeneration ?? ""}
                            raisonBloquee={noeud.type === "sfx" ? raisonAudioNonGenerable(noeud.type) : raisonNonGenerable(noeud)}
                            defauts={{ aspect: formatParDefaut(noeud.type).aspect, megapixels: formatParDefaut(noeud.type).megapixels, lora: loraParDefaut(noeud.type) && depart == null }}
                            registre={registreImages}
                            imageActuelle={imageActuelle(noeud)}
                            dureeSecondes={noeud.dureeSecondes ?? null}
                            generations={generations}
                            generationInitiale={generationBrute ?? null}
                            simule={(process.env.COMFYUI_MODE ?? "stub") !== "http"}
                            libelleBouton={noeud.fichier ? (noeud.type === "sfx" ? "Régénérer le son…" : "Régénérer…") : noeud.type === "sfx" ? "Générer un son…" : "Générer…"}
                            classeBouton="btn btn-gold"
                          />
                        </ReglagesAsset>
                        {noeud.type === "sfx" ? null : <RendusAsset generations={generations} />}
                      </div>
                    </div>
                  </section>
                )}

                {/* ---- Voix d'un personnage ---- */}
                {noeud.type === "personnage" ? (
                  <section id="as-voix" className="bf-section">
                    <Titre titre="Voix" />
                    <div className="as-carte-bloc">
                      <AssignerVoix projectId={pid} personnageId={noeud.id} voixActuelle={noeud.voix} voixLibres={voixLibres} nbRepliques={noeud.nbRepliques} />
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        </FicheProvider>
      </main>
    </>
  );
}
