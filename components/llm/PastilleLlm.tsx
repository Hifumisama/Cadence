"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StatutLlm } from "@/app/api/llm/statut/route";
import { choisirModeleLlm } from "@/app/llm/actions";

const INTERVALLE_MS = 30_000;

/** Pastille du header : le serveur LLM répond-il, et quel modèle sert. Point or = joignable, écarlate = injoignable,
 * gris = pas encore sondé. « Joignable » veut dire que la route de santé répond : le modèle peut ne pas être chargé en
 * VRAM (llama-swap le charge au premier appel). Un clic ouvre la liste des modèles que le serveur déclare ; choisir
 * un modèle vaut pour les prochains appels (le worker le lit au démarrage de chaque appel). */
export function PastilleLlm() {
  const [statut, setStatut] = useState<StatutLlm | null>(null);
  const [erreurSonde, setErreurSonde] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const racine = useRef<HTMLDivElement>(null);

  const sonder = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/llm/statut", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setStatut((await res.json()) as StatutLlm);
      setErreurSonde(false);
      return true;
    } catch {
      setErreurSonde(true);
      return false;
    }
  }, []);

  useEffect(() => {
    void sonder();
    const timer = setInterval(() => {
      if (!document.hidden) void sonder();
    }, INTERVALLE_MS);
    return () => clearInterval(timer);
  }, [sonder]);

  // Échap ou clic hors du menu le ferme.
  useEffect(() => {
    if (!ouvert) return;
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuvert(false);
    };
    const dehors = (e: MouseEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("keydown", clavier);
    document.addEventListener("mousedown", dehors);
    return () => {
      document.removeEventListener("keydown", clavier);
      document.removeEventListener("mousedown", dehors);
    };
  }, [ouvert]);

  const choisir = async (modele: string | null) => {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await choisirModeleLlm(modele);
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      await sonder();
      setOuvert(false);
    } catch {
      setErreur("Le choix n'a pas pu être enregistré.");
    } finally {
      setEnCours(false);
    }
  };

  const etat = erreurSonde || !statut ? (erreurSonde ? "down" : "inconnu") : statut.joignable ? "ok" : "down";
  const chargeEnVram = statut?.charges?.includes(statut.modele);
  const titre = !statut
    ? erreurSonde
      ? "État du LLM indisponible"
      : "Sonde du LLM en cours…"
    : statut.joignable
      ? `LLM joignable (${statut.hote}) — modèle ${statut.choisi ? "choisi" : "configuré"} : ${statut.modele}` +
        (statut.charges == null ? "" : chargeEnVram ? " — chargé en VRAM" : " — pas chargé (se charge au premier appel)")
      : `LLM injoignable (${statut.hote})`;

  const modeles = statut?.modeles ?? [];
  const peutChoisir = !!statut?.joignable && modeles.length > 0;
  const choixPerime = !!statut?.choisi && statut.modeles != null && !statut.modeles.includes(statut.modele);

  const contenu = (
    <>
      <span className="llm-dot" aria-hidden="true" />
      <span className="llm-nom">{statut ? statut.modele : "LLM"}</span>
    </>
  );

  return (
    <div className="llm-wrap" ref={racine}>
      {peutChoisir ? (
        <button
          type="button"
          className={`llm-pastille llm-bouton is-${etat}`}
          title={`${titre} — cliquer pour changer de modèle`}
          aria-label={titre}
          aria-haspopup="listbox"
          aria-expanded={ouvert}
          onClick={() => {
            setErreur(null);
            setOuvert(!ouvert);
          }}
        >
          {contenu}
          <span className="llm-chevron" aria-hidden="true" />
        </button>
      ) : (
        <span className={`llm-pastille is-${etat}`} title={titre} role="status" aria-label={titre}>
          {contenu}
        </span>
      )}

      {ouvert && statut ? (
        <div className="llm-menu" role="dialog" aria-label="Modèle LLM">
          <span className="llm-menu-titre">Modèle LLM</span>
          <ul className="llm-menu-liste" role="listbox" aria-label="Modèles du serveur">
            {modeles.map((m) => {
              const actif = m === statut.modele;
              return (
                <li key={m} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={actif}
                    className={`llm-menu-item${actif ? " is-actif" : ""}`}
                    disabled={enCours}
                    onClick={() => (actif ? setOuvert(false) : void choisir(m))}
                  >
                    <span className="llm-menu-nom">{m}</span>
                    <span className="llm-menu-notes">
                      {m === statut.defaut ? <span>par défaut</span> : null}
                      {statut.charges?.includes(m) ? <span>en VRAM</span> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {choixPerime ? (
            <p className="llm-menu-alerte" role="alert">
              « {statut.modele} » n&rsquo;est plus déclaré par le serveur : les appels échoueront tant qu&rsquo;on n&rsquo;en choisit pas un autre.
            </p>
          ) : null}
          {statut.choisi ? (
            <button type="button" className="llm-menu-reset" disabled={enCours} onClick={() => void choisir(null)}>
              Revenir au modèle par défaut ({statut.defaut})
            </button>
          ) : null}
          {erreur ? (
            <p className="llm-menu-alerte" role="alert">
              {erreur}
            </p>
          ) : null}
          <p className="llm-menu-aide">Vaut pour les prochains appels, y compris ceux déjà en file. Un modèle fixé pour un skill par variable d&rsquo;environnement prime encore.</p>
        </div>
      ) : null}
    </div>
  );
}
