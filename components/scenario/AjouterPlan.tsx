"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { affiner, appliquerSelection, genererProposition, ouvrirConversation, rejeter } from "@/app/agents/actions";
import { lirePropositionVue } from "@/app/agents/lecture";
import { Icone } from "@/components/ui/Icone";
import type { EcrasementAConfirmer, Position, VueChangement, VueProposition } from "@/lib/agents/types";

/** Où le plan va naître, tel que la page Scénario le sait : la position dans l'épisode, la scène (null = « Sans scène »), et leurs noms pour l'écran. */
export type CibleAjoutPlan = {
  insertion: Position;
  sceneId: number | null;
  /** « III · La Fuite ». */
  scene: string;
  /** « Après le plan 07 · Le seuil » ou « Au début du film ». */
  apres: string;
};

type Phase = "brief" | "ecriture" | "relecture" | "fait";

const INTERVALLE_MS = 1500;

const LIBELLE_LIAISON: Record<string, string> = {
  suite: "Dans la continuité du plan précédent",
  coupe: "Coupe franche",
};

const message = (e: unknown) => (e instanceof Error ? e.message : "Erreur inattendue.");

/** Ajouter un plan à la scène ouverte, avec l'agent : on décrit ce qui se passe, l'agent écrit le plan (il lit le brief, la scène et les plans voisins pour
 * raccorder), on relit, on affine si besoin, puis on l'ajoute. Rien n'est écrit dans le scénario avant « Ajouter à la scène ». Autonome : il parle
 * directement aux actions de l'agent (conversation de l'épisode, proposition, application), sans passer par la fenêtre générale de l'agent. */
export function AjouterPlan({
  projectId,
  episodeId,
  ouvert,
  cible,
  onFermer,
  onAjoute,
}: {
  projectId: number;
  episodeId: number;
  ouvert: boolean;
  cible: CibleAjoutPlan | null;
  onFermer: () => void;
  /** Le plan vient d'être ajouté (la page se met à jour d'elle-même). */
  onAjoute: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("brief");
  const [consigne, setConsigne] = useState("");
  const [retour, setRetour] = useState("");
  const [prop, setProp] = useState<VueProposition | null>(null);
  /** La proposition suivie. `prop` n'en est que la dernière lecture (absente juste après le lancement). */
  const [propUuid, setPropUuid] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [ecrasements, setEcrasements] = useState<EcrasementAConfirmer[] | null>(null);
  const conversation = useRef<string | null>(null);
  const cibleDeLaProposition = useRef<string | null>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const cleCible = cible ? JSON.stringify(cible.insertion) + String(cible.sceneId) : null;
  const occupeOuEcrit = occupe || phase === "ecriture";

  const reinit = () => {
    setPhase("brief");
    setConsigne("");
    setRetour("");
    setProp(null);
    setPropUuid(null);
    setErreur(null);
    setEcrasements(null);
    cibleDeLaProposition.current = null;
  };

  // Une autre scène ou une autre position que celle de la proposition en cours : on repart de zéro.
  useEffect(() => {
    if (ouvert && phase !== "brief" && cibleDeLaProposition.current !== cleCible) reinit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, cleCible]);

  // Ouvert : Échap ferme (sauf pendant l'écriture), le fond de page ne défile plus, le focus passe au champ.
  const fermer = () => {
    if (occupeOuEcrit) return;
    if (phase === "fait") reinit();
    onFermer();
  };
  const fermerRef = useRef(fermer);
  fermerRef.current = fermer;
  useEffect(() => {
    if (!ouvert) return;
    const echap = (e: KeyboardEvent) => e.key === "Escape" && fermerRef.current();
    const defilement = document.body.style.overflow;
    document.addEventListener("keydown", echap);
    document.body.style.overflow = "hidden";
    if (phase === "brief") champ.current?.focus();
    return () => {
      document.removeEventListener("keydown", echap);
      document.body.style.overflow = defilement;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  // Pendant l'écriture : on relit la proposition jusqu'à ce qu'elle ne soit plus « en génération ».
  const enGeneration = phase === "ecriture" && propUuid != null;
  useEffect(() => {
    if (!enGeneration || !propUuid) return;
    let annule = false;
    const tick = async () => {
      try {
        const p = await lirePropositionVue(propUuid);
        if (annule) return;
        if (!p) {
          setErreur("La proposition a disparu.");
          setPhase("brief");
          return;
        }
        setProp(p);
        if (p.statut === "prete") setPhase("relecture");
        else if (p.statut === "echouee") {
          setErreur(p.erreur ?? p.tache?.erreur ?? "L'agent n'a pas réussi à écrire ce plan.");
          setPhase("brief");
        } else if (p.statut === "rejetee") setPhase("brief");
      } catch (e) {
        if (!annule) setErreur(message(e));
      }
    };
    void tick();
    const t = setInterval(() => void tick(), INTERVALLE_MS);
    return () => {
      annule = true;
      clearInterval(t);
    };
  }, [enGeneration, propUuid]);

  if (!ouvert || !cible) return null;

  /** Lance une action serveur qui renvoie `{ ok }` ; ramasse les erreurs au même endroit. */
  const agir = async (f: () => Promise<{ ok: boolean; erreur?: string }>) => {
    setErreur(null);
    setOccupe(true);
    try {
      const r = await f();
      if (!r.ok) setErreur(r.erreur ?? "Échec.");
      return r.ok;
    } catch (e) {
      setErreur(message(e));
      return false;
    } finally {
      setOccupe(false);
    }
  };

  const ecrire = async () => {
    const c = consigne.trim();
    if (!c || occupeOuEcrit) return;
    await agir(async () => {
      if (!conversation.current) {
        const r = await ouvrirConversation(projectId, "episode", { id: episodeId }, "courte");
        if (!r.ok) return r;
        conversation.current = r.conversationUuid;
      }
      const r = await genererProposition(conversation.current, { consigne: c, position: cible.insertion, ...(cible.sceneId != null ? { sceneId: cible.sceneId } : {}) });
      if (!r.ok) return r;
      cibleDeLaProposition.current = cleCible;
      setProp(null);
      setPropUuid(r.propositionUuid);
      setPhase("ecriture");
      return r;
    });
  };

  const affinerLeplan = async () => {
    const r = retour.trim();
    if (!propUuid || !r || occupeOuEcrit) return;
    const ok = await agir(async () => {
      const res = await affiner(propUuid, r);
      if (!res.ok) return res;
      setProp(null);
      setPropUuid(res.propositionUuid);
      return res;
    });
    if (ok) {
      setRetour("");
      setPhase("ecriture");
    }
  };

  /** Abandonne la proposition en cours (pendant l'écriture ou à la relecture) et revient à la description, qu'on garde. */
  const abandonner = async () => {
    if (!propUuid || occupe) return;
    const ok = await agir(() => rejeter(propUuid));
    if (ok) {
      setProp(null);
      setPropUuid(null);
      setPhase("brief");
    }
  };

  const ajouter = async (confirmeEcrasement = false) => {
    if (!propUuid || occupeOuEcrit) return;
    setErreur(null);
    setOccupe(true);
    try {
      const r = await appliquerSelection(propUuid, { confirmeEcrasement });
      if (r.ok) {
        setEcrasements(null);
        setPhase("fait");
        onAjoute();
      } else if (r.confirmationRequise?.length) setEcrasements(r.confirmationRequise);
      else setErreur(r.erreur);
    } catch (e) {
      setErreur(message(e));
    } finally {
      setOccupe(false);
    }
  };

  const changements: VueChangement[] = prop?.groupes.flatMap((g) => g.changements) ?? [];
  const planPropose = changements.find((c) => c.cibleType === "plan" && c.operation === "creer") ?? null;
  const autres = changements.filter((c) => c !== planPropose);
  const a = (planPropose?.apres ?? {}) as { titre?: string; description?: string; dureeGenerationSecondes?: number; liaison?: string };
  const bloque = planPropose == null || planPropose.bloque || planPropose.refuseRaison != null;
  const tache = prop?.tache ?? null;

  return createPortal(
    <div className="sc-tiroir-fond" onClick={fermer}>
      <aside className="sc-tiroir sc-ajout" role="dialog" aria-modal="true" aria-label="Nouveau plan" onClick={(e) => e.stopPropagation()}>
        <header className="sc-tiroir-hd">
          <div>
            <span className="sc-tiroir-etiquette">Nouveau plan</span>
            <h2>{phase === "fait" ? "Plan ajouté" : phase === "relecture" ? "À relire" : phase === "ecriture" ? "L'agent écrit" : "Que se passe-t-il ?"}</h2>
            <ul className="sc-ajout-lieu">
              <li>
                <span>Scène</span>
                <b>{cible.scene}</b>
              </li>
              <li>
                <span>Place</span>
                <b>{cible.apres}</b>
              </li>
            </ul>
          </div>
          <button type="button" className="sc-tiroir-fermer" onClick={fermer} disabled={occupeOuEcrit} aria-label="Fermer">
            <Icone nom="fermer" taille={18} />
          </button>
        </header>

        <div className="sc-tiroir-corps" aria-live="polite">
          {phase === "brief" ? (
            <div className="sc-ajout-champ">
              <label htmlFor="ajout-plan-consigne">Décris le plan</label>
              <textarea
                id="ajout-plan-consigne"
                ref={champ}
                className="field"
                rows={6}
                value={consigne}
                onChange={(e) => setConsigne(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void ecrire();
                  }
                }}
                placeholder="Ex. Elle découvre la lampe éteinte ; plan serré sur sa main qui hésite avant de l'allumer."
              />
              <p className="tiny-note">Une phrase suffit : l&rsquo;agent lit le brief, la scène et les plans voisins pour raccorder. Ctrl + Entrée pour lancer.</p>
            </div>
          ) : null}

          {phase === "ecriture" ? (
            <div className="sc-ajout-attente" role="status">
              <span className="sc-ajout-pouls" aria-hidden="true" />
              <div>
                <p>
                  {tache?.statut === "en_attente"
                    ? tache.positionFile != null
                      ? `En file d'attente (n° ${tache.positionFile})…`
                      : "En file d'attente…"
                    : "L'agent écrit le plan…"}
                </p>
                <p className="tiny-note">
                  {tache?.progressionJetons ? `${tache.progressionJetons} jetons reçus · ` : ""}
                  Compte quelques dizaines de secondes. Rien n&rsquo;est écrit dans le scénario tant que tu n&rsquo;as pas validé.
                </p>
              </div>
            </div>
          ) : null}

          {phase === "relecture" ? (
            planPropose ? (
              <>
                <article className="sc-ajout-plan">
                  <h3>{a.titre ?? planPropose.libelle}</h3>
                  <p className="sc-ajout-meta num">
                    {a.dureeGenerationSecondes ? `${a.dureeGenerationSecondes} s` : "Durée à définir"}
                    {a.liaison ? ` · ${LIBELLE_LIAISON[a.liaison] ?? a.liaison}` : ""}
                  </p>
                  <p className="sc-description">{a.description ?? "Pas de description."}</p>
                </article>

                {planPropose.rangsDeplaces.length > 0 ? (
                  <p className="tiny-note">
                    {planPropose.rangsDeplaces.length === 1 ? "Un plan suivant change" : `${planPropose.rangsDeplaces.length} plans suivants changent`} de rang (le montage ne se refait pas : seul le numéro affiché bouge).
                  </p>
                ) : null}

                {planPropose.avertissements.length > 0 || planPropose.refuseRaison ? (
                  <ul className="sc-ajout-avert">
                    {planPropose.refuseRaison ? <li className="is-bloque">{planPropose.refuseRaison}</li> : null}
                    {planPropose.avertissements.map((w, i) => (
                      <li key={i} className={w.type === "bloque_controle" ? "is-bloque" : undefined}>
                        {w.texte}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {autres.length > 0 ? (
                  <details className="sc-ajout-autres">
                    <summary>
                      {autres.length} autre{autres.length > 1 ? "s" : ""} changement{autres.length > 1 ? "s" : ""} dans cette proposition
                    </summary>
                    <ul>
                      {autres.map((c) => (
                        <li key={c.id}>{c.libelle}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                {prop?.resume ? <p className="tiny-note">Note de l&rsquo;agent : {prop.resume}</p> : null}

                {ecrasements ? (
                  <div className="sc-ajout-confirme">
                    <p>Cette proposition écrase des éléments déjà validés :</p>
                    <ul>
                      {ecrasements.map((e) => (
                        <li key={e.changementId}>
                          {e.libelle} : {e.ecrase}
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="btn btn-gold" onClick={() => void ajouter(true)} disabled={occupe}>
                      Confirmer et ajouter
                    </button>
                  </div>
                ) : null}

                <div className="sc-ajout-champ">
                  <label htmlFor="ajout-plan-retour">Affiner</label>
                  <textarea
                    id="ajout-plan-retour"
                    className="field"
                    rows={3}
                    value={retour}
                    onChange={(e) => setRetour(e.target.value)}
                    placeholder="Ex. Plus court, et garde le regard vers la fenêtre."
                    disabled={occupe}
                  />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void affinerLeplan()} disabled={occupe || !retour.trim()}>
                    Affiner la proposition
                  </button>
                </div>
              </>
            ) : (
              <p className="sc-ajout-avert is-bloque">L&rsquo;agent n&rsquo;a pas proposé de plan à ajouter. Recommence en précisant ta demande.</p>
            )
          ) : null}

          {phase === "fait" ? (
            <div className="sc-ajout-fait">
              <span className="sc-ajout-coche" aria-hidden="true">
                <Icone nom="valide" taille={22} />
              </span>
              <p>
                Le plan est dans la scène <b>{cible.scene}</b>. Sa fiche (le prompt vidéo) reste à écrire depuis la page du plan.
              </p>
            </div>
          ) : null}

          {erreur ? <p className="sc-ajout-erreur" role="alert">{erreur}</p> : null}
        </div>

        <footer className="sc-tiroir-pied">
          {phase === "brief" ? (
            <>
              <button type="button" className="btn btn-gold" onClick={() => void ecrire()} disabled={occupe || !consigne.trim()}>
                {occupe ? "Lancement…" : "Écrire le plan"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={fermer} disabled={occupe}>
                Annuler
              </button>
            </>
          ) : null}
          {phase === "ecriture" ? (
            <button type="button" className="btn btn-ghost" onClick={() => void abandonner()} disabled={occupe}>
              Annuler l&rsquo;écriture
            </button>
          ) : null}
          {phase === "relecture" ? (
            <>
              <button type="button" className="btn btn-gold" onClick={() => void ajouter()} disabled={occupe || bloque}>
                {occupe ? "Ajout…" : "Ajouter à la scène"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void abandonner()} disabled={occupe}>
                Recommencer
              </button>
            </>
          ) : null}
          {phase === "fait" ? (
            <button type="button" className="btn btn-gold" onClick={fermer}>
              Fermer
            </button>
          ) : null}
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
