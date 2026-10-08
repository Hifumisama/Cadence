/** La RÉPLIQUE D'ÉCOUTE d'une voix : le texte que la voix de référence lit à la génération (Qwen3-TTS Voice Design), celui qu'on réécoute
 * pour juger le timbre. Écrite à la demande, SANS skill d'agent : un prompt simple, intégré ici, envoyé au fournisseur LLM déjà
 * configuré (lib/llm/). Elle tient au caractère du personnage, fait au moins deux phrases et est écrite dans la langue de la voix
 * (la langue de la fiche de voix, nom anglais du moteur : lib/langues-tts.ts).
 *
 * Pas d'accès à la base ni au disque : les parties pures (prompt, nettoyage, repli) sont testables ; l'appel au modèle prend son
 * fournisseur en paramètre. */

import { CORPS_SANS_REFLEXION, creerFournisseur } from "./llm/config";
import type { FournisseurLlm } from "./llm/types";
import { langueFicheVoix } from "./langues-tts";
import { TEXTE_REFERENCE_DEFAUT } from "./voix";

/** Ce qu'on sait de la voix et de son personnage. Tout est facultatif sauf la langue. */
export type ContexteRepliqueEcoute = {
  /** Langue de la voix (fiche) : « French », « English »… Normalisée ici. */
  langue: string;
  /** Description du personnage (âge, allure, caractère) ou, à défaut, la description canonique du timbre. */
  caractere?: string | null;
  /** L'instruction de timbre (Voice Design), en anglais : le ton attendu s'y lit. */
  instruction?: string | null;
  /** Rôle quand il n'y a pas de personnage (voix off, narrateur). */
  role?: string | null;
};

export type RepliqueEcoute = {
  texte: string;
  /** Langue dans laquelle le texte est écrit (nom anglais du moteur). Peut différer de celle de la voix pour un texte de repli. */
  langue: string;
  /** « modele » : écrite par le LLM ; « repli » : texte fixe (modèle injoignable ou sortie inutilisable). */
  source: "modele" | "repli";
};

/** Textes de repli, par langue du moteur : neutres, en deux phrases. Utilisés si le modèle ne répond pas. */
const REPLIS: Record<string, string> = {
  French: "Bonjour, ravi de vous voir ici. Installez-vous, prenez le temps, et dites-moi ce qui vous amène.",
  English: TEXTE_REFERENCE_DEFAUT, // le même texte : langueDuTexteDeReference le reconnaît et envoie « English »
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

/** Le message envoyé au modèle. Pur. */
export function messageRepliqueEcoute(c: ContexteRepliqueEcoute): string {
  const langue = langueFicheVoix(c.langue);
  const lignes = [`Language of the line: ${langue === "Auto" ? "the language of the character description" : langue}`];
  if (c.caractere?.trim()) lignes.push(`Character: ${c.caractere.trim()}`);
  else if (c.role?.trim()) lignes.push(`Role: ${c.role.trim()}`);
  if (c.instruction?.trim()) lignes.push(`Voice (timbre and delivery): ${c.instruction.trim()}`);
  if (lignes.length === 1) lignes.push("Character: not described; write a neutral, warm line of a calm speaker.");
  return lignes.join("\n");
}

/** Nombre de phrases (séparées par . ! ? … suivis d'un espace ou de la fin). */
export function nombrePhrases(texte: string): number {
  return texte.split(/(?<=[.!?…。！？])["»”)]*\s+/u).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;
}

/** Nettoie la sortie du modèle : retire une éventuelle réflexion, les guillemets, le markdown, un préfixe « Line : »; replie les
 * espaces. Renvoie une chaîne vide si rien d'utilisable. */
export function nettoyerRepliqueEcoute(brut: string): string {
  let t = brut.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```[a-z]*\n?|```/gi, "");
  t = t.replace(/^\s*(?:line|réplique|replique|texte|text)\s*:\s*/i, "");
  t = t.replace(/[*_#>`]+/g, "").replace(/\s+/g, " ").trim();
  // Guillemets autour de toute la ligne (droits, courbes, français).
  t = t.replace(/^["“”«»'‘’]+\s*/, "").replace(/\s*["“”«»'‘’]+$/, "");
  return t.trim();
}

const MAX_CARACTERES = 500;

export type OptionsRepliqueEcoute = { fournisseur?: FournisseurLlm; modele?: string; signal?: AbortSignal };

/** Écrit la réplique d'écoute avec le LLM configuré. Une phrase seule est renvoyée au modèle une fois ; si le modèle est injoignable
 * ou ne donne rien d'utilisable, le texte de repli de la langue (jamais d'erreur pour ça : le texte reste modifiable). */
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
