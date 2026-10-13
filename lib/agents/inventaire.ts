import { construireCode } from "../assetCode";
import type { ChangementBrut } from "./changements";
import { TYPES_MANQUANTS, suffixeDeCode } from "./conversion";
import { cleNouvelAsset } from "./fiches";
import type { Avertissement } from "./types";

/** Sortie du skill `inventaire-assets` : les assets que les plans réclament et que le registre n'a pas. */
export type SortieInventaire = {
  assets: { code: string; type: string; parent?: string | null; description: string; plans: string[]; raison: string }[];
  notes: string;
};

export type AssetRegistre = { code: string; type: string; description?: string };

const MOTS_VIDES = new Set(["le", "la", "les", "un", "une", "de", "du", "des", "d", "l", "et", "the", "of", "a", "an"]);

/** Les mots significatifs d'un suffixe de code (« lampe_huile » → lampe, huile) : sert à repérer un asset
 * qui ressemble à un asset existant. */
function mots(suffixe: string): string[] {
  return suffixe
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 1 && !MOTS_VIDES.has(m));
}

/** L'asset du registre auquel un code proposé ressemble (même type, mots communs), ou null. Ce n'est qu'un
 * signal pour la revue : le rapprochement sémantique (lanterne / lampe) reste celui du modèle, qui voit le registre. */
export function ressemblant(type: string, suffixe: string, registre: AssetRegistre[]): string | null {
  const a = new Set(mots(suffixe));
  if (a.size === 0) return null;
  for (const r of registre) {
    if (r.type !== type) continue;
    const b = new Set(mots(r.code.includes("_") ? r.code.slice(r.code.indexOf("_") + 1) : r.code));
    if (b.size === 0) continue;
    const communs = [...a].filter((m) => b.has(m)).length;
    if (communs > 0 && (communs === a.size || communs === b.size)) return r.code;
  }
  return null;
}

/** Les codes de `codes` cités tels quels dans un texte (hors `sauf`, le code de l'asset lui-même). */
function codesCites(texte: string, codes: Iterable<string>, sauf: string): string[] {
  const t = texte.toLowerCase();
  return [...codes].filter((c) => {
    if (c === sauf) return false;
    // Le code doit être un mot entier : ni précédé ni suivi d'un caractère de code (CHAR_iris ≠ CHAR_iris_blessee).
    const morceaux = t.split(c.toLowerCase());
    return morceaux.slice(0, -1).some((avant, i) => !/[a-z0-9_]$/.test(avant) && !/^[a-z0-9_]/.test(morceaux[i + 1]!));
  });
}

/** La sortie d'`inventaire-assets` → des changements « créer un asset » (sans prompt : il s'écrit ensuite,
 * un asset à la fois). Écarte ce qui existe déjà et les doublons de la sortie ; signale ce qui ressemble à un asset
 * existant sans le refuser. Le parent est un asset existant (`deriveDeCode`) ou créé ici (`deriveDeCle`) ; le
 * registre n'a qu'un niveau, l'application rattache toujours au master. Pur, testé. */
export function depuisInventaire(sortie: SortieInventaire, registre: AssetRegistre[]): ChangementBrut[] {
  const existants = new Set(registre.map((a) => a.code));
  const declares = (sortie.assets ?? []).map((m) => ({
    m,
    suffixe: suffixeDeCode(m.code),
    code: TYPES_MANQUANTS.has(m.type) && suffixeDeCode(m.code) ? construireCode(m.type, suffixeDeCode(m.code)) : null,
  }));
  const codesCrees = new Set(declares.flatMap((d) => (d.code && !existants.has(d.code) ? [d.code] : [])));
  const vus = new Set<string>();
  const typeDeCode = new Map<string, string>([...registre.map((r) => [r.code, r.type] as [string, string]), ...declares.flatMap((d) => (d.code && codesCrees.has(d.code) ? [[d.code, d.m.type] as [string, string]] : []))]);
  const sorties: ChangementBrut[] = [];
  for (const { m, suffixe, code } of declares) {
    if (!code || existants.has(code) || vus.has(code)) continue; // inutilisable, déjà au registre, ou déjà proposé
    vus.add(code);
    const avert: Avertissement[] = [];
    const info = [(m.raison ?? "").trim(), m.plans?.length ? `plans : ${m.plans.join(", ")}` : ""].filter(Boolean).join(" · ");
    if (info) avert.push({ type: "info", texte: info });
    if (code !== m.code) avert.push({ type: "info", texte: `Code proposé « ${m.code} », construit selon la convention du registre : ${code}.` });
    const proche = ressemblant(m.type, suffixe, registre);
    if (proche) avert.push({ type: "alerte_controle", texte: `Ressemble à ${proche}, déjà au registre : vérifie qu'il ne s'agit pas du même asset avant d'appliquer.` });

    const apres: Record<string, unknown> = { type: m.type, suffixe, description: (m.description ?? "").trim(), critique: false };
    const parent = m.parent?.trim();
    if (parent) {
      if (existants.has(parent)) apres.deriveDeCode = parent;
      else {
        // Un parent proposé ici : son code exact, ou le même nom avec un autre préfixe de type.
        const crees = [...codesCrees].find((c) => c === parent || c.endsWith(`_${suffixeDeCode(parent)}`));
        if (crees && crees !== code) apres.deriveDeCle = cleNouvelAsset(crees);
        else avert.push({ type: "alerte_controle", texte: `Parent « ${parent} » introuvable (ni au registre, ni proposé ici) : l'asset est créé sans parent.` });
      }
    }
    // Un état d'un sujet récurrent (personnage, créature, décor, prop) PART du sujet : le modèle l'oublie souvent dans `parent` alors
    // qu'il cite le code du sujet dans sa description ou sa raison. Même type : le parent est posé ici (info) ; autre type : alerte.
    if (!apres.deriveDeCode && !apres.deriveDeCle) {
      const cites = codesCites(`${m.description ?? ""} ${m.raison ?? ""}`, typeDeCode.keys(), code);
      const meme = cites.find((c) => typeDeCode.get(c) === m.type);
      if (meme) {
        if (existants.has(meme)) apres.deriveDeCode = meme;
        else apres.deriveDeCle = cleNouvelAsset(meme);
        avert.push({ type: "info", texte: `Parent ${meme} posé par le code : l'asset le cite comme son sujet (état ou variante de lui) ; retire-le si c'est un asset à part.` });
      } else if (cites.length > 0) {
        avert.push({ type: "alerte_controle", texte: `Cite ${cites.join(", ")} (un autre type) sans parent : si c'est un ÉTAT de ce sujet (forme, stade, éclairage), propose-le du même type avec ce parent ; un VFX est de la matière générique, pas un état.` });
      }
    }
    const typeParent = apres.deriveDeCode ? typeDeCode.get(String(apres.deriveDeCode)) : undefined;
    if (m.type === "vfx" && typeParent && typeParent !== "vfx") {
      avert.push({ type: "alerte_controle", texte: `Un VFX n'est jamais un état d'un sujet : ${code} a pour parent ${apres.deriveDeCode} (${typeParent}). Si c'est une forme ou un état de ce sujet, il doit être du même type que lui.` });
    }
    sorties.push({
      groupe: "assets",
      cle: cleNouvelAsset(code),
      cibleType: "asset",
      cibleRef: null,
      libelle: `${code} · nouvel asset`,
      operation: "creer",
      sousGroupe: null,
      apres,
      avertissements: avert,
    });
  }
  // Un dérivé dont le parent est créé ici vient après lui.
  sorties.sort((a, b) => Number(!!(a.apres as Record<string, unknown>).deriveDeCle) - Number(!!(b.apres as Record<string, unknown>).deriveDeCle));
  return sorties;
}
