"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { demanderFichePlan, demanderFicheH3ir } from "@/app/demandes/actions";
import { useTaches } from "@/components/taches/TachesProvider";
import { cleDemande } from "@/lib/taches";

/** Le délai au bout duquel une demande que la file ne montre pas encore est tenue pour finie (elle a pu naître et finir entre deux sondages). */
const ATTENTE_MAX_MS = 20000;

/** « Générer la fiche » d'un plan qui n'en a pas : l'agent écrit la fiche (prompt vidéo, références) en arrière-plan et elle est enregistrée sans relecture ;
 * on la relit dans la page du plan. Le bouton reste actif ailleurs : l'application se parcourt pendant l'écriture, une ligne de la file des tâches la suit.
 * `demandeEnCours` : la demande déjà posée (page rechargée en cours de route). */
export function GenererFiche({
  projectId,
  planUuid,
  demandeEnCours = null,
  libelle = "Générer la fiche",
  className = "btn btn-gold btn-sm",
  avant,
  onErreur,
  h3ir,
}: {
  projectId: number;
  planUuid: string;
  demandeEnCours?: number | null;
  libelle?: string;
  className?: string;
  /** Présent : la fiche est compilée par Open H3 IR (et remplace la fiche existante) avec ces réglages facultatifs, au lieu d'être écrite par `plan-h3`. */
  h3ir?: { shots: number | null; director: string | null; creativity: string | null };
  /** Appelé avant le lancement (ex. enregistrer le scénario du plan) ; renvoie false pour renoncer. */
  avant?: () => Promise<boolean>;
  onErreur?: (message: string | null) => void;
}) {
  const router = useRouter();
  const { taches, pret, rafraichir } = useTaches();
  const [demandeId, setDemandeId] = useState<number | null>(demandeEnCours);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const depuis = useRef<number>(Date.now());

  // La page recharge avec une demande en cours (ou finie) : on suit celle que le serveur montre.
  useEffect(() => {
    setDemandeId(demandeEnCours);
    if (demandeEnCours != null) depuis.current = Date.now();
  }, [demandeEnCours]);

  const signaler = (m: string | null) => {
    setErreur(m);
    onErreur?.(m);
  };

  // Tant que la tâche est active on attend ; dès qu'elle ne l'est plus (finie, échouée, annulée), la page se recharge : la fiche est là.
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
      const r = h3ir ? await demanderFicheH3ir(projectId, planUuid, h3ir) : await demanderFichePlan(projectId, planUuid);
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
        title={
          h3ir
            ? "Open H3 IR compile la fiche en arrière-plan (traduction de l'intent, une à deux minutes par essai) ; elle remplace la fiche actuelle, dont le prompt reste dans l'historique"
            : "L'agent écrit la fiche (prompt vidéo, références) en arrière-plan ; tu la relis ensuite dans la page du plan"
        }
      >
        {envoi ? "…" : enCours ? "Fiche en cours d'écriture…" : libelle}
      </button>
      {erreur && !onErreur ? <span className="tiny-note" role="alert">{erreur}</span> : null}
    </>
  );
}
