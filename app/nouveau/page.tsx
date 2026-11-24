import Link from "next/link";
import { ConceptionAssistant } from "@/components/design/DesignAssistant";
import type { StyleVue } from "@/components/design/types";
import { Topbar } from "@/components/ui/Topbar";
import { demosMiseEnScene } from "@/lib/media";
import { styleUtilisable } from "@/lib/styles/library";
import { listerStyles } from "@/lib/styles/styles-db";
import { familleDuStyle } from "@/lib/styles/showcase";

export const dynamic = "force-dynamic";

/** A project's design: the choices made before telling the story (format, genre, tone, duration, language, style), then the
 * meeting with the screenwriter. Only ready-to-use styles (with their short clause for video) are offered; the presentation
 * image is optional (`data/styles/<id>/apercu.webp`, generated once and for all). Styles come from the `styles` table. */
export default async function NouveauProjetPage() {
  const styles: StyleVue[] = (await listerStyles())
    .filter(styleUtilisable)
    .map((s) => ({
      id: s.id,
      nom: s.nom,
      famille: familleDuStyle(s.id),
      descriptor: s.descriptor,
      clause: s.clause ?? "",
      apercu: s.apercus.length > 0,
    }));

  return (
    <>
      <Topbar
        trail={
          <>
            <Link href="/">Projets</Link>
            <span className="sep">›</span>
            <span className="here">Nouveau projet</span>
          </>
        }
      />
      <main>
        <ConceptionAssistant styles={styles} demos={demosMiseEnScene()} />
      </main>
    </>
  );
}
