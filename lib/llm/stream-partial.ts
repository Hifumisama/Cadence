/** Reading a JSON BEING WRITTEN (streaming, 2026-10-03). The output of a skill is constrained JSON: while the
 * model writes, the text is not parsable. To show the agent's answer as it flows, we extract a
 * top-level string (`reponse` for the conversation) by decoding it as far as it has arrived. Pure, tolerant:
 * a text that does not (yet) have this shape gives null, never an error. */

/** The value, decoded at this stage, of the top-level string `cle` of a partial JSON text; null if it has not
 * started. Handles escapes (`\n`, `\"`, `\\`, `\uXXXX`) and stops at an incomplete escape. */
export function extraireChainePartielle(texte: string, cle: string): string | null {
  const re = new RegExp(`"${cle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*"`);
  const m = re.exec(texte);
  if (!m) return null;
  let sortie = "";
  for (let i = m.index + m[0].length; i < texte.length; i++) {
    const c = texte[i]!;
    if (c === '"') return sortie; // end of the string
    if (c !== "\\") {
      sortie += c;
      continue;
    }
    const suivant = texte[i + 1];
    if (suivant === undefined) return sortie; // escape cut: the rest has not arrived
    if (suivant === "u") {
      const hex = texte.slice(i + 2, i + 6);
      if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) return sortie;
      sortie += String.fromCharCode(parseInt(hex, 16));
      i += 5;
      continue;
    }
    sortie += ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" } as Record<string, string>)[suivant] ?? suivant;
    i += 1;
  }
  return sortie; // the string is not closed yet: what we have of it
}

/** The last `n` characters of a text (the end of a reasoning being written). */
export const fin = (texte: string, n: number): string => (texte.length > n ? texte.slice(texte.length - n) : texte);

/** Accumulator of a call's stream: the response text and the end of the reasoning, reset at each new call
 * (a resend to the model opens one). Bounded: memory and the database never hold a whole stream. */
export class AccumulateurFlux {
  texte = "";
  reflexion = "";
  constructor(
    private readonly maxTexte = 24_000,
    private readonly maxReflexion = 6_000,
  ) {}

  recevoir(evenement: { type: "debut" | "reflexion" | "texte"; texte: string }): void {
    if (evenement.type === "debut") {
      this.texte = "";
      this.reflexion = "";
    } else if (evenement.type === "texte") {
      this.texte = (this.texte + evenement.texte).slice(0, this.maxTexte);
    } else {
      this.reflexion = fin(this.reflexion + evenement.texte, this.maxReflexion);
    }
  }
}
