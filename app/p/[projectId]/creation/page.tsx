import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvanceeScene } from "@/components/design/ProgressScene";
import { Topbar } from "@/components/ui/Topbar";
import { db } from "@/db";
import { lirePlansIntents, lireSuiviFiches, lireVueCreation } from "@/lib/agents/creation-view";
import { lireConception } from "@/lib/projects/design-db";
import { resumeMiseEnScene } from "@/lib/h3ir/settings";
import { MEDIA_ROOT, posterSrc } from "@/lib/media";
import { getFirstEpisodeId, getProject } from "@/lib/queries";
import { lireBrief } from "@/lib/agents/queries-agents";
import { lireEtatImages } from "@/lib/assets/queries-images";

export const dynamic = "force-dynamic";

/** The ninth step of the project design: the progress of the preparation (the installer: brief, structure, treatment, screenplays, registry,
 * inventory, review), without intermediate validation, then the intents screen from which the sheets start (one request per clip, outside
 * creation). Here we follow the progress; the worker does the work. A project created before the design is shown without the ribbon or the poster. */
export default async function CreationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  const [projet, premierEpisodeId] = await Promise.all([getProject(pid), getFirstEpisodeId(pid)]);
  if (!projet) notFound();
  const [creation, conception, brief, images, plansIntents, suiviFiches] = await Promise.all([lireVueCreation(pid), lireConception(db, pid), lireBrief(pid), lireEtatImages(pid), lirePlansIntents(pid), lireSuiviFiches(pid)]);
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
            <span className="here">{projet.nom}</span>
            <span className="sep">›</span>
            <span className="here">Création</span>
          </>
        }
        tabs={{ projectId: pid, episodeBase }}
      />
      <main>
        <AvanceeScene projectId={pid} nomProjet={projet.nom} initial={creation} imagesInitial={images} conception={conception} style={{ nom: styleBrief?.nom || "Style libre", image, poster: posterSrc("projects", pid, projet.posterFichier ?? null) }} miseEnScene={resumeMiseEnScene(projet.creativite, projet.styleCamera)} plansInitial={plansIntents} suiviInitial={suiviFiches} />
      </main>
    </>
  );
}
