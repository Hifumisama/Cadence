import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefDossier } from "@/components/brief/BriefFolder";
import { BriefVide } from "@/components/brief/EmptyBrief";
import { Topbar } from "@/components/ui/Topbar";
import { lireBriefOuVide } from "@/lib/agents/queries-agents";
import { getAllAssets, getEpisode, getFirstEpisodeId, getProject } from "@/lib/queries";
import { db } from "@/db";
import { lireConception } from "@/lib/projects/design-db";
import { plansSansFicheApresCreation } from "@/lib/agents/creation-view";
import { MEDIA_ROOT, assetMediaSrc, posterSrc } from "@/lib/media";
import { slugStyle } from "@/lib/styles/library";
import { apercusDuStyle } from "@/lib/styles/styles-db";
import { SUJETS_APERCU } from "@/lib/styles/subjects";
import type { StyleBriefVue, VignetteStyle } from "@/components/brief/StyleBrief";
import { demosMiseEnScene } from "@/lib/media";
import { ReglagesCameraProjet } from "@/components/brief/ProjectCameraSettings";

export const dynamic = "force-dynamic";

/** The project brief: the reference the agent reads for all its requests (tone, style,
 * characters, duration…). Read-only page; the title, arc, characters, places and notes are corrected by hand on site.
 * The style is fixed at design time. */
export default async function BriefPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  const [projet, premierEpisodeId] = await Promise.all([getProject(pid), getFirstEpisodeId(pid)]);
  if (!projet) notFound();
  const episode = premierEpisodeId ? await getEpisode(premierEpisodeId) : null;
  const lu = await lireBriefOuVide(pid, projet.nom);
  // The film title is the project's title: the brief displays it and corrects it as is (correcting the title here renames the project).
  const brief = { ...lu, contenu: { ...lu.contenu, titre: projet.nom } };
  // A designed project (/nouveau page) has fixed its language, duration, genre and tone: they are displayed, no longer editable here.
  const conception = await lireConception(db, pid);
  const identiteFigee = conception !== null;
  // Once the registry is created, the characters and places live there: the brief shows its view, it no longer keeps an editable copy.
  const registre = (await getAllAssets(pid))
    .filter((a) => a.type === "personnage" || a.type === "decor")
    .map((a) => ({ code: a.code, type: a.type as "personnage" | "decor", description: a.description ?? "", src: assetMediaSrc(a.fichier) }));
  // « partiel » : no brief written, only the style and notes could have been set by hand.
  const redige = brief.statut !== "partiel";
  const styleVue = await vueStyle(brief.contenu.style, conception?.style.source === "bibliotheque" ? conception.style.styleId : null);
  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;
  // After creation: as long as clips have no sheet, a link leads to the Tournage page, where the sheets are written.
  const sansFiche = await plansSansFicheApresCreation(pid);

  return (
    <>
      <Topbar
        trail={
          <>
            <Link href="/">Projets</Link>
            <span className="sep">›</span>
            <span className="here">{projet.nom}</span>
            <span className="sep">›</span>
            <span className="here">Brief</span>
          </>
        }
        tabs={{ projectId: pid, episodeBase }}
      />
      <main className="page">
        {sansFiche > 0 ? (
          <p style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "0 0 16px" }}>
            <span>
              {sansFiche} plan{sansFiche > 1 ? "s" : ""} sans fiche.
            </span>
            <Link href={`${episodeBase}/tournage`} className="btn btn-gold">
              Écrire les fiches
            </Link>
          </p>
        ) : null}
        {redige ? <BriefDossier projectId={pid} nomProjet={projet.nom} brief={brief} style={styleVue} identiteFigee={identiteFigee} registre={registre} affiche={posterSrc("projects", pid, projet.posterFichier)} episodeId={episode?.id ?? null} resume={episode?.resume ?? ""} /> :<BriefVide projectId={pid} nomProjet={projet.nom} brief={brief} />}
        <ReglagesCameraProjet projectId={pid} creativite={projet.creativite} styleCamera={projet.styleCamera} demos={demosMiseEnScene()} />
      </main>
    </>
  );
}

/** The project style as the page shows it: its name, its two clauses, and its images — the presentation image set at creation (free style), then the
 * previews of the common scenes (`lib/styles/subjects.ts`, already generated) when the style is a library style (chosen at design time, or whose
 * name matches a library entry). A free style without an image has no thumbnail. */
async function vueStyle(style: { nom?: string; clause?: string; promptImage?: string; image?: string } | undefined, styleId: string | null): Promise<StyleBriefVue> {
  const id = styleId ?? (style?.nom?.trim() ? slugStyle(style.nom) : null);
  const vignettes: VignetteStyle[] = [];
  if (style?.image && existsSync(join(MEDIA_ROOT, "styles", style.image))) vignettes.push({ id: "presentation", libelle: "Présentation", teste: "", aspect: "2:3", fichier: style.image });
  if (id) {
    const apercus = await apercusDuStyle(id);
    for (const s of SUJETS_APERCU) {
      if (apercus.includes(s.id)) vignettes.push({ id: s.id, libelle: s.libelle, teste: s.teste, aspect: s.aspect, fichier: `${id}/${s.id}.webp` });
    }
  }
  return { nom: style?.nom?.trim() ?? "", promptImage: style?.promptImage?.trim() ?? "", clause: style?.clause?.trim() ?? "", vignettes };
}
