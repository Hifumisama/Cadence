import { fmtDuree } from "@/lib/agents/revision/format";
import type { SceneTouchee } from "@/lib/agents/revision/affichage";

/** Le scénario AVEC le brouillon, replié sous la fiche des décisions : seulement les scènes que le brouillon touche (une scène intacte n'a
 * rien à dire). Chaque plan montre ce qui change : coupé, durée avant → après, déplacé, réplique avant → après. */
export function ScenesBrouillon({ scenes }: { scenes: SceneTouchee[] }) {
  if (scenes.length === 0) return null;
  return (
    <div className="rv-scenes">
      {scenes.map((s) => (
        <section key={s.titre} className="rv-scene" aria-label={s.titre}>
          <header>
            <span>{s.titre}</span>
            <span>
              {s.dureeApres !== s.dureeAvant ? <del>{fmtDuree(s.dureeAvant)}</del> : null} {fmtDuree(s.dureeApres)}
            </span>
          </header>
          {s.plans.map((p) => (
            <div key={p.uuid} className={`rv-plan${p.coupe ? " is-coupe" : ""}`}>
              <span className="rv-plan-ref">{p.ajoute ? "+" : p.handle}</span>
              <span className="rv-plan-corps">
                <span className="rv-plan-titre">{p.titre}</span>
                {p.coupe ? <span className="rv-pil is-rouge">coupé</span> : null}
                {p.ajoute ? <span className="rv-pil">nouveau</span> : null}
                {p.fiche ? <span className="rv-pil">fiche à relire</span> : null}
                {p.deplace ? <span className="rv-pil">déplacé</span> : null}
                {p.etat === "rendu" && (p.coupe || p.duree !== p.dureeOriginale) ? <span className="rv-pil is-rouge">rendu</span> : null}
                {p.repliques
                  .filter((r) => r.supprimee || r.texte !== r.texteOriginal)
                  .map((r) => (
                    <span key={r.handle} className="rv-replique">
                      {r.supprimee ? (
                        <del>{r.texteOriginal}</del>
                      ) : (
                        <>
                          <del>{r.texteOriginal}</del> <ins>{r.texte}</ins>
                        </>
                      )}
                    </span>
                  ))}
              </span>
              <span className="rv-plan-duree">
                {p.coupe ? (
                  <del>{p.dureeOriginale} s</del>
                ) : p.ajoute ? (
                  <ins>{p.duree} s</ins>
                ) : p.duree !== p.dureeOriginale ? (
                  <>
                    <del>{p.dureeOriginale} s</del> <ins>{p.duree} s</ins>
                  </>
                ) : (
                  `${p.duree} s`
                )}
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
