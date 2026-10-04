import { createHash } from "node:crypto";
import { corpsPourSkill, creerFournisseur, maxTokensPourSkill, modelePourSkill, type Env } from "./config";
import { chargerSkill } from "./skills";
import { enregistrerTrace, type EnregistreurTrace, type StatutTrace, type TraceAEnregistrer } from "./traces";
import { valider } from "./validation";
import { ErreurLlm, messagesSansImages, type DemandeLlm, type FournisseurLlm, type MessageLlm, type ReponseLlm } from "./types";

/** Limite de sortie par défaut : un brief ou un plan tient largement, un plafond
 * évite une génération qui ne s'arrête pas. */
export const MAX_TOKENS_PAR_DEFAUT = 16384;

export type OptionsExecution = {
  fournisseur?: FournisseurLlm;
  /** Modèle forcé ; sinon `LLM_MODELE_<SKILL>` puis `LLM_LOCAL_MODELE`. */
  modele?: string;
  projectId?: number | null;
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
  /** Renvois automatiques après une sortie hors schéma (1 par défaut, 0 = aucun). */
  maxRenvois?: number;
  surProgres?: (jetonsSortie: number) => void;
  /** Texte au fil du flux (voir `DemandeLlm.surFlux`). */
  surFlux?: DemandeLlm["surFlux"];
  /** `false` : ne pas contraindre la sortie côté serveur (comparaison, diagnostic) ;
   * la validation contre le schéma reste faite. `true` par défaut. */
  contrainte?: boolean;
  /** Journalisation : `enregistrerTrace` (base) par défaut ; `null` pour désactiver. */
  enregistrer?: EnregistreurTrace | null;
  env?: Env;
  racine?: string;
  /** Variante de skill : restreint les guides chargés (voir lib/llm/skills.ts). */
  variante?: string;
  /** Contrôle sémantique d'une sortie VALIDE contre le schéma (voir lib/llm/controles.ts) : la liste de ses
   * erreurs déclenche un renvoi (dans la limite de `maxRenvois`) ; si elles persistent, la sortie est gardée. */
  controler?: (json: unknown) => string[];
  /** Champs ajoutés au corps de la requête ; sinon `LLM_CORPS_<SKILL>` / `LLM_CORPS` (voir config.ts). */
  corps?: Record<string, unknown>;
};

export type ResultatSkill = {
  /** Le JSON de sortie, validé contre le schéma du skill. */
  json: unknown;
  reponse: ReponseLlm;
  /** Cumul des appels (le renvoi éventuel compte). */
  usage: { entree: number; sortie: number };
  dureeMs: number;
  renvois: number;
  modele: string;
  skill: { nom: string; caracteres: number; jetonsEstimes: number };
};

/** Une entrée peut être un texte, un objet (sérialisé en JSON lisible) ou une
 * conversation déjà en messages — dont le contenu peut être mixte (texte + images,
 * voir `PartieContenu`) : c'est la voie pour une planche de vignettes. */
export function versMessages(entree: string | object | MessageLlm[]): MessageLlm[] {
  if (typeof entree === "string") return [{ role: "user", content: entree }];
  if (Array.isArray(entree)) return entree as MessageLlm[];
  return [{ role: "user", content: JSON.stringify(entree, null, 2) }];
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

/** Exécute un skill d'agent : chargement → appel → validation (un renvoi corrigé
 * si besoin) → trace. Le JSON n'est JAMAIS réparé en silence : hors schéma après
 * le renvoi, c'est une `ErreurLlm('sortie_invalide')` qui porte les erreurs. */
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
  let dureeMs = 0;
  let derniere: ReponseLlm | null = null;
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
      usage.entree += rep.usage.entree;
      usage.sortie += rep.usage.sortie;
      dureeMs += rep.dureeMs;

      const a = analyser(rep, skill.schema);
      // Sortie valide contre le schéma : un contrôle sémantique peut encore demander UN renvoi.
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
        // Les images (planche de vignettes) sont remplacées par un marqueur : jamais de base64 en base.
        messages: messagesSansImages(messages),
        systemeEmpreinte: createHash("sha256").update(skill.systeme).digest("hex"),
        systemeCaracteres: skill.caracteres,
        sortieBrute: derniere?.texte ?? null,
        json: statut === "ok" ? json : null,
        erreursValidation,
        erreur,
        renvois,
        tokensEntree: usage.entree,
        tokensSortie: usage.sortie,
        dureeMs,
      };
      // Une trace qui ne s'écrit pas ne doit jamais masquer le résultat (ni l'erreur) du LLM.
      await enregistrer(trace).catch((err) => console.warn("[llm] trace non enregistrée :", (err as Error).message));
    }
  }
}
