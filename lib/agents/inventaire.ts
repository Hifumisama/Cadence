import { construireCode } from "../assetCode";
import type { ChangementBrut } from "./changements";
import { TYPES_MANQUANTS, suffixeDeCode } from "./conversion";
import { cleNouvelAsset } from "./fiches";
import type { Avertissement } from "./types";

/** Sortie du skill `inventaire-assets` : les assets que les plans réclament et que le registre n'a pas. */
export type SortieInventaire = {
  assets: { code: string; type: string; parent?: string; description: string; plans: string[]; raison: string }[];
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
