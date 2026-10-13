"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { supprimerEssai } from "@/app/plans/actions";
import { Vignette } from "@/components/plan/Vignette";

export type LigneJournal = {
  id: number;
  numero: number;
  depuisNumero: number | null;
  /** La consigne qui a produit l'essai ; null pour une première génération, un import, un rendu d'avant. */
  consigne: string | null;
  /** Ce que l'agent ou les contrôles ont signalé en appliquant la correction de cet essai (jamais un blocage). */
  notes: string[];
  quand: string;
  src: string | null;
  genre: string;
  retenu: boolean;
  /** En file ou en cours : on ne le supprime pas. */
  enFile: boolean;
  echoue: boolean;
  hrefVoir: string;
};

/** Le journal des essais du plan, du plus récent au plus ancien : la consigne de chacun, « Voir », « Repartir de là » (charge l'essai comme
 * base de l'intention) et « Supprimer » (confirmation inline en deux temps, jamais window.confirm). Supprimer retire la ligne de rendu et,
 * si aucun autre essai ne s'en sert, son fichier vidéo ; l'essai retenu supprimé fait repasser le plan en itération, le dernier essai
 * supprimé en brouillon (voir `supprimerEssai`). */
export function JournalEssais({ planId, lignes }: { planId: number; lignes: LigneJournal[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aConfirmer, setAConfirmer] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (minuteur.current && clearTimeout(minuteur.current)), []);

  const supprimer = (l: LigneJournal) => {
    if (aConfirmer !== l.id) {
      setAConfirmer(l.id);
      setMessage(null);
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = setTimeout(() => setAConfirmer(null), 3500);
      return;
    }
    setAConfirmer(null);
    startTransition(async () => {
      const r = await supprimerEssai(planId, l.id);
      setMessage(r.ok ? { ok: true, texte: `Essai n°${l.numero} supprimé du journal${r.fichierSupprime ? " (vidéo enlevée du stockage)" : ""}.` } : { ok: false, texte: r.erreur });
    });
  };

  const repartir = (l: LigneJournal) => {
    router.push(l.hrefVoir, { scroll: false });
    const t = document.getElementById("tm-consigne");
    t?.focus();
    t?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  return (
    <div className="tm-journal">
      <h3>Journal des essais</h3>
      <p className="tm-aide">Chaque essai garde la consigne qui l&rsquo;a produit. Tu peux repartir de n&rsquo;importe lequel.</p>
      {message ? (
        <p className="tiny-note" role={message.ok ? "status" : "alert"} style={{ color: message.ok ? "var(--or-glow)" : "var(--ecarlate-glow)" }}>
          {message.texte}
        </p>
      ) : null}
      {lignes.length === 0 ? <p className="tm-aide">Rien pour l&rsquo;instant.</p> : null}
      {lignes.map((l) => (
        <div key={l.id} className="tm-j">
          <span className="tm-j-img">
            <Vignette src={l.src} />
          </span>
          <div>
            <p>{l.consigne ? `« ${l.consigne} »` : <span className="tm-aide">{l.genre === "import" ? "Vidéo importée." : l.depuisNumero == null ? "Génération initiale." : "Sans consigne."}</span>}</p>
            {l.notes.length > 0 ? <p className="tm-notes">{l.notes.join(" ")}</p> : null}
            <small className="num">
              n°{l.numero} · {l.quand}
              {l.depuisNumero != null ? ` · depuis n°${l.depuisNumero}` : ""}
              {` · ${l.genre}`}
              {l.retenu ? " · retenu" : ""}
              {l.enFile ? " · en cours" : l.echoue ? " · échoué" : ""}
            </small>
            <div className="tm-j-ac">
              {l.src ? (
                <Link className="tm-lien" href={l.hrefVoir} scroll={false}>
                  Voir
                </Link>
              ) : null}
              {l.src ? (
                <button type="button" className="tm-lien" onClick={() => repartir(l)}>
                  Repartir de là
                </button>
              ) : null}
              <button
                type="button"
                className={`tm-lien tm-lien-suppr${aConfirmer === l.id ? " is-confirme" : ""}`}
                disabled={pending || l.enFile}
                title={l.enFile ? "Cet essai tourne encore : annule-le d'abord." : undefined}
                onClick={() => supprimer(l)}
              >
                {aConfirmer === l.id ? "Confirmer la suppression" : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
