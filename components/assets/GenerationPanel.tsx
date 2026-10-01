"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { adopterGeneration, supprimerGeneration } from "@/app/assets/generation-actions";
import { GenerationDialog, type GenerationVivante } from "@/components/assets/GenerationDialog";
import { useTaches } from "@/components/taches/TachesProvider";
import type { Aspect } from "@/lib/asset-generation";
import type { GenerationVue, SourceDisponible } from "@/lib/queries-generations";
import { cleImage, estActive, pageEstPerimee, tachesDeAsset } from "@/lib/taches";

/** Génération d'images d'un asset : le bouton « Générer… » (à côté de l'import
 * du fichier) ouvre la popup (modes texte / images). Chaque demande produit un
 * CANDIDAT (jamais l'image de l'asset directement) : la popup les montre, on
 * l'adopte ou on le jette. Plusieurs demandes peuvent attendre : le suivi vit
 * dans l'indicateur du header (components/taches), qui nous dit quand la page est
 * en retard et à quelle étape en est la génération en cours. */
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
  generationInitiale,
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
  /** uuid d'une génération à ouvrir d'office (lien `?generation=` de l'indicateur). */
  generationInitiale: string | null;
  simule: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { taches, pret, marquerVuLocal, annuler } = useTaches();
  const cible = generationInitiale ? (generations.find((g) => g.uuid === generationInitiale) ?? null) : null;
  const [ouvert, setOuvert] = useState(cible != null);
  const [candidatInitialId] = useState<number | null>(cible?.id ?? null);
  const [pending, startTransition] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  // Arrivée depuis l'indicateur : on a ouvert la popup sur la génération, on la
  // marque vue et on retire `?generation=` de l'adresse (une seule fois).
  const traite = useRef(false);
  useEffect(() => {
    if (traite.current || !cible) return;
    traite.current = true;
    marquerVuLocal([cleImage(cible.uuid)]);
    router.replace(pathname, { scroll: false });
  }, [cible, marquerVuLocal, router, pathname]);

  // La page ne se recharge que lorsqu'une génération de CET asset change d'état
  // (démarre, finit, échoue, arrive d'un autre onglet) — pas à chaque étape.
  const tachesAsset = useMemo(() => tachesDeAsset(taches, assetId), [taches, assetId]);
  const dernierRefresh = useRef(0);
  useEffect(() => {
    if (!pret || !pageEstPerimee(tachesAsset, generations)) return;
    if (Date.now() - dernierRefresh.current < 2000) return;
    dernierRefresh.current = Date.now();
    router.refresh();
  }, [pret, tachesAsset, generations, router]);

  // Progression, aperçu et rang dans la file viennent de l'indicateur, en direct.
  const vivantes = useMemo<GenerationVivante[]>(
    () =>
      generations.map((g) => {
        const live = tachesAsset.find((x) => x.cle === cleImage(g.uuid));
        if (!live || !estActive(live)) return { ...g, position: null, derriereVideo: false };
        return {
          ...g,
          statut: live.statut,
          progression: live.progression ?? g.progression,
          apercuSrc: live.apercuSrc ?? g.apercuSrc,
          position: live.positionFile,
          derriereVideo: live.derriereVideo,
          annulationDemandee: live.annulationDemandee,
        };
      }),
    [generations, tachesAsset],
  );

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
        generations={vivantes}
        candidatInitialId={candidatInitialId}
        ouvert={ouvert}
        onFermer={() => setOuvert(false)}
        onAdopter={adopter}
        onSupprimer={supprimer}
        onAnnuler={(g) => annuler(cleImage(g.uuid))}
        occupe={pending}
        retour={retour}
        simule={simule}
      />
    </>
  );
}
