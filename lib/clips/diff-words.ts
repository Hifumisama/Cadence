/** Word-by-word difference between two texts (longest common subsequence): used to show what a voice-timbre retouch changed, struck through
 * (removed) and highlighted (added). Pure. Spaces and punctuation stuck to words count as part of the word: « husky, »
 * and « husky » are two different words, which is the right level to read an instruction. */

export type SegmentDiff = { type: "meme" | "retire" | "ajoute"; texte: string };

const mots = (t: string): string[] => t.split(/\s+/).filter(Boolean);

export function differenceMots(avant: string, apres: string): SegmentDiff[] {
  const a = mots(avant);
  const b = mots(apres);
  // Table of common-subsequence lengths, walked from the end to the start.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const brut: SegmentDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      brut.push({ type: "meme", texte: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      brut.push({ type: "retire", texte: a[i++]! });
    } else {
      brut.push({ type: "ajoute", texte: b[j++]! });
    }
  }
  while (i < a.length) brut.push({ type: "retire", texte: a[i++]! });
  while (j < b.length) brut.push({ type: "ajoute", texte: b[j++]! });

  // Adjacent words of the same kind are grouped: « calm and attentive » is displayed as one block.
  const groupes: SegmentDiff[] = [];
  for (const s of brut) {
    const dernier = groupes.at(-1);
    if (dernier && dernier.type === s.type) dernier.texte += ` ${s.texte}`;
    else groupes.push({ ...s });
  }

  // A small common word (« and », « the ») taken between two changes splits the reading into pieces: we count it on both
  // sides, and the whole change is displayed as one removed followed by one added.
  const segments: SegmentDiff[] = [];
  let retires: string[] = [];
  let ajoutes: string[] = [];
  const vider = () => {
    if (retires.length > 0) segments.push({ type: "retire", texte: retires.join(" ") });
    if (ajoutes.length > 0) segments.push({ type: "ajoute", texte: ajoutes.join(" ") });
    retires = [];
    ajoutes = [];
  };
  groupes.forEach((s, k) => {
    if (s.type === "retire") retires.push(s.texte);
    else if (s.type === "ajoute") ajoutes.push(s.texte);
    else if (retires.length + ajoutes.length > 0 && groupes[k + 1] && groupes[k + 1]!.type !== "meme" && !s.texte.includes(" ") && s.texte.length <= 4) {
      retires.push(s.texte);
      ajoutes.push(s.texte);
    } else {
      vider();
      segments.push({ ...s });
    }
  });
  vider();
  return segments;
}
