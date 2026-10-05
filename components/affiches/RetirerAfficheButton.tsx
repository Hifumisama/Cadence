"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { retirerAffiche } from "@/app/affiches/actions";
import type { CibleAffiche } from "@/lib/affiches";

/** Retire l'image de présentation (retour au dégradé). Deux temps pour ne pas la perdre d'un faux clic. */
export function RetirerAfficheButton({ cible, id }: { cible: CibleAffiche; id: number }) {
  const router = useRouter();
  const [demande, setDemande] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!demande) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setDemande(true)}>
        Retirer l&rsquo;image
      </button>
    );
  }
  return (
    <span className="aff-confirmation">
      <button
        type="button"
        className="btn btn-danger"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await retirerAffiche(cible, id);
            setDemande(false);
            router.refresh();
          })
        }
      >
        {pending ? "…" : "Oui, retirer"}
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setDemande(false)} disabled={pending}>
        Annuler
      </button>
    </span>
  );
}
