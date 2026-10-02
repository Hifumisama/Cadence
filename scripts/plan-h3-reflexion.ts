import "dotenv/config";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { plans } from "../db/schema";
import { entreePlanH3 } from "../lib/agents/contexte";
import { configLlm, corpsPourSkill, maxTokensPourSkill, modelePourSkill } from "../lib/llm/config";
import { versMessages } from "../lib/llm/executer";
import { chargerSkill } from "../lib/llm/skills";

/** Diagnostic de la RÉFLEXION : envoie la vraie requête de `plan-h3` au serveur LLM (sans passer par le
 * worker), affiche en direct ce que le serveur renvoie en `reasoning_content` (la réflexion) et en
 * `content` (la réponse), puis un résumé. Sert à savoir si `enable_thinking: false` est respecté.
 *
 *   npm run plan-h3:reflexion -- --projet 1 [--plan uuid] [--modele X] [--max 4096]
 *                               [--sans-corps]      (n'envoie pas LLM_CORPS_PLAN_H3)
 *                               [--sans-schema]     (pas de response_format : écarte la grammaire)
 *                               [--sans-pattern]    (schéma envoyé SANS les `pattern`, en mémoire seulement)
 * Rien n'est écrit en base. `--max` borne les jetons (défaut 4096) pour ne pas brûler le GPU. */

function arg(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const drapeau = (nom: string) => process.argv.includes(nom);

async function main(): Promise<number> {
  const projectId = Number(arg("--projet"));
  if (!Number.isInteger(projectId) || projectId <= 0) {
    console.error("Usage : npm run plan-h3:reflexion -- --projet <id> [--plan uuid] [--modele X] [--max 4096] [--sans-corps] [--sans-schema] [--sans-pattern]");
    return 2;
  }
  let uuid = arg("--plan");
  if (!uuid) {
    const [p] = await db.select({ uuid: plans.uuid, description: plans.description }).from(plans).where(eq(plans.projectId, projectId)).orderBy(asc(plans.ordre), asc(plans.id));
    const tous = await db.select({ uuid: plans.uuid, description: plans.description }).from(plans).where(and(eq(plans.projectId, projectId))).orderBy(asc(plans.ordre), asc(plans.id));
    uuid = (tous.find((x) => (x.description ?? "").trim()) ?? p)?.uuid;
  }
  if (!uuid) {
    console.error("Aucun plan dans ce projet.");
    return 2;
  }
  const e = await entreePlanH3(db, projectId, uuid, "Écris la fiche de plan complète.");
  if (!e) {
    console.error("Plan illisible.");
    return 2;
  }

  const cfg = configLlm();
  const modele = arg("--modele") ?? modelePourSkill("plan-h3");
  const skill = chargerSkill("plan-h3");
  const maxTokens = Number(arg("--max") ?? 4096);
  const corpsSkill = drapeau("--sans-corps") ? undefined : corpsPourSkill("plan-h3");
  const sansPattern = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sansPattern)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== "pattern").map(([k, x]) => [k, sansPattern(x)]))
        : v;
  const schemaEnvoye = drapeau("--sans-pattern") ? (sansPattern(skill.schema) as Record<string, unknown>) : skill.schema;
  const corps = {
    model: modele,
    messages: [{ role: "system", content: skill.systeme }, ...versMessages(e.entree as object)],
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: maxTokens,
    ...(drapeau("--sans-schema") ? {} : { response_format: { type: "json_schema", json_schema: { name: "sortie", strict: true, schema: schemaEnvoye } } }),
    ...corpsSkill,
  };
  console.log(`Serveur   : ${cfg.url}`);
  console.log(`Modèle    : ${modele}`);
  console.log(`Corps ajouté : ${corpsSkill ? JSON.stringify(corpsSkill) : "(aucun)"}`);
  console.log(`Schéma    : ${drapeau("--sans-schema") ? "non (pas de grammaire)" : `oui (response_format json_schema${drapeau("--sans-pattern") ? ", sans les pattern" : ""})`}`);
  console.log(`Système   : ${skill.caracteres} caractères · max_tokens ${maxTokens}\n`);

  const debut = Date.now();
  const res = await fetch(`${cfg.url}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(corps),
  });
  if (!res.ok || !res.body) {
    console.error(`HTTP ${res.status} : ${(await res.text().catch(() => "")).slice(0, 500)}`);
    return 1;
  }

  let reflexion = "";
  let reponse = "";
  let arret: string | undefined;
  let usage: unknown;
  let done = false;
  let premier: number | null = null;
  let mode: "" | "reflexion" | "reponse" = "";
  const lecteur = res.body.getReader();
  const dec = new TextDecoder();
  let tampon = "";
  const traiter = (ligne: string) => {
    const l = ligne.trim();
    if (!l.startsWith("data:")) return;
    const charge = l.slice(5).trim();
    if (charge === "[DONE]") {
      done = true;
      return;
    }
    let j: any;
    try {
      j = JSON.parse(charge);
    } catch {
      return;
    }
    const c = j?.choices?.[0];
    const r = c?.delta?.reasoning_content;
    const t = c?.delta?.content;
    if (typeof r === "string" && r) {
      premier ??= Date.now() - debut;
      if (mode !== "reflexion") process.stdout.write("\n\x1b[33m── RÉFLEXION ──\x1b[0m\n");
      mode = "reflexion";
      reflexion += r;
      process.stdout.write(r);
    }
    if (typeof t === "string" && t) {
      premier ??= Date.now() - debut;
      if (mode !== "reponse") process.stdout.write("\n\x1b[32m── RÉPONSE ──\x1b[0m\n");
      mode = "reponse";
      reponse += t;
      process.stdout.write(t);
    }
    if (c?.finish_reason) arret = c.finish_reason;
    if (j?.usage) usage = j.usage;
  };
  try {
    for (;;) {
      const { done: fin, value } = await lecteur.read();
      if (fin) break;
      tampon += dec.decode(value, { stream: true });
      let i: number;
      while ((i = tampon.indexOf("\n")) >= 0) {
        traiter(tampon.slice(0, i));
        tampon = tampon.slice(i + 1);
      }
    }
    traiter(tampon);
  } catch (err) {
    console.error(`\n\nFlux coupé : ${(err as Error).message}`);
  }

  console.log("\n\n════════ RÉSUMÉ ════════");
  console.log(`Durée                 : ${Math.round((Date.now() - debut) / 1000)} s (premier jeton après ${premier ?? "?"} ms)`);
  console.log(`Réflexion             : ${reflexion.length} caractères`);
  console.log(`Réponse               : ${reponse.length} caractères`);
  console.log(`finish_reason         : ${arret ?? "(aucun)"}   [DONE] reçu : ${done ? "oui" : "non"}`);
  console.log(`usage                 : ${usage ? JSON.stringify(usage) : "(absent)"}`);
  const demande = (corpsSkill?.chat_template_kwargs as { enable_thinking?: boolean } | undefined)?.enable_thinking;
  if (reflexion.length === 0) console.log(`\n→ Aucune réflexion reçue${demande === false ? " : enable_thinking: false est respecté." : "."}`);
  else if (demande === false) console.log("\n→ Le serveur RÉFLÉCHIT malgré enable_thinking: false : le réglage n'est pas respecté (ou pas appliqué).");
  else if (demande === true) console.log("\n→ Réflexion reçue : normal, enable_thinking: true était demandé.");
  else console.log("\n→ Réflexion reçue sans réglage envoyé : c'est le comportement par défaut du modèle.");
  if (arret === "length") console.log(`→ Coupé par max_tokens (${maxTokens}).`);
  if (!arret && !done) console.log("→ Le flux s'est fermé sans fin de génération (serveur planté / proxy).");
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(2);
  });
