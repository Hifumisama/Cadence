import { readdirSync } from "node:fs";
import { resolve } from "node:path";

function workflowsVoix(): string[] {
  try {
    return readdirSync(resolve(process.cwd(), "workflows/voice-clone")).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

/** État STATIQUE, volontairement isolé : la voix de RÉFÉRENCE (étape « Référence », Qwen3-TTS) et le TEST (audio de test, vidéo
 * de test) se génèrent depuis Cadence, mais les prises de RÉPLIQUES (CosyVoice3) ne sont pas branchées : ce panneau dit ce qui
 * manque au lieu de simuler un bouton qui ne ferait rien.
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
          La voix de référence se génère depuis l&rsquo;étape « Référence », l&rsquo;audio et la vidéo de test depuis l&rsquo;étape
          « Test vidéo ». Les prises de répliques (CosyVoice3) se fabriquent encore à la main dans ComfyUI, puis se
          déposent ici : Cadence tient le carnet (paramètres retenus, durées mesurées) mais ne soumet pas ces jobs.
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
