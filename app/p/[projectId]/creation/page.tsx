import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvanceeScene } from "@/components/conception/AvanceeScene";
import { Topbar } from "@/components/ui/Topbar";
import { db } from "@/db";
import { lireVueCreation } from "@/lib/agents/creation-vue";
import { lireConception } from "@/lib/conception-db";
import { MEDIA_ROOT, posterSrc } from "@/lib/media";
import { getFirstEpisodeId, getProject } from "@/lib/queries";
import { lireBrief } from "@/lib/queries-agents";

export const dynamic = "force-dynamic";

/** La huitième étape de la conception : l'avancée de la préparation (l'installateur : brief, structure, scénarios, registre, inventaire,
 * voix, fiches), sans validation intermédiaire. Ici on suit l'avancement ; le worker fait le travail. Un projet créé avant la
 * conception s'affiche sans le ruban ni l'affiche. */
export default async function CreationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  const [projet, premierEpisodeId] = await Promise.all([getProject(pid), getFirstEpisodeId(pid)]);
  if (!projet) notFound();
  const [creation, conception, brief] = await Promise.all([lireVueCreation(pid), lireConception(db, pid), lireBrief(pid)]);
  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;
  const styleBrief = brief?.contenu.style;
  const image = styleBrief?.image && existsSync(join(MEDIA_ROOT, "styles", styleBrief.image)) ? styleBrief.image : null;

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
      <main>
        <AvanceeScene projectId={pid} nomProjet={projet.nom} initial={creation} conception={conception} style={{ nom: styleBrief?.nom || "Style libre", image, poster: posterSrc("projects", pid, projet.posterFichier ?? null) }} />
      </main>
    </>
  );
}
