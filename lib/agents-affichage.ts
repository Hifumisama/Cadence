import type {
  Avertissement,
  CleSectionBrief,
  CompteursProposition,
  EstimationGeneration,
  EtatTache,
  Etape,
  Position,
  Profondeur,
  RangDeplace,
  SectionBrief,
  StatutChamp,
  TypeAvertissement,
  VueChangement,
  VueGroupe,
} from "./agents/types";

/** Aides d'AFFICHAGE du système d'agents (popup à étapes, revue, brief) : libellés,
 * regroupements, diff lisible. Pures, sans base ni Next : testées dans
 * lib/agents-affichage.test.ts, importables par les composants client. Le serveur fait
 * foi pour les données (compteurs, cochage, avertissements) ; on ne les recalcule pas. */

// ---------------------------------------------------------------------------
// Fil d'étapes
// ---------------------------------------------------------------------------

export const ETAPES_PAR_PROFONDEUR: Record<Profondeur, readonly Etape[]> = {
  courte: ["consigne", "proposition", "applique"],
  complete: ["conversation", "brief", "proposition", "applique"],
};

export const LIBELLE_ETAPE: Record<Etape, string> = {
  consigne: "Consigne",
  conversation: "Conversation",
  brief: "Brief",
  proposition: "Proposition",
  applique: "Appliqué",
};

export type EtatEtape = "faite" | "courante" | "a_venir";
export type EtapeFil = { etape: Etape; libelle: string; etat: EtatEtape; cliquable: boolean };

/** Ramène une étape du serveur à celle que la profondeur connaît (une conversation
 * courte n'a ni conversation ni brief ; une complète n'a pas de consigne). */
export function etapeValide(profondeur: Profondeur, etape: Etape): Etape {
  const etapes = ETAPES_PAR_PROFONDEUR[profondeur];
  if (etapes.includes(etape)) return etape;
  if (etape === "consigne") return etapes[0]!;
  if (etape === "conversation" || etape === "brief") return profondeur === "courte" ? "consigne" : etape;
  return etapes[0]!;
}

/** Le fil : chaque étape est « faite » (avant l'atteinte), « courante » (la vue affichée)
 * ou « à venir ». On peut revenir sur toute étape déjà atteinte ; jamais sauter en avant. */
export function filEtapes(profondeur: Profondeur, atteinte: Etape, affichee: Etape): EtapeFil[] {
  const etapes = ETAPES_PAR_PROFONDEUR[profondeur];
  const iAtteinte = Math.max(0, etapes.indexOf(etapeValide(profondeur, atteinte)));
  const iAffichee = Math.max(0, etapes.indexOf(etapeValide(profondeur, affichee)));
  return etapes.map((etape, i) => ({
    etape,
    libelle: LIBELLE_ETAPE[etape],
    etat: i === iAffichee ? "courante" : i < iAffichee ? "faite" : "a_venir",
    cliquable: i <= iAtteinte && i !== iAffichee,
  }));
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

// ---------------------------------------------------------------------------
// Estimation (cadrage au niveau du bouton « Générer la proposition »)
// ---------------------------------------------------------------------------

export function formaterDureeEstimee(secondes: number): string {
  if (!Number.isFinite(secondes) || secondes <= 0) return "quelques secondes";
  if (secondes < 90) return `~${Math.max(1, Math.round(secondes))} s`;
  return `~${Math.round(secondes / 60)} min`;
}

export function libelleEstimation(e: EstimationGeneration): string {
  const cout = e.coutEstimeUsd == null ? "local : gratuit" : `≈ ${e.coutEstimeUsd.toFixed(2).replace(".", ",")} $`;
  const parts = [
    e.skill ? formaterDureeEstimee(e.dureeEstimeeSecondes) : "construite tout de suite, sans modèle",
    e.skill && e.jetonsEntreeEstimes > 0 ? `${String(Math.round(e.jetonsEntreeEstimes / 100) / 10).replace(".", ",")} k jetons` : null,
    e.skill ? cout : "gratuit",
    e.tachesDevant > 0 ? `${e.tachesDevant} tâche${e.tachesDevant > 1 ? "s" : ""} devant` : e.skill ? "part tout de suite" : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Brief : trois états explicites
// ---------------------------------------------------------------------------

export const ETAT_CHAMP: Record<StatutChamp, { symbole: string; libelle: string; description: string }> = {
  fourni: { symbole: "●", libelle: "Fourni", description: "Dit ou corrigé par toi" },
  deduit: { symbole: "○", libelle: "Déduit", description: "Conclu par l'agent à partir de tes réponses" },
  a_valider: { symbole: "◇", libelle: "À valider", description: "Inventé ou incertain : à relire" },
};

/** Les sections rangées par groupe, dans l'ordre d'apparition (Univers, Style, …). */
export function groupesBrief(sections: SectionBrief[]): { groupe: string; sections: SectionBrief[] }[] {
  const groupes: { groupe: string; sections: SectionBrief[] }[] = [];
  for (const s of sections) {
    const g = groupes.find((x) => x.groupe === s.groupe);
    if (g) g.sections.push(s);
    else groupes.push({ groupe: s.groupe, sections: [s] });
  }
  return groupes;
}

export function decompterStatuts(sections: SectionBrief[]): Record<StatutChamp, number> {
  const n: Record<StatutChamp, number> = { fourni: 0, deduit: 0, a_valider: 0 };
  for (const s of sections) n[s.statut] += 1;
  return n;
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

export type TypeEdition = "nombre" | "texte" | "lignes" | "json";

const CLES_NOMBRE: CleSectionBrief[] = ["dureeEpisodeSecondes"];
const CLES_TEXTE: CleSectionBrief[] = ["titre", "arc", "genreTon", "langueDialogues"];
const CLES_LIGNES: CleSectionBrief[] = ["continuite", "inventions", "questionsOuvertes"];

export function typeEdition(cle: string): TypeEdition {
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
      return valeur == null ? "" : String(valeur);
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

// ---------------------------------------------------------------------------
// Revue
// ---------------------------------------------------------------------------

export const LIBELLE_OPERATION = { creer: "Créer", modifier: "Modifier", supprimer: "Supprimer" } as const;

export const LIBELLE_CIBLE = {
  brief: "Brief",
  projet: "Projet",
  saison: "Saison",
  episode: "Épisode",
  scene: "Scène",
  asset: "Asset",
  plan: "Plan",
} as const;

export type GraviteAvertissement = "info" | "attention" | "bloquant";

export const AVERTISSEMENT: Record<TypeAvertissement, { libelle: string; gravite: GraviteAvertissement }> = {
  ecrase_valide: { libelle: "Écrase un élément validé", gravite: "attention" },
  invention: { libelle: "Invention de l'agent", gravite: "attention" },
  hors_portee: { libelle: "Hors de la portée demandée", gravite: "bloquant" },
  bloque_controle: { libelle: "Bloqué par un contrôle", gravite: "bloquant" },
  contredit_brief: { libelle: "Contredit le brief", gravite: "attention" },
  non_pris_en_charge: { libelle: "Pas encore pris en charge", gravite: "bloquant" },
  info: { libelle: "À noter", gravite: "info" },
};

export const avertissementsDe = (c: Pick<VueChangement, "avertissements">, type: TypeAvertissement): Avertissement[] =>
  c.avertissements.filter((a) => a.type === type);

export const GROUPE_ECRASEMENT = "ecrasement";
export const GROUPE_BRIEF = "brief";

/** Les groupes dans l'ordre de lecture : le risque d'écrasement EN TÊTE, puis les
 * mises à jour du brief, puis le reste dans l'ordre du serveur. */
export function ordonnerGroupes(groupes: VueGroupe[]): VueGroupe[] {
  const rang = (g: VueGroupe) => (g.id === GROUPE_ECRASEMENT ? 0 : g.id === GROUPE_BRIEF ? 1 : 2);
  return groupes
    .map((g, i) => ({ g, i }))
    .sort((a, b) => rang(a.g) - rang(b.g) || a.i - b.i)
    .map((x) => x.g);
}

const cochable = (c: VueChangement) => !c.bloque && c.refuseRaison == null;

export type EtatCochage = "tous" | "aucun" | "partiel" | "indisponible";

/** L'état de la case d'un groupe : sur les seuls changements cochables. */
export function etatCochage(g: Pick<VueGroupe, "changements">): EtatCochage {
  const cochables = g.changements.filter(cochable);
  if (cochables.length === 0) return "indisponible";
  const n = cochables.filter((c) => c.coche).length;
  return n === 0 ? "aucun" : n === cochables.length ? "tous" : "partiel";
}

export const peutCocher = cochable;

/** « 12 sélectionnés · 3 écartés · 1 bloqué · 1 refusé » (les zéros, sauf le premier, sont omis). */
export function resumeCompteurs(c: CompteursProposition): string {
  const pl = (n: number, s: string, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;
  return [
    pl(c.selectionnes, "sélectionné"),
    c.ecartes > 0 ? pl(c.ecartes, "écarté") : null,
    c.bloques > 0 ? pl(c.bloques, "bloqué") : null,
    c.refuses > 0 ? pl(c.refuses, "refusé") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export const two = (n: number): string => String(n).padStart(2, "0");

/** Où un plan est inséré. Le rang affiché (jamais un identifiant, F03) vient de `rangDe`
 * quand l'appelant connaît les plans de l'épisode. */
export function libellePosition(position: Position | null, rangDe?: (planUuid: string) => number | null): string | null {
  if (!position) return null;
  if ("debut" in position) return "Au début de l'épisode";
  if ("fin" in position) return "À la fin de l'épisode";
  const rang = rangDe?.(position.apresPlanUuid) ?? null;
  return rang != null ? `Après le plan ${two(rang)}` : "Après un plan existant";
}

/** « Les plans suivants bougent : 05 → 06, 06 → 07 » ; null s'il n'y en a pas. */
export function libelleRangs(rangs: RangDeplace[], max = 4): string | null {
  if (rangs.length === 0) return null;
  const vus = rangs.slice(0, max).map((r) => `${two(r.rangAvant)} → ${two(r.rangApres)}`);
  return `${rangs.length === 1 ? "Le plan suivant bouge" : "Les plans suivants bougent"} : ${vus.join(", ")}${rangs.length > max ? ", …" : ""}`;
}

// ---------------------------------------------------------------------------
// Diff avant / après
// ---------------------------------------------------------------------------

export type LigneDiff = { cle: string | null; avant: string | null; apres: string | null; etat: "ajoute" | "retire" | "modifie" };

const stable = (v: unknown): string => JSON.stringify(v ?? null);

/** Un avant/après lisible : champ par champ pour deux objets, sinon une seule ligne.
 * Ne garde que ce qui change ; `identiques` compte ce qui reste pareil. */
export function lignesDiff(avant: unknown, apres: unknown): { lignes: LigneDiff[]; identiques: number } {
  const lignes: LigneDiff[] = [];
  let identiques = 0;
  const vide = (v: unknown) => v === null || v === undefined;

  if (vide(avant) && vide(apres)) return { lignes, identiques };

  if (vide(avant)) {
    if (estObjet(apres)) {
      for (const [k, v] of Object.entries(apres)) lignes.push({ cle: k, avant: null, apres: valeurEnTexte(v), etat: "ajoute" });
    } else lignes.push({ cle: null, avant: null, apres: valeurEnTexte(apres), etat: "ajoute" });
    return { lignes, identiques };
  }
  if (vide(apres)) {
    if (estObjet(avant)) {
      for (const [k, v] of Object.entries(avant)) lignes.push({ cle: k, avant: valeurEnTexte(v), apres: null, etat: "retire" });
    } else lignes.push({ cle: null, avant: valeurEnTexte(avant), apres: null, etat: "retire" });
    return { lignes, identiques };
  }

  if (estObjet(avant) && estObjet(apres)) {
    const cles = [...new Set([...Object.keys(avant), ...Object.keys(apres)])];
    for (const k of cles) {
      const a = avant[k];
      const b = apres[k];
      if (stable(a) === stable(b)) {
        identiques += 1;
        continue;
      }
      lignes.push({
        cle: k,
        avant: vide(a) ? null : valeurEnTexte(a),
        apres: vide(b) ? null : valeurEnTexte(b),
        etat: vide(a) ? "ajoute" : vide(b) ? "retire" : "modifie",
      });
    }
    return { lignes, identiques };
  }

  if (stable(avant) === stable(apres)) return { lignes, identiques: 1 };
  lignes.push({ cle: null, avant: valeurEnTexte(avant), apres: valeurEnTexte(apres), etat: "modifie" });
  return { lignes, identiques };
}
