"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { adopterGeneration, lancerGenerationVoix, supprimerGeneration } from "@/app/assets/generation-actions";
import { deposerReference, enregistrerVoix } from "@/app/voix/actions";
import {
  METHODE_VOIX,
  TEMPERATURE_VOIX_DEFAUT,
  TEMPERATURE_VOIX_MAX,
  TEMPERATURE_VOIX_MIN,
} from "@/lib/asset-generation";
import type { GenerationVue } from "@/lib/queries-generations";
import { checksInstruction, checksReference, raisonGenerationReference, type ImpactReference, type SourceVoix } from "@/lib/voix";
import { CandidatsTest } from "./CandidatsTest";
import { useChangementReference } from "./ConfirmationReference";
import { CopierBouton } from "./CopierBouton";
import { useEtapesVoix } from "./FicheVoixSlider";
import { TrimAudio } from "./TrimAudio";
import { useGenerationsVoix } from "./useGenerationsVoix";
import { ZoneDepot } from "./ZoneDepot";

/** Candidates affichées : les quatre plus récentes (les autres restent sur le disque jusqu'à la purge, mais ne s'affichent plus). */
const CANDIDATES_AFFICHEES = 4;

const METHODES_REFERENCE: string[] = [METHODE_VOIX];

const virgule = (n: number) => n.toFixed(2).replace(".", ",");

/** Étape 2 — la voix de référence. Deux façons de l'obtenir, côte à côte : « Décrire » (une instruction Voice Design, en anglais) ou
 * « Cloner » (un audio fourni, rogné à la taille de la réplique). Puis le bloc « Générer une voix de référence » : il lit la RÉPLIQUE
 * D'ÉCOUTE de la fiche (étape 1, en lecture seule ici) avec la créativité choisie. Chaque essai est une candidate à écouter, puis à
 * garder (elle devient la voix de référence) ou à jeter. Changer une référence existante dont des prises dépendent demande une
 * confirmation (components/voix/ConfirmationReference.tsx). Une référence produite ailleurs se dépose toujours. */
export function EtapeReference({
  assetId,
  source: sourceInitiale,
  instruction: instructionInitiale,
  refText,
  referenceFichier,
  referenceSrc,
  generations,
  generationInitiale,
  simule,
  impact,
}: {
  assetId: number;
  source: SourceVoix;
  instruction: string;
  /** La réplique d'écoute de la fiche (lecture seule ici). */
  refText: string;
  referenceFichier: string | null;
  referenceSrc: string | null;
  /** TOUTES les générations de la voix (référence, test) : la page sait ainsi quand elle est en retard. */
  generations: GenerationVue[];
  generationInitiale: string | null;
  simule: boolean;
  impact: ImpactReference;
}) {
  const { aller } = useEtapesVoix();
    const [source, setSource] = useState<SourceVoix>(sourceInitiale);
  const [instruction, setInstruction] = useState(instructionInitiale);
  const [temperature, setTemperature] = useState(TEMPERATURE_VOIX_DEFAUT);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [lancement, startLancement] = useTransition();

  const { changer, dialogue } = useChangementReference({ assetId, aDejaUneReference: referenceFichier != null, impact });

  // Mode et instruction s'enregistrent tout seuls (un instant après la frappe), comme la fiche.
  const dernier = useRef(JSON.stringify({ source: sourceInitiale, instruction: instructionInitiale }));
  useEffect(() => {
    const cle = JSON.stringify({ source, instruction });
    if (cle === dernier.current) return;
    const t = setTimeout(() => {
      dernier.current = cle;
      void enregistrerVoix(assetId, { source, instruction });
    }, 600);
    return () => clearTimeout(t);
  }, [assetId, source, instruction]);

  // `methodes` : un tableau stable, pour que le hook ne recalcule pas à chaque rendu.
  const { vivantes, annuler } = useGenerationsVoix({ assetId, generations, generationInitiale, methodes: METHODES_REFERENCE, etape: "reference", surveiller: true });
  // Tout ce qui attend, tourne ou a échoué, plus les quatre candidates terminées les plus récentes.
  const essais = useMemo(() => {
    let termines = 0;
    return vivantes.filter((g) => g.statut !== "termine" || ++termines <= CANDIDATES_AFFICHEES);
  }, [vivantes]);

  const raison = raisonGenerationReference({ source, instruction, refText });
  const checksInstr = source === "design" ? checksInstruction(instruction) : [];
  const checksRef = checksReference({ fichier: referenceFichier, refText });

  const generer = () =>
    startLancement(async () => {
      const r = await lancerGenerationVoix(assetId, { instruction, texteReference: refText, temperature });
      setRetour(r.ok ? { ok: true, texte: r.position > 1 ? `Génération ajoutée à la file, position ${r.position}.` : "Génération lancée." } : { ok: false, texte: r.erreur });
    });

  const resultat = (r: Awaited<ReturnType<typeof changer>>) => setRetour(r.ok ? { ok: true, texte: r.message } : { ok: false, texte: r.erreur });

  const garder = (id: number) =>
    startTransition(async () => {
      resultat(await changer(() => adopterGeneration(id)));
    });

  const supprimer = (id: number) =>
    startTransition(async () => {
      const r = await supprimerGeneration(id);
      setRetour(r.ok ? null : { ok: false, texte: r.erreur });
    });

  // Dépôt et rognage : même confirmation. Un refus ou un échec remonte en erreur dans la zone de dépôt (le rognage reste en place).
  const deposer = (apres?: () => void) => async (fd: FormData) => {
    const r = await changer(async () => {
      await deposerReference(assetId, fd);
      return { ok: true as const };
    });
    resultat(r);
    if (!r.ok) throw new Error(r.erreur);
    apres?.();
  };

  const choisirSource = (s: SourceVoix) => {
    setSource(s);
  };

  const radio = (cle: SourceVoix, titre: string, aide: string) => (
    <button type="button" role="radio" aria-checked={source === cle} className="mode-rd" onClick={() => choisirSource(cle)}>
      <i aria-hidden="true" />
      <span>
        <b>{titre}</b>
        <span className="aide">{aide}</span>
      </span>
    </button>
  );

  return (
    <div className="voix-fiche">
      <div className="modes-voix" role="radiogroup" aria-label="Mode de création de la voix">
        <div className="mode-voix" data-on={source === "design"}>
          {radio("design", "Décrire", "Voice Design : une description en anglais")}
          <div className="field-group">
            <div className="voix-lbl-row">
              <label htmlFor="r-instruction">Description de la voix (anglais)</label>
              <CopierBouton texte={instruction} />
            </div>
            <textarea
              id="r-instruction"
              className="field field-mono"
              rows={6}
              value={instruction}
              onChange={(e) => {
                setInstruction(e.target.value);
                setSource("design");
              }}
              placeholder="Identité → origine (native French speaker) → prosodie → état. Un paragraphe. Le débit, le volume, ce que la voix ne fait jamais : c'est ici que ça se dit."
            />
            {checksInstr.length > 0 ? (
              <ul className="voix-notes">
                {checksInstr.map((c) => (
                  <li key={c.titre} className={c.niveau}>
                    <b>{c.titre}.</b> {c.detail}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="mode-voix" data-on={source === "reference"}>
          {radio("reference", "Cloner", "Un audio fourni, rogné à la réplique")}
          <div className="field-group">
            <span className="lbl-voix">Audio source</span>
            <TrimAudio action={deposer(() => setSource("reference"))} aDejaUneReference={referenceSrc != null} />
            <p className="tiny-note">Garde exactement une réplique, sans silence de bord, sans musique ni réverbération. Le rognage devient la voix de référence.</p>
          </div>
        </div>
      </div>

      <h3 className="h3-voix">Générer une voix de référence</h3>
      <div className="field-group">
        <span className="lbl-voix">Texte lu · réplique d&rsquo;écoute de la fiche</span>
        {refText.trim() ? <blockquote className="voix-reftext">{refText}</blockquote> : <p className="chip-none">Pas encore de réplique d&rsquo;écoute.</p>}
        <p className="tiny-note">
          Ce texte vient de la fiche, il ne se modifie pas ici.{" "}
          <button type="button" className="lien-bouton" onClick={() => aller("fiche", { focus: "action" })}>
            Modifier à l&rsquo;étape 1
          </button>
        </p>
      </div>

      <div className="crea-voix">
        <div className="crea-lbl">
          <label htmlFor="r-temp">Créativité de la voix</label>
          <output htmlFor="r-temp" className="num">{virgule(temperature)}</output>
        </div>
        <input
          id="r-temp"
          type="range"
          min={TEMPERATURE_VOIX_MIN}
          max={TEMPERATURE_VOIX_MAX}
          step={0.05}
          value={temperature}
          onChange={(e) => setTemperature(Number(e.target.value))}
          aria-valuetext={`${virgule(temperature)} sur ${virgule(TEMPERATURE_VOIX_MAX)}`}
        />
        <div className="crea-bornes">
          <span>{virgule(TEMPERATURE_VOIX_MIN)} · posée, régulière</span>
          <span>{virgule(TEMPERATURE_VOIX_MAX)} · vivante, plus de variations</span>
        </div>
        <p className="tiny-note">Règle la liberté du modèle à chaque essai. Plus haut, plus de variations d&rsquo;un essai à l&rsquo;autre, mais le timbre peut dériver. S&rsquo;applique à la prochaine génération.</p>
      </div>

      <div className="row-actions">
        <button
          type="button"
          className={`btn ${referenceFichier ? "" : "btn-gold"}`}
          onClick={generer}
          disabled={raison != null || lancement}
          aria-describedby={raison ? "r-raison" : undefined}
          data-focus-etape
        >
          {lancement ? "…" : referenceFichier ? "Générer une nouvelle référence" : "Générer une voix de référence"}
        </button>
        {raison ? <span id="r-raison" className="tiny-note">{raison}</span> : null}
      </div>
      {simule ? <p className="tiny-note">Mode simulé : le son généré est factice (silence).</p> : null}

      <div className="sous-bloc">
        <h3 className="h3-petit">Voix de référence actuelle</h3>
        {referenceSrc ? (
          <audio controls src={referenceSrc} className="voix-audio-ref" aria-label="Voix de référence actuelle" />
        ) : (
          <p className="chip-none">{referenceFichier ? `Référence introuvable sur le stockage (${referenceFichier}).` : "Pas encore de voix de référence."}</p>
        )}
      </div>

      <div className="sous-bloc">
        <h3 className="h3-petit">Candidates récentes · {CANDIDATES_AFFICHEES} au plus</h3>
        <CandidatsTest
          nature="audio"
          generations={essais}
          occupe={pending}
          libelleAdopter="Garder celle-ci"
          libelleMode={(g) => (g.temperature != null ? `créativité ${virgule(g.temperature)}` : null)}
          onAdopter={garder}
          onSupprimer={supprimer}
          onAnnuler={annuler}
        />
      </div>

      <div className="sous-bloc">
        <h3 className="h3-petit">Dépôt à la main</h3>
        <ZoneDepot action={deposer()} accept="audio/*" compact>
          {referenceFichier ? "Remplacer la référence — glisser un audio ici, ou cliquer" : "Déposer une référence faite ailleurs — glisser un audio ici, ou cliquer"}
        </ZoneDepot>
      </div>

      {retour ? (
        <p className="tiny-note" role={retour.ok ? "status" : "alert"} style={{ color: retour.ok ? "var(--or-glow)" : "var(--ecarlate-glow)" }}>
          {retour.texte}
        </p>
      ) : null}
      {checksRef.length > 0 ? (
        <ul className="voix-notes">
          {checksRef.map((c) => (
            <li key={c.titre} className={c.niveau}>
              <b>{c.titre}.</b> {c.detail}
            </li>
          ))}
        </ul>
      ) : null}
      {dialogue}
    </div>
  );
}
