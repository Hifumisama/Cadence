import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DemarrageAssistant } from "@/components/conception/DemarrageAssistant";
import { Topbar } from "@/components/ui/Topbar";
import { db } from "@/db";
import { lireVueCreation } from "@/lib/agents/creation-vue";
import { ouvrirConversation } from "@/lib/agents/service";
import { lireConception } from "@/lib/conception-db";
import { MEDIA_ROOT } from "@/lib/media";
import { getProject } from "@/lib/queries";
import { lireBrief, lireConversation, trouverConversation } from "@/lib/queries-agents";

export const dynamic = "force-dynamic";

/** La suite de la conception d'un projet : le scénario (entretien avec le scénariste) puis le clap. Un projet sans conception (créé avant
 * cette page) n'a rien à faire ici ; un projet dont la préparation est lancée va sur la page de l'installateur. */
export default async function DemarragePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pid = Number(projectId);
  const projet = Number.isInteger(pid) ? await getProject(pid) : null;
  if (!projet) notFound();

  const conception = await lireConception(db, pid);
  if (!conception) redirect(`/p/${pid}`);
  if (await lireVueCreation(pid)) redirect(`/p/${pid}/creation`);

  let conv = await trouverConversation(pid, "projet", null);
  if (!conv) {
    const o = await ouvrirConversation(pid, "projet", null, "complete");
    conv = o.ok ? await lireConversation(o.conversationUuid) : null;
  }
  if (!conv) notFound();

  const brief = await lireBrief(pid);
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
            <span className="here">Conception</span>
          </>
        }
      />
      <main>
        <DemarrageAssistant projectId={pid} nomProjet={projet.nom} convInitiale={conv} conception={conception} style={{ nom: styleBrief?.nom || "Style libre", image }} />
      </main>
    </>
  );
}
