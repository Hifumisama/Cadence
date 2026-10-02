import Link from "next/link";
import { notFound } from "next/navigation";
import { getFirstEpisodeId, getProject } from "@/lib/queries";
import { getGenerationsAsset } from "@/lib/queries-generations";
import { getVoixDetail, liensDeLaVoix } from "@/lib/queries-voix";
import { ETAPES_VOIX, estEtapeVoix, verdictSuppressionVoix, type EtapeVoix } from "@/lib/voix";
import { Topbar } from "@/components/ui/Topbar";
import { StatutSelector } from "@/components/assets/StatutSelector";
import { SupprimerAssetButton } from "@/components/assets/SupprimerAssetButton";
import { EtapeVoix as EtapeVoixForm } from "@/components/voix/EtapeVoix";
import { EtapeReference } from "@/components/voix/EtapeReference";
import { EtapeTest } from "@/components/voix/EtapeTest";
import { RepliqueLigne } from "@/components/voix/RepliqueLigne";
import { NouvelleRepliqueForm } from "@/components/repliques/NouvelleRepliqueForm";

export const dynamic = "force-dynamic";

export default async function VoixDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; code: string }>;
  searchParams: Promise<{ etape?: string; generation?: string }>;
}) {
  const [{ projectId, code }, { etape: etapeBrute, generation: generationBrute }] = await Promise.all([params, searchParams]);
  const pid = Number(projectId);
  const [projet, d, premierEpisodeId] = await Promise.all([
    getProject(pid),
    getVoixDetail(pid, decodeURIComponent(code)),
    getFirstEpisodeId(pid),
  ]);
  if (!projet || !d) notFound();
  const generations = await getGenerationsAsset(d.asset.id);
  const suppression = verdictSuppressionVoix(await liensDeLaVoix(d.asset.id, d.personnage?.id ?? null), d.personnage?.code ?? null);

  const { asset, fiche } = d;
  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;
  const etape: EtapeVoix = estEtapeVoix(etapeBrute) ? etapeBrute : "voix";
  const base = `/p/${pid}/voix/${asset.code}`;

  const valeursVoix = {
    description: asset.description ?? "",
    instruction: asset.promptGeneration ?? "",
    critique: asset.critique,
    personnageId: fiche.personnageId,
    source: fiche.source,
    langue: fiche.langue,
    refText: fiche.refText,
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
            <span className="here">{asset.code}</span>
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
          <span className="num" style={{ color: "var(--ink)" }}>{asset.code}</span>
          <span style={{ flex: 1 }} />
          <Link href={`/p/${pid}/assets/${asset.code}`} className="tiny-note" style={{ color: "var(--ink-3)" }}>
            Fiche au registre d&rsquo;assets →
          </Link>
        </div>

        <div className="voix-entete">
          <div className="voix-titre">
            <h1 className="master-code">{asset.code}</h1>
            {d.personnage ? (
              <Link href={`/p/${pid}/assets/${d.personnage.code}`} className="type-tag" title="Personnage rattaché">
                {d.personnage.code}
              </Link>
            ) : null}
          </div>
          <div className="fiche-actions">
            {asset.critique ? <span className="crit-tag">Critique</span> : null}
            <StatutSelector assetId={asset.id} statut={asset.statut} />
            <SupprimerAssetButton
              assetId={asset.id}
              code={asset.code}
              bloque={suppression.bloque}
              raisonBlocage={suppression.raison}
              confirmation={suppression.avertissement}
              redirectTo={`/p/${pid}/voix`}
            />
          </div>
        </div>

        <nav className="etapes-voix" aria-label="Étapes du casting">
          {ETAPES_VOIX.map((e, i) => (
            <Link
              key={e.cle}
              href={e.cle === "voix" ? base : `${base}?etape=${e.cle}`}
              scroll={false}
              className={`etape-onglet ph-${d.phases[e.cle]}${etape === e.cle ? " is-actif" : ""}`}
              aria-current={etape === e.cle ? "step" : undefined}
            >
              <i />
              <span className="n num">{i + 1}</span>
              <span className="l">{e.label}</span>
              <span className="a">{e.aide}</span>
            </Link>
          ))}
        </nav>

        <section className="panel etape-panel">
          {etape === "voix" ? (
            <>
              <div className="panel-hd">
                <h2>1 · La voix</h2>
                <span className="eyebrow">une description, ou un audio</span>
              </div>
              <div className="panel-bd">
                <EtapeVoixForm
                  key={JSON.stringify(valeursVoix)}
                  assetId={asset.id}
                  initial={valeursVoix}
                  personnages={d.personnages}
                  referenceSrc={d.referenceSrc}
                />
              </div>
            </>
          ) : null}

          {etape === "reference" ? (
            <>
              <div className="panel-hd">
                <h2>2 · Voix de référence</h2>
                <span className="eyebrow">{fiche.source === "design" ? "générée depuis l'instruction" : "l'audio fourni"}</span>
              </div>
              <div className="panel-bd">
                <EtapeReference
                  assetId={asset.id}
                  source={fiche.source}
                  instruction={asset.promptGeneration ?? ""}
                  refText={fiche.refText}
                  langue={fiche.langue}
                  referenceFichier={asset.fichier}
                  referenceSrc={d.referenceSrc}
                  hrefEtapeVoix={base}
                  code={asset.code}
                  generations={generations}
                  generationInitiale={generationBrute ?? null}
                  simule={(process.env.COMFYUI_MODE ?? "stub") !== "http"}
                />
              </div>
            </>
          ) : null}

          {etape === "test" ? (
            <>
              <div className="panel-hd">
                <h2>3 · Test vidéo</h2>
                <span className="eyebrow">la voix sur un visage</span>
              </div>
              <div className="panel-bd">
                <EtapeTest
                  key={`${fiche.testDecorId}|${fiche.testPersonnageId}|${fiche.testTexte}`}
                  assetId={asset.id}
                  decors={d.decors}
                  personnages={d.personnages}
                  initial={{
                    decorId: fiche.testDecorId,
                    personnageId: fiche.testPersonnageId ?? fiche.personnageId,
                    texte: fiche.testTexte,
                  }}
                  referenceSrc={d.referenceSrc}
                  testAudioSrc={d.testAudioSrc}
                  testAudioNom={fiche.testAudio}
                  testVideoSrc={d.testVideoSrc}
                  testVideoNom={fiche.testVideo}
                />
              </div>
            </>
          ) : null}

          {etape === "repliques" ? (
            <>
              <div className="panel-hd">
                <h2>4 · Production des répliques</h2>
                <span className="eyebrow">{d.repliques.length} réplique{d.repliques.length > 1 ? "s" : ""}</span>
              </div>
              <div className="panel-bd">
                {d.repliques.length > 0 ? (
                  <ul className="rep-lignes">
                    {d.repliques.map((r) => (
                      <RepliqueLigne key={r.id} r={r} />
                    ))}
                  </ul>
                ) : (
                  <p className="chip-none">
                    Aucune réplique n&rsquo;a cette voix.{" "}
                    {d.personnage
                      ? `Celles de ${d.personnage.code} la prennent automatiquement.`
                      : "Rattache la voix à un personnage (étape Voix) ou écris une réplique dont elle est le locuteur."}
                  </p>
                )}
                <details className="repl-orphelines" style={{ marginTop: "var(--sp-4)" }}>
                  <summary>Nouvelle réplique pour {d.personnage ? d.personnage.code : asset.code}</summary>
                  <NouvelleRepliqueForm
                    projectId={pid}
                    options={d.optionsLocuteur}
                    episodes={d.episodes}
                    locuteurInitial={d.locuteurParDefaut}
                  />
                </details>
                <p className="tiny-note" style={{ marginTop: "var(--sp-3)" }}>
                  Une génération par réplique, jamais un bloc tagué. La durée mesurée sur la prise remonte à la fiche de plan.{" "}
                  <a href={`/api/export/repliques?projectId=${pid}&format=csv`} style={{ color: "var(--or)" }}>Exporter (CSV)</a>
                  {" · "}
                  <a href={`/api/export/repliques?projectId=${pid}&format=json`} style={{ color: "var(--or)" }}>JSON</a>
                </p>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </>
  );
}
