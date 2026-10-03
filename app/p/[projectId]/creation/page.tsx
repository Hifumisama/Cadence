import Link from "next/link";
import { notFound } from "next/navigation";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import { SuiviCreation } from "@/components/creation/SuiviCreation";
import { Topbar } from "@/components/ui/Topbar";
import { lireVueCreation } from "@/lib/agents/creation-vue";
import { getFirstEpisodeId, getProject } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** L'installateur : la création du projet, étape par étape (brief, structure, scénarios, registre, inventaire, voix, fiches),
 * sans validation intermédiaire. Ici on suit l'avancement ; le worker fait le travail. */
export default async function CreationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  const [projet, premierEpisodeId] = await Promise.all([getProject(pid), getFirstEpisodeId(pid)]);
  if (!projet) notFound();
  const creation = await lireVueCreation(pid);
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
            <span className="here">Création</span>
          </>
        }
        tabs={{ projectId: pid, episodeBase }}
      />
      <main className="page">
        <div className="screen-hd">
          <div>
            <p className="eyebrow" style={{ margin: "0 0 6px" }}>
              Installateur
            </p>
            <h1>Création du projet</h1>
            <p>
              Chaque étape est écrite puis appliquée toute seule. Tu relis ensuite le résultat là où il se trouve (épisodes, registre, plans) et tu retouches ce qui doit l&rsquo;être.
            </p>
          </div>
          <div className="actions">
            <BoutonAgent
              className="btn btn-ghost"
              demande={{ projectId: pid, portee: "projet", cible: null, profondeur: "complete", libelle: projet.nom }}
              libelle="Revenir à la conversation"
            />
          </div>
        </div>
        <SuiviCreation projectId={pid} initial={creation} />
      </main>
    </>
  );
}
