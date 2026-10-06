import Link from "next/link";

export type PriseVue = {
  id: number;
  numeroRendu: number;
  statut: string;
  /** Source vidéo lisible, sinon null (rendu en file, échoué, ou fichier absent). */
  src: string | null;
  /** « aperçu », « final », « import ». */
  genre: string;
  rejeu: number;
  seedCourte: string | null;
  hrefA: string;
  /** Charge ce rendu en B (comparaison) ; null quand ce rendu est A ou n'est pas lisible. */
  hrefB: string | null;
  estA: boolean;
  estB: boolean;
};

const ETAT: Record<string, string> = {
  en_attente: "en file",
  en_cours: "en cours",
  echoue: "échoué",
  rejoue: "rejoué",
};

/** La pellicule des rendus du plan : un cliché par rendu (première image de la vidéo), le plus ancien à gauche. Cliquer un cliché le
 * charge dans le lecteur (A) ; « B » le met en face pour comparer. Remplace l'ancienne liste « Historique » de la colonne de droite. */
export function Pellicule({ prises, hrefComparer, hrefQuitter }: { prises: PriseVue[]; hrefComparer: string | null; hrefQuitter: string | null }) {
  if (prises.length === 0) return null;
  return (
    <div className="fp-pellicule">
      <div className="fp-strip" role="list" aria-label="Rendus du plan">
        {prises.map((p) => {
          const enCours = p.statut === "en_attente" || p.statut === "en_cours";
          return (
            <div
              key={p.id}
              role="listitem"
              className={`fp-take${p.estA ? " is-a" : ""}${p.estB ? " is-b" : ""}${enCours ? " is-run" : ""}${p.statut === "echoue" ? " is-echec" : ""}`}
            >
              {p.estA || p.estB ? <span className="fp-take-flag num">{p.estA ? "A" : "B"}</span> : null}
              <Link href={p.hrefA} scroll={false} className="fp-take-lien" aria-label={`Voir le rendu n°${p.numeroRendu}`}>
                <span className="fp-take-th">
                  {p.src ? <video src={`${p.src}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} /> : null}
                </span>
                <span className="fp-take-m">
                  <b className="num">n°{p.numeroRendu}</b> {p.genre}
                  {p.rejeu > 1 ? ` · rejeu ${p.rejeu}` : ""}
                  <br />
                  {ETAT[p.statut] ?? (p.seedCourte ? `seed ${p.seedCourte}…` : "")}
                </span>
              </Link>
              {p.hrefB ? (
                <Link href={p.hrefB} scroll={false} className="fp-take-b" title="Comparer avec A">
                  B
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="fp-pellicule-actions">
        {hrefQuitter ? (
          <Link className="btn btn-ghost btn-sm" href={hrefQuitter} scroll={false}>
            Quitter la comparaison
          </Link>
        ) : hrefComparer ? (
          <Link className="btn btn-ghost btn-sm" href={hrefComparer} scroll={false}>
            Comparer A / B
          </Link>
        ) : null}
      </div>
    </div>
  );
}
