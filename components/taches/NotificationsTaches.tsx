"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAgents } from "@/components/agents/AgentsProvider";
import { useTaches } from "@/components/taches/TachesProvider";
import { etatNotifications, notifier, pageEnArriere } from "@/lib/notifications-navigateur";
import type { Tache } from "@/lib/taches";
import { Icone } from "@/components/ui/Icone";

/** Notifications de fin de tâche : un petit toast quand une génération, une
 * proposition ou une vidéo se termine (ou échoue), même si on est ailleurs dans
 * l'application. Le panneau du header garde la liste ; ici, on prévient.
 *
 * Règles :
 * - ce qui était déjà fini à l'ouverture de la page n'est pas annoncé (il est dans le
 *   panneau, avec son point) ;
 * - une annulation voulue par l'utilisateur ne notifie pas ;
 * - tant qu'une popup modale est ouverte, on attend : elle masquerait le toast (couche
 *   supérieure du navigateur) et la popup montre déjà son résultat ;
 * - au-delà de 3 fins d'un coup, un seul toast les regroupe. */

const DUREE_MS = 10000;
const DUREE_ECHEC_MS = 16000;
const MAX_VISIBLES = 3;

type Toast = {
  id: number;
  cles: string[];
  ok: boolean;
  titre: string;
  texte: string;
  action: { libelle: string; ouvrir: () => void };
};

function estFinie(x: Tache): boolean {
  return x.statut === "termine" || x.statut === "echoue";
}

function texteFin(x: Tache): string {
  if (x.statut === "echoue") return x.erreur ? x.erreur.slice(0, 120) : "La tâche a échoué.";
  if (x.genre === "llm") return "Terminé : à relire.";
  if (x.genre === "video") return "Vidéo prête.";
  return "Résultat prêt.";
}

export function NotificationsTaches() {
  const router = useRouter();
  const { taches, pret, marquerVuLocal, setPanneauOuvert } = useTaches();
  const { ouvrirAgent } = useAgents();
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Tâches déjà annoncées (ou terminées avant l'ouverture de la page).
  const annoncees = useRef<Set<string> | null>(null);
  const compteur = useRef(0);
  const minuteurs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [attente, setAttente] = useState(0);

  const fermer = useCallback((id: number) => {
    const m = minuteurs.current.get(id);
    if (m) clearTimeout(m);
    minuteurs.current.delete(id);
    setToasts((l) => l.filter((t) => t.id !== id));
  }, []);

  const programmer = useCallback(
    (id: number, ms: number) => {
      const ancien = minuteurs.current.get(id);
      if (ancien) clearTimeout(ancien);
      minuteurs.current.set(id, setTimeout(() => fermer(id), ms));
    },
    [fermer],
  );

  const ouvrirTache = useCallback(
    (x: Tache) => {
      marquerVuLocal([x.cle]);
      if (x.genre === "llm" && x.conversationUuid) ouvrirAgent({ conversationUuid: x.conversationUuid, projectId: x.projectId || undefined });
      else router.push(x.href);
    },
    [marquerVuLocal, ouvrirAgent, router],
  );

  useEffect(() => {
    if (!pret) return;
    // Première réponse : tout ce qui est déjà fini est « connu », pas annoncé.
    if (annoncees.current === null) {
      annoncees.current = new Set(taches.filter(estFinie).map((x) => x.cle));
      return;
    }
    const vues = annoncees.current;
    const nouvelles = taches.filter((x) => estFinie(x) && x.vuAt == null && !vues.has(x.cle));
    if (nouvelles.length === 0) return;

    // Page en arrière-plan (autre onglet, autre fenêtre) et notifications natives actives :
    // une notification du système, pas de toast (il aurait disparu avant le retour).
    if (etatNotifications() === "active" && pageEnArriere()) {
      nouvelles.forEach((x) => vues.add(x.cle));
      if (nouvelles.length > MAX_VISIBLES) {
        const echecs = nouvelles.filter((x) => x.statut === "echoue").length;
        notifier(
          `Cadence : ${nouvelles.length} tâches terminées`,
          echecs > 0 ? `Dont ${echecs} échec${echecs > 1 ? "s" : ""}.` : "Résultats prêts.",
          "cadence-lot",
          () => setPanneauOuvert(true),
        );
      } else {
        nouvelles.forEach((x) => notifier(`Cadence : ${x.libelle}`, texteFin(x), x.cle, () => ouvrirTache(x)));
      }
      return;
    }
    // Une popup modale ouverte : on garde les fins en réserve et on réessaie un peu plus tard.
    if (document.querySelector("dialog[open]")) {
      const t = setTimeout(() => setAttente((n) => n + 1), 1500);
      return () => clearTimeout(t);
    }
    nouvelles.forEach((x) => vues.add(x.cle));

    const id = ++compteur.current;
    let toast: Toast;
    if (nouvelles.length > MAX_VISIBLES) {
      const echecs = nouvelles.filter((x) => x.statut === "echoue").length;
      toast = {
        id,
        cles: nouvelles.map((x) => x.cle),
        ok: echecs === 0,
        titre: `${nouvelles.length} tâches terminées`,
        texte: echecs > 0 ? `dont ${echecs} échec${echecs > 1 ? "s" : ""}.` : "Résultats prêts.",
        action: { libelle: "Ouvrir la liste", ouvrir: () => setPanneauOuvert(true) },
      };
      setToasts((l) => [...l, toast].slice(-MAX_VISIBLES));
      programmer(id, nouvelles.some((x) => x.statut === "echoue") ? DUREE_ECHEC_MS : DUREE_MS);
      return;
    }
    const lot = nouvelles.map((x, i) => {
      const tid = id * 10 + i;
      const t: Toast = {
        id: tid,
        cles: [x.cle],
        ok: x.statut === "termine",
        titre: x.libelle,
        texte: texteFin(x),
        action: { libelle: "Voir", ouvrir: () => ouvrirTache(x) },
      };
      programmer(tid, x.statut === "echoue" ? DUREE_ECHEC_MS : DUREE_MS);
      return t;
    });
    setToasts((l) => [...l, ...lot].slice(-MAX_VISIBLES));
  }, [taches, pret, attente, ouvrirTache, programmer, setPanneauOuvert]);

  useEffect(() => {
    const m = minuteurs.current;
    return () => m.forEach((t) => clearTimeout(t));
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="nt" aria-label="Notifications">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`nt-toast ${t.ok ? "nt-ok" : "nt-echec"}`}
          role={t.ok ? "status" : "alert"}
          onMouseEnter={() => {
            const m = minuteurs.current.get(t.id);
            if (m) clearTimeout(m);
          }}
          onMouseLeave={() => programmer(t.id, 4000)}
        >
          <span className="nt-marque" aria-hidden="true">
            <Icone nom={t.ok ? "valide" : "alerte"} taille={16} />
          </span>
          <div className="nt-corps">
            <span className="nt-titre num" title={t.titre}>
              {t.titre}
            </span>
            <span className="nt-texte">{t.texte}</span>
          </div>
          <button
            type="button"
            className="nt-action"
            onClick={() => {
              t.action.ouvrir();
              fermer(t.id);
            }}
          >
            {t.action.libelle}
          </button>
          <button type="button" className="nt-x" aria-label="Fermer la notification" onClick={() => fermer(t.id)}>
            <Icone nom="fermer" />
          </button>
        </div>
      ))}
    </div>
  );
}
