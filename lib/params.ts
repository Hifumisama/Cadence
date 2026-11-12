import { db } from "../db";
import { parametres } from "../db/schema";


// Default values if the table has not yet been seeded — see
// docs/FRICTIONS.md F03/F04 for the origin of each ceiling. clause_style
// and the scenario_* moved to `projects` on 2026-09-28, then became
// copies of the BRIEF on 2026-10-02 (single source) — see db/schema.ts.
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
