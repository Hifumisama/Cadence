/** Différence mot à mot entre deux textes (plus longue sous-suite commune) : sert à montrer ce qu'une retouche de timbre a changé, en
 * barré (retiré) et en surligné (ajouté). Pur. Les espaces et la ponctuation collée aux mots comptent comme partie du mot : « husky, »
 * et « husky » sont deux mots différents, ce qui est le bon niveau pour lire une instruction. */

export type SegmentDiff = { type: "meme" | "retire" | "ajoute"; texte: string };

const mots = (t: string): string[] => t.split(/\s+/).filter(Boolean);

export function differenceMots(avant: string, apres: string): SegmentDiff[] {
  const a = mots(avant);
  const b = mots(apres);
  // Table des longueurs de sous-suite commune, parcourue de la fin vers le début.
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

  // Les mots voisins de même nature sont regroupés : « calm and attentive » s'affiche d'un bloc.
  const groupes: SegmentDiff[] = [];
  for (const s of brut) {
    const dernier = groupes.at(-1);
    if (dernier && dernier.type === s.type) dernier.texte += ` ${s.texte}`;
    else groupes.push({ ...s });
  }

  // Un petit mot commun (« and », « the ») pris entre deux changements découpe la lecture en morceaux : on le compte des deux
  // côtés, et tout le changement s'affiche en un retiré suivi d'un ajouté.
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

/** Vrai si les deux textes ne diffèrent qu'par les espaces. */
export function memeTexte(avant: string, apres: string): boolean {
  return mots(avant).join(" ") === mots(apres).join(" ");
}
