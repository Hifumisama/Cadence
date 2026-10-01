import Link from "next/link";
import { notFound } from "next/navigation";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import { BriefEditeur } from "@/components/agents/BriefEditeur";
import { Topbar } from "@/components/ui/Topbar";
import { lireBrief } from "@/lib/queries-agents";
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
  const brief = await lireBrief(pid);
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
              libelle={brief ? "Reprendre avec l'agent" : "Créer le brief avec l'agent"}
            />
          </div>
        </div>

        {brief ? (
          <section className="panel">
            <div className="panel-hd">
              <h2>{brief.contenu.titre || projet.nom}</h2>
              <span className="eyebrow">
                {brief.statut === "brouillon" ? "brouillon" : "brief du projet"} · version {brief.version}
              </span>
            </div>
            <div className="panel-bd">
              <BriefEditeur projectId={pid} brief={brief} />
            </div>
          </section>
        ) : (
          <section className="panel">
            <div className="panel-bd">
              <p className="tiny-note">
                Ce projet n&rsquo;a pas encore de brief. Parle-en avec l&rsquo;agent : il pose quelques questions, rédige le brief, et tu
                le relis avant de l&rsquo;appliquer.
              </p>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
