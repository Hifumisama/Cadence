import { readdirSync } from "node:fs";
import { resolve } from "node:path";

function workflowsVoix(): string[] {
  try {
    return readdirSync(resolve(process.cwd(), "workflows/voice-clone")).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

/** État STATIQUE, volontairement isolé : aucune génération voix n'est
 * lancée depuis Cadence pour l'instant. Le worker reste câblé sur la seule
 * génération vidéo (décision du 2026-09-28 : un système de tâches ComfyUI
 * dédié viendra plus tard, pas une généralisation du worker). Ce panneau
 * dit ce qui manque au lieu de simuler un bouton qui ne ferait rien.
 * Composant serveur (lecture du dossier workflows/). */
export function GenerationNonBranchee({ compact = false }: { compact?: boolean }) {
  const fichiers = workflowsVoix();
  return (
    <section className="panel gen-off" aria-label="Génération voix — non branchée">
      <div className="panel-hd">
        <h2>Génération ComfyUI</h2>
        <span className="badge b-brouillon">
          <i />
          Non branchée
        </span>
      </div>
      <div className="panel-bd">
        <p className="tiny-note" style={{ color: "var(--ink-3)" }}>
          Les prises se fabriquent encore à la main dans ComfyUI, puis se déposent ici (candidats, référence,
          test de tenue, rendu T1). Cadence tient le carnet — paramètres retenus, verdicts, bancs d&rsquo;écoute
          — mais ne soumet aucun job voix : le système de tâches ComfyUI dédié n&rsquo;existe pas encore.
        </p>
        {!compact ? (
          <div className="chips" style={{ marginTop: "var(--sp-3)" }}>
            <span className="lbl">workflows/voice-clone</span>
            {fichiers.length > 0 ? fichiers.map((f) => <span key={f} className="chip">{f}</span>) : <span className="chip-none">aucun</span>}
          </div>
        ) : null}
      </div>
    </section>
  );
}
