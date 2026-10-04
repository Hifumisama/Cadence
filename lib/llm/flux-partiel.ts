/** Lecture d'un JSON QUI S'ÉCRIT (streaming, 2026-10-03). La sortie d'un skill est du JSON contraint : tant que le
 * modèle écrit, le texte n'est pas parsable. Pour montrer la réponse de l'agent au fil de l'eau, on en extrait une
 * chaîne de premier niveau (`reponse` pour la conversation) en la décodant jusqu'où elle est arrivée. Pur, tolérant :
 * un texte qui n'a pas (encore) cette forme donne null, jamais une erreur. */

/** La valeur, décodée à ce stade, de la chaîne de premier niveau `cle` d'un texte JSON partiel ; null si elle n'a pas
 * commencé. Gère les échappements (`\n`, `\"`, `\\`, `\uXXXX`) et s'arrête à un échappement incomplet. */
export function extraireChainePartielle(texte: string, cle: string): string | null {
  const re = new RegExp(`"${cle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*"`);
  const m = re.exec(texte);
  if (!m) return null;
  let sortie = "";
  for (let i = m.index + m[0].length; i < texte.length; i++) {
    const c = texte[i]!;
    if (c === '"') return sortie; // fin de la chaîne
    if (c !== "\\") {
      sortie += c;
      continue;
    }
    const suivant = texte[i + 1];
    if (suivant === undefined) return sortie; // échappement coupé : la suite n'est pas arrivée
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
  return sortie; // la chaîne n'est pas encore fermée : ce qu'on en a
}

/** Les `n` derniers caractères d'un texte (la fin d'une réflexion qui s'écrit). */
export const fin = (texte: string, n: number): string => (texte.length > n ? texte.slice(texte.length - n) : texte);

/** Accumulateur du flux d'un appel : le texte de la réponse et la fin de la réflexion, remis à zéro à chaque nouvel appel
 * (un renvoi au modèle en ouvre un). Borné : la mémoire et la base ne portent jamais un flux entier. */
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
