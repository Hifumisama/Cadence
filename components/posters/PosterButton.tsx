"use client";

import { useTransition } from "react";
import { ouvrirAffiche } from "@/app/affiches/actions";
import { Icone } from "@/components/ui/Icon";
import type { CibleAffiche } from "@/lib/posters/posters";

/** « Générer une image »: opens the poster generation page of a project or an episode (the poster asset, invisible
 * from the registry, is created on the first click). */
export function BoutonAffiche({
  cible,
  id,
  className = "btn btn-ghost",
  libelle = "Générer une image",
}: {
  cible: CibleAffiche;
  id: number;
  className?: string;
  libelle?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      title="Générer une image de présentation avec l'IA, à partir du titre, du résumé et de la clause de style"
      onClick={() =>
        startTransition(async () => {
          await ouvrirAffiche(cible, id);
        })
      }
    >
      <Icone nom="image" taille={16} /> {pending ? "…" : libelle}
    </button>
  );
}
