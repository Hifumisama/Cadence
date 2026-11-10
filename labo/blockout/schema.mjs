// Validation d'un plan de blockout : le schéma (plan.schema.json) puis les contrôles croisés qu'un schéma n'exprime pas.
// `node schema.mjs [fichiers…]` valide les exemples (ou les fichiers donnés) sans rien rendre.
import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const RACINE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(RACINE, "plan.schema.json"), "utf8"));

/** Nombre d'images que H3 génère pour une durée : la même expression que le nœud 22:24 du workflow vidéo
 * (`max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17`, modulo toujours positif comme en Python). */
export function nombreImages(dureeSecondes) {
  const n = Math.max(5, Math.round(dureeSecondes * 24));
  return n + ((((5 - (n % 17)) % 17) + 17) % 17);
}

/** « 608x352 » → { largeur, hauteur, megapixels } ; les mégapixels sont ceux à demander au nœud 22:9 pour obtenir cette taille. */
export function resolutionDe(plan) {
  const [largeur, hauteur] = plan.resolution.split("x").map(Number);
  return { largeur, hauteur, megapixels: plan.resolution === "608x352" ? 0.2 : 0.4 };
}

/** Le sous-ensemble de JSON Schema dont plan.schema.json se sert (pas de dépendance pour un labo). */
function verifier(valeur, schema, chemin, erreurs) {
  if (schema.$ref) schema = SCHEMA.$defs[schema.$ref.split("/").pop()];
  if (schema.enum) {
    if (!schema.enum.includes(valeur)) erreurs.push(`${chemin} : « ${String(valeur)} » n'est pas dans [${schema.enum.join(", ")}]`);
    return;
  }
  const type = Array.isArray(valeur) ? "array" : Number.isInteger(valeur) ? "integer" : valeur === null ? "null" : typeof valeur;
  if (schema.type && type !== schema.type) {
    erreurs.push(`${chemin} : ${schema.type} attendu, ${type} reçu`);
    return;
  }
  if (schema.minimum != null && valeur < schema.minimum) erreurs.push(`${chemin} : ${valeur} est sous le minimum ${schema.minimum}`);
  if (schema.maximum != null && valeur > schema.maximum) erreurs.push(`${chemin} : ${valeur} dépasse le maximum ${schema.maximum}`);
  if (schema.pattern && !new RegExp(schema.pattern).test(valeur)) erreurs.push(`${chemin} : « ${valeur} » ne respecte pas ${schema.pattern}`);
  if (schema.maxLength != null && valeur.length > schema.maxLength) erreurs.push(`${chemin} : plus de ${schema.maxLength} caractères`);
  if (schema.type === "array") {
    if (schema.minItems != null && valeur.length < schema.minItems) erreurs.push(`${chemin} : au moins ${schema.minItems} élément(s)`);
    if (schema.maxItems != null && valeur.length > schema.maxItems) erreurs.push(`${chemin} : au plus ${schema.maxItems} éléments`);
    valeur.forEach((v, i) => verifier(v, schema.items, `${chemin}[${i}]`, erreurs));
  }
  if (schema.type === "object") {
    for (const cle of schema.required ?? []) if (!(cle in valeur)) erreurs.push(`${chemin}.${cle} : champ obligatoire absent`);
    for (const [cle, v] of Object.entries(valeur)) {
      const sous = schema.properties?.[cle];
      if (sous) verifier(v, sous, `${chemin}.${cle}`, erreurs);
      else if (schema.additionalProperties === false) erreurs.push(`${chemin}.${cle} : champ inconnu`);
    }
  }
}

const AVEC_ARRIVEE = ["push_in", "pull_out", "zoom_in", "zoom_out"];
const ORDRE_TAILLES = SCHEMA.$defs.taille.enum; // du plus large au plus serré
const SUR_LA_GRILLE = ["gauche", "centre", "droite"];
const cle = (c) => c.colonne + "/" + c.profondeur;

/** Les mouvements de caméra d'un plan, dans l'ordre : le premier puis ceux de « puis ». */
export const mouvementsDe = (plan) => [plan.camera, ...(plan.camera.puis ?? [])];

/** Rend la liste des erreurs d'un plan (vide = valide) et, s'il est valide, le plan complété de ses valeurs par défaut.
 * Ce qui est seulement superflu ou incohérent sans conséquence (une « arrivee » sur un pan) est retiré avec un avertissement
 * plutôt que refusé : le JSON vient d'un petit modèle. */
export function validerPlan(brut, idParDefaut = "plan") {
  const erreurs = [];
  const avertissements = [];
  verifier(brut, SCHEMA, "plan", erreurs);
  if (erreurs.length) return { erreurs, avertissements, plan: null };

  const plan = structuredClone(brut);
  plan.id ??= idParDefaut;
  plan.cadence ??= 24;
  plan.resolution ??= "864x480";
  plan.cadre = { angle: "eye_level", axe: "face", cible: "groupe", ...plan.cadre };

  const ids = plan.sujets.map((s) => s.id);
  if (new Set(ids).size !== ids.length) erreurs.push("sujets : deux sujets portent le même id");
  if (ids.includes("groupe")) erreurs.push("sujets : « groupe » est réservé à cadre.cible, donner un autre id au sujet");
  const cases = plan.sujets.map((s) => cle(s.placement));
  if (new Set(cases).size !== cases.length) erreurs.push("sujets : deux sujets partent de la même case (placement), en déplacer un");
  for (const s of plan.sujets) {
    if (s.deplacement && cle(s.deplacement.vers) === cle(s.placement)) {
      delete s.deplacement;
      avertissements.push("sujets." + s.id + " : déplacement vers sa propre case, retiré");
    }
  }
  if (!plan.sujets.some((s) => SUR_LA_GRILLE.includes(s.placement.colonne))) erreurs.push("sujets : au moins un sujet doit partir de la grille (colonne gauche, centre ou droite)");
  if (plan.cadre.cible !== "groupe" && !ids.includes(plan.cadre.cible)) {
    erreurs.push("cadre.cible : « " + plan.cadre.cible + " » n'est ni « groupe » ni l'id d'un sujet (" + ids.join(", ") + ")");
  }

  const mobiles = plan.sujets.filter((s) => s.deplacement).map((s) => s.id);
  let taille = plan.cadre.taille;
  mouvementsDe(plan).forEach((m, rang) => {
    const ou = rang === 0 ? "camera" : "camera.puis[" + (rang - 1) + "]";
    if (m.mouvement === "tracking") {
      m.suit ??= mobiles.includes(plan.cadre.cible) ? plan.cadre.cible : mobiles.length === 1 ? mobiles[0] : undefined;
      if (!m.suit) erreurs.push(ou + ".suit : un tracking doit nommer le sujet suivi, parmi ceux qui ont un deplacement (" + (mobiles.join(", ") || "aucun") + ")");
      else if (!mobiles.includes(m.suit)) erreurs.push(ou + ".suit : « " + m.suit + " » n'a pas de deplacement, il n'y a rien à suivre (sujets mobiles : " + (mobiles.join(", ") || "aucun") + ")");
    } else if (m.suit) {
      delete m.suit;
      avertissements.push(ou + ".suit : réservé au tracking, retiré");
    }
    if (m.arrivee) {
      const ecart = ORDRE_TAILLES.indexOf(m.arrivee.taille) - ORDRE_TAILLES.indexOf(taille);
      const resserre = m.mouvement === "push_in" || m.mouvement === "zoom_in";
      if (!AVEC_ARRIVEE.includes(m.mouvement) || ecart === 0 || ecart > 0 !== resserre) {
        avertissements.push(ou + ".arrivee : " + m.mouvement + " depuis " + taille + " ne peut pas finir en " + m.arrivee.taille + ", retirée (l'amplitude s'applique)");
        delete m.arrivee;
      } else taille = m.arrivee.taille;
    }
  });
  return { erreurs, avertissements, plan: erreurs.length ? null : plan };
}

/** Lit et valide un fichier de plan ; rend le plan complété, lève une erreur lisible sinon. */
export function chargerPlan(chemin) {
  const { erreurs, avertissements, plan } = validerPlan(JSON.parse(readFileSync(chemin, "utf8")), basename(chemin, ".json"));
  if (erreurs.length) throw new Error(chemin + " n'est pas un plan valide :\n  - " + erreurs.join("\n  - "));
  for (const a of avertissements) console.warn("  (" + plan.id + ") " + a);
  return plan;
}

/** Les fichiers passés en argument, ou tous les exemples. */
export function fichiersDemandes(args) {
  if (args.length) return args;
  const dossier = join(RACINE, "exemples");
  return readdirSync(dossier).filter((f) => f.endsWith(".json")).sort().map((f) => join(dossier, f));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  let echec = false;
  for (const fichier of fichiersDemandes(process.argv.slice(2))) {
    try {
      const plan = chargerPlan(fichier);
      console.log(`valide  ${plan.id} (${plan.duree} s, ${nombreImages(plan.duree)} images, ${plan.resolution})`);
    } catch (e) {
      echec = true;
      console.error(e.message);
    }
  }
  process.exit(echec ? 1 : 0);
}
