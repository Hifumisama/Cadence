"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { useTaches } from "@/components/tasks/TasksProvider";
import { cleVideo } from "@/lib/tasks/tasks";

/** Reloads the clip's page when one of its renders changes state (starts, finishes, fails, cancelled), as seen by
 * the header indicator: without this the video and the history stayed as they were at load. Same principle as
 * GenerationPanel (assets): we compare the page's state with the tasks' state, and only reload on a gap. */
export function SuiviRendus({ planUuid, jobs }: { planUuid: string; jobs: { id: number; statut: string }[] }) {
  const router = useRouter();
  const { taches, pret } = useTaches();
  const dernier = useRef(0);

  const perimee = useMemo(() => {
    const duPlan = taches.filter((x) => x.genre === "video" && x.href.endsWith(`/montage/${planUuid}`));
    return duPlan.some((x) => {
      const job = jobs.find((j) => cleVideo(j.id) === x.cle);
      // A cancelled video is `echoue` in the database, `annulee` in the task list.
      const statutPage = job?.statut === "echoue" && x.statut === "annulee" ? "annulee" : job?.statut;
      return !job || statutPage !== x.statut;
    });
  }, [taches, planUuid, jobs]);

  // A task of this clip (render OR iteration) that stops being active: the page reloads one last time. An iteration is followed by its
  // request's line, which changes kind when it finishes (video → agent) and then escapes the comparison above: without this the video only appeared after a click.
  const actives = useMemo(
    () => taches.filter((x) => x.href.endsWith(`/montage/${planUuid}`) && (x.statut === "en_attente" || x.statut === "en_cours")).map((x) => x.cle),
    [taches, planUuid],
  );
  const avant = useRef<string[] | null>(null);
  useEffect(() => {
    if (!pret) return;
    const precedentes = avant.current;
    avant.current = actives;
    if (precedentes && precedentes.some((cle) => !actives.includes(cle))) router.refresh();
  }, [actives, pret, router]);

  useEffect(() => {
    if (!pret || !perimee) return;
    if (Date.now() - dernier.current < 2000) return;
    dernier.current = Date.now();
    router.refresh();
  }, [pret, perimee, router]);

  return null;
}
