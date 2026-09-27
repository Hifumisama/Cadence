"use client";

import { useTransition } from "react";
import { supprimerMouvement } from "@/app/scenario/actions";

export function SupprimerMouvementButton({ mouvementId, titre }: { mouvementId: number; titre: string }) {
  const [pending, startTransition] = useTransition();

  const onSupprimer = () => {
    if (!window.confirm(`Supprimer le mouvement "${titre}" ? Ses plans passeront en "sans mouvement".`)) return;
    startTransition(() => supprimerMouvement(mouvementId));
  };

  return (
    <button className="btn btn-danger btn-sm" type="button" onClick={onSupprimer} disabled={pending}>
      {pending ? "..." : "Supprimer"}
    </button>
  );
}
