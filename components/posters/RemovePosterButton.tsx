"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { retirerAffiche } from "@/app/affiches/actions";
import type { CibleAffiche } from "@/lib/posters/posters";

/** Removes the presentation image (back to the gradient). Two steps so as not to lose it through a misclick. */
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
