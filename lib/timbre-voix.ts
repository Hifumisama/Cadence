/** Le TIMBRE d'une voix décrite : l'instruction Voice Design (en anglais, c'est ce que lit Qwen3-TTS) que l'IA propose au départ, puis
 * RETOUCHE quand le ressenti dit « à ajuster ». Comme la réplique d'écoute (lib/replique-ecoute.ts) : pas de skill d'agent, un prompt
 * court intégré, envoyé au fournisseur LLM configuré (lib/llm/). Les règles d'écriture sont celles de `checksInstruction` (lib/voix.ts) :
 * langue native nommée, pas de négations, pas de vocabulaire de prise de son, pas de mot qui traîne un accent.
 *
 * Aucun accès à la base ni au disque : le message, la lecture de la réponse et le repli sont purs et testables ; l'appel au modèle prend
 * son fournisseur en paramètre. */

import { CORPS_SANS_REFLEXION, creerFournisseur } from "./llm/config";
import type { FournisseurLlm } from "./llm/types";
import { langueFicheVoix } from "./langues-tts";
import type { EssaiVoix } from "./voix";

export type ContexteTimbre = {
  /** Langue native de la voix (« French », « English »…), nom du moteur. */
  langue: string;
  /** Description du personnage (âge, allure, caractère) ou, à défaut, la description canonique du timbre. */
  caractere?: string | null;
  /** Rôle quand il n'y a pas de personnage (voix off, narrateur). */
  role?: string | null;
  /** Les mots choisis pour orienter l'IA (« Jeune », « Grave »…). */
  orientations?: string[];
  /** RETOUCHE : l'instruction actuelle, à modifier. Absente = première proposition. */
  precedente?: string | null;
  /** RETOUCHE : ce qui ne va pas (« Plus grave », « Trop robotique »…) et la phrase libre. */
  remarques?: string[];
  note?: string | null;
  /** RETOUCHE : les essais déjà faits et ce qu'on en a pensé (pour ne pas revenir en arrière). */
  journal?: EssaiVoix[];
};

export type PropositionTimbre = {
  /** L'instruction Voice Design, en anglais. */
  instruction: string;
  /** Une phrase en français : la voix décrite, ou ce que la retouche a changé. */
  resume: string;
  /** « modele » : écrite par le LLM ; « repli » : texte fixe (modèle injoignable) — jamais pour une retouche. */
  source: "modele" | "repli";
};

export const SYSTEME_TIMBRE = [
  "You write the voice instruction for a text-to-speech 'voice design' model (Qwen3-TTS). The instruction describes ONE character's voice.",
  "Rules for the instruction:",
  "- ONE paragraph in English, 35 to 80 words, in this order: who speaks (age range, gender, role), their native language and origin (always write 'a native <Language> speaker'), the prosody (pace, pitch, texture, energy), the emotional state.",
  "- Describe what the voice IS. Never describe what it is not: no negations (no, not, never, without).",
  "- Describe a throat, not a microphone: no 'close-miked', 'studio', 'reverb', 'recording'.",
  "- No words that carry an accent or a social class by birth ('posh', 'aristocratic', 'southern'): describe the function instead (commanding, gentle).",
  "- No names, no plot, no quotation marks.",
  'Answer with a JSON object only, on a single line: {"instruction": "...", "resume": "..."}.',
  "'resume' is ONE short sentence in French. For a first proposal, it says in plain words what the voice sounds like. For a retouch, it says what changed.",
].join("\n");

export const SYSTEME_RETOUCHE = [
  SYSTEME_TIMBRE,
  "",
  "You are RETOUCHING an existing instruction. Rules for the retouch:",
  "- Change only what the remarks ask for. Keep every other word of the current instruction exactly as it is.",
  "- Translate each remark into a concrete vocal change (lower pitch, slower pace, softer texture, less theatrical delivery).",
  "- The journal lists earlier attempts and what the listener thought of them. Never go back to a version they rejected, and do not repeat a change that was already tried.",
].join("\n");

const phraseLangue = (langue: string) => {
  const l = langueFicheVoix(langue);
  return l === "Auto" ? "the language of the character" : l;
};

/** Le message envoyé au modèle. Pur. */
export function messageTimbre(c: ContexteTimbre): string {
  const lignes = [`Native language of the voice: ${phraseLangue(c.langue)}`];
  if (c.caractere?.trim()) lignes.push(`Character: ${c.caractere.trim()}`);
  else if (c.role?.trim()) lignes.push(`Role: ${c.role.trim()}`);
  if (c.orientations?.length) lignes.push(`The author wants a voice that is: ${c.orientations.join(", ")}`);
  if (c.precedente?.trim()) {
    lignes.push(`Current instruction to retouch: ${c.precedente.trim()}`);
    if (c.remarques?.length) lignes.push(`What is wrong with it: ${c.remarques.join("; ")}`);
    if (c.note?.trim()) lignes.push(`In the author's own words: ${c.note.trim()}`);
    const jug = (c.journal ?? []).filter((e) => e.verdict || e.note.trim());
    if (jug.length > 0) {
      lignes.push("Journal of earlier attempts (oldest first):");
      for (const e of jug) lignes.push(`- #${e.n} [${e.verdict ?? "not judged"}] ${e.instruction}${e.note.trim() ? ` (remark: ${e.note.trim()})` : ""}`);
    }
  } else if (lignes.length === 1) {
    lignes.push("Character: not described; propose a calm, warm and natural speaker.");
  }
  return lignes.join("\n");
}

function nettoyer(t: string): string {
  return t.replace(/[*_#`]+/g, "").replace(/\s+/g, " ").replace(/^["“”«»'‘’]+\s*/, "").replace(/\s*["“”«»'‘’]+$/, "").trim();
}

/** Lit la réponse du modèle : un objet JSON `{instruction, resume}` (éventuellement dans un bloc de code ou entouré de texte). À défaut
 * de JSON, un texte brut d'une certaine longueur est pris comme instruction. Renvoie null si rien d'utilisable. */
export function lireReponseTimbre(brut: string): { instruction: string; resume: string } | null {
  const sansReflexion = brut.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```[a-z]*\n?|```/gi, "").trim();
  const debut = sansReflexion.indexOf("{");
  const fin = sansReflexion.lastIndexOf("}");
  if (debut >= 0 && fin > debut) {
    try {
      const o = JSON.parse(sansReflexion.slice(debut, fin + 1)) as { instruction?: unknown; resume?: unknown };
      const instruction = typeof o.instruction === "string" ? nettoyer(o.instruction) : "";
      if (instruction) return { instruction, resume: typeof o.resume === "string" ? o.resume.replace(/\s+/g, " ").trim() : "" };
    } catch {
      // JSON cassé : on retombe sur le texte brut ci-dessous
    }
  }
  const texte = nettoyer(sansReflexion.replace(/^\s*(?:instruction|voice)\s*:\s*/i, ""));
  return texte.split(/\s+/).length >= 12 && !texte.includes("{") ? { instruction: texte, resume: "" } : null;
}

/** Instruction de repli par langue, quand le modèle ne répond pas à une PREMIÈRE proposition. */
export function timbreDeRepli(langue: string): PropositionTimbre {
  const l = langueFicheVoix(langue);
  const natif = l === "Auto" ? "a native speaker" : `a native ${l} speaker`;
  return {
    instruction: `A calm adult voice, ${natif}, warm and attentive, with a slightly husky texture. They speak at an unhurried pace with a natural, relaxed energy and a hint of dry humour.`,
    resume: "Une voix adulte, posée et chaleureuse, un peu rauque (proposition de secours : le modèle ne répond pas, retouche-la).",
    source: "repli",
  };
}

export type OptionsTimbre = { fournisseur?: FournisseurLlm; modele?: string; signal?: AbortSignal };

/** Propose (ou retouche, si `precedente` est donnée) l'instruction de timbre. Une première proposition retombe sur un texte de repli si
 * le modèle est injoignable ; une RETOUCHE, elle, échoue franchement : un texte de repli ne répondrait pas aux remarques. */
export async function ecrireTimbre(c: ContexteTimbre, options: OptionsTimbre = {}): Promise<PropositionTimbre> {
  const retouche = !!c.precedente?.trim();
  try {
    const fournisseur = options.fournisseur ?? creerFournisseur();
    const rep = await fournisseur.generer({
      systeme: retouche ? SYSTEME_RETOUCHE : SYSTEME_TIMBRE,
      messages: [{ role: "user", content: messageTimbre(c) }],
      modele: options.modele,
      maxTokens: 500,
      temperature: retouche ? 0.5 : 0.8,
      corps: CORPS_SANS_REFLEXION,
      signal: options.signal,
    });
    const lu = lireReponseTimbre(rep.texte);
    if (lu) return { ...lu, source: "modele" };
    if (retouche) throw new Error("Le modèle n'a pas rendu d'instruction utilisable : relance la retouche.");
  } catch (e) {
    if (options.signal?.aborted) throw e;
    if (retouche) throw new Error(e instanceof Error && e.message.startsWith("Le modèle") ? e.message : `Retouche impossible : ${(e as Error).message}`);
    console.warn("[timbre-voix] modèle indisponible, instruction de repli :", (e as Error).message);
  }
  return timbreDeRepli(c.langue);
}
