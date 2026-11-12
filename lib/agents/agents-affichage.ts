import type {
  CleSectionBrief,
  EtatTache,
  Etape,
  Profondeur,
  VueSousTache,
} from "./types";

/** Aides d'AFFICHAGE du système d'agents (popup à étapes, revue, brief) : libellés,
 * regroupements, diff lisible. Pures, sans base ni Next : testées dans
 * lib/agents/agents-affichage.test.ts, importables par les composants client. Le serveur fait
 * foi pour les données (compteurs, cochage, avertissements) ; on ne les recalcule pas. */

// ---------------------------------------------------------------------------
// Fil d'étapes
// ---------------------------------------------------------------------------

const ETAPES_PAR_PROFONDEUR: Record<Profondeur, readonly Etape[]> = {
  courte: ["consigne", "proposition", "applique"],
  complete: ["conversation", "brief", "proposition", "applique"],
};

/** Ramène une étape du serveur à celle que la profondeur connaît (une conversation
 * courte n'a ni conversation ni brief ; une complète n'a pas de consigne). */
export function etapeValide(profondeur: Profondeur, etape: Etape): Etape {
  const etapes = ETAPES_PAR_PROFONDEUR[profondeur];
  if (etapes.includes(etape)) return etape;
  if (etape === "consigne") return etapes[0]!;
  if (etape === "conversation" || etape === "brief") return profondeur === "courte" ? "consigne" : etape;
  return etapes[0]!;
}

// ---------------------------------------------------------------------------
// Tâches (tour de conversation, brief, proposition)
// ---------------------------------------------------------------------------

export const estTacheActive = (t: Pick<EtatTache, "statut"> | null | undefined): boolean =>
  t != null && (t.statut === "en_attente" || t.statut === "en_cours");

const LIBELLE_BUT: Record<EtatTache["but"], string> = {
  tour: "L'agent réfléchit…",
  brief: "L'agent rédige le brief…",
  proposition: "L'agent prépare la proposition…",
  affiche: "L'agent écrit le prompt de l'affiche…",
  essai: "L'agent traduit ta consigne en prompt…",
};

/** Ce qu'on dit d'une tâche d'agent : file, travail en cours (avec le compteur de
 * jetons, le maximum est inconnu), échec ou annulation. Null quand il n'y a rien à dire. */
export function libelleTache(t: EtatTache | null | undefined): string | null {
  if (!t) return null;
  if (t.statut === "en_attente") return `En file · n°${t.positionFile ?? "?"}`;
  if (t.statut === "en_cours") {
    const jetons = t.progressionJetons != null && t.progressionJetons > 0 ? ` · ${t.progressionJetons} jeton${t.progressionJetons > 1 ? "s" : ""}` : "";
    return `${LIBELLE_BUT[t.but]}${jetons}`;
  }
  if (t.statut === "echoue") return t.erreur ? `Échec : ${t.erreur}` : "Échec";
  if (t.statut === "annulee") return "Annulée";
  return null;
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Une valeur JSON en texte lisible (affichage du brief et du diff). Les tableaux de
 * chaînes → une ligne par élément ; les objets → « clé : valeur » ; jamais de JSON brut
 * sauf pour un objet imbriqué sur trois niveaux. */
export function valeurEnTexte(valeur: unknown, profondeur = 0): string {
  if (valeur === null || valeur === undefined || valeur === "") return "—";
  if (typeof valeur === "string") return valeur;
  if (typeof valeur === "number" || typeof valeur === "boolean") return String(valeur);
  if (Array.isArray(valeur)) {
    if (valeur.length === 0) return "—";
    return valeur.map((v) => (typeof v === "object" && v !== null ? `• ${compact(v, profondeur)}` : `• ${String(v)}`)).join("\n");
  }
  if (estObjet(valeur)) return compact(valeur, profondeur);
  return String(valeur);
}

function compact(valeur: unknown, profondeur: number): string {
  if (!estObjet(valeur)) return valeurEnTexte(valeur, profondeur + 1);
  if (profondeur >= 2) return JSON.stringify(valeur);
  return Object.entries(valeur)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k} : ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" — ");
}

export type TypeEdition = "nombre" | "texte" | "lignes" | "json" | "style" | "libre";

const CLES_NOMBRE: CleSectionBrief[] = ["dureeEpisodeSecondes"];
const CLES_TEXTE: CleSectionBrief[] = ["titre", "arc", "genreTon", "langueDialogues", "rythme"];
const CLES_LIGNES: CleSectionBrief[] = ["inventions", "questionsOuvertes"];

export function typeEdition(cle: string): TypeEdition {
  if (cle === "style") return "style"; // nom + clause : deux champs, pas du JSON brut
  if (cle === "notes" || cle === "univers") return "libre"; // texte libre, peut être vide
  if ((CLES_NOMBRE as string[]).includes(cle)) return "nombre";
  if ((CLES_TEXTE as string[]).includes(cle)) return "texte";
  if ((CLES_LIGNES as string[]).includes(cle)) return "lignes";
  return "json";
}

/** La valeur d'une section dans le champ d'édition. */
export function versSaisie(cle: string, valeur: unknown): string {
  switch (typeEdition(cle)) {
    case "nombre":
    case "texte":
    case "libre":
      return valeur == null ? "" : String(valeur);
    case "style": {
      const v = (valeur ?? {}) as { nom?: unknown; clause?: unknown };
      return JSON.stringify({ nom: typeof v.nom === "string" ? v.nom : "", clause: typeof v.clause === "string" ? v.clause : "" });
    }
    case "lignes":
      return Array.isArray(valeur) ? valeur.map(String).join("\n") : "";
    default:
      return JSON.stringify(valeur ?? null, null, 2);
  }
}

export type ResultatSaisie = { ok: true; valeur: unknown } | { ok: false; erreur: string };

/** Relit la saisie : le serveur valide ensuite contre le schéma du brief. */
export function depuisSaisie(cle: string, saisie: string): ResultatSaisie {
  switch (typeEdition(cle)) {
    case "nombre": {
      const n = Number(saisie.replace(",", ".").trim());
      if (!Number.isFinite(n) || n <= 0) return { ok: false, erreur: "Un nombre de secondes supérieur à 0." };
      return { ok: true, valeur: Math.round(n) };
    }
    case "texte":
      if (!saisie.trim() && cle !== "genreTon") return { ok: false, erreur: "Ce champ ne peut pas être vide." };
      return { ok: true, valeur: saisie.trim() };
    case "libre":
      return { ok: true, valeur: saisie.trim() };
    case "style": {
      try {
        const v = JSON.parse(saisie) as { nom?: unknown; clause?: unknown };
        return { ok: true, valeur: { nom: String(v.nom ?? "").trim(), clause: String(v.clause ?? "").trim() } };
      } catch {
        return { ok: false, erreur: "Style illisible." };
      }
    }
    case "lignes":
      return { ok: true, valeur: saisie.split("\n").map((l) => l.trim()).filter(Boolean) };
    default:
      try {
        return { ok: true, valeur: JSON.parse(saisie) };
      } catch (e) {
        return { ok: false, erreur: `JSON invalide : ${(e as Error).message}` };
      }
  }
}

export const SYMBOLE_SOUS_TACHE: Record<VueSousTache["statut"], string> = {
  en_attente: "…",
  en_cours: "▶",
  termine: "✓",
  echoue: "✕",
  annulee: "–",
};

/** Ce qu'on dit d'une sous-tâche : file, travail en cours (jetons), résultat, échec, annulation. */
export function libelleEtatSousTache(s: VueSousTache): string {
  switch (s.statut) {
    case "en_attente":
      return `En file · n°${s.positionFile ?? "?"}`;
    case "en_cours":
      return s.progressionJetons != null && s.progressionJetons > 0 ? `En cours · ${s.progressionJetons} jeton${s.progressionJetons > 1 ? "s" : ""}` : "En cours · démarrage…";
    case "termine":
      return `Terminé · ${s.nbChangements} changement${s.nbChangements > 1 ? "s" : ""}`;
    case "echoue":
      return s.erreur ? `Échec : ${s.erreur.slice(0, 120)}` : "Échec";
    default:
      return "Annulée";
  }
}


