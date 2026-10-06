"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type DragEvent } from "react";
import { deposerSourceImport, lancerGeneration } from "@/app/assets/generation-actions";
import { MediaZoom } from "@/components/assets/MediaZoom";
import { urlMiniature } from "@/lib/miniatures";
import {
  ASPECTS,
  CANDIDATS_GARDES,
  MAX_SOURCES,
  MEGAPIXELS_PROPOSES,
  raisonDemandeInvalide,
  type Aspect,
  type DemandeGeneration,
  type ModeGeneration,
} from "@/lib/asset-generation";
import type { GenerationVue, SourceDisponible } from "@/lib/queries-generations";
import type { GenreTache } from "@/lib/taches";
import { Icone } from "@/components/ui/Icone";

/** Une génération de la page, complétée par ce que l'indicateur sait en direct :
 * progression, aperçu, rang dans la file. */
const DERRIERE: Record<GenreTache, string> = { image: "une image", video: "une vidéo", llm: "un agent" };

/** Une génération avec son rang dans la file et, si elle attend, le genre de la
 * tâche qui tient le GPU (une vidéo, un appel d'agent…). */
export type GenerationVivante = GenerationVue & { position: number | null; derriere: GenreTache | null };

const ACTIFS = ["en_attente", "en_cours"];

/** Une source affichée dans un emplacement : un asset du registre ou un fichier
 * importé à la volée (jetable, jamais rattaché au registre). */
type SourceVue =
  | { origine: "asset"; assetId: number; code: string; src: string }
  | { origine: "import"; fichier: string; code: string; src: string };

const cleSource = (s: SourceVue) => (s.origine === "asset" ? `asset:${s.assetId}` : `import:${s.fichier}`);

const LIBELLE_TYPE: Record<string, string> = {
  personnage: "Personnage",
  decor: "Décor",
  prop: "Accessoire",
  vfx: "Effet",
  keyframe: "Plan clé",
  oth: "Autre",
  affiche: "Affiche",
};

function libelleMode(nb: number): string {
  return nb >= 2 ? `Fusion de ${nb} images` : "Modification";
}

/** Popup de génération d'images d'un asset (variante B de la maquette) : deux
 * modes — « À partir du texte » (Krea 2 Turbo) et « À partir d'images » (Qwen
 * Image Edit 2511, 1 à 3 sources dont la première est la cible). Fermer la
 * popup n'interrompt rien : le worker continue, le résultat arrive dans les
 * candidats de la fiche. */
export function GenerationDialog({
  assetId,
  code,
  type,
  methodeGeneration,
  parentCode,
  promptInitial,
  defauts,
  registre,
  imageActuelle,
  generations,
  candidatInitialId,
  ouvert,
  onFermer,
  onAdopter,
  onSupprimer,
  onAnnuler,
  occupe,
  retour,
  simule,
}: {
  assetId: number;
  code: string;
  type: string;
  methodeGeneration: string | null;
  parentCode: string | null;
  promptInitial: string;
  defauts: { aspect: Aspect; megapixels: number; lora: boolean };
  registre: SourceDisponible[];
  /** L'image de l'asset lui-même, présélectionnée en source 1 du mode images. */
  imageActuelle: SourceDisponible | null;
  generations: GenerationVivante[];
  /** Candidat à montrer à l'ouverture (lien depuis l'indicateur du header). */
  candidatInitialId: number | null;
  ouvert: boolean;
  onFermer: () => void;
  onAdopter: (id: number) => void;
  onSupprimer: (id: number) => void;
  /** Annule une génération en file ou en cours (indicateur du header, même chemin). */
  onAnnuler: (g: GenerationVivante) => void;
  occupe: boolean;
  retour: { ok: boolean; texte: string } | null;
  simule: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const parent = useMemo(() => (parentCode ? (registre.find((r) => r.code === parentCode) ?? null) : null), [registre, parentCode]);
  const parentSource: SourceVue | null = parent ? { origine: "asset", assetId: parent.id, code: parent.code, src: parent.src } : null;
  const soiSource: SourceVue | null = imageActuelle
    ? { origine: "asset", assetId: imageActuelle.id, code: imageActuelle.code, src: imageActuelle.src }
    : null;
  // Source 1 proposée d'office en mode « images » : l'image de l'asset s'il en a
  // une (on la retouche), sinon celle de son parent (un dérivé part de lui).
  const sourceParDefaut = soiSource ?? parentSource;
  // L'asset lui-même reste proposable dans le registre même si on l'a retirée.
  const registreComplet = useMemo(() => (imageActuelle ? [imageActuelle, ...registre] : registre), [imageActuelle, registre]);

  const [mode, setMode] = useState<ModeGeneration>(methodeGeneration === "edition" && sourceParDefaut ? "images" : "texte");
  const [sources, setSources] = useState<SourceVue[]>(methodeGeneration === "edition" && sourceParDefaut ? [sourceParDefaut] : []);
  const [prompt, setPrompt] = useState(promptInitial);
  const [aspect, setAspect] = useState<Aspect>(defauts.aspect);
  const [mp, setMp] = useState(defauts.megapixels);
  const [lora, setLora] = useState(defauts.lora);
  const [picker, setPicker] = useState<"registre" | "import" | null>(null);
  const [vu, setVu] = useState<number | null>(candidatInitialId);
  const [lancee, setLancee] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [etatImport, setImport] = useState<"repos" | "envoi" | "survol">("repos");
  const [envoi, startEnvoi] = useTransition();
  const [lancement, startLancement] = useTransition();

  // Le prompt de la fiche a changé (un candidat a été adopté) : on suit, sauf si
  // l'utilisateur a déjà écrit autre chose.
  const dernierInitial = useRef(promptInitial);
  useEffect(() => {
    if (dernierInitial.current === promptInitial) return;
    setPrompt((p) => (p === dernierInitial.current ? promptInitial : p));
    dernierInitial.current = promptInitial;
  }, [promptInitial]);

  // Un candidat adopté remplace l'image de l'asset sous le même nom : la source
  // « asset lui-même » prend l'URL neuve, sinon la vignette resterait l'ancienne.
  useEffect(() => {
    if (!imageActuelle) return;
    setSources((cur) =>
      cur.some((s) => s.origine === "asset" && s.assetId === imageActuelle.id && s.src !== imageActuelle.src)
        ? cur.map((s) => (s.origine === "asset" && s.assetId === imageActuelle.id ? { ...s, src: imageActuelle.src } : s))
        : cur,
    );
  }, [imageActuelle]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (ouvert && !d.open) d.showModal();
    if (!ouvert && d.open) d.close();
  }, [ouvert]);

  // Plusieurs générations peuvent attendre : la scène montre celle qui tourne, à
  // défaut la plus ancienne en attente (la prochaine à partir).
  const actives = generations.filter((g) => ACTIFS.includes(g.statut));
  const actif = actives.find((g) => g.statut === "en_cours") ?? actives[actives.length - 1] ?? null;
  const autres = actives.length - (actif ? 1 : 0);

  // Plus rien d'actif : le message de lancement n'a plus lieu d'être.
  useEffect(() => {
    if (!actif) setLancee(null);
  }, [actif]);
  const terminees = generations.filter((g) => g.statut === "termine" && g.src);
  const courant = terminees.find((g) => g.id === vu) ?? terminees[0] ?? null;
  const derniere = generations[0] ?? null;
  const echec = !actif && derniere?.statut === "echoue" ? derniere : null;
  const annulee = !actif && derniere?.statut === "annulee";
  // Couper une génération en cours coûte du temps de GPU : on confirme. En file,
  // l'annulation est immédiate et sans perte.
  const [confirmerAnnulation, setConfirmerAnnulation] = useState(false);
  useEffect(() => setConfirmerAnnulation(false), [actif?.id, actif?.statut]);

  const changerMode = (m: ModeGeneration) => {
    setMode(m);
    setPicker(null);
    setErreur(null);
    // Passer en « images » : l'image de l'asset (ou, à défaut, de son parent) est
    // la source naturelle, présélectionnée en image 1.
    if (m === "images" && sources.length === 0 && sourceParDefaut) setSources([sourceParDefaut]);
  };

  const demande = (): DemandeGeneration => ({
    mode,
    prompt,
    aspect,
    megapixels: mp,
    loraPersonnage: lora,
    sources: sources.map((s) => (s.origine === "asset" ? { origine: "asset", assetId: s.assetId } : { origine: "import", fichier: s.fichier })),
  });

  /** Pourquoi on ne peut pas lancer, ou null. */
  const raison = (): string | null => {
    if (etatImport === "envoi") return "Import de l'image en cours…";
    if (mode === "images" && sources.length === 0) return "Ajoute au moins une image : l'image 1 est celle qui sera modifiée.";
    if (!prompt.trim()) return mode === "texte" ? type === "affiche" ? "Le prompt est vide : écris-le ici." : "Le prompt est vide : écris-le ici ou dans la fiche de l'asset." : "Décris la modification à appliquer.";
    return raisonDemandeInvalide(demande());
  };
  const bloque = raison();

  const lancer = () => {
    if (bloque) return;
    startLancement(async () => {
      const r = await lancerGeneration(assetId, demande());
      setErreur(r.ok ? null : r.erreur);
      if (r.ok) {
        setLancee(r.position > 1 ? `Ajoutée à la file, position ${r.position}.` : "Génération lancée.");
        setVu(null);
        setPicker(null);
      }
    });
  };

  const ajouterAsset = (a: SourceDisponible) => {
    if (sources.length >= MAX_SOURCES || sources.some((s) => s.origine === "asset" && s.assetId === a.id)) return;
    setSources([...sources, { origine: "asset", assetId: a.id, code: a.code, src: a.src }]);
    setPicker(null);
  };

  const importer = (fichier: File | undefined) => {
    if (!fichier) return;
    if (!fichier.type.startsWith("image/")) {
      setErreur("Ce fichier n'est pas une image.");
      setImport("repos");
      return;
    }
    setImport("envoi");
    setErreur(null);
    startEnvoi(async () => {
      const fd = new FormData();
      fd.append("fichier", fichier);
      const r = await deposerSourceImport(assetId, fd);
      setImport("repos");
      if (!r.ok) {
        setErreur(r.erreur);
        return;
      }
      setSources((cur) => (cur.length >= MAX_SOURCES ? cur : [...cur, { origine: "import", fichier: r.fichier, code: fichier.name, src: r.src }]));
      setPicker(null);
    });
  };

  const deposer = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    importer(e.dataTransfer.files?.[0]);
  };

  const deplacer = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= sources.length) return;
    const copie = [...sources];
    [copie[i], copie[j]] = [copie[j]!, copie[i]!];
    setSources(copie);
  };

  const workflow = mode === "texte" ? "IMG_01_TextToImage · Krea 2 Turbo" : "IMG_Simple_Edit · Qwen Image Edit 2511";
  const emplacements = Array.from({ length: MAX_SOURCES }, (_, i) => sources[i] ?? null);

  return (
    <dialog
      ref={ref}
      className="gd"
      aria-labelledby="gd-titre"
      onClose={onFermer}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="gd-head">
        <h2 id="gd-titre">
          Générer une image <span className="num gd-code">{type === "affiche" ? "de présentation" : code}</span>
        </h2>
        <div className="gd-head-r">
          {simule ? <span className="tiny-note">Mode simulé : images factices.</span> : null}
          <span className="num tiny-note">{workflow}</span>
          <button type="button" className="gd-x" onClick={onFermer} aria-label="Fermer">
            <Icone nom="fermer" />
          </button>
        </div>
      </div>

      <div className="gd-body">
        <div className="gd-col">
          <div className="gd-grp">
            <span className="gd-lbl">Mode</span>
            <div className="gd-seg" role="group" aria-label="Mode de génération">
              <button type="button" aria-pressed={mode === "texte"} onClick={() => changerMode("texte")}>
                À partir du texte
                <small>texte → image</small>
              </button>
              <button type="button" aria-pressed={mode === "images"} onClick={() => changerMode("images")}>
                À partir d&rsquo;images
                <small>1 à {MAX_SOURCES} images</small>
              </button>
            </div>
            {methodeGeneration === "edition" && mode === "texte" ? (
              <p className="tiny-note">
                Cet asset est en méthode « édition »{parentCode ? ` : le texte seul ne reprendra pas l'apparence de ${parentCode}` : " : le texte seul ne reprendra pas l'apparence d'une image existante"}.
              </p>
            ) : null}
            {methodeGeneration === "edition" && !parentSource && !soiSource ? (
              <p className="tiny-note">
                {parentCode
                  ? `${parentCode} n'a pas encore d'image : donne-lui-en une d'abord, ou choisis une autre source.`
                  : "Choisis les images de départ (jusqu'à 3) : la première est celle qui sera modifiée."}
              </p>
            ) : null}
            {methodeGeneration !== "edition" && mode === "images" ? (
              <p className="tiny-note">La méthode de la fiche ne change pas : tu peux partir d&rsquo;images pour cette génération.</p>
            ) : null}
          </div>

          {mode === "images" ? (
            <div className="gd-grp">
              <span className="gd-lbl">Images sources</span>
              <div className="gd-slots">
                {emplacements.map((s, i) => (
                  <div key={s ? cleSource(s) : `vide-${i}`} className={`gd-slot${i === 0 ? " cible" : ""}`}>
                    <span className="gd-slot-tag">
                      Image {i + 1} · {i === 0 ? "cible" : "référence"}
                    </span>
                    {s ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="gd-thumb" src={urlMiniature(s.src, 192)} alt={s.code} decoding="async" />
                        <span className="gd-slot-nom num" title={s.code}>
                          {s.code}
                        </span>
                        {s.origine === "import" ? <span className="tiny-note">importée, jetable</span> : null}
                        <div className="gd-slot-actions">
                          <button type="button" onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label={`Image ${i + 1} : reculer d'un rang`}>
                            ◀
                          </button>
                          <button type="button" onClick={() => deplacer(i, 1)} disabled={i >= sources.length - 1} aria-label={`Image ${i + 1} : avancer d'un rang`}>
                            <Icone nom="droite" />
                          </button>
                          <button type="button" onClick={() => setSources(sources.filter((_, k) => k !== i))} aria-label={`Retirer l'image ${i + 1}`}>
                            <Icone nom="fermer" />
                          </button>
                        </div>
                      </>
                    ) : i === sources.length ? (
                      <button type="button" className="gd-add" onClick={() => setPicker(picker ? null : "registre")} aria-expanded={picker != null}>
                        <Icone nom="ajouter" taille={15} /> Ajouter
                      </button>
                    ) : (
                      <div className="gd-add gd-add-off" aria-hidden="true" />
                    )}
                  </div>
                ))}
              </div>
              <p className="tiny-note">
                <strong>{libelleMode(sources.length)}</strong> ·{" "}
                {sources.length >= 2
                  ? "l'image 1 est la cible ; les suivantes apportent ce qu'il faut en reprendre."
                  : "l'image 1 est transformée selon le prompt."}
              </p>

              {picker ? (
                <div className="gd-picker">
                  <div className="gd-picker-hd">
                    <div className="gd-tabs" role="group" aria-label="Origine de l'image">
                      <button type="button" aria-pressed={picker === "registre"} onClick={() => setPicker("registre")}>
                        Depuis le registre
                      </button>
                      <button type="button" aria-pressed={picker === "import"} onClick={() => setPicker("import")}>
                        Importer
                      </button>
                    </div>
                    <button type="button" className="btn btn-ghost btn-mini" onClick={() => setPicker(null)}>
                      Annuler
                    </button>
                  </div>
                  {picker === "registre" ? (
                    registreComplet.length > 0 ? (
                      <div className="gd-reg">
                        {registreComplet.map((a) => {
                          const deja = sources.some((s) => s.origine === "asset" && s.assetId === a.id);
                          return (
                            <button key={a.id} type="button" onClick={() => ajouterAsset(a)} disabled={deja}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img className="gd-thumb" src={urlMiniature(a.src, 192)} alt="" loading="lazy" decoding="async" />
                              <span className="num gd-reg-code">{a.code}</span>
                              <span className="tiny-note">{deja ? "déjà ajoutée" : a.id === assetId ? "cet asset" : (LIBELLE_TYPE[a.type] ?? a.type)}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="tiny-note">Aucun autre asset n&rsquo;a encore d&rsquo;image dans le registre.</p>
                    )
                  ) : (
                    <>
                      <label
                        className={`gd-drop${etatImport === "survol" ? " survol" : ""}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setImport("survol");
                        }}
                        onDragLeave={() => setImport("repos")}
                        onDrop={deposer}
                      >
                        {etatImport === "envoi" || envoi ? "Envoi…" : "Dépose une image ici ou clique pour en choisir une"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          hidden
                          onChange={(e) => {
                            importer(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <p className="tiny-note">Importée pour cette génération uniquement : elle n&rsquo;entre pas dans le registre.</p>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="gd-grp">
            <label className="gd-lbl" htmlFor="gd-prompt">
              {mode === "texte" ? "Prompt (description de l'image)" : "Prompt (consigne de modification)"}
            </label>
            <textarea
              id="gd-prompt"
              className="field"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={mode === "texte" ? "Décris l'image à créer, en anglais." : "Ex. Change her coat to midnight blue. Keep the face identical."}
            />
            <p className="tiny-note">
              {mode === "texte"
                ? type === "affiche"
                  ? "Prérempli à partir du titre et du résumé : écris-le en anglais, sans demander de texte dans l'image."
                  : "Prérempli depuis la fiche de l'asset."
                : "Une consigne à l'impératif, pas une description : dis ce qui change et ce qui reste identique. Les images se citent par leur rang (« image 1 », « image 2 »)."}{" "}
              {type === "affiche" ? "La clause de style du projet est ajoutée automatiquement." : "Il devient le prompt de l’asset quand tu utilises le résultat."}
            </p>
          </div>

          <div className="gd-grp">
            <span className="gd-lbl">Réglages</span>
            {mode === "texte" ? (
              <div className="gd-row">
                <select className="field" value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} aria-label="Format">
                  {ASPECTS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <select className="field" value={mp} onChange={(e) => setMp(Number(e.target.value))} aria-label="Mégapixels">
                  {MEGAPIXELS_PROPOSES.map((m) => (
                    <option key={m} value={m}>
                      {String(m).replace(".", ",")} MP
                    </option>
                  ))}
                </select>
                {type === "personnage" ? (
                  <label className="chk" title="LoRA CharacterDesign : fiche personnage à 4 vues">
                    <input type="checkbox" checked={lora} onChange={(e) => setLora(e.target.checked)} />
                    Fiche 4 vues
                  </label>
                ) : null}
              </div>
            ) : (
              <p className="tiny-note">Le format suit l&rsquo;image 1 : le graphe d&rsquo;édition n&rsquo;a pas de réglage de taille.</p>
            )}
          </div>
        </div>

        <div className="gd-col gd-scene">
          <div className="gd-grp">
            <span className="gd-lbl">{actif ? (actif.statut === "en_cours" ? "Génération en cours" : "En file") : "Résultat"}</span>
            {actif ? (
              <>
                <div className="gd-stage">
                  {actif.apercuSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={actif.apercuSrc} alt="Aperçu en cours de génération" />
                  ) : (
                    <span className="tiny-note">
                      {actif.statut === "en_attente"
                        ? `En file${actif.position ? ` · n°${actif.position}` : ""}${actif.derriere ? ` · derrière ${DERRIERE[actif.derriere]}` : ""}`
                        : "Démarrage…"}
                    </span>
                  )}
                </div>
                {actif.progression ? (
                  <>
                    <progress
                      className="gd-bar"
                      value={actif.progression.valeur}
                      max={actif.progression.max}
                      aria-label="Progression de la génération"
                    />
                    <div className="gd-prog num">
                      <span>
                        {actif.progression.etape ? `${actif.progression.etape} · ` : ""}
                        étape {actif.progression.valeur}/{actif.progression.max}
                      </span>
                    </div>
                  </>
                ) : (
                  <progress className="gd-bar" aria-label="Génération en cours" />
                )}
                {lancee ? (
                  <p className="tiny-note" role="status" style={{ color: "var(--or-glow)" }}>
                    {lancee}
                  </p>
                ) : null}
                {actif.annulationDemandee ? (
                  <p className="tiny-note" role="status" style={{ color: "var(--or-glow)" }}>
                    Annulation demandée… ComfyUI est en train de s&rsquo;arrêter.
                  </p>
                ) : confirmerAnnulation ? (
                  <div className="gd-row" role="group" aria-label="Confirmer l'annulation">
                    <button type="button" className="btn btn-ghost btn-mini" onClick={() => { setConfirmerAnnulation(false); onAnnuler(actif); }}>
                      Oui, annuler la génération
                    </button>
                    <button type="button" className="btn btn-ghost btn-mini" onClick={() => setConfirmerAnnulation(false)}>
                      Non
                    </button>
                  </div>
                ) : (
                  <div className="gd-row">
                    <button
                      type="button"
                      className="btn btn-ghost btn-mini"
                      onClick={() => (actif.statut === "en_cours" ? setConfirmerAnnulation(true) : onAnnuler(actif))}
                    >
                      {actif.statut === "en_cours" ? "Annuler cette génération" : "Retirer de la file"}
                    </button>
                  </div>
                )}
                {autres > 0 ? (
                  <p className="tiny-note num">
                    + {autres} autre{autres > 1 ? "s" : ""} en file pour cet asset
                  </p>
                ) : null}
                <p className="tiny-note">Tu peux fermer cette fenêtre : la génération continue, et le suivi est dans l&rsquo;icône du bandeau.</p>
              </>
            ) : courant ? (
              <>
                <MediaZoom kind="image" src={courant.src!} apercu={urlMiniature(courant.src!, 768)} alt="Candidat généré" classe="gd-stage zoomable" />
                <p className="tiny-note num">
                  {courant.methode === "edition" ? "À partir d'images" : `${courant.aspect} · ${String(courant.megapixels).replace(".", ",")} MP`}
                </p>
                <div className="gd-row">
                  <button type="button" className="btn btn-primary" onClick={() => onAdopter(courant.id)} disabled={occupe}>
                    Utiliser
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => onSupprimer(courant.id)} disabled={occupe}>
                    Supprimer
                  </button>
                </div>
                <p className="tiny-note">Utiliser remplace l&rsquo;image et le prompt de l&rsquo;asset, et le repasse « en cours ». Générer relance avec les réglages du formulaire et une nouvelle seed.</p>
              </>
            ) : (
              <div className="gd-stage vide">
                <span className="tiny-note">Aucun résultat pour l&rsquo;instant. Remplis le formulaire puis clique sur Générer.</span>
              </div>
            )}
            {retour ? (
              <p className="tiny-note" role={retour.ok ? "status" : "alert"} style={{ color: retour.ok ? "var(--or-glow)" : "var(--ecarlate-glow)" }}>
                {retour.texte}
              </p>
            ) : null}
            {annulee ? <p className="tiny-note">Dernière génération annulée.</p> : null}
            {echec ? (
              <p className="tiny-note gd-echec" role="alert">
                Dernière génération échouée{echec.erreur ? ` : ${echec.erreur.slice(0, 160)}` : "."}
              </p>
            ) : null}
          </div>

          <div className="gd-grp">
            <div className="gd-row gd-row-between">
              <span className="gd-lbl">Candidats</span>
              <span className="num tiny-note">
                {terminees.length}/{CANDIDATS_GARDES}
              </span>
            </div>
            <div className="gd-cands">
              {Array.from({ length: CANDIDATS_GARDES }, (_, i) => {
                const c = terminees[i];
                return c ? (
                  <button
                    key={c.id}
                    type="button"
                    className={`gd-cand${!actif && courant?.id === c.id ? " on" : ""}`}
                    onClick={() => setVu(c.id)}
                    aria-label={`Candidat ${i + 1}`}
                    aria-pressed={!actif && courant?.id === c.id}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urlMiniature(c.src!, 96)} alt="" loading="lazy" decoding="async" />
                  </button>
                ) : (
                  <span key={`vide-${i}`} className="gd-cand vide" />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="gd-foot">
        <span className={`gd-raison${bloque ? " bloque" : ""}`} role="status">
          {bloque ??
            (mode === "texte"
              ? `Prêt : texte seul, ${aspect} · ${String(mp).replace(".", ",")} MP.`
              : `Prêt : ${sources.length} image${sources.length > 1 ? "s" : ""}, ${libelleMode(sources.length).toLowerCase()}.`)}
          {erreur ? <span className="gd-erreur" role="alert"> {erreur}</span> : null}
        </span>
        <div className="gd-row">
          <button type="button" className="btn btn-ghost" onClick={onFermer}>
            Fermer
          </button>
          <button type="button" className="btn btn-gold" onClick={lancer} disabled={bloque != null || lancement}>
            {lancement ? "…" : actif ? "Ajouter à la file" : "Générer"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
