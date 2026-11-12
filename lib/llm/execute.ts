import { createHash } from "node:crypto";
import { corpsPourSkill, creerFournisseur, maxTokensPourSkill, modelePourSkill, type Env } from "./config";
import { chargerSkill } from "./skills";
import { enregistrerTrace, type EnregistreurTrace, type StatutTrace, type TraceAEnregistrer } from "./traces";
import { valider } from "./validation";
import { ErreurLlm, messagesSansImages, type DemandeLlm, type FournisseurLlm, type MessageLlm, type ReponseLlm } from "./types";

/** Default output limit: a brief or a plan fits comfortably; a cap avoids a generation that never stops. */
const MAX_TOKENS_PAR_DEFAUT = 16384;

export type OptionsExecution = {
  fournisseur?: FournisseurLlm;
  /** Forced model; otherwise `LLM_MODELE_<SKILL>` then `LLM_LOCAL_MODELE`. */
  modele?: string;
  projectId?: number | null;
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
  /** Automatic resends after an output off the schema (1 by default, 0 = none). */
  maxRenvois?: number;
  surProgres?: (jetonsSortie: number) => void;
  /** Text as the stream flows (see `DemandeLlm.surFlux`). */
  surFlux?: DemandeLlm["surFlux"];
  /** `false`: do not constrain the output server side (comparison, diagnosis);
   * validation against the schema is still done. `true` by default. */
  contrainte?: boolean;
  /** Logging: `enregistrerTrace` (database) by default; `null` to disable. */
  enregistrer?: EnregistreurTrace | null;
  env?: Env;
  racine?: string;
  /** Skill variant: restricts the guides loaded (see lib/llm/skills.ts). */
  variante?: string;
  /** Semantic check of an output VALID against the schema (see lib/llm/checks.ts): its list of
   * errors triggers a resend (within the limit of `maxRenvois`); if they persist, the output is kept. */
  controler?: (json: unknown) => string[];
  /** Fields added to the request body; otherwise `LLM_CORPS_<SKILL>` / `LLM_CORPS` (see config.ts). */
  corps?: Record<string, unknown>;
};

export type ResultatSkill = {
  /** The JSON output, validated against the skill's schema. */
  json: unknown;
  reponse: ReponseLlm;
  /** Cumulative calls (any resend counts). */
  usage: { entree: number; sortie: number };
  dureeMs: number;
  renvois: number;
  modele: string;
  skill: { nom: string; caracteres: number; jetonsEstimes: number };
};

/** An input can be a text, an object (serialized as readable JSON) or a conversation already in messages — whose content can be mixed (text + images,
 * see `PartieContenu`): this is the route for a contact sheet of thumbnails. */
export function versMessages(entree: string | object | MessageLlm[]): MessageLlm[] {
  if (typeof entree === "string") return [{ role: "user", content: entree }];
  if (Array.isArray(entree)) return entree as MessageLlm[];
  return [{ role: "user", content: JSON.stringify(entree) }];
}

export function messageDeRenvoi(erreurs: string[]): string {
  return [
    "Ta réponse ne respecte pas le schéma de sortie. Erreurs relevées :",
    ...erreurs.map((e) => `- ${e}`),
    "",
    "Renvoie UNIQUEMENT le JSON complet corrigé, conforme au schéma, sans texte autour.",
  ].join("\n");
}

type Analyse = { ok: true; json: unknown } | { ok: false; erreurs: string[] };

function analyser(rep: ReponseLlm, schema: Record<string, unknown>): Analyse {
  const erreurs: string[] = [];
  if (rep.arret === "length") erreurs.push("Sortie tronquée : la limite de jetons a été atteinte avant la fin du JSON. Écris plus court.");
  let json: unknown = rep.json;
  if (json === undefined) {
    try {
      json = JSON.parse(rep.texte.trim());
    } catch (e) {
      erreurs.push(`La réponse n'est pas du JSON valide (${(e as Error).message}).`);
      return { ok: false, erreurs };
    }
  }
  if (erreurs.length) return { ok: false, erreurs };
  const v = valider(schema, json);
  return v.ok ? { ok: true, json } : { ok: false, erreurs: v.erreurs };
}

/** Runs an agent skill: loading → call → validation (one corrected resend
 * if needed) → trace. The JSON is NEVER silently repaired: off the schema after
 * the resend, it is an `ErreurLlm('sortie_invalide')` carrying the errors. */
export async function executerSkill(
  nomSkill: string,
  entree: string | object | MessageLlm[],
  options: OptionsExecution = {},
): Promise<ResultatSkill> {
  const env = options.env ?? process.env;
  const skill = chargerSkill(nomSkill, options.racine, { variante: options.variante });
  const fournisseur = options.fournisseur ?? creerFournisseur(env);
  const modele = options.modele ?? modelePourSkill(nomSkill, env);
  const messages = versMessages(entree);
  const maxRenvois = options.maxRenvois ?? 1;
  const enregistrer = options.enregistrer === undefined ? enregistrerTrace : options.enregistrer;

  let courants = messages;
  let renvois = 0;
  const usage = { entree: 0, sortie: 0 };
  // Server measurements (llama.cpp) accumulated over the resends: tokens reused from the cache / prefilled; null as long as the server does not provide them.
  let cache = null as { repris: number; prefill: number } | null;
  let dureeMs = 0;
  let derniere: ReponseLlm | null = null;
  const reflexions: string[] = [];
  let erreursValidation: string[] | null = null;
  let statut: StatutTrace = "echoue";
  let erreur: string | null = null;
  let json: unknown = null;

  try {
    for (;;) {
      const rep = await fournisseur.generer({
        systeme: skill.systeme,
        messages: courants,
        schemaSortie: options.contrainte === false ? undefined : skill.schema,
        modele,
        maxTokens: options.maxTokens ?? maxTokensPourSkill(nomSkill, env) ?? MAX_TOKENS_PAR_DEFAUT,
        corps: options.corps ?? corpsPourSkill(nomSkill, env),
        temperature: options.temperature,
        signal: options.signal,
        surProgres: options.surProgres,
        surFlux: options.surFlux,
      });
      derniere = rep;
      if (rep.reflexion) reflexions.push(rep.reflexion);
      usage.entree += rep.usage.entree;
      usage.sortie += rep.usage.sortie;
      dureeMs += rep.dureeMs;
      if (rep.timings) cache = { repris: (cache?.repris ?? 0) + rep.timings.cacheN, prefill: (cache?.prefill ?? 0) + rep.timings.promptN };

      const a = analyser(rep, skill.schema);
      // Output valid against the schema: a semantic check can still request ONE resend.
      if (a.ok && options.controler && renvois < maxRenvois) {
        const soucis = options.controler(a.json);
        if (soucis.length > 0) {
          erreursValidation = soucis;
          renvois += 1;
          courants = [...messages, { role: "assistant", content: rep.texte }, { role: "user", content: messageDeRenvoi(soucis) }];
          continue;
        }
      }
      if (a.ok) {
        statut = "ok";
        json = a.json;
        erreursValidation = null;
        return {
          json: a.json,
          reponse: rep,
          usage,
          dureeMs,
          renvois,
          modele: rep.modele,
          skill: { nom: skill.nom, caracteres: skill.caracteres, jetonsEstimes: skill.jetonsEstimes },
        };
      }
      erreursValidation = a.erreurs;
      if (renvois >= maxRenvois) {
        statut = "invalide";
        erreur = `Sortie hors schéma après ${renvois} renvoi(s) : ${a.erreurs.slice(0, 3).join(" ; ")}`;
        throw new ErreurLlm("sortie_invalide", erreur, { erreurs: a.erreurs, texte: rep.texte });
      }
      renvois += 1;
      courants = [...messages, { role: "assistant", content: rep.texte }, { role: "user", content: messageDeRenvoi(a.erreurs) }];
    }
  } catch (e) {
    if (statut !== "invalide") {
      statut = e instanceof ErreurLlm && e.code === "interrompu" ? "interrompu" : "echoue";
      erreur = (e as Error).message;
    }
    throw e;
  } finally {
    if (enregistrer) {
      const trace: TraceAEnregistrer = {
        skill: skill.nom,
        fournisseur: fournisseur.nom,
        modele: derniere?.modele ?? modele,
        statut,
        projectId: options.projectId ?? null,
        // Images (contact sheet of thumbnails) are replaced by a marker: never base64 in the database.
        messages: messagesSansImages(messages),
        systemeEmpreinte: createHash("sha256").update(skill.systeme).digest("hex"),
        systemeCaracteres: skill.caracteres,
        sortieBrute: derniere?.texte ?? null,
        // A resend = a new reasoning: we keep them all, separated.
        reflexion: reflexions.length ? reflexions.join("\n\n--- renvoi ---\n\n") : null,
        json: statut === "ok" ? json : null,
        erreursValidation,
        erreur,
        renvois,
        tokensEntree: usage.entree,
        tokensSortie: usage.sortie,
        tokensCache: cache?.repris ?? null,
        tokensPrefill: cache?.prefill ?? null,
        dureeMs,
      };
      // A trace that cannot be written must never hide the LLM's result (nor its error).
      await enregistrer(trace).catch((err) => console.warn("[llm] trace non enregistrée :", (err as Error).message));
    }
  }
}
