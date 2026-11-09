import type { DecisionsAffichees } from "@/lib/agents/types";

/** Ce que l'agent d'« Itérer » a décidé de changer sur le plan (2026-11-09) : intent avant → après, durée, références ajoutées / retirées, réglages
 * Open H3 IR, assets à créer. Montré pendant la recompilation et après (aussi quand elle est refusée, « images manquantes » : on sait ce qui attend).
 * Lecture seule : les décisions ne s'écrivent qu'avec la fiche compilée. */
export function DecisionsIteration({ d }: { d: DecisionsAffichees }) {
  const refs = [...d.referencesAjoutees.map((c) => `+ ${c}`), ...d.referencesRetirees.map((c) => `− ${c}`)];
  return (
    <div className="tm-decisions" aria-label="Décisions de l'agent">
      <p className="tm-decisions-titre">Ce que l&rsquo;agent change</p>
      <ul>
        {d.reglages.map((r) => (
          <li key={r.libelle}>
            {r.libelle} : <s>{r.avant}</s> → <b>{r.apres}</b>
          </li>
        ))}
        {refs.length > 0 ? <li>Références : {refs.join(", ")}</li> : null}
        {d.duree ? (
          <li>
            Durée : <s>{d.duree.avant} s</s> → <b>{d.duree.apres} s</b>
          </li>
        ) : null}
        {d.intent ? (
          <li>
            <details>
              <summary>Intent réécrit</summary>
              <div className="tm-decisions-intent">
                <p>
                  <small>Avant</small>
                  {d.intent.avant}
                </p>
                <p>
                  <small>Après</small>
                  {d.intent.apres}
                </p>
              </div>
            </details>
          </li>
        ) : null}
        {d.manquants.map((m) => (
          <li key={m.code}>
            À créer : <b>{m.code}</b>
            {m.raison ? ` (${m.raison})` : ""}, non créé : crée-le, génère son image, puis itère de nouveau.
          </li>
        ))}
      </ul>
    </div>
  );
}
