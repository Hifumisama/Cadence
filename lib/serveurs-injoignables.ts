import { inArray } from "drizzle-orm";
import { db } from "../db";
import { parametres } from "../db/schema";
import type { ServeursInjoignables } from "./serveurs-injoignables-types";

/** Lecture de l'état noté par le worker (voir worker/disponibilite.ts). */
export async function lireServeursInjoignables(): Promise<ServeursInjoignables> {
  const rows = await db.select().from(parametres).where(inArray(parametres.cle, ["injoignable_llm", "injoignable_comfyui"]));
  const v = new Map(rows.map((r) => [r.cle, r.valeur]));
  return { llm: v.get("injoignable_llm") ?? null, comfyui: v.get("injoignable_comfyui") ?? null };
}
