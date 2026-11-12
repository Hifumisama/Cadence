"use client";

import { useTransition } from "react";
import { supprimerScene } from "@/app/scenario/actions";
import { Icone } from "@/components/ui/Icon";

/** The trash button of a scene, next to « Modifier ». Its clips are not deleted: they move to « Sans scène ». */
export function SupprimerSceneButton({ sceneId, titre }: { sceneId: number; titre: string }) {
  const [pending, startTransition] = useTransition();

  const onSupprimer = () => {
    if (!window.confirm(`Supprimer la scène "${titre}" ? Ses plans passeront en "sans scène".`)) return;
    startTransition(() => supprimerScene(sceneId));
  };

  return (
    <button className="btn btn-danger btn-icone" type="button" onClick={onSupprimer} disabled={pending} title="Supprimer la scène" aria-label={`Supprimer la scène ${titre}`}>
      <Icone nom={pending ? "encours" : "supprimer"} taille={16} />
    </button>
  );
}
