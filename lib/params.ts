import { db } from "../db";
import { parametres } from "../db/schema";
import { eq } from "drizzle-orm";

// Valeurs par défaut si la table n'a pas encore été seedée — voir
// docs/FRICTIONS.md F03/F04 pour l'origine de chaque plafond.
const DEFAULTS: {
  clause_style: string;
  fps_defaut: string;
  duree_plafond_secondes: string;
  marge_respiration_secondes: string;
  tentatives_max: string;
  scenario_arc: string;
  scenario_style: string;
  scenario_continuite: string;
  scenario_rimes: string;
  scenario_pieges: string;
} = {
  clause_style: "Cinematic anime illustration, refined linework, sophisticated cinematic lighting, atmospheric depth, polished digital rendering, in the visual tradition of Makoto Shinkai and Yoshiyuki Sadamoto.",
  fps_defaut: "24",
  duree_plafond_secondes: "15",
  marge_respiration_secondes: "1",
  tentatives_max: "2",
  // Globaux du scénario (skill `scenario`, sections "Le monde"/"Les rimes"/
  // "Les pièges") — un seul jeu de valeurs pour toute la série, pas par plan.
  scenario_arc: "",
  scenario_style: "",
  scenario_continuite: "",
  scenario_rimes: "",
  scenario_pieges: "",
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
