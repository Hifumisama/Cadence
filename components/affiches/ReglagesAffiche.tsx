"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reglerTitreAffiche } from "@/app/affiches/actions";
import type { CibleAffiche } from "@/lib/affiches";

/** Le réglage de l'affiche avant de lancer un essai : écrire le titre dans l'image (ligne de titre du prompt). Le prompt lui-même est écrit par
 * l'agent à partir de la consigne de l'atelier (components/assets/AtelierAsset.tsx). */
export function ReglagesAffiche({
  cible,
  id,
  titreDansImage,
  personnage,
}: {
  cible: CibleAffiche;
  id: number;
  titreDansImage: boolean;
  /** Le personnage principal retenu, et si son image sert de première source. */
  personnage: { nom: string; aImage: boolean } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const basculer = (actif: boolean) =>
    startTransition(async () => {
      const r = await reglerTitreAffiche(cible, id, actif);
      setErreur(r.ok ? null : r.erreur);
      router.refresh();
    });

  return (
    <div className="aff-reglages">
      <label className="aff-case">
        <input type="checkbox" checked={titreDansImage} disabled={pending} onChange={(e) => basculer(e.target.checked)} />
        <span>
          Écrire le titre dans l&rsquo;image
          <small>
            {titreDansImage
              ? "Le modèle dessine le titre : il n'est pas superposé une seconde fois. Un titre renommé demande une nouvelle image."
              : "Sinon le titre se superpose à l'affichage, net et toujours à jour."}
          </small>
        </span>
      </label>

      <p className="tiny-note">
        {personnage
          ? personnage.aImage
            ? `Le personnage principal (${personnage.nom}) est joint d'office à la consigne : l'affiche part d'un canevas vide 2:3 et en reprend le visage et la tenue. Retire-le pour une création de zéro.`
            : `Le personnage principal (${personnage.nom}) est décrit dans le prompt, mais il n'a pas encore d'image : la cohérence sera moindre.`
          : "Aucun personnage principal repéré dans le registre : l'agent compose à partir du résumé."}
      </p>

      {erreur ? (
        <p className="aff-retour is-erreur" role="status">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
