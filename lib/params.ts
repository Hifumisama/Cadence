import { db } from "../db";
import { parametres } from "../db/schema";
import { eq } from "drizzle-orm";

// Valeurs par défaut si la table n'a pas encore été seedée — voir
// docs/FRICTIONS.md F03/F04 pour l'origine de chaque plafond. clause_style
// et les scenario_* ont migré sur `projects` le 2026-09-28 (réglages propres
// à une histoire, pas des constantes du pipeline) — voir db/schema.ts.
const DEFAULTS: {
  fps_defaut: string;
  duree_plafond_secondes: string;
  marge_respiration_secondes: string;
  tentatives_max: string;
} = {
  fps_defaut: "24",
  duree_plafond_secondes: "15",
  marge_respiration_secondes: "1",
  tentatives_max: "2",
};

export type Parametres = { [K in keyof typeof DEFAULTS]: string };

export async function getParam(cle: keyof typeof DEFAULTS): Promise<string> {
  const rows = await db.select().from(parametres).where(eq(parametres.cle, cle)).limit(1);
  return rows[0]?.valeur ?? DEFAULTS[cle];
}

export async function setParam(cle: keyof typeof DEFAULTS, valeur: string): Promise<void> {
  await db
    .insert(parametres)
    .values({ cle, valeur })
    .onConflictDoUpdate({ target: parametres.cle, set: { valeur } });
}

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
