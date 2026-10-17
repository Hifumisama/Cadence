import "dotenv/config";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chargerSkill } from "../lib/llm/skills";
import { executerSkill } from "../lib/llm/executer";
import { configLlm, creerFournisseur } from "../lib/llm/config";
import { ErreurLlm, type MessageLlm } from "../lib/llm/types";

/** Banc de rejeu : rejoue de vraies traces (agent_traces) contre un ou plusieurs modèles de llama-swap.
 *
 *   npm run llm:banc -- --modeles gemma4-26b-A4B-v2,gemma4-e4b [--skills plan-h3,prompt-asset] [--ids 955,979]
 *                       [--par-skill 2] [--repetitions 1] [--traces fichier.jsonl] [--sans-contrainte]
 *                       [--renvois 0] [--max-tokens 16384] [--corps-defaut] [--sortie dossier]
 *
 * Aucune base, aucune écriture de trace : seul le serveur LLM (LLM_LOCAL_URL du .env) est sollicité. Le prompt système et
 * le schéma sont rechargés depuis agents/skills/ (la trace ne garde que l'empreinte) : un écart de taille avec la trace
 * d'origine est signalé, la sortie de référence peut venir d'une autre version du prompt.
 * Les modèles sont passés l'un après l'autre (un chargement llama-swap par modèle, mesuré à part par un appel d'échauffement).
 * Par défaut AUCUN champ supplémentaire n'est ajouté au corps de la requête (les `chat_template_kwargs` sont dépréciés :
 * choisir une entrée llama-swap `-nothink` pour couper la réflexion) ; `--corps-defaut` rétablit le comportement de l'app. */

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
  try {
    const r = await executerSkill(t.skill, t.messages, {
      modele,
      enregistrer: null,
      maxRenvois: nombre("--renvois", 0),
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
    return {
      json: r.json, texte, reflexion,
      mesure: {
        ...base, statut: "ok", dureeMs, premierJetonMs: premier,
        jetonsEntree: r.usage.entree, jetonsSortie: r.usage.sortie,
        jetonsParSeconde: decode > 0 ? (r.usage.sortie / decode) * 1000 : null,
        caracteresReflexion: reflexion.length, caracteresTexte: texte.length, renvois: r.renvois,
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
      },
    };
  }
}

function tableau(mesures: Mesure[]): string {
  const lignes = ["| modèle | skill | n | valides | durée moy. (s) | 1er jeton (s) | jetons/s | sortie moy. | réflexion % | réf. durée (s) | réf. jetons/s |", "|---|---|---|---|---|---|---|---|---|---|---|"];
  const groupes = new Map<string, Mesure[]>();
  for (const m of mesures) groupes.set(`${m.modele}\u0000${m.skill}`, [...(groupes.get(`${m.modele}\u0000${m.skill}`) ?? []), m]);
  for (const [cle, ms] of groupes) {
    const [modele, skill] = cle.split("\u0000");
    const ok = ms.filter((m) => m.statut === "ok");
    const refTps = moy(ms.map((m) => (m.refDureeMs > 0 ? (m.refJetonsSortie / m.refDureeMs) * 1000 : NaN)));
    const reflexionPct = moy(ms.map((m) => (m.caracteresReflexion + m.caracteresTexte > 0 ? (100 * m.caracteresReflexion) / (m.caracteresReflexion + m.caracteresTexte) : NaN)));
    lignes.push(
      `| ${modele} | ${skill} | ${ms.length} | ${ok.length}/${ms.length} | ${fmt(moy(ms.map((m) => m.dureeMs)) / 1000)} | ${fmt(moy(ms.map((m) => (m.premierJetonMs ?? NaN))) / 1000)} | ${fmt(moy(ok.map((m) => m.jetonsParSeconde ?? NaN)))} | ${fmt(moy(ok.map((m) => m.jetonsSortie)), 0)} | ${fmt(reflexionPct, 0)} | ${fmt(moy(ms.map((m) => m.refDureeMs)) / 1000)} | ${fmt(refTps)} |`,
    );
  }
  return lignes.join("\n");
}

async function main(): Promise<number> {
  const modeles = liste("--modeles");
  if (!modeles?.length) {
    console.error("Usage : npm run llm:banc -- --modeles a,b [--skills s1,s2] [--ids 1,2] [--par-skill N] [--repetitions N] [--traces f.jsonl] [--sans-contrainte] [--renvois N] [--max-tokens N] [--corps-defaut] [--sortie dossier]");
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
    if (derives.has(t.skill)) continue;
    derives.add(t.skill);
    const actuel = chargerSkill(t.skill).caracteres;
    if (actuel !== t.systeme_caracteres) console.log(`  ⚠ ${t.skill} : prompt système actuel ${actuel} caractères, trace d'origine ${t.systeme_caracteres} (version différente, ou variante de skill)`);
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
    for (const t of traces) {
      for (let rep = 1; rep <= repetitions; rep++) {
        const { mesure, json, texte } = await rejouer(modele, t, rep);
        toutes.push(mesure);
        appendFileSync(fichierMesures, JSON.stringify(mesure) + "\n");
        sorties.set(t.id, [...(sorties.get(t.id) ?? []), { modele, m: mesure, json, texte }]);
        const etat = mesure.statut === "ok" ? "ok      " : mesure.statut === "invalide" ? "INVALIDE" : "ÉCHEC   ";
        console.log(`  #${String(t.id).padEnd(5)} ${t.skill.padEnd(20)} ${etat} ${sec(mesure.dureeMs).padStart(6)} s  ${fmt(mesure.jetonsParSeconde ?? NaN).padStart(5)} tok/s  sortie ${String(mesure.jetonsSortie).padStart(5)}${mesure.erreur ? "  " + mesure.erreur.slice(0, 90) : ""}`);
      }
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

  const rapport = `# Banc LLM ${horodatage}\n\nServeur ${configLlm().url}. Débit = jetons de sortie / (durée − premier jeton). « réflexion % » = part des caractères reçus dans reasoning_content.\n\n${tableau(toutes)}\n`;
  writeFileSync(join(dossier, "rapport.md"), rapport);
  console.log(`\n${tableau(toutes)}\n\nRapport et sorties dans ${dossier}`);
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error(e);
  process.exit(1);
});
