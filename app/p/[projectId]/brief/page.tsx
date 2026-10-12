import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefDossier } from "@/components/brief/BriefDossier";
import { BriefVide } from "@/components/brief/BriefVide";
import { Topbar } from "@/components/ui/Topbar";
import { lireBriefOuVide } from "@/lib/queries-agents";
import { getAllAssets, getFirstEpisodeId, getProject } from "@/lib/queries";
import { db } from "@/db";
import { lireConception } from "@/lib/conception-db";
import { MEDIA_ROOT, assetMediaSrc } from "@/lib/media";
import { cheminApercuStyle, slugStyle } from "@/lib/styles/bibliotheque";
import { SUJETS_APERCU } from "@/lib/styles/sujets";
import type { StyleBriefVue, VignetteStyle } from "@/components/brief/StyleBrief";

export const dynamic = "force-dynamic";

/** Le brief du projet : la référence que l'agent lit pour toutes ses demandes (ton, style,
 * personnages, durée…). Page de lecture ; le titre, l'arc, les personnages, les lieux et les notes se corrigent à la main sur place.
 * Le style est fixé à la conception. */
export default async function BriefPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  const [projet, premierEpisodeId] = await Promise.all([getProject(pid), getFirstEpisodeId(pid)]);
  if (!projet) notFound();
  const brief = await lireBriefOuVide(pid, projet.nom);
  // Un projet conçu (page /nouveau) a fixé sa langue, sa durée, son genre et son ton : ils s'affichent, sans plus s'éditer ici.
  const conception = await lireConception(db, pid);
  const identiteFigee = conception !== null;
  // Une fois le registre créé, les personnages et les lieux y vivent : le brief en montre la vue, il n'en garde plus une copie à éditer.
  const registre = (await getAllAssets(pid))
    .filter((a) => a.type === "personnage" || a.type === "decor")
    .map((a) => ({ code: a.code, type: a.type as "personnage" | "decor", description: a.description ?? "", src: assetMediaSrc(a.fichier) }));
  // « partiel » : pas de brief rédigé, seuls le style et les notes ont pu être posés à la main.
  const redige = brief.statut !== "partiel";
  const styleVue = vueStyle(brief.contenu.style, conception?.style.source === "bibliotheque" ? conception.style.styleId : null);
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
        {redige ? <BriefDossier projectId={pid} nomProjet={projet.nom} brief={brief} serie={projet.type === "serie"} style={styleVue} identiteFigee={identiteFigee} registre={registre} /> : <BriefVide projectId={pid} nomProjet={projet.nom} brief={brief} />}
      </main>
    </>
  );
}

/** Le style du projet tel que la page le montre : son nom, ses deux clauses, et ses images — l'image de présentation posée à la création (style libre), puis les
 * aperçus des scènes communes (`lib/styles/sujets.ts`, générés par `npm run styles:apercus`) quand le style est un style de la bibliothèque (choisi à la conception, ou dont
 * le nom est celui d'une entrée de la bibliothèque). Un style libre sans image n'a pas de vignette. */
function vueStyle(style: { nom?: string; clause?: string; promptImage?: string; image?: string } | undefined, styleId: string | null): StyleBriefVue {
  const id = styleId ?? (style?.nom?.trim() ? slugStyle(style.nom) : null);
  const vignettes: VignetteStyle[] = [];
  if (style?.image && existsSync(join(MEDIA_ROOT, "styles", style.image))) vignettes.push({ id: "presentation", libelle: "Présentation", teste: "", aspect: "2:3", fichier: style.image });
  if (id) {
    for (const s of SUJETS_APERCU) {
      if (existsSync(join(MEDIA_ROOT, cheminApercuStyle(id, s.id)))) vignettes.push({ id: s.id, libelle: s.libelle, teste: s.teste, aspect: s.aspect, fichier: `${id}/${s.id}.webp` });
    }
  }
  return { nom: style?.nom?.trim() ?? "", promptImage: style?.promptImage?.trim() ?? "", clause: style?.clause?.trim() ?? "", vignettes };
}
