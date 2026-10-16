"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { adopterGeneration, supprimerGeneration } from "@/app/assets/generation-actions";
import { enregistrerVoixPersonnage, lancerMasterVoix, proposerRepliqueBase, supprimerMasterVoix } from "@/app/voix/master-actions";
import { Icone } from "@/components/ui/Icone";
import { METHODE_MASTER_VOIX } from "@/lib/asset-generation";
import type { GenerationVue } from "@/lib/queries-generations";
import { ilYa } from "@/lib/temps-relatif";
import { urlMiniature } from "@/lib/miniatures";
import { useGenerationsVoix } from "./useGenerationsVoix";

const METHODES = [METHODE_MASTER_VOIX];
const ACTIFS = ["en_attente", "en_cours"];
const MASTER = "master";

/** L'onglet « Voix » de la fiche d'un personnage, bâti comme l'atelier d'image : à gauche l'écran de test et sa légende (la voix gardée, ou
 * l'essai qu'on regarde) ; à droite, sous les yeux, ce qu'on veut entendre (la voix voulue, la réplique du test) puis le journal des essais.
 * Rien ne bloque : sans master, le modèle vidéo invente la voix du personnage à chaque plan. Les champs se retiennent en quittant la case. */
export function BlocVoix({
  personnageId,
  nom,
  initial,
  master,
  generations,
  generationInitiale,
}: {
  personnageId: number;
  nom: string;
  initial: { description: string; repliqueBase: string };
  master: { src: string | null; videoSrc: string | null; portraitSrc: string | null };
  generations: GenerationVue[];
  generationInitiale: string | null;
}) {
  const router = useRouter();
  const [description, setDescription] = useState(initial.description);
  const [replique, setReplique] = useState(initial.repliqueBase);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [occupe, startTransition] = useTransition();
  const [idee, setIdee] = useState(false);
  const { vivantes, annuler } = useGenerationsVoix({ assetId: personnageId, generations, generationInitiale, methodes: METHODES, surveiller: true });

  const aMaster = master.src != null;
  // Ce qu'on regarde : la voix gardée (le master) ou un essai (par son uuid).
  const [selection, setSelection] = useState<string>(() => {
    const demande = generationInitiale && generations.find((g) => g.uuid === generationInitiale && g.methode === METHODE_MASTER_VOIX);
    if (demande) return demande.uuid;
    if (aMaster || master.videoSrc) return MASTER;
    return generations.find((g) => g.methode === METHODE_MASTER_VOIX)?.uuid ?? MASTER;
  });
  // Un essai qui vient d'être lancé se montre aussitôt.
  const dernier = useRef(vivantes[0]?.uuid ?? null);
  useEffect(() => {
    const premier = vivantes[0]?.uuid ?? null;
    if (premier && premier !== dernier.current) setSelection(premier);
    dernier.current = premier;
  }, [vivantes]);

  const essai = selection === MASTER ? null : (vivantes.find((g) => g.uuid === selection) ?? null);
  const regardeMaster = essai == null;
  const numero = (uuid: string) => vivantes.length - vivantes.findIndex((g) => g.uuid === uuid);

  const enregistrer = () => void enregistrerVoixPersonnage(personnageId, { description, repliqueBase: replique });

  const demanderIdee = async () => {
    setIdee(true);
    setRetour(null);
    const r = await proposerRepliqueBase(personnageId, description);
    setIdee(false);
    if (r.ok) {
      setReplique(r.texte);
      void enregistrerVoixPersonnage(personnageId, { description, repliqueBase: r.texte });
    } else setRetour({ ok: false, texte: r.erreur });
  };

  const generer = () =>
    startTransition(async () => {
      setRetour(null);
      const r = await lancerMasterVoix(personnageId, { description, repliqueBase: replique });
      if (r.ok) {
        setRetour({ ok: true, texte: r.position > 1 ? `En file, n°${r.position}.` : "Lancé : le suivi est dans l'icône du bandeau, tu peux quitter la page." });
        router.refresh();
      } else setRetour({ ok: false, texte: r.erreur });
    });

  const agir = (f: () => Promise<{ ok: true } | { ok: false; erreur: string }>, message: string, apres?: () => void) =>
    startTransition(async () => {
      const r = await f();
      setRetour(r.ok ? { ok: true, texte: message } : { ok: false, texte: r.erreur });
      if (r.ok) {
        apres?.();
        router.refresh();
      }
    });

  const aDejaGenere = aMaster || vivantes.some((g) => g.statut === "termine");
  const etat = (g: (typeof vivantes)[number]) =>
    g.statut === "en_attente"
      ? `En file${g.position ? ` · n°${g.position}` : ""}`
      : g.statut === "en_cours"
        ? (g.progression?.etape ?? "En cours…")
        : g.statut === "annulee"
          ? "Annulé"
          : g.statut === "echoue"
            ? "Échoué"
            : "Prêt";
  const pourcent = (g: (typeof vivantes)[number]) => (g.progression ? Math.round((g.progression.valeur / g.progression.max) * 100) : 0);

  return (
    <div className="atelier atelier-voix">
      <div className="atelier-g">
        <div className="outils">
          <h2>
            Voix <small>{aMaster ? "voix gardée" : vivantes.length ? `${vivantes.length} essai${vivantes.length > 1 ? "s" : ""}` : "pas encore de voix"}</small>
          </h2>
        </div>

        {/* ---- L'écran de test ---- */}
        <div className={`scene${regardeMaster && aMaster ? " valide" : ""}`}>
          {regardeMaster ? (
            <>
              <span className={`etiq hg${aMaster ? " or" : ""}`}>{aMaster ? "Voix gardée · le master" : "Pas de voix gardée"}</span>
              {master.videoSrc ? (
                <div className="passe entre" key="master">
                  <video controls playsInline preload="metadata" src={master.videoSrc} poster={master.portraitSrc ?? undefined} />
                </div>
              ) : (
                <div className="boite vierge" style={{ "--ar": "16 / 9" } as React.CSSProperties}>
                  <div>
                    <Icone nom="son" taille={42} />
                    <b>{aMaster ? "Pas de vidéo de test conservée" : "Pas encore de vidéo de test"}</b>
                    <p>{aMaster ? "La voix est gardée, seule sa vidéo manque." : `Écris la réplique à droite : ${nom} la dira dans une courte vidéo, et on en garde la voix.`}</p>
                  </div>
                </div>
              )}
            </>
          ) : essai.statut === "termine" && essai.videoSrc ? (
            <>
              <span className="etiq hg">Essai n°{numero(essai.uuid)}</span>
              <div className="passe entre" key={essai.uuid}>
                <video controls playsInline preload="metadata" src={essai.videoSrc} poster={master.portraitSrc ?? undefined} />
              </div>
            </>
          ) : ACTIFS.includes(essai.statut) ? (
            <>
              <span className="etiq hg">Essai n°{numero(essai.uuid)} · en travail</span>
              <div className="boite plein chatoie entre" key={essai.uuid}>
                {master.portraitSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="flou" src={urlMiniature(master.portraitSrc, 384)} alt="" style={{ "--flou": "14px", "--sat": "0.5", opacity: 0.7 } as React.CSSProperties} />
                ) : null}
              </div>
              <div className="travail" role="status">
                <div className="msg">
                  <span className="num">n°{numero(essai.uuid)}</span>
                  <span>{essai.statut === "en_attente" ? etat(essai) : `La vidéo se tourne · ${etat(essai)}${essai.progression ? ` · ${pourcent(essai)} %` : ""}`}</span>
                </div>
                <progress className="gd-bar" value={essai.progression?.valeur} max={essai.progression?.max} aria-label="Progression" />
              </div>
            </>
          ) : (
            <>
              <span className="etiq hg">Essai n°{numero(essai.uuid)}</span>
              <div className="boite plein echec entre" key={essai.uuid}>
                <div className="boite-contenu">
                  <div>
                    <b>{essai.statut === "annulee" ? "Cet essai a été annulé" : essai.statut === "echoue" ? "Cet essai n'a rien produit" : "Pas de vidéo"}</b>
                    <p>{essai.erreur ? essai.erreur.slice(0, 220) : essai.statut === "echoue" ? "Échec sans message." : "La génération s'est arrêtée."}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ---- La légende : l'audio, et ce qu'on peut en faire ---- */}
        <div className="legende glisse" key={selection} aria-live="polite">
          {regardeMaster ? (
            <>
              <div className="leg-tete">
                <span className="qui">
                  <b>{aMaster ? `La voix de ${nom}` : "Pas de voix gardée"}</b>
                </span>
                {aMaster ? (
                  <span className="leg-actions">
                    <span className="retenu-badge">
                      <Icone nom="valide" taille={14} />
                      Gardée
                    </span>
                    <button type="button" className="btn btn-fant btn-sm" disabled={occupe} onClick={() => agir(() => supprimerMasterVoix(personnageId), "Master retiré.")}>
                      Retirer le master
                    </button>
                  </span>
                ) : null}
              </div>
              <div className="leg-corps">
                {aMaster ? <audio controls preload="none" src={master.src!} /> : <span className="sans">Sans master, le modèle vidéo invente la voix de {nom} à chaque plan.</span>}
              </div>
            </>
          ) : (
            <>
              <div className="leg-tete">
                <span className="qui">
                  <b className="num">Essai n°{numero(essai.uuid)}</b> · <span suppressHydrationWarning>{ilYa(essai.createdAt)}</span> · {etat(essai).toLowerCase()}
                </span>
                <span className="leg-actions">
                  {ACTIFS.includes(essai.statut) ? (
                    <button type="button" className="btn btn-fant btn-sm" onClick={() => annuler(essai)} disabled={essai.annulationDemandee}>
                      {essai.annulationDemandee ? "Annulation demandée…" : essai.statut === "en_cours" ? "Annuler" : "Retirer de la file"}
                    </button>
                  ) : (
                    <>
                      {essai.statut === "termine" && essai.src ? (
                        <button type="button" className="btn btn-or btn-sm" disabled={occupe} onClick={() => agir(() => adopterGeneration(essai.id), `C'est la voix de ${nom} : le master est posé.`, () => setSelection(MASTER))}>
                          <Icone nom="valide" taille={14} /> Garder cette voix
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-fant btn-ico"
                        disabled={occupe}
                        onClick={() => agir(() => supprimerGeneration(essai.id), "Essai retiré.", () => setSelection(MASTER))}
                        aria-label={essai.statut === "termine" ? "Supprimer cet essai" : "Retirer cet essai"}
                        title={essai.statut === "termine" ? "Supprimer cet essai" : "Retirer cet essai"}
                      >
                        <Icone nom="supprimer" taille={15} />
                      </button>
                    </>
                  )}
                </span>
              </div>
              {essai.statut === "termine" && essai.src ? (
                <div className="leg-corps">
                  <audio controls preload="none" src={essai.src} />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="atelier-d">
        {/* ---- Ce qu'on veut entendre ---- */}
        <section className="consigne" aria-labelledby="bv-titre">
          <label htmlFor="bv-voix">
            <b id="bv-titre">Quelle voix veut-on ?</b>
            <small>Timbre, âge, accent, état d&rsquo;esprit. Vide : le modèle choisit.</small>
          </label>
          <textarea id="bv-voix" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} onBlur={enregistrer} placeholder="Une voix grave et posée, un léger accent du sud, jamais pressée…" />

          <label htmlFor="bv-replique" className="bv-sous">
            <b>La réplique du test</b>
            <small>Deux ou trois phrases dans la langue du projet, qui montrent le caractère de la voix.</small>
          </label>
          <textarea id="bv-replique" rows={4} value={replique} onChange={(e) => setReplique(e.target.value)} onBlur={enregistrer} placeholder="Ce que le personnage dira dans la vidéo de test…" />
          <div className="bv-idee">
            <button type="button" className="btn btn-fant btn-sm" onClick={demanderIdee} disabled={idee}>
              <Icone nom="agent" taille={14} /> {idee ? "L'IA écrit…" : replique.trim() ? "Une autre réplique" : "Une réplique de l'IA"}
            </button>
          </div>

          {retour ? (
            <p className={`retour ${retour.ok ? "ok" : "ko"}`} role={retour.ok ? "status" : "alert"}>
              {retour.texte}
            </p>
          ) : null}
          <div className="envoi">
            <button type="button" className="btn btn-or" onClick={generer} disabled={occupe || !replique.trim()}>
              <Icone nom="son" taille={15} /> {aDejaGenere ? "Générer une autre voix" : "Générer la voix"}
            </button>
          </div>
        </section>

        {/* ---- Le journal des essais ---- */}
        <aside className="journal" aria-label="Voix gardée et essais">
          <div className="j-tete">
            <h3>Journal d&rsquo;essais</h3>
            <span className="num">{vivantes.length}</span>
          </div>
          <div className="j-liste" role="listbox" aria-label="Voix gardée et essais, du plus récent au plus ancien">
            {aMaster || master.videoSrc ? (
              <button type="button" role="option" aria-selected={regardeMaster} className={`j-item${regardeMaster ? " on" : ""}`} onClick={() => setSelection(MASTER)}>
                <span className="vign">{master.portraitSrc ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={urlMiniature(master.portraitSrc, 192)} alt="" loading="lazy" decoding="async" /> : null}</span>
                <span className="j-m">
                  <span className="j-l1">
                    <span className="drap or">gardée</span>
                  </span>
                  <span className="j-txt titre">La voix de {nom}</span>
                </span>
              </button>
            ) : null}
            {vivantes.length > 0 ? <div className="j-sep">Essais · du plus récent</div> : <p className="j-vide">Le premier essai apparaîtra ici.</p>}
            {vivantes.map((g) => {
              const on = !regardeMaster && essai?.uuid === g.uuid;
              const actif = ACTIFS.includes(g.statut);
              return (
                <button key={g.uuid} type="button" role="option" aria-selected={on} className={`j-item${on ? " on" : ""}`} onClick={() => setSelection(g.uuid)}>
                  <span className={`vign${g.statut === "termine" ? "" : g.statut === "echoue" || g.statut === "annulee" ? " echec" : " run flou"}${master.portraitSrc ? "" : " vide"}`}>
                    {master.portraitSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urlMiniature(master.portraitSrc, 192)} alt="" loading="lazy" decoding="async" />
                    ) : null}
                    {actif ? (
                      <span className="mini-p">
                        <b style={{ "--p": `${pourcent(g)}%` } as React.CSSProperties} />
                      </span>
                    ) : null}
                  </span>
                  <span className="j-m">
                    <span className="j-l1">
                      <span className="num">n°{numero(g.uuid)}</span>
                      {g.statut === "en_attente" ? (
                        <span className="drap rouge">en file</span>
                      ) : g.statut === "en_cours" ? (
                        <span className="drap rouge">en cours</span>
                      ) : g.statut === "echoue" ? (
                        <span className="drap echec">échoué</span>
                      ) : g.statut === "annulee" ? (
                        <span className="drap neutre">annulé</span>
                      ) : null}
                      <span className="quand" suppressHydrationWarning>
                        {ilYa(g.createdAt)}
                      </span>
                    </span>
                    <span className="j-txt">{g.texteReference ?? "Test de voix"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
