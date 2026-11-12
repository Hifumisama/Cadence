"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import type { GenerationVivante } from "@/components/assets/GenerationDialog";
import { useTaches } from "@/components/tasks/TasksProvider";
import type { GenerationVue } from "@/lib/assets/queries-generations";
import { cleImage, estActive, pageEstPerimee, tachesDeAsset } from "@/lib/tasks/tasks";

/** Live tracking of the character's voice attempts: progress, rank in the queue and cancellation come from the header indicator.
 * `methodes`: those the step shows. `surveiller`: ONE step reloads the page when a voice generation changes state (starts, finishes,
 * fails, comes from another tab) — all the panels being mounted, one is enough. Arrival from the header (`?generation=`): the step
 * that owns this generation marks it seen and rewrites the address on its step, only once. */
export function useGenerationsVoix({
  assetId,
  generations,
  generationInitiale,
  methodes,
  surveiller = false,
}: {
  assetId: number;
  generations: GenerationVue[];
  generationInitiale: string | null;
  methodes: string[];
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
    router.replace(`${pathname}#as-voix`, { scroll: false });
  }, [generationInitiale, generations, methodes, marquerVuLocal, router, pathname]);

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
