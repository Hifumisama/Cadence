import { notFound, redirect } from "next/navigation";
import { getFirstEpisodeId } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Un projet est un film : son épisode unique s'ouvre directement. */
export default async function ProjetPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const id = Number(projectId);
  const episodeId = await getFirstEpisodeId(id);
  if (episodeId == null) notFound();
  redirect(`/p/${id}/e/${episodeId}/scenario`);
}
