"use client";

import { useTransition } from "react";
import { ouvrirAffiche } from "@/app/affiches/actions";
import { Icone } from "@/components/ui/Icone";
import type { CibleAffiche } from "@/lib/affiches";

/** « Générer une image » : ouvre la page de génération de l'affiche d'un projet ou d'un épisode (l'asset d'affiche, invisible
 * du registre, est créé au premier clic). */
export function BoutonAffiche({ cible, id, className = "btn btn-ghost" }: { cible: CibleAffiche; id: number; className?: string }) {
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
      <Icone nom="image" taille={16} /> {pending ? "…" : "Générer une image"}
    </button>
  );
}
