import Link from "next/link";
import { notFound } from "next/navigation";
import { getFirstEpisodeId, getProject } from "@/lib/queries";
import { cheminAssetMedia, dureeAudioMedia } from "@/lib/media";
import { getGenerationsAsset } from "@/lib/queries-generations";
import { getVoixDetail, liensDeLaVoix } from "@/lib/queries-voix";
import { ETAPES_VOIX, etapeDepuisParametre, manquePourAvancer, verdictSuppressionVoix, type EtapeVoix } from "@/lib/voix";
import { Topbar } from "@/components/ui/Topbar";
import { SupprimerAssetButton } from "@/components/assets/SupprimerAssetButton";
import { AssistantVoix } from "@/components/voix/AssistantVoix";
import { SceneIdentite } from "@/components/voix/SceneIdentite";
import { SceneOrigine } from "@/components/voix/SceneOrigine";
import { SceneReference } from "@/components/voix/SceneReference";
import { SceneRepliques } from "@/components/voix/SceneRepliques";
import { SceneRessenti } from "@/components/voix/SceneRessenti";
import { SceneSource } from "@/components/voix/SceneSource";
import { SceneTimbre } from "@/components/voix/SceneTimbre";
import { SceneVoix } from "@/components/voix/SceneVoix";

export const dynamic = "force-dynamic";

/** Fiche vocale : l'ASSISTANT d'une voix, six scènes plein cadre (identité, origine, timbre ou source, référence, ressenti, répliques).
 * Elle s'ouvre sur la première scène sauf `?etape=` explicite (les liens du bandeau de suivi y mènent). Les scènes sont construites ici
 * (données serveur) et restent toutes montées dans l'assistant ; celle du timbre ou de la source suit l'origine choisie. Le code de la
 * voix (VOICE_*) n'apparaît nulle part : le nom affiché est celui qu'on a choisi, sinon un nom dérivé (lib/voix.ts:nomVoix). */
export default async function VoixDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; code: string }>;
  searchParams: Promise<{ etape?: string; generation?: string }>;
}) {
  const [{ projectId, code }, { etape: etapeBrute, generation: generationBrute }] = await Promise.all([params, searchParams]);
  const pid = Number(projectId);
  const [projet, d, premierEpisodeId] = await Promise.all([getProject(pid), getVoixDetail(pid, decodeURIComponent(code)), getFirstEpisodeId(pid)]);
  if (!projet || !d) notFound();
  const generations = await getGenerationsAsset(d.asset.id);
  const suppression = verdictSuppressionVoix(await liensDeLaVoix(d.asset.id, d.personnage?.id ?? null), d.personnage?.code ?? null);

  const { asset, fiche } = d;
  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;
  const etape: EtapeVoix = etapeDepuisParametre(etapeBrute);
  const simule = (process.env.COMFYUI_MODE ?? "stub") !== "http";

  // Ce qu'un changement de voix de référence ferait regénérer : les prises déjà là, et le test vidéo.
  const impact = { nbPrises: d.repliques.filter((r) => r.fichier != null).length, testVideo: fiche.testVideo != null };
  const instruction = asset.promptGeneration ?? "";
  const generationInitiale = generationBrute ?? null;

  const manques = Object.fromEntries(
    ETAPES_VOIX.map((e) => [
      e.cle,
      manquePourAvancer(e.cle, {
        source: fiche.source,
        instruction,
        refText: fiche.refText,
        referenceFichier: asset.fichier,
        valide: asset.statut === "valide",
        testVideo: fiche.testVideo != null,
      }),
    ]),
  ) as Record<EtapeVoix, string | null>;

  // La teinte de la lumière d'ambiance suit le nom de la voix : stable d'une visite à l'autre, différente d'une voix à l'autre.
  const teinte = [...d.asset.code].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 360, 17);

  const scenes: Record<EtapeVoix, React.ReactNode> = {
    identite: (
      <SceneIdentite
        assetId={asset.id}
        nom={d.nom}
        personnageId={fiche.personnageId}
        personnages={d.personnages}
        langue={fiche.langue}
        critique={asset.critique}
        description={asset.description ?? ""}
        suppression={
          <SupprimerAssetButton
            assetId={asset.id}
            code={asset.code}
            libelle={`la voix « ${d.nom} »`}
            bloque={suppression.bloque}
            raisonBlocage={suppression.raison}
            confirmation={suppression.avertissement}
            redirectTo={`/p/${pid}/voix`}
          />
        }
      />
    ),
    origine: <SceneOrigine />,
    // Les deux contenus de la scène 3 sont montés : l'assistant masque celui qui ne correspond pas à l'origine choisie.
    voix: (
      <SceneVoix
        timbre={<SceneTimbre assetId={asset.id} instruction={instruction} refText={fiche.refText} langue={fiche.langue} />}
        source={
          <SceneSource
            assetId={asset.id}
            sourceSrc={d.sourceSrc}
            sourceEstVideo={d.sourceEstVideo}
            refText={fiche.refText}
            referenceFichier={asset.fichier}
            referenceSrc={d.referenceSrc}
            generations={generations}
            generationInitiale={generationInitiale}
            impact={impact}
          />
        }
      />
    ),
    reference: (
      <SceneReference
        assetId={asset.id}
        instruction={instruction}
        refText={fiche.refText}
        referenceFichier={asset.fichier}
        referenceSrc={d.referenceSrc}
        generations={generations}
        generationInitiale={generationInitiale}
        simule={simule}
        impact={impact}
      />
    ),
    ressenti: (
      <SceneRessenti
        assetId={asset.id}
        nomVoix={d.nom}
        instruction={instruction}
        referenceFichier={asset.fichier}
        referenceSrc={d.referenceSrc}
        statut={asset.statut}
        decors={d.decors}
        personnages={d.personnages}
        initial={{ decorId: fiche.testDecorId, personnageId: fiche.testPersonnageId ?? fiche.personnageId, texte: fiche.testTexte }}
        refText={fiche.refText}
        testVideoSrc={d.testVideoSrc}
        testVideoNom={fiche.testVideo}
        generations={generations}
        generationInitiale={generationInitiale}
        simule={simule}
        essais={fiche.essais}
        langue={fiche.langue}
        referenceDuree={asset.fichier ? dureeAudioMedia(cheminAssetMedia(asset.fichier)) : null}
      />
    ),
    repliques: (
      <SceneRepliques
        projectId={pid}
        assetId={asset.id}
        repliques={d.repliques}
        sansReference={!asset.fichier}
        optionsLocuteur={d.optionsLocuteur}
        episodes={d.episodes}
        locuteurInitial={d.locuteurParDefaut}
      />
    ),
  };

  return (
    <>
      <Topbar
        trail={
          <>
            <Link href="/">Projets</Link>
            <span className="sep">›</span>
            {projet.type === "serie" ? <Link href={`/p/${pid}`}>{projet.nom}</Link> : <span className="here">{projet.nom}</span>}
            <span className="sep">›</span>
            <Link href={`/p/${pid}/voix`}>Casting</Link>
            <span className="sep">›</span>
            <span className="here">{d.nom}</span>
          </>
        }
        tabs={{ projectId: pid, episodeBase }}
      />
      <main className="av-page">
        <AssistantVoix
          projectId={pid}
          assetId={asset.id}
          nom={d.nom}
          etapeInitiale={etape}
          signal={`${etape}|${generationBrute ?? ""}`}
          sourceInitiale={fiche.source}
          teinteInitiale={teinte}
          phases={d.phases}
          manques={manques}
          scenes={scenes}
        />
      </main>
    </>
  );
}
