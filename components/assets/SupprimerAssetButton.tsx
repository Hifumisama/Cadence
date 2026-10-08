"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { supprimerAsset } from "@/app/assets/actions";

export function SupprimerAssetButton({
  assetId,
  code,
  bloque,
  raisonBlocage,
  redirectTo,
  confirmation,
  libelle,
}: {
  assetId: number;
  code: string;
  bloque: boolean;
  raisonBlocage: string | null;
  redirectTo: string;
  /** Précision ajoutée à la confirmation (ce qui changera). */
  confirmation?: string | null;
  /** Ce que la confirmation nomme à la place du code (le casting n'affiche jamais le code VOICE_*). */
  libelle?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const onSupprimer = () => {
    if (bloque) return;
    if (!window.confirm(`Supprimer définitivement ${libelle ?? code} ?${confirmation ? ` ${confirmation}` : ""}`)) return;
    setErreur(null);
    startTransition(async () => {
      const resultat = await supprimerAsset(assetId);
      if (resultat.ok) {
        router.push(redirectTo);
      } else {
        setErreur(resultat.erreur);
      }
    });
  };

  return (
    <span>
      <button
        className="btn btn-danger btn-sm"
        type="button"
        onClick={onSupprimer}
        disabled={pending || bloque}
        title={bloque ? raisonBlocage ?? "Suppression bloquée" : "Supprimer"}
      >
        {pending ? "..." : "Supprimer"}
      </button>
      {erreur ? <p className="tiny-note" style={{ color: "var(--ecarlate-glow)", marginTop: 6 }}>{erreur}</p> : null}
    </span>
  );
}
