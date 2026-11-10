import type { ChangementBrut } from "../agents/changements";
import type { ApresFiche, RefFiche } from "../agents/fiches";
import type { Avertissement } from "../agents/types";
import { ORDRE_SECTIONS } from "../prompt";
import type { ResultatH3ir } from "./resultat";

/** Du résultat de la tâche Open H3 IR (`agent_runs.resultat`) au changement `fiche` d'une proposition (même forme que `depuisFichePlan`,
 * lib/agents/conversion.ts). Pur, testé. Étape 4 du chantier (docs/PLAN_INTEGRATION_OPEN_H3_IR.md).
 *
 * - `sections` : celles du compilateur, qui portent déjà les six noms du format H3 ; un prompt sans résumé ni description détaillée est BLOQUÉ.
 * - `refs` : le manifeste (label `<Picture N>` / `<Audio N>` → emplacement ; empreinte → chemin → asset). Une voix devient une référence audio dont l'asset
 *   est le PERSONNAGE (son master). Une vidéo de référence ne s'écrit pas dans une fiche : elle est signalée.
 * - ni durée ni description : le plan garde les siens (la durée effective du compilateur n'est que la grille d'images du rendu : 8 s restent 8,000 s, 6 s donnent 6,583 s ; lib/grille-images.ts).
 * - `moteur: "h3ir"` : l'applicateur de fiche garde alors l'ancien prompt dans l'historique et inscrit le nouveau en « compilation ». */

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

  // --- références ---
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
    // Un audio est une voix (`voice_timbre`, l'asset est le personnage).
    if (m.kind === "audio") refs.push({ type: "audio", slot, asset: lien.code, role: "Voix du personnage", retention: "reference" });
    else refs.push({ type: "picture", slot, asset: lien.code, role: m.role ?? null, retention: null });
  }
  refs.sort((a, b) => (a.type === b.type ? a.slot - b.slot : a.type === "picture" ? -1 : 1));
  if (!refs.some((r) => r.type === "picture")) ajouter("bloque_controle", "La compilation ne cite aucune image de référence : la fiche n'est pas écrite.");

  // --- diagnostics du compilateur ---
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
