import Link from "next/link";
import { notFound } from "next/navigation";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import { BriefEditeur } from "@/components/agents/BriefEditeur";
import { Topbar } from "@/components/ui/Topbar";
import { lireBriefOuVide } from "@/lib/queries-agents";
import { getFirstEpisodeId, getProject } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Le brief du projet : la référence que l'agent lit pour toutes ses demandes (ton, style,
 * personnages, durée…). Modifiable ici comme dans la popup ; une demande à l'agent peut aussi
 * le faire évoluer (la revue le montre comme un changement du brief). */
export default async function BriefPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  const [projet, premierEpisodeId] = await Promise.all([getProject(pid), getFirstEpisodeId(pid)]);
  if (!projet) notFound();
  const brief = await lireBriefOuVide(pid, projet.nom);
  // « Rédigé » : un brief complet (valide ou brouillon) ; « partiel » : style et notes posés à la main.
  const redige = brief.statut !== "partiel";
  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;

  return (
    <>
      <Topbar
        trail={
          <>
            <Link href="/">Projets</Link>
            <span className="sep">›</span>
            {projet.type === "serie" ? <Link href={`/p/${pid}`}>{projet.nom}</Link> : <span className="here">{projet.nom}</span>}
            <span className="sep">›</span>
            <span className="here">Brief</span>
          </>
        }
        tabs={{ projectId: pid, episodeBase }}
      />
      <main className="page">
        <div className="screen-hd">
          <div>
            <p className="eyebrow" style={{ margin: "0 0 6px" }}>
              Référence du projet
            </p>
            <h1>Brief</h1>
            <p>
              Ce que l&rsquo;agent sait du projet : il en lit les extraits utiles à chaque demande. Corriger une section la marque comme
              « fournie ».
            </p>
          </div>
          <div className="actions">
            <BoutonAgent
              className="btn btn-ghost"
              demande={{ projectId: pid, portee: "projet", cible: null, profondeur: "complete", libelle: projet.nom }}
              libelle={redige ? "Reprendre avec l'agent" : "Rédiger le brief avec l'agent"}
            />
          </div>
        </div>

        <section className="panel">
          <div className="panel-hd">
            <h2>{brief.contenu.titre || projet.nom}</h2>
            <span className="eyebrow">
              {brief.statut === "brouillon" ? "brouillon" : brief.statut === "partiel" ? "style et notes" : "brief du projet"}
              {brief.version > 0 ? ` · version ${brief.version}` : ""}
            </span>
          </div>
          <div className="panel-bd">
            {brief.statut === "partiel" ? (
              <p className="tiny-note" style={{ marginBottom: "var(--sp-3)" }}>
                Pas encore de brief rédigé : tu peux déjà poser la clause de style et les notes du projet ici (elles servent à la génération
                d&rsquo;images). Parle du projet à l&rsquo;agent pour qu&rsquo;il rédige le reste, sans écraser ce que tu as posé.
              </p>
            ) : null}
            <BriefEditeur projectId={pid} brief={brief} />
          </div>
        </section>
      </main>
    </>
  );
}
