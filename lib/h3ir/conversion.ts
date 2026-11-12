import type { ChangementBrut } from "../agents/changes";
import type { ApresFiche, RefFiche } from "../agents/sheets";
import type { Avertissement } from "../agents/types";
import { ORDRE_SECTIONS } from "../clips/prompt";
import type { ResultatH3ir } from "./result";
import type { ResultatRetouche } from "./retouch";

/** From the result of the Open H3 IR task (`agent_runs.resultat`) to the `fiche` change of a proposal (same shape as `depuisFichePlan`,
 * lib/agents/conversion.ts). Pure, tested. Step 4 of the project (docs/PLAN_INTEGRATION_OPEN_H3_IR.md).
 *
 * - `sections`: the compiler's, which already carry the six names of the H3 format; a prompt without a summary or detailed description is BLOCKED.
 * - `refs`: the manifest (label `<Picture N>` / `<Audio N>` → slot; fingerprint → path → asset). A voice becomes an audio reference whose asset
 *   is the CHARACTER (its master). A reference video is not written into a sheet: it is flagged.
 * - neither duration nor description: the clip keeps its own (the compiler's effective duration is only the render's image grid: 8 s stay 8,000 s, 6 s give 6,583 s; lib/renders/image-grid.ts).
 * - `moteur: "h3ir"`: the sheet applier then keeps the old prompt in the history and records the new one as « compilation ». */

const SECTIONS_OBLIGATOIRES = ["summary", "detailed_description"] as const;
const LABEL = /(Picture|Audio|Video)\s*(\d+)/i;

export function depuisCompilationH3ir(
  res: ResultatH3ir,
  plan: { uuid: string; titre: string },
  options: { groupe?: string; sousGroupe?: string | null } = {},
): ChangementBrut[] {
  const avertissements: Avertissement[] = [];
  const ajouter = (type: Avertissement["type"], texte: string) => avertissements.push({ type, texte });

  const c = res.compilation;
  const essais = res.tentatives.length;
  ajouter(
    "info",
    `Compilée par Open H3 IR (${c.source ?? "source inconnue"}, essai ${essais}, seed ${res.seedUtilisee}) à partir d'un intent traduit en anglais. L'ancien prompt reste dans l'historique du prompt.`,
  );
  for (const a of res.avertissements) ajouter("alerte_controle", a);

  // --- sections ---
  const sections: Record<string, string> = {};
  for (const nom of ORDRE_SECTIONS) sections[nom] = (c.sections[nom] ?? "").trim();
  for (const nom of SECTIONS_OBLIGATOIRES) {
    if (!sections[nom]) ajouter("bloque_controle", `Le prompt compilé n'a pas de section « ${nom} » : la fiche n'est pas écrite.`);
  }
  const manquantes = ORDRE_SECTIONS.filter((nom) => !(nom in c.sections));
  if (manquantes.length > 0) ajouter("alerte_controle", `Sections absentes de la compilation (laissées vides) : ${manquantes.join(", ")}.`);

  // --- references ---
  const refs: RefFiche[] = [];
  for (const m of [...c.manifest].sort((a, b) => a.slot - b.slot)) {
    const chemin = res.fichiers[m.sha256];
    const lien = chemin == null ? undefined : res.liens.find((l) => l.path === chemin);
    if (!lien) {
      ajouter("alerte_controle", `Une référence du manifeste (${m.label}) ne correspond à aucun fichier envoyé : elle n'est pas écrite dans la fiche.`);
      continue;
    }
    const numero = LABEL.exec(m.label);
    const slot = numero ? Number(numero[2]) : m.slot;
    if (m.kind === "video" || lien.type === "video") {
      ajouter("alerte_controle", `${lien.code} est une vidéo de référence : une fiche n'écrit que des images et des voix, elle n'est pas reportée (les vidéos déjà liées au plan restent).`);
      continue;
    }
    // An audio is a voice (`voice_timbre`, the asset is the character).
    if (m.kind === "audio") refs.push({ type: "audio", slot, asset: lien.code, role: "Voix du personnage", retention: "reference" });
    else refs.push({ type: "picture", slot, asset: lien.code, role: m.role ?? null, retention: null });
  }
  refs.sort((a, b) => (a.type === b.type ? a.slot - b.slot : a.type === "picture" ? -1 : 1));
  if (!refs.some((r) => r.type === "picture")) ajouter("bloque_controle", "La compilation ne cite aucune image de référence : la fiche n'est pas écrite.");

  // --- compiler diagnostics ---
  const diagnostics = c.diagnostics.slice(0, 20);
  for (const d of diagnostics) {
    const grave = /^(error|warn)/i.test(d.severity);
    ajouter(grave ? "alerte_controle" : "info", `Open H3 IR · ${d.rule} : ${d.message}`);
  }
  if (c.diagnostics.length > diagnostics.length) ajouter("info", `… et ${c.diagnostics.length - diagnostics.length} autres diagnostics d'Open H3 IR (voir le résultat de la tâche).`);

  const fiche: ApresFiche = { sections, refs, voixDuPrompt: true, moteur: "h3ir" };
  return [
    {
      groupe: options.groupe ?? "fiches",
      cibleType: "fiche",
      cibleRef: plan.uuid,
      libelle: `Fiche de plan · ${plan.titre} (Open H3 IR)`,
      operation: "modifier",
      sousGroupe: options.sousGroupe ?? null,
      apres: fiche,
      avertissements,
    },
  ];
}

/** From the result of a prompt RETOUCH (« partir de cet essai », skill `retouche-prompt`) to the `fiche` change: the six sections of the retouched attempt, nothing
 * else. The clip's references do not move (no `refs`: « absent field = we do not touch it »), the sheet check verifies at application that the prompt
 * cites images that exist. `moteur: "h3ir"`: the old prompt stays in the history and the new one goes in. */
export function depuisRetouche(res: ResultatRetouche, plan: { uuid: string; titre: string }, options: { groupe?: string; sousGroupe?: string | null } = {}): ChangementBrut[] {
  const avertissements: Avertissement[] = [];
  avertissements.push({
    type: "info",
    texte: `Prompt de l'essai n°${res.depuisNumero} retouché, sans recompilation${res.modifications.length ? ` : ${res.modifications.join(" ; ")}` : ""}. L'ancien prompt reste dans l'historique du prompt.`,
  });
  const sections: Record<string, string> = {};
  for (const nom of ORDRE_SECTIONS) sections[nom] = (res.sections[nom] ?? "").trim();
  for (const nom of SECTIONS_OBLIGATOIRES) {
    if (!sections[nom]) avertissements.push({ type: "bloque_controle", texte: `Le prompt retouché n'a pas de section « ${nom} » : la fiche n'est pas écrite.` });
  }
  const fiche: ApresFiche = { sections, passages: res.passages, voixDuPrompt: true, moteur: "h3ir" };
  return [
    {
      groupe: options.groupe ?? "fiches",
      cibleType: "fiche",
      cibleRef: plan.uuid,
      libelle: `Fiche de plan · ${plan.titre} (prompt de l'essai n°${res.depuisNumero} retouché)`,
      operation: "modifier",
      sousGroupe: options.sousGroupe ?? null,
      apres: fiche,
      avertissements,
    },
  ];
}
