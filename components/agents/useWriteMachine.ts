"use client";

import { useEffect, useRef, useState } from "react";

/** Effet « machine à écrire » : le texte visible rattrape le texte reçu lettre par lettre (le flux arrive par à-coups,
 * toutes les ~1,2 s ; sans lissage il apparaît par paquets). La vitesse s'adapte au retard : un petit écart se lit
 * tranquillement, un gros paquet se rattrape vite (jamais plus de ~1 s de retard). Un texte qui raccourcit (nouvel appel)
 * repart de zéro. `null` : rien à écrire. */
export function useMachineAEcrire(cible: string | null): string {
  const texte = cible ?? "";
  const [n, setN] = useState(0);
  const dernier = useRef("");

  useEffect(() => {
    // Un texte qui ne prolonge pas le précédent (nouvel appel, renvoi au modèle) : on repart de zéro.
    if (!texte.startsWith(dernier.current)) setN(0);
    dernier.current = texte;
  }, [texte]);

  useEffect(() => {
    const t = setInterval(() => {
      setN((courant) => {
        const total = dernier.current.length;
        if (courant >= total) return courant;
        const retard = total - courant;
        return Math.min(total, courant + Math.max(1, Math.ceil(retard / 25)));
      });
    }, 25);
    return () => clearInterval(t);
  }, []);

  return texte.slice(0, Math.min(n, texte.length));
}
