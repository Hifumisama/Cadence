import Link from "next/link";
import { notFound } from "next/navigation";
import { getFirstEpisodeId, getProject } from "@/lib/queries";
import { getGenerationsAsset } from "@/lib/queries-generations";
import { getVoixDetail, liensDeLaVoix } from "@/lib/queries-voix";
import { libelleLangueMoteur } from "@/lib/langues-tts";
import { ETAPES_VOIX, LIBELLE_ETAT_FICHE, etapeDepuisParametre, verdictSuppressionVoix, type EtapeVoix } from "@/lib/voix";
import { Topbar } from "@/components/ui/Topbar";
import { SupprimerAssetButton } from "@/components/assets/SupprimerAssetButton";
import { EtapeFiche } from "@/components/voix/EtapeFiche";
import { EtapeReference } from "@/components/voix/EtapeReference";
import { EtapeValidation } from "@/components/voix/EtapeValidation";
import { FicheVoixSlider } from "@/components/voix/FicheVoixSlider";
import { RepliqueLigne } from "@/components/voix/RepliqueLigne";
import { NouvelleRepliqueForm } from "@/components/repliques/NouvelleRepliqueForm";

export const dynamic = "force-dynamic";

const CLASSE_ETAT = { a_creer: "b-attente", a_valider: "b-rejoue", validee: "b-termine" } as const;

/** Fiche vocale : quatre étapes en slider (fiche, voix de référence, validation, répliques). Elle s'ouvre toujours sur l'étape 1,
 * sauf `?etape=` explicite. Le code de la voix (VOICE_*) n'apparaît nulle part : le nom affiché est dérivé (lib/voix.ts:nomVoix). */
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

  const nbMesurees = d.repliques.filter((r) => r.dureeSecondes != null).length;
  // Ce qu'un changement de voix de référence ferait regénérer : les prises déjà là, et le test vidéo.
  const impact = { nbPrises: d.repliques.filter((r) => r.fichier != null).length, testVideo: fiche.testVideo != null };

  const panneaux: Record<EtapeVoix, React.ReactNode> = {
    fiche: (
      <EtapeFiche
        assetId={asset.id}
        codeVoix={asset.code}
        initial={{
          description: asset.description ?? "",
          critique: asset.critique,
          personnageId: fiche.personnageId,
          langue: fiche.langue,
          refText: fiche.refText,
        }}
        instruction={asset.promptGeneration ?? ""}
        personnages={d.personnages}
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
    reference: (
      <EtapeReference
        assetId={asset.id}
        source={fiche.source}
        instruction={asset.promptGeneration ?? ""}
        refText={fiche.refText}
        referenceFichier={asset.fichier}
        referenceSrc={d.referenceSrc}
        generations={generations}
        generationInitiale={generationBrute ?? null}
        simule={simule}
        impact={impact}
      />
    ),
    validation: (
      <EtapeValidation
        assetId={asset.id}
        nomVoix={d.nom}
        statut={asset.statut}
        referenceFichier={asset.fichier}
        referenceSrc={d.referenceSrc}
        decors={d.decors}
        personnages={d.personnages}
        initial={{ decorId: fiche.testDecorId, personnageId: fiche.testPersonnageId ?? fiche.personnageId, texte: fiche.testTexte }}
        refText={fiche.refText}
        testVideoSrc={d.testVideoSrc}
        testVideoNom={fiche.testVideo}
        generations={generations}
        generationInitiale={generationBrute ?? null}
        simule={simule}
      />
    ),
    repliques: (
      <div className="voix-fiche">
        {asset.fichier && asset.statut !== "valide" ? (
          <p className="avert-voix">La voix n&rsquo;est pas encore validée. Les répliques produites maintenant seront à regénérer si la voix change.</p>
        ) : null}
        <NouvelleRepliqueForm projectId={pid} options={d.optionsLocuteur} episodes={d.episodes} locuteurInitial={d.locuteurParDefaut} />
        {d.repliques.length > 0 ? (
          <ul className="rep-lignes">
            {d.repliques.map((r) => (
              <RepliqueLigne key={r.id} r={r} voixId={asset.id} sansReference={!asset.fichier} />
            ))}
          </ul>
        ) : (
          <p className="chip-none">
            Aucune réplique pour cette voix.{" "}
            {d.personnage
              ? `Celles de ${d.personnage.code} la prennent automatiquement ; écris-en une ci-dessus.`
              : "Écris la première ci-dessus : elle naît dans cette voix."}
          </p>
        )}
        <p className="tiny-note">Une génération par réplique, jamais un bloc tagué. La durée mesurée sur la prise remonte à la fiche de plan. « Refaire » remplace la prise sans confirmation.</p>
      </div>
    ),
  };

  const etapes = ETAPES_VOIX.map((e) => ({
    cle: e.cle,
    etat: d.phases[e.cle],
    detail: e.cle === "repliques" && d.repliques.length > 0 ? `${nbMesurees}/${d.repliques.length}` : undefined,
  }));

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
      <main className="page voix-page">
        <div className="crumbs">
          <Link href={`/p/${pid}/voix`} style={{ color: "var(--or)" }}>
            Casting
          </Link>
          <span>/</span>
          <span style={{ color: "var(--ink)" }}>{d.nom}</span>
          <span style={{ flex: 1 }} />
          <Link href={`/p/${pid}/assets/${asset.code}`} className="tiny-note" style={{ color: "var(--ink-3)" }}>
            Fiche au registre d&rsquo;assets →
          </Link>
        </div>

        <div className="voix-entete">
          <div className="voix-titre">
            <h1 className="master-code">{d.nom}</h1>
            <span className={`badge ${CLASSE_ETAT[d.etat]}`}>
              <i />
              {LIBELLE_ETAT_FICHE[d.etat]}
            </span>
            <span className="chip-langue">{libelleLangueMoteur(fiche.langue)}</span>
            {asset.critique ? <span className="crit-tag">Critique</span> : null}
          </div>
        </div>

        <FicheVoixSlider etapes={etapes} initiale={etape} signal={`${etape}|${generationBrute ?? ""}`} panneaux={panneaux} />
      </main>
    </>
  );
}
