"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { useTaches } from "@/components/taches/TachesProvider";
import { cleVideo } from "@/lib/taches";

/** Recharge la page du plan quand un de ses rendus change d'état (démarre, finit, échoue, annulé), vu par
 * l'indicateur du header : sans cela la vidéo et l'historique restaient ceux du chargement. Même principe que
 * GenerationPanel (assets) : on compare l'état de la page à celui des tâches, on ne recharge que sur écart. */
export function SuiviRendus({ planUuid, jobs }: { planUuid: string; jobs: { id: number; statut: string }[] }) {
  const router = useRouter();
  const { taches, pret } = useTaches();
  const dernier = useRef(0);

  const perimee = useMemo(() => {
    const duPlan = taches.filter((x) => x.genre === "video" && x.href.endsWith(`/plans/${planUuid}`));
    return duPlan.some((x) => {
      const job = jobs.find((j) => cleVideo(j.id) === x.cle);
      // Une vidéo annulée est `echoue` en base, `annulee` dans la liste des tâches.
      const statutPage = job?.statut === "echoue" && x.statut === "annulee" ? "annulee" : job?.statut;
      return !job || statutPage !== x.statut;
    });
  }, [taches, planUuid, jobs]);

  useEffect(() => {
    if (!pret || !perimee) return;
    if (Date.now() - dernier.current < 2000) return;
    dernier.current = Date.now();
    router.refresh();
  }, [pret, perimee, router]);

  return null;
}
