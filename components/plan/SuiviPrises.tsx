"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { useTaches } from "@/components/taches/TachesProvider";
import { cleImage } from "@/lib/taches";

/** Recharge la page du plan quand une prise générée change d'état (démarre, finit, échoue, annulée), vue par l'indicateur du header :
 * sans cela le bouton et le lecteur audio resteraient ceux du chargement. Même principe que SuiviRendus : on compare l'état de la page
 * à celui des tâches, on ne recharge que sur écart. `generations` liste TOUTES les générations de prises des répliques du plan. */
export function SuiviPrises({ planUuid, generations }: { planUuid: string; generations: { uuid: string; statut: string }[] }) {
  const router = useRouter();
  const { taches, pret } = useTaches();
  const dernier = useRef(0);

  const perimee = useMemo(() => {
    const duPlan = taches.filter((x) => x.genre === "image" && (x.detail ?? "").startsWith("Prise générée") && x.href.endsWith(`/plans/${planUuid}`));
    return duPlan.some((x) => {
      const gen = generations.find((g) => cleImage(g.uuid) === x.cle);
      // Une génération annulée est `echoue` en base, `annulee` dans la liste des tâches.
      const statutPage = gen?.statut === "echoue" && x.statut === "annulee" ? "annulee" : gen?.statut;
      return !gen || statutPage !== x.statut;
    });
  }, [taches, planUuid, generations]);

  useEffect(() => {
    if (!pret || !perimee) return;
    if (Date.now() - dernier.current < 2000) return;
    dernier.current = Date.now();
    router.refresh();
  }, [pret, perimee, router]);

  return null;
}
