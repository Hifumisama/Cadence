import Link from "next/link";
import { notFound } from "next/navigation";
import { getFirstEpisodeId, getProject } from "@/lib/queries";
import { getCastingCatalogue } from "@/lib/queries-voix";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import { Topbar } from "@/components/ui/Topbar";
import { SalleVoix } from "@/components/voix/SalleVoix";
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
            <h1>
              La salle <em className="salle-em">d&rsquo;écoute</em>
            </h1>
            <p>Écoute, compare, choisis. Chaque voix se fabrique pas à pas dans sa fiche.</p>
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
          <SalleVoix projectId={pid} voix={voix} />
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
