"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { demanderFichePlan } from "@/app/demandes/actions";
import { useTaches } from "@/components/tasks/TasksProvider";
import { cleDemande } from "@/lib/tasks/tasks";

/** The delay after which a request the queue does not show yet is considered finished (it may have been created and finished between two polls). */
const ATTENTE_MAX_MS = 20000;

/** « Générer la fiche » of a clip: the sheet (video prompt, references) is written in the background and saved without review; we read it back
 * on the clip's page. Open H3 IR alone (lib/h3ir/preparation.ts): if the clip does not yet have its references or their images, the request prepares them first
 * (choice of references, asset creation, prompts, images), then compiles. The current step is shown beside the button (« Images (1/3) »). The button
 * stays active elsewhere: the app can be browsed while it writes, a line in the tasks queue follows it. `demandeEnCours`: the request already placed
 * (page reloaded midway). */
export function GenererFiche({
  projectId,
  planUuid,
  demandeEnCours = null,
  libelle = "Générer la fiche",
  className = "btn btn-gold btn-sm",
  avant,
  onErreur,
}: {
  projectId: number;
  planUuid: string;
  demandeEnCours?: number | null;
  libelle?: string;
  className?: string;
  /** Present: the Open H3 IR settings of this launch (optional); the compiled sheet replaces the existing sheet. */
  /** Called before the launch (e.g. save the clip's screenplay); returns false to give up. */
  avant?: () => Promise<boolean>;
  onErreur?: (message: string | null) => void;
}) {
  const router = useRouter();
  const { taches, pret, rafraichir } = useTaches();
  const [demandeId, setDemandeId] = useState<number | null>(demandeEnCours);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const depuis = useRef<number>(Date.now());

  // The page reloads with a request in progress (or finished): we follow the one the server shows.
  useEffect(() => {
    setDemandeId(demandeEnCours);
    if (demandeEnCours != null) depuis.current = Date.now();
  }, [demandeEnCours]);

  const signaler = (m: string | null) => {
    setErreur(m);
    onErreur?.(m);
  };

  // While the task is active we wait; as soon as it is no longer (finished, failed, cancelled), the page reloads: the sheet is there.
  useEffect(() => {
    if (demandeId == null || !pret) return;
    const t = taches.find((x) => x.cle === cleDemande(demandeId));
    const active = t && (t.statut === "en_attente" || t.statut === "en_cours");
    if (active) return;
    if (!t && Date.now() - depuis.current < ATTENTE_MAX_MS) {
      const r = setTimeout(() => void rafraichir(), 2000);
      return () => clearTimeout(r);
    }
    if (t?.statut === "echoue") signaler("L'écriture de la fiche a échoué : le détail est dans le panneau des tâches.");
    setDemandeId(null);
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandeId, taches, pret]);

  const lancer = async () => {
    if (envoi || demandeId != null) return;
    signaler(null);
    setEnvoi(true);
    try {
      if (avant && !(await avant())) return;
      const r = await demanderFichePlan(projectId, planUuid);
      if (!r.ok) {
        signaler(r.erreur);
        return;
      }
      depuis.current = Date.now();
      setDemandeId(r.demandeId);
      void rafraichir();
    } catch (e) {
      signaler(e instanceof Error ? e.message : "Quelque chose a échoué.");
    } finally {
      setEnvoi(false);
    }
  };

  const enCours = demandeId != null;
  // The current step, read from the request's line in the tasks panel (« Choix des références · 1/5 », « Images (1/3) · 4/5 »).
  const etape = demandeId != null ? (taches.find((x) => x.cle === cleDemande(demandeId))?.detail ?? null) : null;
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          void lancer();
        }}
        disabled={envoi || enCours}
        title="Open H3 IR compile la fiche en arrière-plan. S'il manque des références ou leurs images, elles sont d'abord choisies et générées (deux assets au plus sont créés). Tu la relis ensuite dans la page du plan"
      >
        {envoi ? "…" : enCours ? "Fiche en cours d'écriture…" : libelle}
      </button>
      {etape ? <span className="tiny-note" role="status">{etape}</span> : null}
      {erreur && !onErreur ? <span className="tiny-note" role="alert">{erreur}</span> : null}
    </>
  );
}
