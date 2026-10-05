"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { arreterCreationProjet, reprendreCreationProjet } from "@/app/creation/actions";
import { SYMBOLE_SOUS_TACHE } from "@/lib/agents-affichage";
import type { VueCreation } from "@/lib/agents/creation-vue";
import { Icone, type NomIcone } from "@/components/ui/Icone";

const SYMBOLE: Record<VueCreation["etapes"][number]["statut"], { icone: NomIcone; libelle: string }> = {
  a_venir: { icone: "vide", libelle: "À venir" },
  en_cours: { icone: "encours", libelle: "En cours" },
  fait: { icone: "fait", libelle: "Fait" },
  passe: { icone: "neutre", libelle: "Rien à faire" },
  echoue: { icone: "echec", libelle: "En échec" },
};

/** La page de l'installateur : l'avancement de la création du projet, étape par étape. Sondage de l'API tant que ça
 * tourne ; « Arrêter » coupe ce qui tourne (rien n'est défait), « Reprendre » relance l'étape en échec. Jamais la couleur
 * seule : un symbole et un libellé par état. */
export function SuiviCreation({ projectId, initial }: { projectId: number; initial: VueCreation | null }) {
  const [vue, setVue] = useState<VueCreation | null>(initial);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const enVol = useRef(false);

  const charger = useCallback(async () => {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const res = await fetch(`/api/creation/${projectId}`, { cache: "no-store" });
      if (res.ok) setVue(((await res.json()) as { creation: VueCreation | null }).creation);
    } catch {
      // serveur qui redémarre : au prochain tour
    } finally {
      enVol.current = false;
    }
  }, [projectId]);

  const enCours = vue?.statut === "en_cours";
  useEffect(() => {
    const t = setInterval(() => void charger(), enCours ? 2000 : 8000);
    return () => clearInterval(t);
  }, [charger, enCours]);

  const agir = (action: () => Promise<{ ok: boolean; erreur?: string }>) =>
    startTransition(async () => {
      setErreur(null);
      const r = await action();
      if (!r.ok) setErreur(r.erreur ?? "L'action a échoué.");
      await charger();
    });

  if (!vue) {
    return (
      <section className="panel">
        <div className="panel-bd">
          <p className="tiny-note">
            Aucune création pour ce projet. Parle de ton projet à l&rsquo;agent, puis « Créer tout le projet » enchaînera toutes les étapes sans rien te demander entre elles.
          </p>
        </div>
      </section>
    );
  }

  const titre = { en_cours: "Création en cours", termine: "Création terminée", echoue: "Création interrompue", arretee: "Création arrêtée" }[vue.statut];
  const etapeEnCours = vue.etapes.find((e) => e.statut === "en_cours" || e.statut === "echoue");

  return (
    <section className="panel" aria-label="Avancement de la création">
      <div className="panel-hd">
        <h2>{titre}</h2>
        <span className="eyebrow num">
          {vue.faites} / {vue.total}
        </span>
      </div>
      <div className="panel-bd" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <progress className="gd-bar" value={vue.faites} max={vue.total} aria-label="Étapes terminées" />
        <ol className="inst-etapes">
          {vue.etapes.map((e) => (
            <li key={e.cle} className={`inst-etape s-${e.statut}`} aria-current={etapeEnCours?.cle === e.cle ? "step" : undefined}>
              <span className="inst-symbole" aria-hidden="true">
                <Icone nom={SYMBOLE[e.statut].icone} taille={18} className={e.statut === "en_cours" ? "icone-tourne" : undefined} />
              </span>
              <span className="inst-corps">
                <span className="inst-nom">{e.libelle}</span>
                <span className="tiny-note">{e.erreur ?? e.resultat ?? e.detail}</span>
              </span>
              <span className="inst-etat tiny-note">{SYMBOLE[e.statut].libelle}</span>
              {e.activite ? (
                <span className="inst-activite tiny-note" role="status">
                  {e.activite}
                </span>
              ) : null}
              {e.sousTaches.length > 0 ? (
                <ul className="inst-sous" aria-label={`Détail : ${e.libelle}`}>
                  {e.sousTaches.map((s, i) => (
                    <li key={`${s.libelle}-${i}`} className={`s-${s.statut}`}>
                      <span aria-hidden="true">{SYMBOLE_SOUS_TACHE[s.statut]}</span>
                      <span className="inst-sous-nom">{s.libelle}</span>
                      <span className="tiny-note">{s.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
        {erreur ? (
          <p className="ag-erreur tiny-note" role="alert">
            {erreur}
          </p>
        ) : null}
        <div className="gd-row">
          {vue.statut === "en_cours" ? (
            <button type="button" className="btn btn-ghost" onClick={() => agir(() => arreterCreationProjet(projectId))} disabled={pending}>
              Arrêter
            </button>
          ) : null}
          {vue.statut === "echoue" || vue.statut === "arretee" ? (
            <button type="button" className="btn btn-gold" onClick={() => agir(() => reprendreCreationProjet(projectId))} disabled={pending}>
              {vue.statut === "echoue" ? "Reprendre depuis l'étape en échec" : "Reprendre"}
            </button>
          ) : null}
          {vue.statut === "termine" ? (
            <Link href={`/p/${projectId}`} className="btn btn-gold">
              Voir le projet
            </Link>
          ) : null}
          <span className="tiny-note">
            Tu peux quitter cette page : la création continue sur le serveur. Il n&rsquo;y a pas de point de retour : pour tout défaire, supprime le projet.
          </span>
        </div>
      </div>
    </section>
  );
}
