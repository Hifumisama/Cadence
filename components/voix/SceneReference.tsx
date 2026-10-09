"use client";

import { useMemo, useState, useTransition } from "react";
import { adopterGeneration, lancerGenerationVoix, supprimerGeneration } from "@/app/assets/generation-actions";
import { deposerReference } from "@/app/voix/actions";
import { METHODE_VOIX, TEMPERATURE_VOIX_DEFAUT, TEMPERATURE_VOIX_MAX, TEMPERATURE_VOIX_MIN } from "@/lib/asset-generation";
import type { GenerationVue } from "@/lib/queries-generations";
import { checksReference, raisonGenerationReference, type ImpactReference } from "@/lib/voix";
import { useAssistantVoix } from "./AssistantVoix";
import { CandidatsTest } from "./CandidatsTest";
import { useChangementReference } from "./ConfirmationReference";
import { useGenerationsVoix } from "./useGenerationsVoix";
import { ZoneDepot } from "./ZoneDepot";

/** Prises affichées : les quatre plus récentes terminées (les autres restent sur le disque jusqu'à la purge, mais ne s'affichent plus). */
const PRISES_AFFICHEES = 4;
const METHODES: string[] = [METHODE_VOIX];
const virgule = (n: number) => n.toFixed(2).replace(".", ",");

/** Scène 4 — la voix de référence. Voix DÉCRITE : elle lit la réplique d'écoute avec le timbre de la scène 3 ; chaque essai est une prise
 * à écouter, puis à garder (elle devient la voix de référence) ou à jeter ; la créativité règle la liberté du modèle. Voix FOURNIE : rien
 * à générer, la voix isolée de la source EST la référence. Changer une référence dont des prises dépendent demande une confirmation.
 * C'est cette scène qui surveille les générations de la voix (tous les panneaux étant montés, une seule suffit) : la page se recharge
 * quand l'une d'elles change d'état. */
export function SceneReference({
  assetId,
  instruction,
  refText,
  referenceFichier,
  referenceSrc,
  generations,
  generationInitiale,
  simule,
  impact,
}: {
  assetId: number;
  instruction: string;
  refText: string;
  referenceFichier: string | null;
  referenceSrc: string | null;
  /** TOUTES les générations de la voix (référence, test, extraction) : la page sait ainsi quand elle est en retard. */
  generations: GenerationVue[];
  generationInitiale: string | null;
  simule: boolean;
  impact: ImpactReference;
}) {
  const { aller, source } = useAssistantVoix();
  const [temperature, setTemperature] = useState(TEMPERATURE_VOIX_DEFAUT);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [lancement, startLancement] = useTransition();

  const { vivantes, annuler } = useGenerationsVoix({ assetId, generations, generationInitiale, methodes: METHODES, etape: "reference", surveiller: true });
  const { changer, dialogue } = useChangementReference({ assetId, aDejaUneReference: referenceFichier != null, impact });

  const essais = useMemo(() => {
    let terminees = 0;
    return vivantes.filter((g) => g.statut !== "termine" || ++terminees <= PRISES_AFFICHEES);
  }, [vivantes]);

  const raison = raisonGenerationReference({ source: "design", instruction, refText });
  const checks = checksReference({ fichier: referenceFichier, refText });

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

  const deposer = async (fd: FormData) => {
    const r = await changer(async () => {
      await deposerReference(assetId, fd);
      return { ok: true as const };
    });
    resultat(r);
    if (!r.ok) throw new Error(r.erreur);
  };

  const fournie = source === "reference";

  return (
    <>
      <p className="cn-acte">Scène 4 · Référence</p>
      <h2 className="cn-titre">
        {fournie ? (
          <>
            Voici <em>la référence</em>.
          </>
        ) : (
          <>
            Écoute, et <em>garde</em> la bonne.
          </>
        )}
      </h2>

      {fournie ? (
        <p className="cn-sous">La voix isolée de la source est la référence : il n&rsquo;y a rien à générer.</p>
      ) : (
        <>
          <p className="cn-sous">Elle lit la réplique d&rsquo;écoute avec le timbre décrit.</p>
          {refText.trim() ? <blockquote className="av-citation"><p>« {refText.trim()} »</p></blockquote> : null}
          <div className="av-cre">
            <button type="button" className="btn btn-primary av-gros-bouton" onClick={generer} disabled={raison != null || lancement} aria-describedby={raison ? "av-raison" : undefined}>
              {lancement ? "…" : referenceFichier ? "Générer une nouvelle prise" : "Générer une prise"}
            </button>
            <label className="cn-note" htmlFor="av-temp" style={{ margin: 0 }}>
              Créativité <output htmlFor="av-temp">{virgule(temperature)}</output>
            </label>
            <input
              id="av-temp"
              type="range"
              min={TEMPERATURE_VOIX_MIN}
              max={TEMPERATURE_VOIX_MAX}
              step={0.05}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              aria-valuetext={`${virgule(temperature)} sur ${virgule(TEMPERATURE_VOIX_MAX)}`}
            />
          </div>
          {raison ? (
            <p id="av-raison" className="av-retour">
              {raison}{" "}
              <button type="button" className="cn-lien" onClick={() => aller("voix")}>
                Aller au timbre
              </button>
            </p>
          ) : (
            <p className="cn-note">Plus haut, plus de variations d&rsquo;une prise à l&rsquo;autre, mais le timbre peut dériver. S&rsquo;applique à la prochaine génération.</p>
          )}
          {simule ? <p className="cn-note">Mode simulé : le son généré est factice (silence).</p> : null}
          <div style={{ maxWidth: 820, marginTop: 14 }}>
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
        </>
      )}

      <div className="av-ref">
        <p className="av-bloc-titre">Voix de référence actuelle</p>
        {referenceSrc ? (
          <audio controls preload="none" src={referenceSrc} aria-label="Voix de référence actuelle" />
        ) : (
          <p className="cn-note">
            {referenceFichier ? `Référence introuvable sur le stockage (${referenceFichier}).` : "Pas encore de voix de référence."}
            {fournie ? (
              <>
                {" "}
                <button type="button" className="cn-lien" onClick={() => aller("voix")}>
                  Aller à la source
                </button>
              </>
            ) : null}
          </p>
        )}
        {fournie && referenceSrc ? (
          <p className="cn-note">
            <button type="button" className="cn-lien" onClick={() => aller("voix")}>
              Revoir la source
            </button>
          </p>
        ) : null}
      </div>

      {!fournie ? (
        <details className="av-details">
          <summary>Déposer une référence faite ailleurs</summary>
          <div style={{ marginTop: 10 }}>
            <ZoneDepot action={deposer} accept="audio/*" compact>
              {referenceFichier ? "Remplacer la référence — glisser un audio ici, ou cliquer" : "Glisser un audio ici, ou cliquer"}
            </ZoneDepot>
          </div>
        </details>
      ) : null}

      {retour ? (
        <p className={`av-retour ${retour.ok ? "is-ok" : "is-erreur"}`} role={retour.ok ? "status" : "alert"}>
          {retour.texte}
        </p>
      ) : null}
      {checks.length > 0 ? (
        <ul className="av-notes">
          {checks.map((c) => (
            <li key={c.titre} className={c.niveau}>
              <b>{c.titre}.</b> {c.detail}
            </li>
          ))}
        </ul>
      ) : null}
      {dialogue}
    </>
  );
}
