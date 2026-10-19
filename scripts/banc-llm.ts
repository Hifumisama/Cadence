import "dotenv/config";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chargerSkill } from "../lib/llm/skills";
import { executerSkill } from "../lib/llm/executer";
import { configLlm, creerFournisseur } from "../lib/llm/config";
import { controleurPourSkill } from "../lib/llm/controles";
import { ErreurLlm, type MessageLlm } from "../lib/llm/types";

/** Banc de rejeu : rejoue de vraies traces (agent_traces) contre un ou plusieurs modèles de llama-swap.
 *
 *   npm run llm:banc -- --modeles gemma4-26b-A4B-v2,gemma4-e4b [--skills plan-h3,prompt-asset] [--ids 955,979]
 *                       [--par-skill 2] [--repetitions 1] [--traces fichier.jsonl] [--sans-contrainte]
 *                       [--renvois 0] [--max-tokens 16384] [--corps-defaut] [--sortie dossier]
 *                       [--controles N] [--concurrence N] [--racine dossier] [--sans-variante]
 *
 * Les traces viennent de `npm run llm:banc:export -- --projet 220 --sortie essais/banc/p220.jsonl`.
 *
 * Aucune base, aucune écriture de trace : seul le serveur LLM (LLM_LOCAL_URL du .env) est sollicité. Le prompt système et
 * le schéma sont rechargés depuis agents/skills/ (la trace ne garde que l'empreinte) : un écart de taille avec la trace
 * d'origine est signalé, la sortie de référence peut venir d'une autre version du prompt.
 * Les modèles sont passés l'un après l'autre (un chargement llama-swap par modèle, mesuré à part par un appel d'échauffement).
 * Par défaut AUCUN champ supplémentaire n'est ajouté au corps de la requête (les `chat_template_kwargs` sont dépréciés :
 * choisir une entrée llama-swap `-nothink` pour couper la réflexion) ; `--corps-defaut` rétablit le comportement de l'app.
 *
 * Mise à niveau (2026-10-19), pour mesurer comme en production :
 *  - la VARIANTE du skill est reprise de la trace (champ `variante` de l'export) : sans elle le banc chargeait tous les guides
 *    de genre, un prompt système plus gros que celui de l'app (`--sans-variante` pour l'ancien comportement) ;
 *  - `--controles N` lance les contrôles SÉMANTIQUES du skill (lib/llm/controles.ts) et autorise N renvois ; la colonne
 *    « 1er coup » donne la part des sorties valides sans aucun renvoi ;
 *  - les `timings` du serveur sont gardés (jetons repris du cache, préremplissage, acceptation des brouillons MTP) ;
 *  - `--concurrence N` rejoue N appels à la fois (un modèle à N slots) et donne le débit cumulé ;
 *  - `--racine dossier` charge `agents/skills/` d'une AUTRE copie du dépôt, pour comparer deux versions d'un skill. */

type Trace = {
  id: number;
  skill: string;
  modele: string;
  messages: MessageLlm[];
  sortie_json: unknown;
  tokens_entree: number;
  tokens_sortie: number;
  duree_ms: number;
  systeme_caracteres: number;
  /** Variante de skill de l'appel d'origine (agent_runs.options), absente des anciens exports. */
  variante?: string | null;
};

type Mesure = {
  modele: string;
  traceId: number;
  skill: string;
  repetition: number;
  statut: "ok" | "invalide" | "echoue";
  erreur?: string;
  dureeMs: number;
  premierJetonMs: number | null;
  jetonsEntree: number;
  jetonsSortie: number;
  jetonsParSeconde: number | null;
  caracteresReflexion: number;
  caracteresTexte: number;
  renvois: number;
  /** Jetons d'entrée repris du cache / préchargés et acceptation des brouillons (MTP) ; null si le serveur ne les donne pas. */
  cacheN: number | null;
  promptN: number | null;
  preremplissageTps: number | null;
  acceptationMtp: number | null;
  refDureeMs: number;
  refJetonsSortie: number;
  refModele: string;
};

function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const drapeau = (nom: string) => process.argv.includes(nom);
const liste = (nom: string) => arg(nom)?.split(",").map((s) => s.trim()).filter(Boolean);
const nombre = (nom: string, defaut: number) => {
  const v = arg(nom);
  return v === undefined ? defaut : Number(v);
};
const sec = (ms: number) => (ms / 1000).toFixed(1);
const moy = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "–");

const varianteDe = (t: Trace) => (drapeau("--sans-variante") ? undefined : (t.variante ?? undefined));

/** L'entrée structurée d'un appel, relue dans le dernier message utilisateur (les contrôles sémantiques la veulent en objet). */
function entreeDeTrace(t: Trace): unknown {
  const dernier = [...t.messages].reverse().find((m) => m.role === "user");
  if (!dernier || typeof dernier.content !== "string") return undefined;
  const texte = dernier.content.trim();
  for (const candidat of [texte, texte.slice(Math.max(0, texte.indexOf("{")))]) {
    try {
      return JSON.parse(candidat);
    } catch {
      /* texte libre : pas d'entrée structurée */
    }
  }
  return undefined;
}

function chargerTraces(): Trace[] {
  const fichier = arg("--traces") ?? join("scripts", "banc", "traces-exemple.jsonl");
  const toutes = readFileSync(fichier, "utf-8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Trace);
  const skills = liste("--skills");
  const ids = liste("--ids")?.map(Number);
  const parSkill = nombre("--par-skill", Infinity);
  const compte = new Map<string, number>();
  return toutes.filter((t) => {
    if (skills && !skills.includes(t.skill)) return false;
    if (ids && !ids.includes(t.id)) return false;
    const n = (compte.get(t.skill) ?? 0) + 1;
    compte.set(t.skill, n);
    return n <= parSkill;
  });
}

async function echauffer(modele: string): Promise<number> {
  const t0 = Date.now();
  try {
    await creerFournisseur().generer({ systeme: "Reply with one word.", messages: [{ role: "user", content: "ok" }], modele, maxTokens: 8 });
  } catch (e) {
    console.error(`  Échauffement impossible (${(e as Error).message}) : le modèle existe-t-il dans llama-swap ?`);
    throw e;
  }
  return Date.now() - t0;
}

async function rejouer(modele: string, t: Trace, repetition: number): Promise<{ mesure: Mesure; json: unknown; texte: string; reflexion: string }> {
  const debut = Date.now();
  let premier: number | null = null;
  let reflexion = "";
  let texte = "";
  const base = {
    modele, traceId: t.id, skill: t.skill, repetition,
    refDureeMs: t.duree_ms, refJetonsSortie: t.tokens_sortie, refModele: t.modele,
  };
  const controles = nombre("--controles", 0);
  try {
    const r = await executerSkill(t.skill, t.messages, {
      modele,
      enregistrer: null,
      racine: arg("--racine"),
      variante: varianteDe(t),
      controler: controles > 0 ? controleurPourSkill(t.skill, entreeDeTrace(t)) : undefined,
      maxRenvois: controles > 0 ? controles : nombre("--renvois", 0),
      maxTokens: nombre("--max-tokens", 16384),
      contrainte: !drapeau("--sans-contrainte"),
      corps: drapeau("--corps-defaut") ? undefined : {},
      surFlux: (e) => {
        if (e.type === "debut") return;
        if (premier === null) premier = Date.now() - debut;
        if (e.type === "reflexion") reflexion += e.texte;
        else texte += e.texte;
      },
    });
    const dureeMs = r.dureeMs;
    const decode = premier !== null ? dureeMs - premier : dureeMs;
    const tm = r.reponse.timings;
    return {
      json: r.json, texte, reflexion,
      mesure: {
        ...base, statut: "ok", dureeMs, premierJetonMs: premier,
        jetonsEntree: r.usage.entree, jetonsSortie: r.usage.sortie,
        jetonsParSeconde: decode > 0 ? (r.usage.sortie / decode) * 1000 : null,
        caracteresReflexion: reflexion.length, caracteresTexte: texte.length, renvois: r.renvois,
        cacheN: tm ? tm.cacheN : null,
        promptN: tm ? tm.promptN : null,
        preremplissageTps: tm && tm.promptMs > 0 ? (tm.promptN / tm.promptMs) * 1000 : null,
        acceptationMtp: tm && tm.draftN > 0 ? tm.draftAcceptedN / tm.draftN : null,
      },
    };
  } catch (e) {
    const invalide = e instanceof ErreurLlm && e.code === "sortie_invalide";
    const dureeMs = Date.now() - debut;
    return {
      json: null, texte, reflexion,
      mesure: {
        ...base, statut: invalide ? "invalide" : "echoue", erreur: (e as Error).message.slice(0, 300), dureeMs, premierJetonMs: premier,
        jetonsEntree: 0, jetonsSortie: 0, jetonsParSeconde: null,
        caracteresReflexion: reflexion.length, caracteresTexte: texte.length, renvois: 0,
        cacheN: null, promptN: null, preremplissageTps: null, acceptationMtp: null,
      },
    };
  }
}

function tableau(mesures: Mesure[]): string {
  const lignes = [
    "| modèle | skill | n | valides | 1er coup | durée moy. (s) | 1er jeton (s) | jetons/s | sortie moy. | réflexion % | cache % | préremplissage j/s | MTP | réf. durée (s) | réf. jetons/s |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  const groupes = new Map<string, Mesure[]>();
  for (const m of mesures) groupes.set(`${m.modele}\u0000${m.skill}`, [...(groupes.get(`${m.modele}\u0000${m.skill}`) ?? []), m]);
  for (const [cle, ms] of groupes) {
    const [modele, skill] = cle.split("\u0000");
    const ok = ms.filter((m) => m.statut === "ok");
    const premierCoup = ok.filter((m) => m.renvois === 0);
    const refTps = moy(ms.map((m) => (m.refDureeMs > 0 ? (m.refJetonsSortie / m.refDureeMs) * 1000 : NaN)));
    const reflexionPct = moy(ms.map((m) => (m.caracteresReflexion + m.caracteresTexte > 0 ? (100 * m.caracteresReflexion) / (m.caracteresReflexion + m.caracteresTexte) : NaN)));
    const cachePct = moy(ms.map((m) => (m.cacheN != null && m.promptN != null && m.cacheN + m.promptN > 0 ? (100 * m.cacheN) / (m.cacheN + m.promptN) : NaN)));
    lignes.push(
      `| ${modele} | ${skill} | ${ms.length} | ${ok.length}/${ms.length} | ${premierCoup.length}/${ms.length} | ${fmt(moy(ms.map((m) => m.dureeMs)) / 1000)} | ${fmt(moy(ms.map((m) => (m.premierJetonMs ?? NaN))) / 1000)} | ${fmt(moy(ok.map((m) => m.jetonsParSeconde ?? NaN)))} | ${fmt(moy(ok.map((m) => m.jetonsSortie)), 0)} | ${fmt(reflexionPct, 0)} | ${fmt(cachePct, 0)} | ${fmt(moy(ms.map((m) => m.preremplissageTps ?? NaN)), 0)} | ${fmt(moy(ms.map((m) => m.acceptationMtp ?? NaN)) * 100, 0)} % | ${fmt(moy(ms.map((m) => m.refDureeMs)) / 1000)} | ${fmt(refTps)} |`,
    );
  }
  return lignes.join("\n");
}

/** Exécute les tâches `n` à la fois (un modèle à `n` slots) ; l'ordre de FIN peut différer de l'ordre de départ. */
async function enParallele(taches: Array<() => Promise<void>>, n: number): Promise<void> {
  let suivante = 0;
  const travailleurs = Array.from({ length: Math.max(1, Math.min(n, taches.length)) }, async () => {
    for (;;) {
      const i = suivante++;
      if (i >= taches.length) return;
      await taches[i]!();
    }
  });
  await Promise.all(travailleurs);
}

async function main(): Promise<number> {
  const modeles = liste("--modeles");
  if (!modeles?.length) {
    console.error("Usage : npm run llm:banc -- --modeles a,b [--skills s1,s2] [--ids 1,2] [--par-skill N] [--repetitions N] [--traces f.jsonl] [--sans-contrainte] [--renvois N] [--max-tokens N] [--corps-defaut] [--sortie dossier] [--controles N] [--concurrence N] [--racine dossier] [--sans-variante]");
    return 2;
  }
  const traces = chargerTraces();
  if (!traces.length) {
    console.error("Aucune trace ne correspond aux filtres.");
    return 2;
  }
  const repetitions = nombre("--repetitions", 1);
  const horodatage = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dossier = arg("--sortie") ?? join("essais", "banc", horodatage);
  mkdirSync(dossier, { recursive: true });
  const fichierMesures = join(dossier, "mesures.jsonl");

  console.log(`Serveur ${configLlm().url} · ${traces.length} traces × ${modeles.length} modèle(s) × ${repetitions} répétition(s) · sortie ${dossier}`);
  const derives = new Set<string>();
  for (const t of traces) {
    const cle = `${t.skill}/${t.variante ?? ""}`;
    if (derives.has(cle)) continue;
    derives.add(cle);
    const actuel = chargerSkill(t.skill, arg("--racine"), { variante: varianteDe(t) }).caracteres;
    if (actuel !== t.systeme_caracteres) console.log(`  ⚠ ${t.skill}${t.variante ? ` (${t.variante})` : ""} : prompt système actuel ${actuel} caractères, trace d'origine ${t.systeme_caracteres} (version différente, ou variante de skill)`);
  }

  const toutes: Mesure[] = [];
  const sorties = new Map<number, Array<{ modele: string; m: Mesure; json: unknown; texte: string }>>();
  for (const modele of modeles) {
    console.log(`\n== ${modele} ==`);
    let chargement: number;
    try {
      chargement = await echauffer(modele);
    } catch {
      continue;
    }
    console.log(`  chargement + échauffement : ${sec(chargement)} s`);
    const taches: Array<() => Promise<void>> = [];
    for (const t of traces) {
      for (let rep = 1; rep <= repetitions; rep++) {
        taches.push(async () => {
          const { mesure, json, texte } = await rejouer(modele, t, rep);
          toutes.push(mesure);
          appendFileSync(fichierMesures, JSON.stringify(mesure) + "\n");
          sorties.set(t.id, [...(sorties.get(t.id) ?? []), { modele, m: mesure, json, texte }]);
          const etat = mesure.statut === "ok" ? "ok      " : mesure.statut === "invalide" ? "INVALIDE" : "ÉCHEC   ";
          console.log(`  #${String(t.id).padEnd(5)} ${t.skill.padEnd(20)} ${etat} ${sec(mesure.dureeMs).padStart(6)} s  ${fmt(mesure.jetonsParSeconde ?? NaN).padStart(5)} tok/s  sortie ${String(mesure.jetonsSortie).padStart(5)}${mesure.renvois ? `  ${mesure.renvois} renvoi(s)` : ""}${mesure.erreur ? "  " + mesure.erreur.slice(0, 90) : ""}`);
        });
      }
    }
    const concurrence = nombre("--concurrence", 1);
    const depart = Date.now();
    const avant = toutes.length;
    await enParallele(taches, concurrence);
    // Débit CUMULÉ : tous les jetons de sortie sur le temps réel écoulé (la mesure qui dit si N slots valent le coup).
    if (concurrence > 1) {
      const jetons = toutes.slice(avant).filter((m) => m.statut === "ok").reduce((a, m) => a + m.jetonsSortie, 0);
      console.log(`  concurrence ${concurrence} : ${jetons} jetons en ${sec(Date.now() - depart)} s = ${fmt((jetons / (Date.now() - depart)) * 1000)} tok/s cumulés`);
    }
  }

  // Une page par trace : la sortie de chaque modèle côte à côte, avec la référence, pour juger la qualité à la main.
  for (const t of traces) {
    const blocs = [`# Trace #${t.id} — ${t.skill}`, "", `Référence (${t.modele}) : ${sec(t.duree_ms)} s, ${t.tokens_sortie} jetons de sortie.`, "", "## Entrée", "", "```", ...t.messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))), "```", "", "## Référence", "", "```json", JSON.stringify(t.sortie_json, null, 2), "```"];
    for (const s of sorties.get(t.id) ?? []) {
      blocs.push("", `## ${s.modele} (essai ${s.m.repetition}) — ${s.m.statut}, ${sec(s.m.dureeMs)} s`, "", "```json", s.m.statut === "ok" ? JSON.stringify(s.json, null, 2) : (s.texte.slice(0, 4000) || s.m.erreur || ""), "```");
    }
    writeFileSync(join(dossier, `${t.id}-${t.skill}.md`), blocs.join("\n") + "\n");
  }

  const rapport = `# Banc LLM ${horodatage}\n\nServeur ${configLlm().url}. Débit = jetons de sortie / (durée − premier jeton). « réflexion % » = part des caractères reçus dans reasoning_content. « 1er coup » = sorties valides sans aucun renvoi (avec --controles : schéma ET contrôles sémantiques). « cache % » = part de l'entrée reprise du cache du serveur (dernier appel).\n\n${tableau(toutes)}\n`;
  writeFileSync(join(dossier, "rapport.md"), rapport);
  console.log(`\n${tableau(toutes)}\n\nRapport et sorties dans ${dossier}`);
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error(e);
  process.exit(1);
});
