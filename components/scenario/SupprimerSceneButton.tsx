"use client";

import { useTransition } from "react";
import { supprimerScene } from "@/app/scenario/actions";

export function SupprimerSceneButton({ sceneId, titre }: { sceneId: number; titre: string }) {
  const [pending, startTransition] = useTransition();

  const onSupprimer = () => {
    if (!window.confirm(`Supprimer la scène "${titre}" ? Ses plans passeront en "sans scène".`)) return;
    startTransition(() => supprimerScene(sceneId));
  };

  return (
    <button className="btn btn-danger btn-sm" type="button" onClick={onSupprimer} disabled={pending}>
      {pending ? "..." : "Supprimer"}
    </button>
  );
}
