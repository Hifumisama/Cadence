import { getProject } from "@/lib/queries";
import { getMontage } from "@/lib/montage/queries-montage";
import { Montage } from "@/components/montage/Montage";
import { PassageNuitButton } from "@/components/clip/NightPassageButton";
import { RelancePerimesButton } from "@/components/clip/RetryStaleButton";
import { ToutesPrevisualisationsButton } from "@/components/clip/AllPreviewsButton";

export const dynamic = "force-dynamic";

/** Montage de l'épisode (remplace l'ancienne page « Plans », 2026-11-07 ; docs/PLAN_MONTAGE.md) : la table de montage du film. L'atelier
 * d'un plan est sous `/montage/<uuid>`. */
export default async function MontagePage({ params }: { params: Promise<{ projectId: string; episodeId: string }> }) {
  const { projectId, episodeId } = await params;
  const eid = Number(episodeId);
  const base = `/p/${projectId}/e/${episodeId}`;
  const [projet, m] = await Promise.all([getProject(Number(projectId)), getMontage(eid)]);

  // Les actions de lot portent sur tous les plans de l'épisode (pas seulement ceux du montage), comme avant.
  const nPerimes = m.plans.filter((p) => p.perime).length;
  const nPrevisualise = m.plans.filter((p) => p.statut === "previsualise").length;
  const nDeveloppes = m.plans.filter((p) => p.statut !== "brouillon").length;

  return (
    <Montage
      episodeId={eid}
      base={base}
      eyebrow={projet?.nom ?? "Épisode"}
      plans={m.plans}
      scenes={m.scenes}
      entrees={m.entrees}
      dernierExport={m.dernierExport}
      outils={
        <>
          {nDeveloppes > 0 ? <ToutesPrevisualisationsButton episodeId={eid} /> : null}
          <RelancePerimesButton episodeId={eid} nPerimes={nPerimes} />
          <PassageNuitButton episodeId={eid} nPrevisualise={nPrevisualise} />
        </>
      }
    />
  );
}
