import { readdirSync } from "node:fs";
import { resolve } from "node:path";

function workflowsVoix(): string[] {
  try {
    return readdirSync(resolve(process.cwd(), "workflows/voice-clone")).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

/** État STATIQUE, volontairement isolé : la voix de RÉFÉRENCE se génère depuis
 * Cadence (étape « Référence », Qwen3-TTS), mais les prises de RÉPLIQUES
 * (CosyVoice3) et le rendu du test vidéo ne sont pas branchés : ce panneau dit
 * ce qui manque au lieu de simuler un bouton qui ne ferait rien.
 * Composant serveur (lecture du dossier workflows/). */
export function GenerationNonBranchee({ compact = false }: { compact?: boolean }) {
  const fichiers = workflowsVoix();
  return (
    <section className="panel gen-off" aria-label="Génération voix — branchée en partie">
      <div className="panel-hd">
        <h2>Génération ComfyUI</h2>
        <span className="badge b-brouillon">
          <i />
          Branchée en partie
        </span>
      </div>
      <div className="panel-bd">
        <p className="tiny-note" style={{ color: "var(--ink-3)" }}>
          La voix de référence se génère depuis l&rsquo;étape « Référence ». Les prises de répliques (CosyVoice3) et
          le rendu du test vidéo se fabriquent encore à la main dans ComfyUI, puis se déposent ici : Cadence tient le
          carnet (paramètres retenus, durées mesurées) mais ne soumet pas ces jobs.
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
