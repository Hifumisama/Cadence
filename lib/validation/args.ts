import { z } from "zod";

/** Validation of the arguments of a server action. They come from the browser: the TypeScript types of an action are not checked at run time,
 * so a wrong id, a missing string or an absurdly long text would reach the database. One call at the top of the action. */

/** An internal id (positive integer). */
export const idSchema = z.number().int().positive();
/** A public identifier (`uuid` column). */
export const uuidSchema = z.string().uuid();
/** A free text with a ceiling (an instruction, a title, a description). */
export const texteSchema = (max = 20_000) => z.string().max(max);

const message = (erreur: z.ZodError): string =>
  `Requête invalide : ${erreur.issues.map((i) => `${i.path.length ? i.path.join(".") : "valeur"} (${i.message})`).join(", ")}`;

/** For an action that throws on error: returns the parsed value or throws a readable Error. */
export function exiger<S extends z.ZodType>(schema: S, valeur: unknown): z.infer<S> {
  const r = schema.safeParse(valeur);
  if (!r.success) throw new Error(message(r.error));
  return r.data;
}

/** For an action that returns `{ ok: false, erreur }` on error. */
export function verifier<S extends z.ZodType>(schema: S, valeur: unknown): { ok: true; data: z.infer<S> } | { ok: false; erreur: string } {
  const r = schema.safeParse(valeur);
  return r.success ? { ok: true, data: r.data } : { ok: false, erreur: message(r.error) };
}
