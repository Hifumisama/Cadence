// Tire un plan de blockout (JSON) d'un texte d'intention en français, avec le LLM local de Cadence.
//
//   node generer-plan.mjs --intention "Plan moyen sur Maya…" [--duree 8] [--id mon_plan] [--modele gemma4-e4b] [--sortie plans/mon_plan.json]
//
// Connexion : comme lib/llm/compatibleOpenAI.ts (POST <LLM_LOCAL_URL>/v1/chat/completions, sortie contrainte par
// `response_format` json_schema, réflexion coupée). LLM_LOCAL_URL est lue dans l'environnement, sinon dans le .env de la racine du
// dépôt ; elle n'est jamais affichée. Le modèle : --modele, sinon BLOCKOUT_LLM_MODELE, sinon un petit modèle (MODELE_PAR_DEFAUT).
// Le JSON rendu est validé par schema.mjs ; s'il est refusé, un second essai reçoit les erreurs.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { RACINE, validerPlan } from "./schema.mjs";

export const MODELE_PAR_DEFAUT = "gemma4-e4b";
const DELAI_MS = 5 * 60 * 1000; // le premier appel charge le modèle

/** Une variable de l'environnement, sinon du .env de la racine du dépôt (dernière occurrence, comme dotenv). */
export function variable(nom) {
  if (process.env[nom]?.trim()) return process.env[nom].trim();
  const fichier = resolve(RACINE, "../../.env");
  if (!existsSync(fichier)) return undefined;
  let valeur;
  for (const ligne of readFileSync(fichier, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && m[1] === nom) valeur = m[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return valeur || undefined;
}

/** Le schéma donné au modèle : celui du plan, réduit à ce qu'il doit décider (le code fixe id, cadence, résolution, décor),
 * `$ref` résolus et descriptions retirées (la grammaire du serveur n'en fait rien). Les sujets viennent AVANT le cadre et la
 * caméra : le modèle déclare ses identifiants avant de les citer. `lecture` (une phrase) lui laisse poser le plan avant de coder. */
export function schemaPourLlm() {
  const complet = JSON.parse(readFileSync(join(RACINE, "plan.schema.json"), "utf8"));
  const resoudre = (n) => {
    if (Array.isArray(n)) return n.map(resoudre);
    if (!n || typeof n !== "object") return n;
    if (n.$ref) return resoudre(complet.$defs[n.$ref.split("/").pop()]);
    return Object.fromEntries(Object.entries(n).filter(([c]) => c !== "description").map(([c, v]) => [c, resoudre(v)]));
  };
  const p = resoudre(complet.properties);
  return {
    type: "object",
    additionalProperties: false,
    required: ["lecture", "duree", "sujets", "cadre", "camera"],
    properties: { lecture: { type: "string", maxLength: 400 }, duree: p.duree, sujets: p.sujets, cadre: p.cadre, camera: p.camera },
  };
}

// Instructions en anglais (lues par un petit modèle local, comme les skills de agents/skills/) ; l'intention reste en français.
const SYSTEME = `You convert a French shot description into a JSON "blockout" plan: grey shapes on a 3x3 floor grid plus one camera. Output JSON only.

GRID (seen from the default camera, which stands in front of the "avant" row):
- colonne: gauche | centre | droite (left, center, right of the frame). hors_gauche / hors_droite are OUTSIDE the frame: use them only for a subject that enters the frame (placement) or leaves it (deplacement.vers).
- profondeur: avant (closest to the camera) | milieu | fond (far away).
- Two subjects never start on the same cell.

FIELDS, in this order:
- lecture: one short English sentence: who is where, who moves where, what the camera does.
- duree: seconds, 5 to 10. Use the duration given by the user if any, otherwise 6.
- sujets: one entry per person or important object, 5 at most.
  - id: short lowercase ascii name (maya, garde, caisse). etiquette: the same name in capitals, 14 characters at most.
  - forme: capsule for a person, boite for furniture or a big object, sphere for a small object. gabarit: petit for a child ("enfant") or a small animal, grand for someone very tall or something massive; otherwise omit it.
  - placement: the cell where the subject is at the START.
  - orientation: where a subject that does NOT move is looking: vers_avant (toward the camera), vers_fond (away), vers_gauche, vers_droite. Omit it for a moving subject.
  - deplacement: only if the subject walks or runs. "vers" is the cell where it ENDS, different from placement. moment: when it moves. premiere_moitie if the text says "dans la première moitié", "au début", "d'abord"; seconde_moitie if it says "à mi-plan", "ensuite", "dans la seconde moitié", or if it moves during the camera's second movement; omit it if it moves "pendant tout le plan" or if the text does not say.
- cadre: the framing at the START.
  - taille: extreme_wide | wide | full (whole body) | medium (waist up) | medium_close_up (chest up) | close_up (face).
  - angle: eye_level, low_angle (camera low, looking up), high_angle, bird_eye. Omit it when the text does not say.
  - axe: where the CAMERA stands. Omit it (face) unless the text says the camera itself is on the side (profil_gauche, profil_droit), three-quarter or behind (dos). "de profil", "se font face" describe how the SUBJECTS stand: express that with their orientation (vers_gauche, vers_droite), not with axe.
  - cible: the id of the subject the frame is centered on, or "groupe" when two or more subjects matter.
- camera:
  - mouvement: static (fixed shot) | push_in (camera moves closer) | pull_out (moves back) | zoom_in | zoom_out | pan_left | pan_right (camera turns on the spot) | truck_left | truck_right (camera slides sideways) | tilt_up | tilt_down | pedestal_up | pedestal_down | arc_left | arc_right (camera circles around the target) | tracking (camera follows a walking subject) | shake | roll_clockwise | roll_counterclockwise.
  - amplitude: small | medium | large. vitesse: slow | normal | fast. Omit them when the text does not say.
  - arrivee.taille: only for push_in, pull_out, zoom_in, zoom_out, when the text names the final shot size. It must be tighter than cadre.taille for push_in / zoom_in, wider for pull_out / zoom_out.
  - suit: only for tracking: the id of the followed subject, which must have a deplacement.
  - puis: only if the camera CHANGES movement during the shot: the following movement(s), in order. The shot is split in equal parts, one per movement.

RULES:
- French "travelling avant" = push_in, "travelling arrière" = pull_out, "travelling latéral qui suit" = tracking, "panoramique" = pan, "plan fixe" = static, "contre-plongée" = low_angle, "plongée" = high_angle, "plan en pied" = full, "plan moyen" = medium, "plan rapproché" = medium_close_up, "gros plan" = close_up, "plan large" = wide.
- Every id used in cadre.cible or camera.suit must be the id of one of the sujets.
- Do not invent subjects, movements or camera moves that the text does not mention.

EXAMPLE
Text: "Plan large, 7 secondes. Un chien assis à droite regarde un facteur qui entre par la gauche et marche jusqu'au centre. La caméra panote lentement vers la gauche puis s'arrête."
JSON: {"lecture":"A dog sits on the right looking left; a postman enters from the left and walks to the center; the camera pans left slowly.","duree":7,"sujets":[{"id":"chien","etiquette":"CHIEN","forme":"capsule","gabarit":"petit","placement":{"colonne":"droite","profondeur":"milieu"},"orientation":"vers_gauche"},{"id":"facteur","etiquette":"FACTEUR","forme":"capsule","placement":{"colonne":"hors_gauche","profondeur":"milieu"},"deplacement":{"vers":{"colonne":"centre","profondeur":"milieu"}}}],"cadre":{"taille":"wide","cible":"groupe"},"camera":{"mouvement":"pan_left","vitesse":"slow"}}`;

async function appeler(url, modele, messages, schema) {
  const res = await fetch(`${url}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(DELAI_MS),
    body: JSON.stringify({
      model: modele,
      messages,
      stream: false,
      temperature: 0,
      seed: 1,
      max_tokens: 1500,
      response_format: { type: "json_schema", json_schema: { name: "plan", strict: true, schema } },
      chat_template_kwargs: { enable_thinking: false }, // comme CORPS_SANS_REFLEXION de lib/llm/config.ts
    }),
  });
  if (!res.ok) throw new Error(`Le serveur LLM a répondu ${res.status} : ${(await res.text().catch(() => "")).slice(0, 400)}`);
  const j = await res.json();
  return { texte: String(j?.choices?.[0]?.message?.content ?? ""), arret: j?.choices?.[0]?.finish_reason, jetons: j?.usage?.completion_tokens };
}

/** Rend { plan (ou null), essais: [{ texte, erreurs, avertissements, ms }] } : deux essais au plus. */
export async function genererPlan({ intention, duree, id = "plan", modele }) {
  const url = variable("LLM_LOCAL_URL")?.replace(/\/+$/, "");
  if (!url) throw new Error("LLM_LOCAL_URL absente (environnement ou .env de la racine du dépôt).");
  modele ??= variable("BLOCKOUT_LLM_MODELE") ?? MODELE_PAR_DEFAUT;
  const schema = schemaPourLlm();
  const messages = [
    { role: "system", content: SYSTEME },
    { role: "user", content: `Text: "${intention.trim()}"${duree ? `\nDuration: ${duree} seconds.` : ""}\nJSON:` },
  ];
  const essais = [];
  for (let essai = 1; essai <= 2; essai++) {
    const debut = Date.now();
    const { texte, arret } = await appeler(url, modele, messages, schema);
    let erreurs;
    let avertissements = [];
    let plan = null;
    try {
      const { lecture, ...brut } = JSON.parse(texte);
      ({ erreurs, avertissements, plan } = validerPlan(brut, id));
      if (plan) plan = { id: plan.id, intention: intention.trim(), note: `Généré par ${modele} : ${lecture}`, ...plan };
    } catch (e) {
      erreurs = [`JSON illisible (${arret === "length" ? "sortie coupée par max_tokens" : e.message})`];
    }
    essais.push({ texte, erreurs, avertissements, ms: Date.now() - debut });
    if (plan) return { plan, essais, modele };
    messages.push({ role: "assistant", content: texte });
    messages.push({ role: "user", content: `This JSON was rejected:\n- ${erreurs.join("\n- ")}\nReturn the complete corrected JSON.` });
  }
  return { plan: null, essais, modele };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { values: o } = parseArgs({
    options: { intention: { type: "string" }, duree: { type: "string" }, id: { type: "string", default: "plan_genere" }, modele: { type: "string" }, sortie: { type: "string" } },
  });
  if (!o.intention) {
    console.error('Usage : node generer-plan.mjs --intention "<texte>" [--duree 5..10] [--id <nom>] [--modele <modèle>] [--sortie <fichier.json>]');
    process.exit(1);
  }
  const { plan, essais, modele } = await genererPlan({ intention: o.intention, duree: o.duree ? Number(o.duree) : undefined, id: o.id, modele: o.modele });
  essais.forEach((e, i) => {
    console.log(`essai ${i + 1} (${modele}, ${(e.ms / 1000).toFixed(1)} s) : ${e.erreurs.length ? "refusé" : "valide"}`);
    for (const x of e.erreurs) console.log(`  erreur : ${x}`);
    for (const x of e.avertissements) console.log(`  corrigé : ${x}`);
  });
  if (!plan) process.exit(1);
  const sortie = resolve(o.sortie ?? join(RACINE, "plans", `${plan.id}.json`));
  mkdirSync(dirname(sortie), { recursive: true });
  writeFileSync(sortie, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(`Plan écrit : ${sortie}\nRendu : node rendre.mjs ${sortie}`);
}
