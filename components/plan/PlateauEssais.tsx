"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { supprimerEssai } from "@/app/plans/actions";
import { useBrouillon } from "@/components/plan/BrouillonPlan";
import { Icone } from "@/components/ui/Icone";
import { Braises } from "@/components/plan/Braises";
import { ComparaisonRendus } from "@/components/plan/ComparaisonRendus";
import { frappeEnCours } from "@/components/plan/PelliculePlans";
import { Vignette } from "@/components/plan/Vignette";
import { useTaches } from "@/components/taches/TachesProvider";
import { cleVideo } from "@/lib/taches";
import "./atelier.css";

export type EssaiCarte = {
  id: number;
  /** `jobs.numero_rendu` : le numéro d'un essai ne change jamais, seul l'ordre d'affichage est inversé. */
  numero: number;
  statut: string;
  src: string | null;
  /** « aperçu », « final », « import ». */
  genre: string;
  seedCourte: string | null;
  retenu: boolean;
  enCours: boolean;
  echoue: boolean;
  estA: boolean;
  estB: boolean;
  hrefA: string;
  /** Charge cet essai en B (comparaison) ; null quand il est A ou n'est pas lisible. */
  hrefB: string | null;
  /** La consigne qui a produit l'essai (info-bulle de la vignette), null si aucune. */
  consigne: string | null;
};

/** L'essai en file ou en cours, tel que le serveur le connaît au chargement de la page. Sa progression se relit EN DIRECT dans les tâches (useTaches). */
export type EssaiEnCours = {
  jobId: number;
  numero: number;
  statut: string;
  etape: string | null;
  pourcent: number | null;
  /** Le lecteur montre cet essai (voile « en cours ») ; sinon on regarde un autre essai, sans voile. */
  affiche: boolean;
  /** Le lien qui l'affiche dans le lecteur. */
  href: string;
  /** La consigne qui l'a demandé (itération), null pour une première génération. */
  consigne: string | null;
};

/** La progression d'un essai en cours, relue à chaque sondage des tâches (3 s tant qu'une tâche est active) : sans cela la fenêtre restait figée sur l'étape du
 * chargement de la page (SuiviRendus ne recharge qu'aux changements de statut). Repli sur les valeurs du serveur avant la première réponse. */
function useProgressionEnDirect(enCours: EssaiEnCours | null): { statut: string; etape: string | null; pourcent: number | null } | null {
  const { taches, pret } = useTaches();
  if (!enCours) return null;
  const t = pret ? taches.find((x) => x.cle === cleVideo(enCours.jobId)) : undefined;
  if (!t) return { statut: enCours.statut, etape: enCours.etape, pourcent: enCours.pourcent };
  if (t.statut === "en_attente") return { statut: t.statut, etape: t.positionFile ? `en file, n°${t.positionFile}` : "en file", pourcent: null };
  const p = t.progression;
  return {
    statut: t.statut,
    etape: p?.etape?.trim() ? p.etape : t.statut === "en_cours" ? null : t.statut === "termine" ? "terminé, chargement du rendu" : t.statut === "annulee" ? "annulé" : t.statut === "echoue" ? "échoué" : null,
    pourcent: p && p.max > 0 ? Math.max(0, Math.min(100, Math.round((100 * p.valeur) / p.max))) : null,
  };
}

export type LegendeEssai = {
  id: number;
  /** L'essai est en file ou en cours : on ne le supprime pas. */
  enFile: boolean;
  libelle: string;
  /** La consigne qui a produit l'essai ; null pour une première génération ou un rendu d'avant. */
  consigne: string | null;
  /** Ce que l'agent ou les contrôles ont signalé en appliquant la correction qui a produit l'essai (« l'agent doutait de son diagnostic »…). */
  notes: string[];
  src: string | null;
  numero: number;
};

/** Le plateau d'un plan : le lecteur 16:9 (un essai, ou deux en comparaison) et, à droite, la colonne des essais DÉFILANTE, du plus récent
 * (haut) au plus ancien (bas). Les flèches ▲ ▼ et les touches ↑ ↓ passent d'un essai à l'autre, l'essai courant se recentre. L'essai
 * regardé (A) et celui qu'on lui compare (B) vivent dans l'URL (?rendu=…&compare=…), comme avant : les liens sont calculés côté serveur.
 * Sous le lecteur : la légende (essai, base, consigne) ; `children` vient juste après (actions sur l'essai). */
export function PlateauEssais({
  planId,
  essais,
  principal,
  comparaison,
  hrefPlusRecent,
  hrefPlusAncien,
  hrefComparer,
  hrefQuitter,
  enCours,
  peutVarier,
  relancePerime,
  children,
}: {
  planId: number;
  essais: EssaiCarte[];
  principal: LegendeEssai | null;
  comparaison: { src: string; numero: number } | null;
  hrefPlusRecent: string | null;
  hrefPlusAncien: string | null;
  hrefComparer: string | null;
  hrefQuitter: string | null;
  enCours: EssaiEnCours | null;
  /** « Nouvelle variante » est possible : le plan n'est pas validé et aucun essai n'est en file. */
  peutVarier: boolean;
  /** Le plan est périmé (référence, contenu ou rendu du plan précédent changé) : « Relancer » refait l'essai, même seed, avec l'état d'aujourd'hui. */
  relancePerime: { libelle: string; detail: string; mode: "previsualiser" | "final" } | null;
  children?: ReactNode;
}) {
  const router = useRouter();
  const b = useBrouillon();
  const progression = useProgressionEnDirect(enCours);
  const vueTravail = enCours?.affiche ? enCours : null;
  const liste = useRef<HTMLDivElement>(null);
  const courant = essais.find((e) => e.estA)?.id ?? null;
  const [pending, startTransition] = useTransition();
  const [aConfirmer, setAConfirmer] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (minuteur.current && clearTimeout(minuteur.current)), []);
  // Un autre essai affiché : la confirmation en attente ne vaut plus.
  useEffect(() => setAConfirmer(false), [courant]);

  const repartir = () => {
    const t = document.getElementById("tm-consigne");
    t?.focus();
    t?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const supprimer = () => {
    if (!principal) return;
    if (!aConfirmer) {
      setAConfirmer(true);
      setMessage(null);
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => setAConfirmer(false), 3500);
      return;
    }
    setAConfirmer(false);
    startTransition(async () => {
      const r = await supprimerEssai(planId, principal.id);
      setMessage(r.ok ? { ok: true, texte: `Essai n°${principal.numero} supprimé${r.fichierSupprime ? " (vidéo enlevée du stockage)" : ""}.` } : { ok: false, texte: r.erreur });
    });
  };

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (frappeEnCours(e)) return;
      if (e.key === "ArrowUp" && hrefPlusRecent) {
        e.preventDefault();
        router.push(hrefPlusRecent, { scroll: false });
      } else if (e.key === "ArrowDown" && hrefPlusAncien) {
        e.preventDefault();
        router.push(hrefPlusAncien, { scroll: false });
      }
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [hrefPlusRecent, hrefPlusAncien, router]);

  // L'essai courant au centre de la bande : on défile la bande, jamais la page.
  useEffect(() => {
    const l = liste.current;
    const el = l?.querySelector<HTMLElement>("[data-courant='true']");
    if (l && el) l.scrollTo({ left: el.offsetLeft - l.clientWidth / 2 + el.offsetWidth / 2, behavior: "smooth" });
    else l?.scrollTo({ left: 0 });
  }, [courant, essais.length]);

  return (
    <>
      <div className="tm-plateau">
        <div className="tm-lecteur-bloc">
          <div className={`tm-lecteur${vueTravail ? " is-travail" : ""}`}>
            {vueTravail ? (
              <div className="tm-lecteur-vide">
                <Braises />
              </div>
            ) : principal?.src ? (
              comparaison ? (
                <ComparaisonRendus a={{ src: principal.src, numero: principal.numero }} b={comparaison} />
              ) : (
                <video key={principal.src} controls src={principal.src} className="tm-video" />
              )
            ) : (
              <div className="tm-lecteur-vide">
                <Braises />
                <p className="tm-vide-titre">Pas encore de rendu</p>
                <p className="tiny-note">Le premier essai part de la fiche telle qu&rsquo;elle est.</p>
              </div>
            )}
            {vueTravail && progression ? (
              <div className="tm-travail" role="status" aria-live="polite">
                <div>
                  <span className={`tm-fil${progression.pourcent != null ? " is-mesure" : ""}`}>
                    <i style={progression.pourcent != null ? { width: `${progression.pourcent}%` } : undefined} />
                  </span>
                  <span>
                    Essai n°{vueTravail.numero} {progression.statut === "en_attente" ? "en attente" : "en cours"}
                    {progression.etape ? ` · ${progression.etape}` : ""}
                    {progression.pourcent != null ? ` · ${progression.pourcent} %` : ""}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {vueTravail ? (
            <div className="tm-barre-essai">
              <span className="tm-qui num tm-barre-essai-nom">Essai n°{vueTravail.numero} · en cours</span>
              {vueTravail.consigne ? (
                <div className="tm-barre-essai-consigne">
                  <q>{vueTravail.consigne}</q>
                </div>
              ) : null}
              <p className="tiny-note tm-barre-essai-msg">Les autres essais restent consultables pendant ce temps : choisis-en un dans la colonne. Pour l&rsquo;annuler, passe par le panneau des tâches.</p>
            </div>
          ) : principal ? (
            <div className="tm-barre-essai" aria-live="polite">
              <span className="tm-qui num tm-barre-essai-nom">{principal.libelle}</span>
              <div className="tm-barre-essai-gestes">
                <div className="tm-gestes" role="group" aria-label="Gestes sur cet essai">
                  {enCours && !enCours.affiche ? (
                    <Link href={enCours.href} scroll={false} className="tm-geste" title="Voir sa progression dans le lecteur">
                      Essai n°{enCours.numero} en cours{progression?.pourcent != null ? ` · ${progression.pourcent} %` : ""}
                    </Link>
                  ) : null}
                  {hrefQuitter ? (
                    <Link href={hrefQuitter} scroll={false} className="tm-geste is-actif">
                      Quitter la comparaison
                    </Link>
                  ) : hrefComparer ? (
                    <Link href={hrefComparer} scroll={false} className="tm-geste">
                      Comparer A / B
                    </Link>
                  ) : null}
                  {principal.src && !comparaison ? (
                    <button type="button" className="tm-geste" onClick={repartir} title="Écrire une consigne à partir de cet essai">
                      Repartir de cet essai
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="tm-geste"
                    disabled={!peutVarier || b.occupe}
                    onClick={() => b.figer("variante")}
                    title={peutVarier ? "Même prompt, nouvelle seed : un autre rendu du même plan." : "Un essai tourne, ou le plan est validé : rouvre l'itération."}
                  >
                    Nouvelle variante
                  </button>
                  {relancePerime ? (
                    <button
                      type="button"
                      className="tm-geste is-actif"
                      disabled={!peutVarier || b.occupe}
                      onClick={() => b.figer(relancePerime.mode)}
                      title={peutVarier ? relancePerime.detail : "Un essai tourne, ou le plan est validé : rouvre l'itération."}
                    >
                      {relancePerime.libelle}
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={`tm-suppr${aConfirmer ? " is-confirme" : ""}`}
                  disabled={pending || principal.enFile}
                  title={principal.enFile ? "Cet essai tourne encore : annule-le d'abord." : aConfirmer ? "Cliquer encore pour confirmer" : "Supprimer cet essai"}
                  aria-label={aConfirmer ? "Confirmer la suppression de l'essai" : "Supprimer cet essai"}
                  onClick={supprimer}
                >
                  <Icone nom="supprimer" taille={15} />
                  {aConfirmer ? <span>Confirmer</span> : null}
                </button>
              </div>
              {principal.consigne || principal.notes.length > 0 ? (
                <div className="tm-barre-essai-consigne">
                  {principal.consigne ? <q>{principal.consigne}</q> : null}
                  {principal.notes.length > 0 ? <span className="tm-notes">{principal.notes.join(" ")}</span> : null}
                </div>
              ) : null}
              {b.erreur ? (
                <p className="tiny-note tm-barre-essai-msg" role="alert" style={{ color: "var(--ecarlate-glow)" }}>
                  {b.erreur}
                </p>
              ) : null}
              {message ? (
                <p className="tiny-note tm-barre-essai-msg" role={message.ok ? "status" : "alert"} style={{ color: message.ok ? "var(--or-glow)" : "var(--ecarlate-glow)" }}>
                  {message.texte}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="tm-colonne">
          <div className="tm-col-tete">
            <span>Essais</span>
            <span className="num">{essais.length || ""}</span>
            <span className="tm-col-fl">
              <button type="button" aria-label="Essai plus récent" disabled={!hrefPlusRecent} onClick={() => hrefPlusRecent && router.push(hrefPlusRecent, { scroll: false })}>
                ◀
              </button>
              <button type="button" aria-label="Essai plus ancien" disabled={!hrefPlusAncien} onClick={() => hrefPlusAncien && router.push(hrefPlusAncien, { scroll: false })}>
                ▶
              </button>
            </span>
          </div>
          <div className="tm-col-zone">
            <div className="tm-col-liste" ref={liste} role="list" aria-label="Essais du plan, du plus récent au plus ancien">
              {essais.length === 0 ? <p className="tiny-note tm-col-vide">Aucun essai. Le premier apparaîtra ici.</p> : null}
              {essais.map((e) => (
                <div key={e.id} role="listitem" data-courant={e.estA} className={`tm-essai${e.estA ? " is-a" : ""}${e.estB ? " is-b" : ""}${e.enCours ? " is-run" : ""}${e.echoue ? " is-echec" : ""}`}>
                  <Link href={e.hrefA} scroll={false} className="tm-essai-lien" aria-label={`Voir l'essai n°${e.numero}`} title={e.consigne ?? undefined}>
                    <span className="tm-essai-img">
                      <Vignette src={e.src} />
                      {e.retenu ? <span className="tm-drap">retenu</span> : e.enCours ? <span className="tm-drap is-rouge">en cours</span> : e.echoue ? <span className="tm-drap is-rouge">échoué</span> : null}
                    </span>
                    <span className="tm-essai-m">
                      <b className="num">n°{e.numero}</b> {e.genre}
                      {e.seedCourte ? (
                        <>
                          {" "}
                          · <span className="num">{e.seedCourte}</span>
                        </>
                      ) : null}
                    </span>
                  </Link>
                  {e.hrefB ? (
                    <Link href={e.hrefB} scroll={false} className="tm-essai-b" title="Comparer avec A">
                      B
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {children}
    </>
  );
}
