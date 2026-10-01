import Ajv2020 from "ajv/dist/2020";
import type { ValidateFunction } from "ajv/dist/2020";

/** Les `sortie.schema.json` des skills sont en JSON Schema draft 2020-12
 * (`$schema` relevé sur les six). Ajv 8 le gère via `ajv/dist/2020`. `strict`
 * est relâché : les schémas portent des mots-clés d'annotation (`description`,
 * `title`) et on ne veut pas qu'un mot inconnu empêche la validation. */
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

/** Valide une valeur contre un schéma ; les erreurs sont lisibles par un humain
 * ET par le modèle (elles lui sont renvoyées au renvoi automatique). */
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
