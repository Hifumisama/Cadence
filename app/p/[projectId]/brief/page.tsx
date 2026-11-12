import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefDossier } from "@/components/brief/BriefDossier";
import { BriefVide } from "@/components/brief/BriefVide";
import { Topbar } from "@/components/ui/Topbar";
import { lireBriefOuVide } from "@/lib/queries-agents";
import { getAllAssets, getEpisode, getFirstEpisodeId, getProject } from "@/lib/queries";
import { db } from "@/db";
import { lireConception } from "@/lib/projects/conception-db";
import { plansSansFicheApresCreation } from "@/lib/agents/creation-vue";
import { MEDIA_ROOT, assetMediaSrc, posterSrc } from "@/lib/media";
import { slugStyle } from "@/lib/styles/bibliotheque";
import { apercusDuStyle } from "@/lib/styles/styles-db";
import { SUJETS_APERCU } from "@/lib/styles/sujets";
import type { StyleBriefVue, VignetteStyle } from "@/components/brief/StyleBrief";
import { demosMiseEnScene } from "@/lib/media";
import { ReglagesCameraProjet } from "@/components/brief/ReglagesCameraProjet";

export const dynamic = "force-dynamic";

/** Le brief du projet : la référence que l'agent lit pour toutes ses demandes (ton, style,
 * personnages, durée…). Page de lecture ; le titre, l'arc, les personnages, les lieux et les notes se corrigent à la main sur place.
 * Le style est fixé à la conception. */
export default async function BriefPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  const [projet, premierEpisodeId] = await Promise.all([getProject(pid), getFirstEpisodeId(pid)]);
  if (!projet) notFound();
  const episode = premierEpisodeId ? await getEpisode(premierEpisodeId) : null;
  const lu = await lireBriefOuVide(pid, projet.nom);
  // Le titre du film est celui du projet : le brief l'affiche et le corrige tel quel (corriger le titre ici renomme le projet).
  const brief = { ...lu, contenu: { ...lu.contenu, titre: projet.nom } };
  // Un projet conçu (page /nouveau) a fixé sa langue, sa durée, son genre et son ton : ils s'affichent, sans plus s'éditer ici.
  const conception = await lireConception(db, pid);
  const identiteFigee = conception !== null;
  // Une fois le registre créé, les personnages et les lieux y vivent : le brief en montre la vue, il n'en garde plus une copie à éditer.
  const registre = (await getAllAssets(pid))
    .filter((a) => a.type === "personnage" || a.type === "decor")
    .map((a) => ({ code: a.code, type: a.type as "personnage" | "decor", description: a.description ?? "", src: assetMediaSrc(a.fichier) }));
  // « partiel » : pas de brief rédigé, seuls le style et les notes ont pu être posés à la main.
  const redige = brief.statut !== "partiel";
  const styleVue = await vueStyle(brief.contenu.style, conception?.style.source === "bibliotheque" ? conception.style.styleId : null);
  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;
  // Après la création : tant que des plans n'ont pas de fiche, un lien ramène à l'écran des intents (« Écrire les fiches », suivi par plan).
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
            <Link href={`/p/${pid}/creation`} className="btn btn-gold">
              Relire les intents et écrire les fiches
            </Link>
          </p>
        ) : null}
        {redige ? <BriefDossier projectId={pid} nomProjet={projet.nom} brief={brief} style={styleVue} identiteFigee={identiteFigee} registre={registre} affiche={posterSrc("projects", pid, projet.posterFichier)} episodeId={episode?.id ?? null} resume={episode?.resume ?? ""} /> :<BriefVide projectId={pid} nomProjet={projet.nom} brief={brief} />}
        <ReglagesCameraProjet projectId={pid} creativite={projet.creativite} styleCamera={projet.styleCamera} demos={demosMiseEnScene()} />
      </main>
    </>
  );
}

/** Le style du projet tel que la page le montre : son nom, ses deux clauses, et ses images — l'image de présentation posée à la création (style libre), puis les
 * aperçus des scènes communes (`lib/styles/sujets.ts`, déjà générés) quand le style est un style de la bibliothèque (choisi à la conception, ou dont
 * le nom est celui d'une entrée de la bibliothèque). Un style libre sans image n'a pas de vignette. */
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
