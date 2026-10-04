import Link from "next/link";
import type { LigneMatrice, PlanMatrice } from "@/lib/matrice-assets";

/** Cohérence entre les plans : quel asset sert dans quel plan. Un trou (« ⚠ 03 ») signale un plan sans la référence d'un
 * asset que ses voisins ont : c'est là qu'une incohérence de détail se glisse le plus souvent. Un symbole par état, jamais la
 * couleur seule ; chaque colonne mène au plan. */
export function MatriceAssets({ base, plans, lignes }: { base: string; plans: PlanMatrice[]; lignes: LigneMatrice[] }) {
  if (lignes.length === 0 || plans.length < 2) return null;
  const nbTrous = lignes.filter((l) => l.trous.length > 0).length;
  return (
    <details className="panel">
      <summary className="panel-hd" style={{ cursor: "pointer" }}>
        <h2>Cohérence entre les plans</h2>
        <span className="eyebrow">
          {lignes.length} asset{lignes.length > 1 ? "s" : ""} · {nbTrous} avec un trou
        </span>
      </summary>
      <div className="panel-bd">
        <p className="tiny-note">
          Un asset par ligne, un plan par colonne. « ● » : le plan cite l&rsquo;asset en référence. « ⚠ » : le plan n&rsquo;a pas la référence alors que le plan d&rsquo;avant et celui d&rsquo;après l&rsquo;ont — à
          regarder si le même élément doit y apparaître.
        </p>
        <div className="matrice-wrap">
          <table className="matrice">
            <thead>
              <tr>
                <th scope="col">Asset</th>
                {plans.map((p) => (
                  <th key={p.uuid} scope="col" className="num">
                    <Link href={`${base}/plans/${p.uuid}`} title={p.titre}>
                      {String(p.position).padStart(2, "0")}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.code}>
                  <th scope="row" className="asset-code">
                    {l.code}
                  </th>
                  {l.presents.map((v, i) => {
                    const trou = l.trous.includes(plans[i]!.position);
                    return (
                      <td key={plans[i]!.uuid} className={v ? "is-oui" : trou ? "is-trou" : undefined} aria-label={v ? "cité" : trou ? "trou" : "non cité"}>
                        {v ? "●" : trou ? "⚠" : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
