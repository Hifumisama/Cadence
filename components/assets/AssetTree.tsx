import Link from "next/link";
import type { AssetNode } from "@/lib/queries";
import { infosMedia } from "@/lib/assetMedia";
import { urlMiniature } from "@/lib/miniatures";
import { AssetCard } from "@/components/assets/AssetCard";
import { AjouterDeriveForm } from "@/components/assets/AjouterDeriveForm";

export type FiltresArbre = { statut: string | null; type: string | null };

const STATUTS = [
  { valeur: "valide", libelle: "Validé" },
  { valeur: "en_cours", libelle: "En cours" },
  { valeur: "a_produire", libelle: "À produire" },
] as const;

const LIBELLE_STATUT: Record<string, string> = { valide: "Validé", en_cours: "En cours", a_produire: "À produire" };
const CLASSE_STATUT: Record<string, string> = { valide: "b-termine", en_cours: "b-rejoue", a_produire: "b-attente" };

function descendants(n: AssetNode): AssetNode[] {
  return n.derives.flatMap((d) => [d, ...descendants(d)]);
}

function correspond(n: AssetNode, f: FiltresArbre): boolean {
  return (!f.statut || n.statut === f.statut) && (!f.type || n.type === f.type);
}

/** Un nœud reste affiché s'il correspond au filtre ou si l'un de ses
 * descendants y correspond (sinon on couperait la branche qui y mène). */
function garde(n: AssetNode, f: FiltresArbre): boolean {
  return correspond(n, f) || n.derives.some((d) => garde(d, f));
}

function contient(n: AssetNode, code: string): boolean {
  return n.code === code || n.derives.some((d) => contient(d, code));
}

function hrefFiltre(base: string, f: FiltresArbre, changement: Partial<FiltresArbre>): string {
  const suivant = { ...f, ...changement };
  const q = new URLSearchParams();
  if (suivant.statut) q.set("statut", suivant.statut);
  if (suivant.type) q.set("type", suivant.type);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

function Mini({
  projectId,
  noeud,
  actifCode,
  filtres,
}: {
  projectId: number;
  noeud: AssetNode;
  actifCode: string;
  filtres: FiltresArbre;
}) {
  const { kind, etat, src } = infosMedia(noeud.type, noeud.fichier);
  const enfants = noeud.derives.filter((c) => garde(c, filtres));
  return (
    <div className="tree-mini-wrap">
      <Link
        href={`/p/${projectId}/assets/${noeud.code}`}
        className={`tree-mini${noeud.code === actifCode ? " is-active" : ""}`}
      >
        <span className={`tree-mini-thumb${etat !== "ok" ? " is-vide" : ""}`}>
          {etat === "ok" && kind === "image" && src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urlMiniature(src, 96)} alt="" loading="lazy" decoding="async" />
          ) : null}
          {etat === "ok" && kind === "audio" ? <span aria-hidden="true">♪</span> : null}
          {etat === "ok" && kind === "video" && src ? <video src={`${src}#t=0.001`} preload="metadata" muted playsInline /> : null}
        </span>
        <span className="tree-mini-txt">
          <span className="asset-code">{noeud.code}</span>
          <span className={`badge ${CLASSE_STATUT[noeud.statut] ?? "b-attente"}`}>
            <i />
            {LIBELLE_STATUT[noeud.statut] ?? noeud.statut}
          </span>
        </span>
      </Link>
      {enfants.length > 0 ? (
        <details className="tree-sub" open={contient(noeud, actifCode)}>
          <summary>
            {enfants.length} dérivé{enfants.length > 1 ? "s" : ""}
          </summary>
          <div className="tree-minis">
            {enfants.map((c) => (
              <Mini key={c.id} projectId={projectId} noeud={c} actifCode={actifCode} filtres={filtres} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function Carte({
  projectId,
  noeud,
  actifCode,
  estompe = false,
  peutDeriver = false,
}: {
  projectId: number;
  noeud: AssetNode;
  actifCode: string;
  estompe?: boolean;
  /** Registre à un niveau : seul un master reçoit des dérivés. */
  peutDeriver?: boolean;
}) {
  const { kind, etat, src } = infosMedia(noeud.type, noeud.fichier);
  return (
    <div className={`tree-node${estompe ? " is-estompe" : ""}`}>
      <AssetCard
        href={`/p/${projectId}/assets/${noeud.code}`}
        code={noeud.code}
        type={noeud.type}
        description={noeud.description}
        critique={noeud.critique}
        nbDerives={noeud.derives.length}
        statut={noeud.statut}
        fichier={noeud.fichier}
        kind={kind}
        etat={etat}
        src={src}
        actif={noeud.code === actifCode}
        voix={noeud.type === "personnage" ? noeud.voix : undefined}
      />
      {peutDeriver ? <AjouterDeriveForm projectId={projectId} parentId={noeud.id} parentCode={noeud.code} parentType={noeud.type} /> : null}
    </div>
  );
}

/** Arbre de compétences vertical : la racine (master) en haut, un tronc, puis
 * ses dérivés dans une grille qui retourne à la ligne (pas de défilement
 * horizontal, même avec beaucoup de dérivés). Un dérivé qui a lui-même des
 * enfants devient une grappe avec ses enfants en mini-cartes. Les filtres
 * s'appliquent à tous les niveaux sauf la racine, qui reste toujours là. */
export function AssetTree({
  projectId,
  master,
  actifCode,
  filtres,
  base,
}: {
  projectId: number;
  master: AssetNode;
  actifCode: string;
  filtres: FiltresArbre;
  base: string;
}) {
  const tous = descendants(master);
  const types = [...new Set(tous.map((n) => n.type))].sort();
  const compte = (statut: string) => tous.filter((n) => n.statut === statut).length;
  const filtreActif = filtres.statut !== null || filtres.type !== null;
  const visibles = master.derives.filter((d) => garde(d, filtres));
  const nbCorrespond = tous.filter((n) => correspond(n, filtres)).length;

  return (
    <div className="tree">
      <div className="tree-root-row">
        <Carte projectId={projectId} noeud={master} actifCode={actifCode} peutDeriver />
      </div>

      {tous.length > 0 ? (
        <>
          <div className="tree-trunk" />
          <div className="tree-lane">
            <div className="tree-lane-hd">
              <h3>
                Dérivés
                <small>
                  {filtreActif ? `${nbCorrespond} sur ${tous.length}` : `${tous.length} au total`}
                </small>
              </h3>
              <div className="tree-filtres">
                <Link
                  href={hrefFiltre(base, filtres, { statut: null })}
                  className={`asset-filtre${filtres.statut === null ? " is-actif" : ""}`}
                >
                  Tous statuts
                </Link>
                {STATUTS.map((s) => (
                  <Link
                    key={s.valeur}
                    href={hrefFiltre(base, filtres, { statut: s.valeur })}
                    className={`asset-filtre${filtres.statut === s.valeur ? " is-actif" : ""}${compte(s.valeur) === 0 ? " is-vide" : ""}`}
                  >
                    {s.libelle} <span className="n">{compte(s.valeur)}</span>
                  </Link>
                ))}
              </div>
              {types.length > 1 ? (
                <div className="tree-filtres">
                  <Link
                    href={hrefFiltre(base, filtres, { type: null })}
                    className={`asset-filtre${filtres.type === null ? " is-actif" : ""}`}
                  >
                    Tous types
                  </Link>
                  {types.map((t) => (
                    <Link
                      key={t}
                      href={hrefFiltre(base, filtres, { type: t })}
                      className={`asset-filtre${filtres.type === t ? " is-actif" : ""}`}
                    >
                      {t} <span className="n">{tous.filter((n) => n.type === t).length}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="tree-grid">
              {visibles.map((d) => {
                const enfants = d.derives.filter((c) => garde(c, filtres));
                if (d.derives.length === 0) {
                  return <Carte key={d.id} projectId={projectId} noeud={d} actifCode={actifCode} />;
                }
                return (
                  <div key={d.id} className={`tree-cluster${contient(d, actifCode) ? " on-path" : ""}`}>
                    <Carte projectId={projectId} noeud={d} actifCode={actifCode} estompe={!correspond(d, filtres)} />
                    {enfants.length > 0 ? (
                      <>
                        <span className="tree-stem" />
                        <div className="tree-minis">
                          {enfants.map((c) => (
                            <Mini key={c.id} projectId={projectId} noeud={c} actifCode={actifCode} filtres={filtres} />
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {visibles.length === 0 ? (
              <p className="tiny-note">
                Aucun dérivé ne correspond à ces filtres.{" "}
                <Link href={base} style={{ color: "var(--or)" }}>
                  Tout afficher
                </Link>
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <p className="tiny-note" style={{ textAlign: "center", marginTop: "var(--sp-4)" }}>
          Aucun dérivé pour l&rsquo;instant. Utilise « + dérivé » sous la carte pour en créer un.
        </p>
      )}
    </div>
  );
}
