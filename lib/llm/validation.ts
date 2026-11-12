import Ajv2020 from "ajv/dist/2020";
import type { ValidateFunction } from "ajv/dist/2020";

/** The skills' `sortie.schema.json` are in JSON Schema draft 2020-12
 * (`$schema` noted on all six). Ajv 8 handles it via `ajv/dist/2020`. `strict`
 * is relaxed: the schemas carry annotation keywords (`description`,
 * `title`) and we do not want an unknown word to prevent validation. */
const ajv = new Ajv2020({ allErrors: true, strict: false });
const cache = new WeakMap<object, ValidateFunction>();

export function compilerSchema(schema: Record<string, unknown>): ValidateFunction {
  let v = cache.get(schema);
  if (!v) {
    v = ajv.compile(schema);
    cache.set(schema, v);
  }
  return v;
}

export type ResultatValidation = { ok: true } | { ok: false; erreurs: string[] };

const MAX_ERREURS = 20;

/** Validates a value against a schema; the errors are readable by a human
 * AND by the model (they are sent back to it in the automatic resend). */
export function valider(schema: Record<string, unknown>, valeur: unknown): ResultatValidation {
  const v = compilerSchema(schema);
  if (v(valeur)) return { ok: true };
  const erreurs = (v.errors ?? []).slice(0, MAX_ERREURS).map((e) => {
    const chemin = e.instancePath || "(racine)";
    const extra = e.params && "additionalProperty" in e.params ? ` « ${String(e.params.additionalProperty)} »` : "";
    return `${chemin} : ${e.message ?? "invalide"}${extra}`;
  });
  if ((v.errors?.length ?? 0) > MAX_ERREURS) erreurs.push(`… et ${(v.errors?.length ?? 0) - MAX_ERREURS} autre(s) erreur(s).`);
  return { ok: false, erreurs };
}
