import type {
  CleSectionBrief,
  EtatTache,
  Etape,
  Profondeur,
  VueSousTache,
} from "./types";

/** Display helpers for the agent system (step-by-step popup, review, brief): labels,
 * groupings, readable diff. Pure, with no database or Next: tested in
 * lib/agents/agents-display.test.ts, importable by client components. The server is the
 * source of truth for data (counters, ticking, warnings); we do not recompute them. */

// ---------------------------------------------------------------------------
// Step strip
// ---------------------------------------------------------------------------

const ETAPES_PAR_PROFONDEUR: Record<Profondeur, readonly Etape[]> = {
  courte: ["consigne", "proposition", "applique"],
  complete: ["conversation", "brief", "proposition", "applique"],
};

/** Maps a server step to one the depth knows (a short conversation has neither
 * conversation nor brief; a complete one has no instruction step). */
export function etapeValide(profondeur: Profondeur, etape: Etape): Etape {
  const etapes = ETAPES_PAR_PROFONDEUR[profondeur];
  if (etapes.includes(etape)) return etape;
  if (etape === "consigne") return etapes[0]!;
  if (etape === "conversation" || etape === "brief") return profondeur === "courte" ? "consigne" : etape;
  return etapes[0]!;
}

// ---------------------------------------------------------------------------
// Tasks (conversation turn, brief, proposal)
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

/** What we say about an agent task: queue, work in progress (with the token counter,
 * the maximum is unknown), failure or cancellation. Null when there is nothing to say. */
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

/** A JSON value as readable text (brief and diff display). Arrays of
 * strings → one line per item; objects → "key: value"; never raw JSON
 * except for an object nested three levels deep. */
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
  if (cle === "style") return "style"; // name + clause: two fields, not raw JSON
  if (cle === "notes" || cle === "univers") return "libre"; // free text, may be empty
  if ((CLES_NOMBRE as string[]).includes(cle)) return "nombre";
  if ((CLES_TEXTE as string[]).includes(cle)) return "texte";
  if ((CLES_LIGNES as string[]).includes(cle)) return "lignes";
  return "json";
}

/** A section's value in the edit field. */
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

/** Reads the input back: the server then validates it against the brief schema. */
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

/** What we say about a subtask: queue, work in progress (tokens), result, failure, cancellation. */
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


