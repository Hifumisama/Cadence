import Link from "next/link";
import { notFound } from "next/navigation";
import { getFirstEpisodeId, getProject } from "@/lib/queries";
import { getCastingCatalogue } from "@/lib/queries-voix";
import { libelleLangueMoteur } from "@/lib/langues-tts";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import { Topbar } from "@/components/ui/Topbar";
import { VoixCard } from "@/components/voix/VoixCard";
import { NouvelleVoixForm } from "@/components/voix/NouvelleVoixForm";
import { GenerationNonBranchee } from "@/components/voix/GenerationNonBranchee";

export const dynamic = "force-dynamic";

/** Casting vocal — la liste des fiches vocales. Niveau PROJET, comme le registre d'assets : une voix conçue à l'épisode 1 sert au 7.
 * Plus de catalogue de répliques ici : les répliques naissent dans la fiche de leur voix. */
export default async function CastingPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  const [projet, catalogue, premierEpisodeId] = await Promise.all([getProject(pid), getCastingCatalogue(pid), getFirstEpisodeId(pid)]);
  if (!projet) notFound();

  const { voix } = catalogue;
  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;
  const base = `/p/${pid}/voix`;

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
                <span className="here">Casting</span>
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
              Fiches vocales du projet
            </p>
            <h1>Casting vocal</h1>
            <p>
              Une fiche par voix : sa réplique d&rsquo;écoute, sa voix de référence, sa validation et ses répliques. {voix.length} fiche{voix.length > 1 ? "s" : ""}.
            </p>
          </div>
          <div className="actions" style={{ marginLeft: "auto" }}>
            <BoutonAgent
              className="btn btn-ghost"
              libelle="Créer les voix manquantes"
              demande={{ projectId: pid, portee: "projet", cible: null, profondeur: "complete", libelle: projet.nom, vue: "voix" }}
              titre="L'agent décrit le timbre des personnages qui parlent sans avoir de voix (et la voix off), à partir de leurs répliques"
            />
            <NouvelleVoixForm projectId={pid} personnages={catalogue.personnages} />
          </div>
        </div>

        {voix.length === 0 ? (
          <p className="tiny-note" style={{ padding: "var(--sp-4)" }}>
            Aucune fiche vocale. Crée-en une avec « Nouvelle voix », ou laisse l&rsquo;agent décrire celles qui manquent.
          </p>
        ) : (
          <div className="voix-grid voix-liste" role="list" aria-label="Fiches vocales">
            {voix.map((v) => (
              <div key={v.id} role="listitem" className="voix-liste-item">
                <VoixCard
                  href={`${base}/${v.code}`}
                  nom={v.nom}
                  etat={v.etat}
                  critique={v.critique}
                  langue={libelleLangueMoteur(v.langue)}
                  personnageNom={v.personnageNom}
                  refText={v.refText}
                  referenceSrc={v.referenceSrc}
                  referenceFichier={v.fichier}
                  phases={v.phases}
                  nbRepliques={v.nbRepliques}
                  nbRepliquesMesurees={v.nbRepliquesMesurees}
                />
              </div>
            ))}
          </div>
        )}

        <p className="tiny-note" style={{ marginTop: "var(--sp-4)" }}>
          {catalogue.nbRepliquesSansVoix > 0
            ? `${catalogue.nbRepliquesSansVoix} réplique${catalogue.nbRepliquesSansVoix > 1 ? "s" : ""} sans voix sur ${catalogue.nbRepliques} : leur personnage n'a pas encore de fiche vocale. `
            : ""}
          Export des répliques :{" "}
          <a href={`/api/export/repliques?projectId=${pid}&format=csv`} style={{ color: "var(--or)" }}>CSV</a>
          {" · "}
          <a href={`/api/export/repliques?projectId=${pid}&format=json`} style={{ color: "var(--or)" }}>JSON</a>
        </p>

        <GenerationNonBranchee />
      </main>
    </>
  );
}
