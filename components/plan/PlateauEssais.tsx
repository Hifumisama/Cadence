"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { supprimerEssai } from "@/app/plans/actions";
import { Braises } from "@/components/plan/Braises";
import { ComparaisonRendus } from "@/components/plan/ComparaisonRendus";
import { frappeEnCours } from "@/components/plan/PelliculePlans";
import { Vignette } from "@/components/plan/Vignette";

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
  enCours: { numero: number; etape: string | null; pourcent: number | null } | null;
  children?: ReactNode;
}) {
  const router = useRouter();
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

  // L'essai courant au centre de la colonne : on défile la colonne, jamais la page.
  useEffect(() => {
    const l = liste.current;
    const el = l?.querySelector<HTMLElement>("[data-courant='true']");
    if (l && el) l.scrollTo({ top: el.offsetTop - l.clientHeight / 2 + el.offsetHeight / 2, behavior: "smooth" });
    else l?.scrollTo({ top: 0 });
  }, [courant, essais.length]);

  return (
    <>
      <div className="tm-plateau">
        <div className={`tm-lecteur${enCours ? " is-travail" : ""}`}>
          {principal?.src ? (
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
          {enCours ? (
            <div className="tm-travail" role="status">
              <div>
                <span className="tm-fil">
                  <i />
                </span>
                <span>
                  Essai n°{enCours.numero} en cours{enCours.etape ? ` · ${enCours.etape}` : ""}
                  {enCours.pourcent != null ? ` · ${enCours.pourcent} %` : ""}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="tm-colonne">
          <div className="tm-col-tete">
            <span>Essais</span>
            <span className="num">{essais.length || ""}</span>
            <span className="tm-col-fl">
              <button type="button" aria-label="Essai plus récent" disabled={!hrefPlusRecent} onClick={() => hrefPlusRecent && router.push(hrefPlusRecent, { scroll: false })}>
                ▲
              </button>
              <button type="button" aria-label="Essai plus ancien" disabled={!hrefPlusAncien} onClick={() => hrefPlusAncien && router.push(hrefPlusAncien, { scroll: false })}>
                ▼
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

      {principal ? (
        <div className="tm-legende" aria-live="polite">
          <span className="tm-qui num">{principal.libelle}</span>
          {principal.consigne ? <q>{principal.consigne}</q> : null}
          <span className="tm-legende-actions">
            {principal.src && !comparaison ? (
              <button type="button" className="tm-lien" onClick={repartir}>
                Repartir de cet essai
              </button>
            ) : null}
            {hrefQuitter ? (
              <Link href={hrefQuitter} scroll={false} className="tm-lien">
                Quitter la comparaison
              </Link>
            ) : hrefComparer ? (
              <Link href={hrefComparer} scroll={false} className="tm-lien">
                Comparer A / B
              </Link>
            ) : null}
            <button
              type="button"
              className={`tm-lien tm-lien-suppr${aConfirmer ? " is-confirme" : ""}`}
              disabled={pending || principal.enFile}
              title={principal.enFile ? "Cet essai tourne encore : annule-le d'abord." : undefined}
              onClick={supprimer}
            >
              {aConfirmer ? "Confirmer la suppression" : "Supprimer"}
            </button>
          </span>
          {principal.notes.length > 0 ? <p className="tm-notes">{principal.notes.join(" ")}</p> : null}
          {message ? (
            <p className="tiny-note" role={message.ok ? "status" : "alert"} style={{ color: message.ok ? "var(--or-glow)" : "var(--ecarlate-glow)" }}>
              {message.texte}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </>
  );
}
