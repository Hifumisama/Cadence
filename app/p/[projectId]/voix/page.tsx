import Link from "next/link";
import { notFound } from "next/navigation";
import { getFirstEpisodeId, getProject } from "@/lib/queries";
import { getCastingCatalogue } from "@/lib/queries-voix";
import { BoutonAgent } from "@/components/agents/BoutonAgent";
import { Topbar } from "@/components/ui/Topbar";
import { VoixCard } from "@/components/voix/VoixCard";
import { NouvelleVoixForm } from "@/components/voix/NouvelleVoixForm";
import { GenerationNonBranchee } from "@/components/voix/GenerationNonBranchee";
import { RepliqueProd } from "@/components/repliques/RepliqueProd";

export const dynamic = "force-dynamic";

const FILTRES = [
  { cle: null, label: "Toutes" },
  { cle: "a_produire", label: "À concevoir" },
  { cle: "en_cours", label: "En essais" },
  { cle: "valide", label: "Figées" },
] as const;

/** Casting vocal — catalogue (CDC §6, F06). Niveau PROJET, comme le registre
 * d'assets : une voix conçue à l'épisode 1 sert au 7. */
export default async function CastingPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ statut?: string }>;
}) {
  const { projectId } = await params;
  const { statut: statutBrut } = await searchParams;
  const pid = Number(projectId);
  const [projet, catalogue, premierEpisodeId] = await Promise.all([
    getProject(pid),
    getCastingCatalogue(pid),
    getFirstEpisodeId(pid),
  ]);
  if (!projet) notFound();

  const statutActif = FILTRES.some((f) => f.cle === statutBrut) ? (statutBrut as string) : null;
  const { voix } = catalogue;
  const visibles = statutActif ? voix.filter((v) => v.statut === statutActif) : voix;
  const episodeBase = premierEpisodeId ? `/p/${pid}/e/${premierEpisodeId}` : `/p/${pid}`;
  const base = `/p/${pid}/voix`;

  return (
    <>
      <Topbar
        trail={
          <>
            <Link href="/">Projets</Link>
            <span className="sep">›</span>
            {projet.type === "serie" ? <Link href={`/p/${pid}`}>{projet.nom}</Link> : <span className="here">{projet.nom}</span>}
            {projet.type === "serie" ? (
              <>
                <span className="sep">›</span>
                <span className="here">Casting</span>
              </>
            ) : null}
          </>
        }
        tabs={{ projectId: pid, episodeBase }}
      />
      <main className="page">
        <div className="screen-hd">
          <div>
            <p className="eyebrow" style={{ margin: "0 0 6px" }}>
              Catalogue unique pour tout le projet
            </p>
            <h1>Casting vocal</h1>
            <p>
              Une voix = un asset <code className="num">VOICE_*</code> et son casting en quatre étapes : la voix,
              sa référence, un test vidéo, la production des répliques.
            </p>
          </div>
          <div className="actions" style={{ marginLeft: "auto" }}>
            <BoutonAgent
              className="btn btn-ghost"
              libelle="Créer les voix manquantes"
              demande={{ projectId: pid, portee: "projet", cible: null, profondeur: "complete", libelle: projet.nom, vue: "voix" }}
              titre="L'agent décrit le timbre des personnages qui parlent sans avoir de voix (et la voix off), à partir de leurs répliques"
            />
            <NouvelleVoixForm projectId={pid} personnages={catalogue.personnages} />
          </div>
        </div>

        <div className="tally">
          <div className="tally-item">
            <span className="v">{voix.length}</span>
            <span className="k">Voix</span>
          </div>
          <div className="tally-item">
            <span className="v" style={{ color: "var(--ecarlate-glow)" }}>{voix.filter((v) => v.critique).length}</span>
            <span className="k">Critiques</span>
          </div>
          <div className="tally-item is-termine">
            <span className="v">{voix.filter((v) => v.statut === "valide").length}</span>
            <span className="k">Figées</span>
          </div>
          <span className="tally-spacer" />
          <div className="tally-item">
            <span className="v" style={{ color: "var(--ink-2)" }}>{catalogue.nbRepliques}</span>
            <span className="k">Répliques</span>
          </div>
          <div className={`tally-item${catalogue.nbRepliquesSansVoix > 0 ? " is-rejoue" : ""}`}>
            <span className="v">{catalogue.nbRepliquesSansVoix}</span>
            <span className="k">Sans voix</span>
          </div>
        </div>

        <section className="panel">
          <div className="panel-hd">
            <h2>Voix</h2>
            <span className="eyebrow">Voix → Référence → Test vidéo → Répliques</span>
          </div>
          <nav className="asset-filtres" aria-label="Filtrer par statut">
            {FILTRES.map((f) => {
              const n = f.cle ? voix.filter((v) => v.statut === f.cle).length : voix.length;
              return (
                <Link
                  key={f.label}
                  href={f.cle ? `${base}?statut=${f.cle}` : base}
                  className={`asset-filtre${statutActif === f.cle ? " is-actif" : ""}${n === 0 ? " is-vide" : ""}`}
                >
                  {f.label} <span className="n">{n}</span>
                </Link>
              );
            })}
          </nav>
          <div className="voix-grid">
            {visibles.map((v) => (
              <VoixCard
                key={v.id}
                href={`${base}/${v.code}`}
                code={v.code}
                statut={v.statut}
                critique={v.critique}
                description={v.description ?? ""}
                personnageCode={v.personnageCode}
                referenceSrc={v.referenceSrc}
                referenceFichier={v.fichier}
                phases={v.phases}
                nbRepliques={v.nbRepliques}
                nbRepliquesMesurees={v.nbRepliquesMesurees}
              />
            ))}
          </div>
          {voix.length === 0 ? (
            <p className="tiny-note" style={{ padding: "var(--sp-4)" }}>
              Aucune voix au catalogue. En créer une ci-dessus, ou importer le registre (<code>npm run db:import</code>).
            </p>
          ) : visibles.length === 0 ? (
            <p className="tiny-note" style={{ padding: "var(--sp-4)" }}>Aucune voix dans cet état.</p>
          ) : null}
        </section>

        <section className="panel" style={{ marginTop: "var(--sp-5)" }}>
          <div className="panel-hd">
            <h2>Répliques</h2>
            <span className="eyebrow">écrites au scénario ou à la fiche de voix · la fiche de plan les assemble</span>
          </div>
          <div className="panel-bd">
            {catalogue.repliquesSansVoix.length > 0 ? (
              <>
                <p className="tiny-note" style={{ marginBottom: "var(--sp-3)" }}>
                  {catalogue.repliquesSansVoix.length} réplique{catalogue.repliquesSansVoix.length > 1 ? "s" : ""} sans voix :
                  leur personnage n&rsquo;a pas encore de voix au casting (fiche de la voix, ou « Assigner une voix » sur le
                  personnage au registre). Elles restent écrites en attendant.
                </p>
                <ul className="repl-liste rep-liste">
                  {catalogue.repliquesSansVoix.map((r) => (
                    <RepliqueProd key={r.id} r={r} projectId={pid} />
                  ))}
                </ul>
              </>
            ) : (
              <p className="chip-none">
                {catalogue.nbRepliques > 0
                  ? "Toutes les répliques ont une voix — retrouve-les sur la fiche de chaque voix."
                  : "Aucune réplique pour l'instant."}
              </p>
            )}
            <p className="tiny-note" style={{ marginTop: "var(--sp-3)" }}>
              Export des audios seuls pour le montage :{" "}
              <a href={`/api/export/repliques?projectId=${pid}&format=csv`} style={{ color: "var(--or)" }}>CSV</a>
              {" · "}
              <a href={`/api/export/repliques?projectId=${pid}&format=json`} style={{ color: "var(--or)" }}>JSON</a>
            </p>
          </div>
        </section>

        <GenerationNonBranchee />
      </main>
    </>
  );
}
