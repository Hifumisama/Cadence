import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { ConceptionAssistant } from "@/components/conception/ConceptionAssistant";
import type { StyleVue } from "@/components/conception/types";
import { Topbar } from "@/components/ui/Topbar";
import { MEDIA_ROOT } from "@/lib/media";
import { bibliothequeStyles, cheminApercuStyle, styleUtilisable } from "@/lib/styles/bibliotheque";
import { IDS_SUJETS } from "@/lib/styles/sujets";

export const dynamic = "force-dynamic";

/** La conception d'un projet : les choix qu'on fait avant de raconter l'histoire (format, genre, ton, durée, langue, style), puis la
 * rencontre avec le scénariste. Seuls les styles prêts à l'emploi (avec leur clause courte pour la vidéo) sont proposés ; les images de
 * présentation sont facultatives (`data/styles/<id>/<sujet>.webp`, générées par `npm run styles:apercus`). */
export default function NouveauProjetPage() {
  const styles: StyleVue[] = bibliothequeStyles()
    .filter(styleUtilisable)
    .map((s) => ({
      id: s.id,
      nom: s.nom,
      categories: s.categories,
      filtres: s.filtres,
      descriptor: s.descriptor,
      clause: s.clause ?? "",
      images: IDS_SUJETS.filter((sujet) => existsSync(join(MEDIA_ROOT, cheminApercuStyle(s.id, sujet)))),
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
        <ConceptionAssistant styles={styles} />
      </main>
    </>
  );
}
