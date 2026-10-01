"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EVENEMENT,
  activerNotifications,
  desactiverNotifications,
  etatNotifications,
  type EtatNotifications,
} from "@/lib/notifications-navigateur";

/** Interrupteur « Notifications du navigateur » du panneau des générations : prévient
 * hors de l'onglet quand une tâche se termine. L'autorisation est demandée au clic. */
export function BasculeNotifications() {
  const [etat, setEtat] = useState<EtatNotifications>("indisponible");
  const [occupe, setOccupe] = useState(false);

  const relire = useCallback(() => setEtat(etatNotifications()), []);
  useEffect(() => {
    relire();
    window.addEventListener(EVENEMENT, relire);
    return () => window.removeEventListener(EVENEMENT, relire);
  }, [relire]);

  if (etat === "indisponible") return null;

  if (etat === "bloquee") {
    return (
      <p className="tq-notif tiny-note" role="status">
        Notifications bloquées par le navigateur : autorise-les dans les réglages du site, puis reviens ici.
      </p>
    );
  }

  const active = etat === "active";
  return (
    <label className="tq-notif">
      <input
        type="checkbox"
        checked={active}
        disabled={occupe}
        onChange={async () => {
          if (active) {
            desactiverNotifications();
            return;
          }
          setOccupe(true);
          await activerNotifications();
          setOccupe(false);
        }}
      />
      <span>
        Notifications du navigateur
        <small className="tiny-note"> {active ? "— tu es prévenu hors de l’onglet" : "— être prévenu hors de l’onglet"}</small>
      </span>
    </label>
  );
}
