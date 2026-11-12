import type { DecisionsAffichees } from "@/lib/agents/types";

/** What the « Itérer » agent decided to change on the clip (2026-11-09): intent before → after, duration, references added / removed, Open H3 IR
 * settings, assets created (wave 4a: created by default, their image generated before the recompilation). Shown while waiting for images, during the
 * recompilation and afterwards (also when it fails: we know what was decided). Read-only: the decisions are only written to the clip with the compiled sheet. */
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
            Asset créé : <b>{m.code}</b>
            {m.raison ? ` (${m.raison})` : ""} : son image est générée, puis il rejoint les références à la recompilation.
          </li>
        ))}
      </ul>
    </div>
  );
}
