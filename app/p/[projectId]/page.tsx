import { notFound, redirect } from "next/navigation";
import { getFirstEpisodeId } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Un projet est un film : sa carte d'identité (le brief : titre, affiche, résumé, style) est sa page d'accueil. */
export default async function ProjetPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const id = Number(projectId);
  const episodeId = await getFirstEpisodeId(id);
  if (episodeId == null) notFound();
  redirect(`/p/${id}/brief`);
}
