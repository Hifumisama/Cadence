import { notFound, redirect } from "next/navigation";
import { getFirstEpisodeId } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** A project is a film: its identity card (the brief: title, poster, summary, style) is its home page. */
export default async function ProjetPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const id = Number(projectId);
  const episodeId = await getFirstEpisodeId(id);
  if (episodeId == null) notFound();
  redirect(`/p/${id}/brief`);
}
