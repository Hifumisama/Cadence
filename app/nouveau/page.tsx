import Link from "next/link";
import { ConceptionAssistant } from "@/components/conception/ConceptionAssistant";
import type { StyleVue } from "@/components/conception/types";
import { Topbar } from "@/components/ui/Topbar";
import { styleUtilisable } from "@/lib/styles/bibliotheque";
import { listerStyles } from "@/lib/styles/styles-db";

export const dynamic = "force-dynamic";

/** La conception d'un projet : les choix qu'on fait avant de raconter l'histoire (format, genre, ton, durée, langue, style), puis la
 * rencontre avec le scénariste. Seuls les styles prêts à l'emploi (avec leur clause courte pour la vidéo) sont proposés ; les images de
 * présentation sont facultatives (`data/styles/<id>/<sujet>.webp`, générées par `npm run styles:apercus`). Les styles viennent de la table `styles`. */
export default async function NouveauProjetPage() {
  const styles: StyleVue[] = (await listerStyles())
    .filter(styleUtilisable)
    .map((s) => ({
      id: s.id,
      nom: s.nom,
      categories: s.categories,
      filtres: s.filtres,
      descriptor: s.descriptor,
      clause: s.clause ?? "",
      images: s.apercus,
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
