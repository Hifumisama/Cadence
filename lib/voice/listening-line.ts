/** The LISTENING LINE of a voice: the text that the reference voice reads at generation (Qwen3-TTS Voice Design), the one we listen back to
 * to judge the timbre. Written on demand, WITHOUT agent skill: a simple prompt, built in here, sent to the already configured LLM provider
 * (lib/llm/). It fits the character's personality, is at least two sentences and is written in the voice's language
 * (the voice sheet's language, the engine's English name: lib/voice/languages-tts.ts).
 *
 * No access to the database or disk: the pure parts (prompt, cleanup, fallback) are testable; the model call takes its
 * provider as a parameter. */

import { CORPS_SANS_REFLEXION, creerFournisseur } from "../llm/config";
import type { FournisseurLlm } from "../llm/types";
import { langueFicheVoix } from "./languages-tts";
import { TEXTE_REFERENCE_DEFAUT } from "./voice";

/** What we know about the voice and its character. Everything is optional except the language. */
export type ContexteRepliqueEcoute = {
  /** Language of the voice (sheet): « French », « English »… Normalised here. */
  langue: string;
  /** Character description (age, bearing, temperament) or, failing that, the canonical description of the timbre. */
  caractere?: string | null;
  /** The timbre instruction (Voice Design), in English: the expected tone can be read from it. */
  instruction?: string | null;
  /** Role when there is no character (voice-over, narrator). */
  role?: string | null;
};

export type RepliqueEcoute = {
  texte: string;
  /** Language in which the text is written (engine's English name). May differ from that of the voice for a fallback text. */
  langue: string;
  /** « modele »: written by the LLM; « repli »: fixed text (model unreachable or unusable output). */
  source: "modele" | "repli";
};

/** Fallback texts, per engine language: neutral, in two sentences. Used if the model does not respond. */
const REPLIS: Record<string, string> = {
  French: "Bonjour, ravi de vous voir ici. Installez-vous, prenez le temps, et dites-moi ce qui vous amène.",
  English: TEXTE_REFERENCE_DEFAUT, // the same text: langueDuTexteDeReference recognises it and sends « English »
};

export function repliqueDeRepli(langue: string): RepliqueEcoute {
  const l = langueFicheVoix(langue);
  const texte = REPLIS[l];
  return texte ? { texte, langue: l, source: "repli" } : { texte: REPLIS.English!, langue: "English", source: "repli" };
}

export const SYSTEME_REPLIQUE_ECOUTE = [
  "You write a short line of dialogue that a character says out loud, so that a listener can judge the character's voice.",
  "Rules:",
  "- Write 2 or 3 complete sentences, 25 to 55 words in total.",
  "- First person, in the character's own manner of speaking: vocabulary, rhythm and attitude must fit the character description.",
  "- Plain, factual and self-contained: no plot, no names the listener would not know, no emotional outburst. The voice must be able to say it calmly.",
  "- Natural spoken language, with normal punctuation. No stage directions, no brackets, no emojis, no quotation marks around the line.",
  "- Write the line ONLY in the requested language.",
  "- Answer with the line alone: no title, no explanation.",
].join("\n");

/** The message sent to the model. Pure. */
export function messageRepliqueEcoute(c: ContexteRepliqueEcoute): string {
  const langue = langueFicheVoix(c.langue);
  const lignes = [`Language of the line: ${langue === "Auto" ? "the language of the character description" : langue}`];
  if (c.caractere?.trim()) lignes.push(`Character: ${c.caractere.trim()}`);
  else if (c.role?.trim()) lignes.push(`Role: ${c.role.trim()}`);
  if (c.instruction?.trim()) lignes.push(`Voice (timbre and delivery): ${c.instruction.trim()}`);
  if (lignes.length === 1) lignes.push("Character: not described; write a neutral, warm line of a calm speaker.");
  return lignes.join("\n");
}

/** Number of sentences (separated by . ! ? … followed by a space or the end). */
export function nombrePhrases(texte: string): number {
  return texte.split(/(?<=[.!?…。！？])["»”)]*\s+/u).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
}

/** Cleans the model's output: removes any reasoning, the quotes, the markdown, a « Line : » prefix; collapses the
 * spaces. Returns an empty string if nothing is usable. */
export function nettoyerRepliqueEcoute(brut: string): string {
  let t = brut.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```[a-z]*\n?|```/gi, "");
  t = t.replace(/^\s*(?:line|réplique|replique|texte|text)\s*:\s*/i, "");
  t = t.replace(/[*_#>`]+/g, "").replace(/\s+/g, " ").trim();
  // Quotes around the whole line (straight, curly, French).
  t = t.replace(/^["“”«»'‘’]+\s*/, "").replace(/\s*["“”«»'‘’]+$/, "");
  return t.trim();
}

const MAX_CARACTERES = 500;

export type OptionsRepliqueEcoute = { fournisseur?: FournisseurLlm; modele?: string; signal?: AbortSignal };

/** Writes the listening line with the configured LLM. A single sentence is sent back to the model once; if the model is unreachable
 * or gives nothing usable, the language's fallback text (never an error for that: the text remains editable). */
export async function ecrireRepliqueEcoute(c: ContexteRepliqueEcoute, options: OptionsRepliqueEcoute = {}): Promise<RepliqueEcoute> {
  const langue = langueFicheVoix(c.langue);
  try {
    const fournisseur = options.fournisseur ?? creerFournisseur();
    let meilleur = "";
    const message = messageRepliqueEcoute(c);
    for (let essai = 0; essai < 2; essai++) {
      const rep = await fournisseur.generer({
        systeme: SYSTEME_REPLIQUE_ECOUTE,
        messages: [{ role: "user", content: essai === 0 ? message : `${message}\n\nThe line must have at least 2 complete sentences.` }],
        modele: options.modele,
        maxTokens: 400,
        temperature: 0.8,
        corps: CORPS_SANS_REFLEXION,
        signal: options.signal,
      });
      const texte = nettoyerRepliqueEcoute(rep.texte).slice(0, MAX_CARACTERES);
      if (nombrePhrases(texte) > nombrePhrases(meilleur) || (texte && !meilleur)) meilleur = texte;
      if (nombrePhrases(meilleur) >= 2) break;
    }
    if (meilleur) return { texte: meilleur, langue, source: "modele" };
  } catch (e) {
    if (options.signal?.aborted) throw e;
    console.warn("[replique-ecoute] modèle indisponible, texte de repli :", (e as Error).message);
  }
  return repliqueDeRepli(langue);
}
