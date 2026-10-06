"use client";

import { useEffect, useState } from "react";
import type { StatutLlm } from "@/app/api/llm/statut/route";

const INTERVALLE_MS = 30_000;

/** Pastille du header : le serveur LLM répond-il, et quel modèle est configuré. Point or = joignable,
 * écarlate = injoignable, gris = pas encore sondé. « Joignable » veut dire que la route de santé répond :
 * le modèle peut ne pas être chargé en VRAM (llama-swap le charge au premier appel). */
export function PastilleLlm() {
  const [statut, setStatut] = useState<StatutLlm | null>(null);
  const [erreurSonde, setErreurSonde] = useState(false);

  useEffect(() => {
    let actif = true;
    const sonder = async () => {
      try {
        const res = await fetch("/api/llm/statut", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const s = (await res.json()) as StatutLlm;
        if (actif) {
          setStatut(s);
          setErreurSonde(false);
        }
      } catch {
        if (actif) setErreurSonde(true);
      }
    };
    void sonder();
    const timer = setInterval(() => {
      if (!document.hidden) void sonder();
    }, INTERVALLE_MS);
    return () => {
      actif = false;
      clearInterval(timer);
    };
  }, []);

  const etat = erreurSonde || !statut ? (erreurSonde ? "down" : "inconnu") : statut.joignable ? "ok" : "down";
  const chargeEnVram = statut?.charges?.includes(statut.modele);
  const titre = !statut
    ? erreurSonde
      ? "État du LLM indisponible"
      : "Sonde du LLM en cours…"
    : statut.joignable
      ? `LLM joignable (${statut.hote}) — modèle configuré : ${statut.modele}` +
        (statut.charges == null ? "" : chargeEnVram ? " — chargé en VRAM" : " — pas chargé (se charge au premier appel)")
      : `LLM injoignable (${statut.hote})`;

  return (
    <span className={`llm-pastille is-${etat}`} title={titre} role="status" aria-label={titre}>
      <span className="llm-dot" aria-hidden="true" />
      <span className="llm-nom">{statut ? statut.modele : "LLM"}</span>
    </span>
  );
}
