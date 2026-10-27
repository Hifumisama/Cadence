import { db } from "../db";
import { parametres } from "../db/schema";
import { eq } from "drizzle-orm";

// Valeurs par défaut si la table n'a pas encore été seedée — voir
// docs/FRICTIONS.md F03/F04 pour l'origine de chaque plafond. clause_style
// et les scenario_* ont migré sur `projects` le 2026-09-28, puis sont devenus des
// copies du BRIEF le 2026-10-02 (source unique) — voir db/schema.ts.
const DEFAULTS: {
  fps_defaut: string;
  duree_plafond_secondes: string;
  marge_respiration_secondes: string;
  tentatives_max: string;
} = {
  fps_defaut: "24",
  duree_plafond_secondes: "10",
  marge_respiration_secondes: "1",
  tentatives_max: "2",
};

export type Parametres = { [K in keyof typeof DEFAULTS]: string };

export async function getAllParams(): Promise<Parametres> {
  const rows = await db.select().from(parametres);
  const map = new Map(rows.map((r) => [r.cle, r.valeur]));
  const resultat = { ...DEFAULTS };
  for (const cle of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    const valeur = map.get(cle);
    if (valeur !== undefined) resultat[cle] = valeur;
  }
  return resultat;
}
