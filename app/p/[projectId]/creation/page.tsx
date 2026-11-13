import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvanceeScene } from "@/components/design/ProgressScene";
import { Topbar } from "@/components/ui/Topbar";
import { db } from "@/db";
import { lireVueCreation } from "@/lib/agents/creation-view";
import { lireConception } from "@/lib/projects/design-db";
import { resumeMiseEnScene } from "@/lib/h3ir/settings";
import { MEDIA_ROOT, posterSrc } from "@/lib/media";
import { getFirstEpisodeId, getProject, getScenarioData } from "@/lib/queries";
import { lireBrief } from "@/lib/agents/queries-agents";
import { lireEtatImages } from "@/lib/assets/queries-images";

export const dynamic = "force-dynamic";

/** The ninth step of the project design: the progress of the preparation (the installer: brief, structure, treatment, screenplays, registry,
 * inventory, review), without intermediate validation, then the « first draft complete » screen that leads to the screenplay (the sheets are
 * written from the Tournage page). Here we follow the progress; the worker does the work. A project created before the design is shown without the ribbon or the poster. */
export default async function CreationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  const [projet, premierEpisodeId] = await Promise.all([getProject(pid), getFirstEpisodeId(pid)]);
  if (!projet) notFound();
  const [creation, conception, brief, images, scenario] = await Promise.all([
    lireVueCreation(pid),
    lireConception(db, pid),
    lireBrief(pid),
    lireEtatImages(pid),
    premierEpisodeId ? getScenarioData(premierEpisodeId) : Promise.resolve(null),
  ]);
  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;
  // The first draft as the end screen states it: the scenes written (a clip without a scene is counted in the total, not listed).
  const premierJet = scenario
    ? {
        scenarioHref: `${episodeBase}/scenario`,
        nbPlans: scenario.scenes.reduce((n, s) => n + s.plans.length, 0) + scenario.sansScene.length,
        dureeSecondes: [...scenario.scenes.flatMap((s) => s.plans), ...scenario.sansScene].reduce((n, p) => n + p.dureeMontageSecondes, 0),
        scenes: scenario.scenes.map((s) => ({ titre: s.titre, nbPlans: s.plans.length })),
      }
    : null;
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
        <AvanceeScene projectId={pid} nomProjet={projet.nom} initial={creation} imagesInitial={images} conception={conception} style={{ nom: styleBrief?.nom || "Style libre", image, poster: posterSrc("projects", pid, projet.posterFichier ?? null) }} miseEnScene={resumeMiseEnScene(projet.creativite, projet.styleCamera)} premierJet={premierJet} />
      </main>
    </>
  );
}
