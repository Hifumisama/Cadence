"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import type { GenerationVivante } from "@/components/assets/GenerationDialog";
import { useTaches } from "@/components/taches/TachesProvider";
import type { GenerationVue } from "@/lib/queries-generations";
import { cleImage, estActive, pageEstPerimee, tachesDeAsset } from "@/lib/taches";

/** Le suivi en direct des générations d'une voix (référence, test vidéo), partagé par les deux étapes qui en lancent : la progression, le rang
 * dans la file et l'annulation viennent de l'indicateur du bandeau. `methodes` : celles que l'étape montre. `surveiller` : UNE étape
 * recharge la page quand une génération de la voix change d'état (démarre, finit, échoue, vient d'un autre onglet) — tous les
 * panneaux étant montés, une seule suffit. Arrivée depuis le bandeau (`?generation=`) : l'étape qui possède cette génération la marque
 * vue et réécrit l'adresse sur son étape, une seule fois. */
export function useGenerationsVoix({
  assetId,
  generations,
  generationInitiale,
  methodes,
  etape,
  surveiller = false,
}: {
  assetId: number;
  generations: GenerationVue[];
  generationInitiale: string | null;
  methodes: string[];
  etape: string;
  surveiller?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { taches, pret, marquerVuLocal, annuler } = useTaches();

  const traite = useRef(false);
  useEffect(() => {
    if (traite.current || !generationInitiale) return;
    const cible = generations.find((g) => g.uuid === generationInitiale);
    if (!cible || !methodes.includes(cible.methode)) return;
    traite.current = true;
    marquerVuLocal([cleImage(cible.uuid)]);
    router.replace(`${pathname}?etape=${etape}`, { scroll: false });
  }, [generationInitiale, generations, methodes, etape, marquerVuLocal, router, pathname]);

  const tachesAsset = useMemo(() => tachesDeAsset(taches, assetId), [taches, assetId]);
  const dernierRefresh = useRef(0);
  useEffect(() => {
    if (!surveiller || !pret || !pageEstPerimee(tachesAsset, generations)) return;
    if (Date.now() - dernierRefresh.current < 2000) return;
    dernierRefresh.current = Date.now();
    router.refresh();
  }, [surveiller, pret, tachesAsset, generations, router]);

  const vivantes = useMemo<GenerationVivante[]>(
    () =>
      generations
        .filter((g) => methodes.includes(g.methode))
        .map((g) => {
          const live = tachesAsset.find((x) => x.cle === cleImage(g.uuid));
          if (!live || !estActive(live)) return { ...g, position: null, derriere: null };
          return {
            ...g,
            statut: live.statut,
            progression: live.progression ?? g.progression,
            position: live.positionFile,
            derriere: live.derriere,
            annulationDemandee: live.annulationDemandee,
          };
        }),
    [generations, tachesAsset, methodes],
  );

  return { vivantes, annuler: (g: GenerationVivante) => annuler(cleImage(g.uuid)) };
}
