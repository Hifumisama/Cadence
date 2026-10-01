"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { adopterGeneration, supprimerGeneration } from "@/app/assets/generation-actions";
import { GenerationDialog } from "@/components/assets/GenerationDialog";
import type { Aspect } from "@/lib/asset-generation";
import type { GenerationVue, SourceDisponible } from "@/lib/queries-generations";

const ACTIFS = ["en_attente", "en_cours"];

/** Génération d'images d'un asset : le bouton « Générer… » (à côté de l'import
 * du fichier) ouvre la popup (modes texte / images). Chaque demande produit un
 * CANDIDAT (jamais l'image de l'asset directement) : la popup les montre, on
 * l'adopte ou on le jette. La page se rafraîchit toute seule tant qu'une demande
 * est active, popup fermée ou non. */
export function GenerationPanel({
  assetId,
  code,
  type,
  methodeGeneration,
  parentCode,
  promptInitial,
  raisonBloquee,
  defauts,
  registre,
  imageActuelle,
  generations,
  simule,
}: {
  assetId: number;
  code: string;
  type: string;
  methodeGeneration: string | null;
  parentCode: string | null;
  promptInitial: string;
  raisonBloquee: string | null;
  defauts: { aspect: Aspect; megapixels: number; lora: boolean };
  registre: SourceDisponible[];
  imageActuelle: SourceDisponible | null;
  generations: GenerationVue[];
  simule: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [pending, startTransition] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const actif = generations.some((g) => ACTIFS.includes(g.statut));

  useEffect(() => {
    if (!actif) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [actif, router]);

  const adopter = (id: number) =>
    startTransition(async () => {
      const r = await adopterGeneration(id);
      setRetour(
        r.ok
          ? { ok: true, texte: "Image et prompt adoptés : l'asset repasse « en cours », à revalider." }
          : { ok: false, texte: r.erreur },
      );
    });

  const supprimer = (id: number) =>
    startTransition(async () => {
      const r = await supprimerGeneration(id);
      setRetour(r.ok ? null : { ok: false, texte: r.erreur });
    });

  return (
    <>
      <button
        className="btn btn-gold btn-sm"
        type="button"
        onClick={() => setOuvert(true)}
        disabled={raisonBloquee != null}
        title={raisonBloquee ?? "Générer une image pour cet asset"}
      >
        Générer…
      </button>

      <GenerationDialog
        assetId={assetId}
        code={code}
        type={type}
        methodeGeneration={methodeGeneration}
        parentCode={parentCode}
        promptInitial={promptInitial}
        defauts={defauts}
        registre={registre}
        imageActuelle={imageActuelle}
        generations={generations}
        ouvert={ouvert}
        onFermer={() => setOuvert(false)}
        onAdopter={adopter}
        onSupprimer={supprimer}
        occupe={pending}
        retour={retour}
        simule={simule}
      />
    </>
  );
}
