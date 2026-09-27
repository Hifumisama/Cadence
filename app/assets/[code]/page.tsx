import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetsTree, type AssetNode } from "@/lib/queries";
import { StatutSelector } from "@/components/assets/StatutSelector";
import { AjouterDeriveForm } from "@/components/assets/AjouterDeriveForm";
import { AssetPreview } from "@/components/assets/AssetPreview";
import { UploadFichierForm } from "@/components/assets/UploadFichierForm";
import { AssetFicheEditor } from "@/components/assets/AssetFicheEditor";
import { SupprimerAssetButton } from "@/components/assets/SupprimerAssetButton";
import { delierRef, delierVoixDialogue } from "@/app/assets/actions";

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

function trouverParentCode(masters: AssetNode[], code: string, parent: string | null = null): string | null {
  for (const m of masters) {
    if (m.code === code) return parent;
    const trouve = trouverParentCode(m.derives, code, m.code);
    if (trouve !== null) return trouve;
  }
  return null;
}

/** Arbre de compétences : le master est la racine, chaque dérivé est une
 * branche qui peut elle-même ramifier — profondeur illimitée (retour
 * utilisateur 2026-09-28). Chaque nœud mène à son propre détail au clic. */
function TreeNode({
  noeud,
  actifCode,
  parentCode,
}: {
  noeud: AssetNode;
  actifCode: string;
  parentCode: string | null;
}) {
  const bloque = noeud.derives.length > 0 || noeud.citations.length > 0;
  const raison =
    noeud.derives.length > 0
      ? `A encore ${noeud.derives.length} dérivé(s)`
      : noeud.citations.length > 0
        ? "Encore cité dans une fiche de plan"
        : null;

  return (
    <div className={`tree2-node${parentCode === null ? " tree2-root" : ""}`}>
      <div className={`tree2-row${noeud.code === actifCode ? " is-active" : ""}`}>
        <Link href={`/assets/${noeud.code}`} className="tree2-row-link">
          <AssetPreview type={noeud.type} fichier={noeud.fichier} taille="sm" />
          <span className="asset-code">{noeud.code}</span>
          <span className="type-tag">{noeud.type}</span>
          {noeud.critique ? <span className="crit-tag">Critique</span> : null}
          <span className={`badge ${noeud.statut === "valide" ? "b-termine" : noeud.statut === "en_cours" ? "b-rejoue" : "b-attente"}`}>
            <i />
            {noeud.statut === "valide" ? "Validé" : noeud.statut === "en_cours" ? "En cours" : "À produire"}
          </span>
        </Link>
        <span className="tree2-actions">
          <AjouterDeriveForm parentId={noeud.id} parentCode={noeud.code} parentType={noeud.type} />
          <SupprimerAssetButton
            assetId={noeud.id}
            code={noeud.code}
            bloque={bloque}
            raisonBlocage={raison}
            redirectTo={parentCode ? `/assets/${parentCode}` : "/assets"}
          />
        </span>
      </div>
      {noeud.derives.length > 0 ? (
        <div className="tree2-children">
          {noeud.derives.map((d) => (
            <TreeNode key={d.id} noeud={d} actifCode={actifCode} parentCode={noeud.code} />
          ))}
        </div>
      ) : null}
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
  const parentCode = trouverParentCode(masters, noeud.code);

  return (
    <div>
      <div className="crumbs">
        <Link href="/assets" style={{ color: "var(--or)" }}>
          Assets
        </Link>
        <span>/</span>
        <Link href={`/assets/${master.code}`} className="num" style={{ color: noeud.id === master.id ? "var(--ink)" : "var(--or)" }}>
          {master.code}
        </Link>
        {noeud.id !== master.id ? (
          <>
            <span>/</span>
            <span className="num" style={{ color: "var(--ink)" }}>{noeud.code}</span>
          </>
        ) : null}
      </div>

      <section className="panel" style={{ marginBottom: "var(--sp-5)" }}>
        <div className="panel-hd">
          <h1 className="master-code">{noeud.code}</h1>
          <div className="fiche-actions">
            <span className="type-tag">{noeud.type}</span>
            {noeud.critique ? <span className="crit-tag">Critique</span> : null}
            <StatutSelector assetId={noeud.id} statut={noeud.statut} />
            <SupprimerAssetButton
              assetId={noeud.id}
              code={noeud.code}
              bloque={noeud.derives.length > 0 || noeud.citations.length > 0}
              raisonBlocage={
                noeud.derives.length > 0
                  ? `A encore ${noeud.derives.length} dérivé(s) — supprime-les d'abord.`
                  : noeud.citations.length > 0
                    ? "Encore cité dans une fiche de plan — délie-le ci-dessous d'abord."
                    : null
              }
              redirectTo={parentCode ? `/assets/${parentCode}` : "/assets"}
            />
          </div>
        </div>
        <div className="panel-bd asset-fiche-body">
          <div className="asset-fiche-media">
            <AssetPreview type={noeud.type} fichier={noeud.fichier} taille="lg" />
            <UploadFichierForm assetId={noeud.id} code={noeud.code} />
            {noeud.fichier ? <span className="tiny-note num">{noeud.fichier}</span> : null}
          </div>
          <div className="asset-fiche-info">
            <AssetFicheEditor
              assetId={noeud.id}
              description={noeud.description ?? ""}
              promptGeneration={noeud.promptGeneration ?? ""}
              critique={noeud.critique}
            />
            <div className="field-group">
              <label>Plans d&rsquo;apparition</label>
              {noeud.citations.length > 0 ? (
                <div className="chips">
                  {noeud.citations.map((c) => (
                    <span key={`${c.refId ?? "d"}-${c.dialogueId ?? "r"}-${c.planNumero}`} className="chip-citation">
                      <Link href={`/plans/${c.planNumero}`}>{String(c.planNumero).padStart(3, "0")}</Link>
                      <form
                        action={async () => {
                          "use server";
                          if (c.refId) await delierRef(c.refId);
                          if (c.dialogueId) await delierVoixDialogue(c.dialogueId);
                        }}
                      >
                        <button type="submit" title="Délier de ce plan">
                          ×
                        </button>
                      </form>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="chip-none">Aucun plan pour l&rsquo;instant.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-hd">
          <h2>Arborescence</h2>
          <span className="eyebrow">sujet {master.code}</span>
        </div>
        <div className="panel-bd">
          <div className="tree2">
            <TreeNode noeud={master} actifCode={noeud.code} parentCode={null} />
          </div>
        </div>
      </section>
    </div>
  );
}
