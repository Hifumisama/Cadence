import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetsTree, type AssetNode } from "@/lib/queries";
import { StatutSelector } from "@/components/assets/StatutSelector";
import { AjouterDeriveForm } from "@/components/assets/AjouterDeriveForm";
import { AssetPreview } from "@/components/assets/AssetPreview";

export const dynamic = "force-dynamic";

function trouverNoeud(masters: AssetNode[], code: string): AssetNode | null {
  for (const m of masters) {
    if (m.code === code) return m;
    const trouve = trouverNoeud(m.derives, code);
    if (trouve) return trouve;
  }
  return null;
}

function trouverMasterDe(masters: AssetNode[], code: string): AssetNode | null {
  for (const m of masters) {
    if (m.code === code) return m;
    if (contientCode(m.derives, code)) return m;
  }
  return null;
}

function contientCode(noeuds: AssetNode[], code: string): boolean {
  return noeuds.some((n) => n.code === code || contientCode(n.derives, code));
}

function DeriveTree({ noeud, profondeur }: { noeud: AssetNode; profondeur: number }) {
  return (
    <div className="tree-children">
      {noeud.derives.map((d) => (
        <div key={d.id} className="tree-node">
          <div className="tree-node-hd">
            <AssetPreview type={d.type} fichier={d.fichier} taille="sm" />
            <span className="asset-code">{d.code}</span>
            {d.critique ? <span className="crit-tag">Critique</span> : null}
            <span className="type-tag">{d.type}</span>
            <span style={{ marginLeft: "auto" }}>
              <StatutSelector assetId={d.id} statut={d.statut} />
            </span>
          </div>
          {d.description ? <p className="asset-desc" style={{ marginTop: 8 }}>{d.description}</p> : null}
          {d.plansCitants.length > 0 ? (
            <div className="chips" style={{ marginTop: 8 }}>
              <span className="lbl">Plans</span>
              {d.plansCitants.map((n) => (
                <Link key={n} href={`/plans/${n}`} className="chip">
                  {String(n).padStart(3, "0")}
                </Link>
              ))}
            </div>
          ) : null}
          {d.derives.length > 0 ? <DeriveTree noeud={d} profondeur={profondeur + 1} /> : null}
        </div>
      ))}
    </div>
  );
}

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const masters = await getAssetsTree();
  const master = trouverMasterDe(masters, code);
  if (!master) notFound();

  const noeud = trouverNoeud([master], code) ?? master;

  return (
    <div>
      <div className="crumbs">
        <Link href="/assets" style={{ color: "var(--or)" }}>
          Assets
        </Link>
        <span>/</span>
        <span className="num" style={{ color: "var(--ink)" }}>{noeud.code}</span>
      </div>

      <div className="fiche-hd">
        <div>
          <h1 className="master-code">{master.code}</h1>
          <p className="sub">
            {master.type} · {master.derives.length} dérivé{master.derives.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="fiche-actions">
          {master.critique ? <span className="crit-tag">Critique</span> : null}
          <StatutSelector assetId={master.id} statut={master.statut} />
        </div>
      </div>

      <div className="cols">
        <div className="col">
          <section className="panel">
            <div className="panel-hd">
              <h2>Fiche</h2>
            </div>
            <div className="panel-bd" style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap" }}>
              <AssetPreview type={master.type} fichier={master.fichier} taille="lg" />
              <dl style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "8px 16px", margin: 0, flex: 1, minWidth: 240 }}>
                <dt className="eyebrow">Type</dt>
                <dd style={{ margin: 0 }}>{master.type}</dd>
                <dt className="eyebrow">Description</dt>
                <dd style={{ margin: 0 }}>{master.description ?? "—"}</dd>
                <dt className="eyebrow">Fichier</dt>
                <dd className="num" style={{ margin: 0 }}>{master.fichier ?? "—"}</dd>
              </dl>
            </div>
          </section>

          <section className="panel">
            <div className="panel-hd">
              <h2>Arborescence</h2>
              <span className="eyebrow">{master.derives.length} dérivé(s)</span>
            </div>
            <div className="panel-bd">
              <div className="tree-root">
                <div className="tree-node-hd">
                  <span className="asset-code">{master.code}</span>
                  <span className="type-tag">master</span>
                </div>
              </div>
              {master.derives.length > 0 ? (
                <DeriveTree noeud={master} profondeur={0} />
              ) : (
                <p className="tiny-note" style={{ marginTop: "var(--sp-3)" }}>
                  Aucun dérivé pour ce sujet.
                </p>
              )}
              <AjouterDeriveForm parentId={master.id} parentType={master.type} />
            </div>
          </section>
        </div>

        <aside className="col">
          <section className="panel">
            <div className="panel-hd">
              <h2>Plans d&rsquo;apparition</h2>
              <span className="eyebrow">Master + dérivés</span>
            </div>
            <div className="panel-bd">
              {master.plansCitants.length > 0 ? (
                <div className="chips">
                  {master.plansCitants.map((n) => (
                    <Link key={n} href={`/plans/${n}`} className="chip">
                      {String(n).padStart(3, "0")}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="chip-none">Aucun plan pour l&rsquo;instant.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
